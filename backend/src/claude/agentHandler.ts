import Anthropic from "@anthropic-ai/sdk";
import { findProjects, soqlQuery, sfUpdate, sfCreate, SFProject } from "../salesforce/directApi";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Sales Copilot assistant embedded in Microsoft Outlook. You help sales reps manage their Salesforce projects directly from email — quickly and concisely.

You have tools to look up projects, list all projects, propose write actions (updates, notes, meetings), and draft email replies.

Guidelines:
- Extract the project name from the email context if the user does not specify one.
- After finding a project, show a concise markdown table summary: name, account, status, end date.
- When proposing a date update, always use the exact date the user specifies. Parse natural dates correctly (e.g. "1 Jan 2030" → 2030-01-01).
- When listing all projects, show them in a clean markdown table with Name, Account, Status, End Date columns.
- When drafting an email reply, ALWAYS call the draft_reply tool — never write the draft inline as regular text.
- Keep non-table replies short — 2-4 sentences max.
- Today's date: ${new Date().toISOString().slice(0, 10)}.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_project",
    description: "Search for Salesforce Project__c records by name. Call this first whenever the user mentions a project.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name or partial name to search" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_all_projects",
    description: "List all Salesforce projects, optionally filtered by status.",
    input_schema: {
      type: "object",
      properties: {
        statusFilter: { type: "string", description: "Optional: filter by Status__c value e.g. 'Active', 'On Hold', 'Completed'" },
      },
      required: [],
    },
  },
  {
    name: "propose_update_end_date",
    description: "Propose changing a project's end date. Shows a confirmation dialog before executing.",
    input_schema: {
      type: "object",
      properties: {
        projectId:      { type: "string" },
        projectName:    { type: "string" },
        currentEndDate: { type: "string", description: "Current value (YYYY-MM-DD), or null if not set" },
        newEndDate:     { type: "string", description: "New date to set (YYYY-MM-DD)" },
      },
      required: ["projectId", "projectName", "newEndDate"],
    },
  },
  {
    name: "propose_log_note",
    description: "Propose logging a follow-up note/activity on a project. Shows a confirmation dialog before executing.",
    input_schema: {
      type: "object",
      properties: {
        projectId:   { type: "string" },
        projectName: { type: "string" },
        subject:     { type: "string" },
        noteText:    { type: "string" },
      },
      required: ["projectId", "projectName", "subject", "noteText"],
    },
  },
  {
    name: "propose_schedule_meeting",
    description: "Propose scheduling a meeting with the email participants. Opens Outlook's native meeting composer pre-filled.",
    input_schema: {
      type: "object",
      properties: {
        subject:           { type: "string" },
        requiredAttendees: { type: "array", items: { type: "string" }, description: "From + To addresses" },
        optionalAttendees: { type: "array", items: { type: "string" }, description: "CC addresses" },
        proposedDate:      { type: "string", description: "YYYY-MM-DD" },
        startTime:         { type: "string", description: "HH:MM 24h" },
        durationMinutes:   { type: "number" },
        agenda:            { type: "string" },
      },
      required: ["subject", "requiredAttendees", "proposedDate", "startTime", "durationMinutes", "agenda"],
    },
  },
  {
    name: "propose_attach_file",
    description: "Propose attaching an email attachment to a Salesforce project. Shows a confirmation dialog before uploading.",
    input_schema: {
      type: "object",
      properties: {
        projectId:      { type: "string" },
        projectName:    { type: "string" },
        attachmentId:   { type: "string", description: "Office.js attachment id from the email context" },
        attachmentName: { type: "string" },
        contentType:    { type: "string" },
      },
      required: ["projectId", "projectName", "attachmentId", "attachmentName", "contentType"],
    },
  },
  {
    name: "draft_reply",
    description: "Store a drafted email reply. ALWAYS call this when the user asks to draft or write a reply — never write drafts inline as text.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Reply subject line (optional, leave blank to keep original)" },
        body:    { type: "string", description: "Full reply body in plain text" },
        summary: { type: "string", description: "One-sentence description of the draft for the user" },
      },
      required: ["body", "summary"],
    },
  },
];

// ── Shared types ──────────────────────────────────────────────────────────────

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export interface EmailCtx {
  subject: string;
  from: string;
  to?: string;
  cc?: string;
  bodyPreview: string;
  attachments?: EmailAttachment[];
}

export interface AgentReply {
  reply: string;
  requiresConfirm: boolean;
  proposedAction?: { label: string; description: string; payload: object };
  draftBody?: string;
}

export type ConversationMessage = Anthropic.MessageParam;

export type AgentStreamEvent =
  | { type: "status"; text: string }
  | { type: "delta";  text: string }
  | { type: "clear" }
  | { type: "done"; reply: AgentReply; updatedHistory: ConversationMessage[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmailContextStr(email: EmailCtx): string {
  const attachmentList = email.attachments?.length
    ? `\nAttachments:\n${email.attachments.map((a) => `  - id="${a.id}" name="${a.name}" type="${a.contentType}" size=${a.size}`).join("\n")}`
    : "";
  const toLine  = email.to ? `\nTo: ${email.to}` : "";
  const ccLine  = email.cc ? `\nCC: ${email.cc}` : "";
  return `Email context:\nSubject: ${email.subject}\nFrom: ${email.from}${toLine}${ccLine}${attachmentList}\n\n${email.bodyPreview}`;
}

function toolStatusText(toolName: string): string {
  const map: Record<string, string> = {
    find_project:            "Searching Salesforce projects…",
    list_all_projects:       "Loading all projects…",
    propose_update_end_date: "Preparing date update…",
    propose_log_note:        "Preparing note…",
    propose_schedule_meeting:"Preparing meeting invite…",
    propose_attach_file:     "Preparing file upload…",
    draft_reply:             "Drafting reply…",
  };
  return map[toolName] ?? "Working…";
}

async function handleToolBlock(
  block: Anthropic.ToolUseBlock,
  pendingProposal: { ref: AgentReply["proposedAction"] | undefined },
  pendingDraft:    { ref: string | undefined }
): Promise<string> {
  const input = block.input as Record<string, unknown>;

  switch (block.name) {
    case "find_project": {
      const results: SFProject[] = await findProjects(input.name as string);
      return results.length ? JSON.stringify(results) : `No projects found matching "${input.name}".`;
    }

    case "list_all_projects": {
      const statusFilter = input.statusFilter as string | undefined;
      const where = statusFilter ? `WHERE Status__c = '${statusFilter.replace(/'/g, "\\'")}'` : "";
      const records = await soqlQuery<SFProject>(
        `SELECT Id, Name, Status__c, End_Date__c, Account__r.Name FROM Project__c ${where} ORDER BY Name LIMIT 20`
      );
      return records.length ? JSON.stringify(records) : "No projects found.";
    }

    case "propose_update_end_date":
      pendingProposal.ref = {
        label: "Update End Date",
        description: `Set end date of ${input.projectName} to ${input.newEndDate}`,
        payload: {
          action:      "update_date",
          projectId:   input.projectId,
          projectName: input.projectName,
          oldDate:     input.currentEndDate ?? null,
          newDate:     input.newEndDate,
        },
      };
      return "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

    case "propose_log_note":
      pendingProposal.ref = {
        label: "Log Note",
        description: `Log note on ${input.projectName}: "${input.noteText}"`,
        payload: {
          action:      "log_note",
          projectId:   input.projectId,
          projectName: input.projectName,
          noteSubject: input.subject,
          noteText:    input.noteText,
        },
      };
      return "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

    case "propose_schedule_meeting": {
      const startDT = `${input.proposedDate} at ${input.startTime}`;
      pendingProposal.ref = {
        label: "Schedule Meeting",
        description: `Schedule "${input.subject}" on ${startDT} (${input.durationMinutes} min) with ${(input.requiredAttendees as string[]).join(", ")}`,
        payload: {
          action:            "schedule_meeting",
          subject:           input.subject,
          requiredAttendees: input.requiredAttendees,
          optionalAttendees: input.optionalAttendees ?? [],
          proposedDate:      input.proposedDate,
          startTime:         input.startTime,
          durationMinutes:   input.durationMinutes,
          agenda:            input.agenda,
        },
      };
      return "Proposal recorded. Tell the user the meeting details and ask them to confirm.";
    }

    case "propose_attach_file":
      pendingProposal.ref = {
        label: "Attach File",
        description: `Attach "${input.attachmentName}" to project ${input.projectName}`,
        payload: {
          action:         "attach_file",
          projectId:      input.projectId,
          projectName:    input.projectName,
          attachmentId:   input.attachmentId,
          attachmentName: input.attachmentName,
          contentType:    input.contentType,
        },
      };
      return "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

    case "draft_reply":
      pendingDraft.ref = input.body as string;
      return `Draft stored. Tell the user: "${input.summary}". Mention they can click "Open in Outlook" to compose the reply.`;

    default:
      return "Unknown tool.";
  }
}

// ── Execute confirmed write action ────────────────────────────────────────────
export async function executeConfirmed(payload: Record<string, unknown>): Promise<string> {
  if (payload.action === "update_date") {
    await sfUpdate("Project__c", payload.projectId as string, { End_Date__c: payload.newDate });
    return `Done! End date for **${payload.projectName}** updated to **${payload.newDate}**.`;
  }
  if (payload.action === "log_note") {
    await sfCreate("Task", {
      Subject:      payload.noteSubject,
      Description:  payload.noteText,
      WhatId:       payload.projectId,
      Status:       "Completed",
      ActivityDate: new Date().toISOString().slice(0, 10),
    });
    return `Note logged on **${payload.projectName}**: "${payload.noteText}"`;
  }
  if (payload.action === "attach_file")     return `File "${payload.attachmentName}" attachment handled by client.`;
  if (payload.action === "schedule_meeting") return `Meeting scheduling handled client-side via Office.js.`;
  return "Unknown action.";
}

// ── Standard (non-streaming) agent ───────────────────────────────────────────
export async function runAgent(
  userMessage: string,
  email: EmailCtx,
  history: ConversationMessage[]
): Promise<{ reply: AgentReply; updatedHistory: ConversationMessage[] }> {

  const emailContextStr = buildEmailContextStr(email);
  const messages: ConversationMessage[] = [
    ...history,
    {
      role: "user",
      content: history.length === 0
        ? `${emailContextStr}\n\n---\nUser: ${userMessage}`
        : userMessage,
    },
  ];

  const pendingProposal: { ref: AgentReply["proposedAction"] | undefined } = { ref: undefined };
  const pendingDraft:    { ref: string | undefined }                        = { ref: undefined };

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        reply: {
          reply: text,
          requiresConfirm: !!pendingProposal.ref,
          proposedAction: pendingProposal.ref,
          draftBody: pendingDraft.ref,
        },
        updatedHistory: messages,
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const resultText = await handleToolBlock(block, pendingProposal, pendingDraft);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ── Streaming agent ───────────────────────────────────────────────────────────
export async function runAgentStream(
  userMessage: string,
  email: EmailCtx,
  history: ConversationMessage[],
  onEvent: (event: AgentStreamEvent) => void
): Promise<void> {

  const emailContextStr = buildEmailContextStr(email);
  const messages: ConversationMessage[] = [
    ...history,
    {
      role: "user",
      content: history.length === 0
        ? `${emailContextStr}\n\n---\nUser: ${userMessage}`
        : userMessage,
    },
  ];

  const pendingProposal: { ref: AgentReply["proposedAction"] | undefined } = { ref: undefined };
  const pendingDraft:    { ref: string | undefined }                        = { ref: undefined };

  while (true) {
    let turnText = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    stream.on("text", (delta: string) => {
      turnText += delta;
      onEvent({ type: "delta", text: delta });
    });

    const response = await stream.finalMessage();
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      onEvent({
        type: "done",
        reply: {
          reply: turnText,
          requiresConfirm: !!pendingProposal.ref,
          proposedAction: pendingProposal.ref,
          draftBody: pendingDraft.ref,
        },
        updatedHistory: messages,
      });
      return;
    }

    if (response.stop_reason === "tool_use") {
      // If Claude emitted text before the tool call, clear it from the frontend
      if (turnText.trim()) onEvent({ type: "clear" });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        onEvent({ type: "status", text: toolStatusText(block.name) });
        const resultText = await handleToolBlock(block, pendingProposal, pendingDraft);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}
