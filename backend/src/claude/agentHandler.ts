import Anthropic from "@anthropic-ai/sdk";
import { findProjects, soqlQuery, sfUpdate, sfCreate, sfDelete, SFProject } from "../salesforce/directApi";
import { ProposedAction, UndoToken } from "../types/chat";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Sales Copilot assistant embedded in Microsoft Outlook. You help sales reps manage their Salesforce projects directly from email — quickly and concisely.

Tools available: look up projects, list all projects, propose write actions (date updates, notes, email logging, reminders, meetings, file attachments), and draft replies.

Guidelines:
- Extract the project name from the email context when the user does not specify one.
- After finding a project, show a concise markdown table: Name, Account, Status, End Date. If the project has recentActivities, also show the last 3 as a "Recent Activity" section.
- You can call multiple propose_ tools in a single response to handle compound requests like "update the date and log a note".
- When proposing a date update, use the exact date specified. Parse natural language correctly (e.g. "end of January" → last day of January).
- When drafting an email reply, ALWAYS use the draft_reply tool — never write drafts as regular text.
- After completing any action, end your reply with a short "What's next?" suggestion (1 sentence).
- Keep non-table replies to 2-4 sentences.
- Today's date: ${new Date().toISOString().slice(0, 10)}.

When analysing an email proactively, respond with this structure:
**Urgency**: 🔴 Urgent / 🟡 Normal / 🟢 Low — brief reason
**Asking for**: 1-2 sentences
**Action items**: bullet list of any commitments or deadlines
**Recommended action**: the single most useful thing to do right now`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_project",
    description: "Search for Salesforce Project__c records by name. Call this whenever the user mentions a project. Result includes recent activity timeline.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Project name or partial name" } },
      required: ["name"],
    },
  },
  {
    name: "list_all_projects",
    description: "List all Salesforce projects, optionally filtered by status.",
    input_schema: {
      type: "object",
      properties: { statusFilter: { type: "string" } },
      required: [],
    },
  },
  {
    name: "propose_update_end_date",
    description: "Propose changing a project's end date. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        projectId:      { type: "string" },
        projectName:    { type: "string" },
        currentEndDate: { type: "string" },
        newEndDate:     { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["projectId", "projectName", "newEndDate"],
    },
  },
  {
    name: "propose_log_note",
    description: "Propose logging a follow-up note as a Task on a project. Requires user confirmation.",
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
    name: "propose_log_email_activity",
    description: "Propose logging the entire email as an activity Task on a project. One-click email capture to Salesforce. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        projectId:    { type: "string" },
        projectName:  { type: "string" },
        emailSubject: { type: "string" },
        emailFrom:    { type: "string" },
      },
      required: ["projectId", "projectName", "emailSubject", "emailFrom"],
    },
  },
  {
    name: "propose_followup_reminder",
    description: "Propose creating a follow-up reminder Task on a project for a future date. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        projectId:    { type: "string" },
        projectName:  { type: "string" },
        reminderDate: { type: "string", description: "YYYY-MM-DD" },
        reminderNote: { type: "string" },
      },
      required: ["projectId", "projectName", "reminderDate", "reminderNote"],
    },
  },
  {
    name: "propose_schedule_meeting",
    description: "Propose scheduling a meeting. Opens Outlook's native meeting composer pre-filled. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        subject:           { type: "string" },
        requiredAttendees: { type: "array", items: { type: "string" } },
        optionalAttendees: { type: "array", items: { type: "string" } },
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
    description: "Propose attaching an email attachment to a Salesforce project. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        projectId:      { type: "string" },
        projectName:    { type: "string" },
        attachmentId:   { type: "string" },
        attachmentName: { type: "string" },
        contentType:    { type: "string" },
      },
      required: ["projectId", "projectName", "attachmentId", "attachmentName", "contentType"],
    },
  },
  {
    name: "draft_reply",
    description: "Store a drafted email reply. ALWAYS call this when drafting — never write drafts as regular text.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        body:    { type: "string", description: "Full reply body in plain text" },
        summary: { type: "string", description: "One sentence description for the user" },
      },
      required: ["body", "summary"],
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailAttachment { id: string; name: string; size: number; contentType: string; }

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
  proposedActions?: ProposedAction[];
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
    ? `\nAttachments:\n${email.attachments.map((a) => `  - id="${a.id}" name="${a.name}" type="${a.contentType}"`).join("\n")}`
    : "";
  const toLine = email.to ? `\nTo: ${email.to}` : "";
  const ccLine = email.cc ? `\nCC: ${email.cc}` : "";
  return `Email context:\nSubject: ${email.subject}\nFrom: ${email.from}${toLine}${ccLine}${attachmentList}\n\n${email.bodyPreview}`;
}

function toolStatusText(toolName: string): string {
  const map: Record<string, string> = {
    find_project:              "Searching Salesforce projects…",
    list_all_projects:         "Loading all projects…",
    propose_update_end_date:   "Preparing date update…",
    propose_log_note:          "Preparing note…",
    propose_log_email_activity:"Preparing email log…",
    propose_followup_reminder: "Preparing reminder…",
    propose_schedule_meeting:  "Preparing meeting invite…",
    propose_attach_file:       "Preparing file upload…",
    draft_reply:               "Drafting reply…",
  };
  return map[toolName] ?? "Working…";
}

async function handleToolBlock(
  block: Anthropic.ToolUseBlock,
  pendingProposals: ProposedAction[],
  pendingDraft: { ref: string | undefined },
  email: EmailCtx
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
      pendingProposals.push({
        label: "Update End Date",
        description: `Set end date of **${input.projectName}** to **${input.newEndDate}**`,
        payload: { action: "update_date", projectId: input.projectId, projectName: input.projectName, oldDate: input.currentEndDate ?? null, newDate: input.newEndDate },
      });
      return "Proposal recorded. Tell the user what you'll do and ask them to confirm.";

    case "propose_log_note":
      pendingProposals.push({
        label: "Log Note",
        description: `Log note on **${input.projectName}**: "${input.noteText}"`,
        payload: { action: "log_note", projectId: input.projectId, projectName: input.projectName, noteSubject: input.subject, noteText: input.noteText },
      });
      return "Proposal recorded. Tell the user what you'll do and ask them to confirm.";

    case "propose_log_email_activity":
      pendingProposals.push({
        label: "Log Email",
        description: `Log email "${input.emailSubject}" as activity on **${input.projectName}**`,
        payload: { action: "log_email", projectId: input.projectId, projectName: input.projectName, emailSubject: input.emailSubject, emailFrom: input.emailFrom, emailBody: email.bodyPreview },
      });
      return "Proposal recorded. Tell the user you'll log this email as a Salesforce activity.";

    case "propose_followup_reminder":
      pendingProposals.push({
        label: "Set Reminder",
        description: `Remind on **${input.reminderDate}**: "${input.reminderNote}" on **${input.projectName}**`,
        payload: { action: "followup_reminder", projectId: input.projectId, projectName: input.projectName, reminderDate: input.reminderDate, reminderNote: input.reminderNote },
      });
      return "Proposal recorded. Tell the user about the reminder you'll create.";

    case "propose_schedule_meeting": {
      const startDT = `${input.proposedDate} at ${input.startTime}`;
      pendingProposals.push({
        label: "Schedule Meeting",
        description: `Schedule "${input.subject}" on ${startDT} (${input.durationMinutes} min)`,
        payload: { action: "schedule_meeting", subject: input.subject, requiredAttendees: input.requiredAttendees, optionalAttendees: input.optionalAttendees ?? [], proposedDate: input.proposedDate, startTime: input.startTime, durationMinutes: input.durationMinutes, agenda: input.agenda },
      });
      return "Proposal recorded. Tell the user the meeting details and ask them to confirm.";
    }

    case "propose_attach_file":
      pendingProposals.push({
        label: "Attach File",
        description: `Attach "${input.attachmentName}" to **${input.projectName}**`,
        payload: { action: "attach_file", projectId: input.projectId, projectName: input.projectName, attachmentId: input.attachmentId, attachmentName: input.attachmentName, contentType: input.contentType },
      });
      return "Proposal recorded. Tell the user what you'll do and ask them to confirm.";

    case "draft_reply":
      pendingDraft.ref = input.body as string;
      return `Draft stored. Tell the user: "${input.summary}". Mention they can click "Open in Outlook" to compose the reply.`;

    default:
      return "Unknown tool.";
  }
}

// ── Execute confirmed write actions ───────────────────────────────────────────

export async function executeConfirmed(
  payload: Record<string, unknown>
): Promise<{ reply: string; undoToken?: UndoToken }> {
  if (payload.action === "update_date") {
    // Fetch current date first so we can undo
    const rows = await soqlQuery<{ End_Date__c: string }>(
      `SELECT End_Date__c FROM Project__c WHERE Id = '${payload.projectId}' LIMIT 1`
    );
    const oldDate = rows[0]?.End_Date__c ?? (payload.oldDate as string | undefined);
    await sfUpdate("Project__c", payload.projectId as string, { End_Date__c: payload.newDate });
    return {
      reply: `Done! End date for **${payload.projectName}** updated to **${payload.newDate}**.`,
      undoToken: { action: "update_date", projectId: payload.projectId as string, projectName: payload.projectName as string, oldDate },
    };
  }

  if (payload.action === "log_note") {
    const taskId = await sfCreate("Task", { Subject: payload.noteSubject, Description: payload.noteText, WhatId: payload.projectId, Status: "Completed", ActivityDate: new Date().toISOString().slice(0, 10) });
    return {
      reply: `Note logged on **${payload.projectName}**: "${payload.noteText}"`,
      undoToken: { action: "log_note", projectId: payload.projectId as string, projectName: payload.projectName as string, recordId: taskId },
    };
  }

  if (payload.action === "log_email") {
    const taskId = await sfCreate("Task", {
      Subject:      `Email: ${payload.emailSubject}`,
      Description:  `From: ${payload.emailFrom}\n\n${payload.emailBody}`,
      WhatId:       payload.projectId,
      Status:       "Completed",
      ActivityDate: new Date().toISOString().slice(0, 10),
    });
    return {
      reply: `Email logged as activity on **${payload.projectName}**.`,
      undoToken: { action: "log_email", projectId: payload.projectId as string, projectName: payload.projectName as string, recordId: taskId },
    };
  }

  if (payload.action === "followup_reminder") {
    const taskId = await sfCreate("Task", {
      Subject:      `Follow-up: ${payload.reminderNote}`,
      Description:  payload.reminderNote as string,
      WhatId:       payload.projectId,
      Status:       "Not Started",
      ActivityDate: payload.reminderDate,
    });
    return {
      reply: `Reminder set for **${payload.reminderDate}** on **${payload.projectName}**: "${payload.reminderNote}"`,
      undoToken: { action: "followup_reminder", projectId: payload.projectId as string, projectName: payload.projectName as string, recordId: taskId },
    };
  }

  if (payload.action === "attach_file")     return { reply: `File "${payload.attachmentName}" attachment handled by client.` };
  if (payload.action === "schedule_meeting") return { reply: `Meeting scheduling handled client-side via Office.js.` };
  return { reply: "Unknown action." };
}

// ── Undo last write ───────────────────────────────────────────────────────────

export async function undoAction(token: UndoToken): Promise<string> {
  if (token.action === "update_date" && token.oldDate) {
    await sfUpdate("Project__c", token.projectId, { End_Date__c: token.oldDate });
    return `Undone! End date for **${token.projectName}** reverted to **${token.oldDate}**.`;
  }
  if (["log_note", "log_email", "followup_reminder"].includes(token.action) && token.recordId) {
    await sfDelete("Task", token.recordId);
    return `Undone! Activity removed from **${token.projectName}**.`;
  }
  return "Cannot undo this action.";
}

// ── Standard agent ────────────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  email: EmailCtx,
  history: ConversationMessage[]
): Promise<{ reply: AgentReply; updatedHistory: ConversationMessage[] }> {

  const emailContextStr = buildEmailContextStr(email);
  const messages: ConversationMessage[] = [
    ...history,
    { role: "user", content: history.length === 0 ? `${emailContextStr}\n\n---\nUser: ${userMessage}` : userMessage },
  ];

  const pendingProposals: ProposedAction[] = [];
  const pendingDraft: { ref: string | undefined } = { ref: undefined };

  while (true) {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      return { reply: { reply: text, requiresConfirm: pendingProposals.length > 0, proposedActions: pendingProposals.length ? pendingProposals : undefined, draftBody: pendingDraft.ref }, updatedHistory: messages };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const resultText = await handleToolBlock(block, pendingProposals, pendingDraft, email);
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
    { role: "user", content: history.length === 0 ? `${emailContextStr}\n\n---\nUser: ${userMessage}` : userMessage },
  ];

  const pendingProposals: ProposedAction[] = [];
  const pendingDraft: { ref: string | undefined } = { ref: undefined };

  while (true) {
    let turnText = "";

    const stream = anthropic.messages.stream({ model: "claude-sonnet-4-6", max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages });
    stream.on("text", (delta: string) => { turnText += delta; onEvent({ type: "delta", text: delta }); });

    const response = await stream.finalMessage();
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      onEvent({ type: "done", reply: { reply: turnText, requiresConfirm: pendingProposals.length > 0, proposedActions: pendingProposals.length ? pendingProposals : undefined, draftBody: pendingDraft.ref }, updatedHistory: messages });
      return;
    }

    if (response.stop_reason === "tool_use") {
      if (turnText.trim()) onEvent({ type: "clear" });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        onEvent({ type: "status", text: toolStatusText(block.name) });
        const resultText = await handleToolBlock(block, pendingProposals, pendingDraft, email);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}
