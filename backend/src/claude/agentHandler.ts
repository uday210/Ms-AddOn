import Anthropic from "@anthropic-ai/sdk";
import { findProjects, soqlQuery, sfUpdate, sfCreate, SFProject } from "../salesforce/directApi";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Sales Copilot assistant embedded in Microsoft Outlook. You help sales reps manage their Salesforce projects directly from email — quickly and concisely.

You have tools to look up projects, list all projects, and propose write actions (updates, notes). Write actions always require the user to confirm before they execute.

Guidelines:
- Extract the project name from the email context if the user does not specify one.
- After finding a project, show a concise markdown table summary: name, account, status, end date.
- When proposing a date update, always use the exact date the user specifies. Parse natural dates correctly (e.g. "1 Jan 2030" → 2030-01-01).
- When listing all projects, show them in a clean markdown table with Name, Account, Status, End Date columns.
- For draft replies, write a professional, concise email reply referencing project details.
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
    name: "propose_update_end_date",
    description: "Propose changing a project's end date. Shows a confirmation dialog to the user before executing.",
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
    name: "list_all_projects",
    description: "List all Salesforce projects, optionally filtered by status. Use when the user asks to see all projects or list projects.",
    input_schema: {
      type: "object",
      properties: {
        statusFilter: { type: "string", description: "Optional: filter by Status__c value e.g. 'Active', 'On Hold', 'Completed'" },
      },
      required: [],
    },
  },
  {
    name: "propose_log_note",
    description: "Propose logging a follow-up note/activity on a project. Shows a confirmation dialog to the user before executing.",
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
    description: "Propose scheduling a meeting with the email participants. Opens Outlook's native meeting composer pre-filled with attendees, subject, date/time, and agenda. Use when the user asks to schedule, set up, or book a meeting.",
    input_schema: {
      type: "object",
      properties: {
        subject:            { type: "string",  description: "Meeting subject line" },
        requiredAttendees:  { type: "array",   items: { type: "string" }, description: "Email addresses of required attendees (typically From + To)" },
        optionalAttendees:  { type: "array",   items: { type: "string" }, description: "Email addresses of optional attendees (CC recipients)" },
        proposedDate:       { type: "string",  description: "Suggested meeting date YYYY-MM-DD. Pick a sensible future date based on context." },
        startTime:          { type: "string",  description: "Start time HH:MM in 24h format e.g. 14:00" },
        durationMinutes:    { type: "number",  description: "Duration in minutes, e.g. 30 or 60" },
        agenda:             { type: "string",  description: "Meeting agenda or body text summarising the purpose" },
      },
      required: ["subject", "requiredAttendees", "proposedDate", "startTime", "durationMinutes", "agenda"],
    },
  },
  {
    name: "propose_attach_file",
    description: "Propose attaching an email attachment to a Salesforce project. Use only when the email has attachments listed in the context and the user wants to attach one. Shows a confirmation dialog before uploading.",
    input_schema: {
      type: "object",
      properties: {
        projectId:      { type: "string", description: "Salesforce Project__c record Id" },
        projectName:    { type: "string" },
        attachmentId:   { type: "string", description: "The Office.js attachment id from the email context" },
        attachmentName: { type: "string", description: "The filename of the attachment" },
        contentType:    { type: "string", description: "MIME type of the attachment" },
      },
      required: ["projectId", "projectName", "attachmentId", "attachmentName", "contentType"],
    },
  },
];

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
}

export type ConversationMessage = Anthropic.MessageParam;

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
  if (payload.action === "attach_file") {
    return `File "${payload.attachmentName}" attachment was handled by the client.`;
  }
  if (payload.action === "schedule_meeting") {
    return `Meeting scheduling is handled client-side via Office.js.`;
  }
  return "Unknown action.";
}

// ── Main Claude handler ───────────────────────────────────────────────────────
export async function runAgent(
  userMessage: string,
  email: EmailCtx,
  history: ConversationMessage[]
): Promise<{ reply: AgentReply; updatedHistory: ConversationMessage[] }> {

  const attachmentList = email.attachments?.length
    ? `\nAttachments:\n${email.attachments.map((a) => `  - id="${a.id}" name="${a.name}" type="${a.contentType}" size=${a.size}`).join("\n")}`
    : "";
  const ccLine = email.cc ? `\nCC: ${email.cc}` : "";
  const toLine = email.to ? `\nTo: ${email.to}` : "";
  const emailContext = `Email context:\nSubject: ${email.subject}\nFrom: ${email.from}${toLine}${ccLine}${attachmentList}\n\n${email.bodyPreview}`;

  // Build messages: history + current user turn
  const messages: ConversationMessage[] = [
    ...history,
    {
      role: "user",
      content: history.length === 0
        ? `${emailContext}\n\n---\nUser: ${userMessage}`
        : userMessage,
    },
  ];

  let pendingProposal: AgentReply["proposedAction"] | undefined;

  // Agentic loop — Claude may call tools multiple times before final reply
  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Add assistant turn to history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Final text reply
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const updatedHistory = messages;

      if (pendingProposal) {
        return {
          reply: { reply: text, requiresConfirm: true, proposedAction: pendingProposal },
          updatedHistory,
        };
      }
      return { reply: { reply: text, requiresConfirm: false }, updatedHistory };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, unknown>;
        let resultText: string;

        if (block.name === "find_project") {
          const results: SFProject[] = await findProjects(input.name as string);
          resultText = results.length
            ? JSON.stringify(results)
            : `No projects found matching "${input.name}".`;

        } else if (block.name === "list_all_projects") {
          const statusFilter = input.statusFilter as string | undefined;
          const where = statusFilter ? `WHERE Status__c = '${statusFilter.replace(/'/g, "\\'")}'` : "";
          const records = await soqlQuery<SFProject>(
            `SELECT Id, Name, Status__c, End_Date__c, Account__r.Name FROM Project__c ${where} ORDER BY Name LIMIT 20`
          );
          resultText = records.length ? JSON.stringify(records) : "No projects found.";

        } else if (block.name === "propose_update_end_date") {
          pendingProposal = {
            label: "Update End Date",
            description: `Set end date of ${input.projectName} to ${input.newEndDate}`,
            payload: {
              action: "update_date",
              projectId:   input.projectId,
              projectName: input.projectName,
              oldDate:     input.currentEndDate ?? null,
              newDate:     input.newEndDate,
            },
          };
          resultText = "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

        } else if (block.name === "propose_log_note") {
          pendingProposal = {
            label: "Log Note",
            description: `Log note on ${input.projectName}: "${input.noteText}"`,
            payload: {
              action:       "log_note",
              projectId:    input.projectId,
              projectName:  input.projectName,
              noteSubject:  input.subject,
              noteText:     input.noteText,
            },
          };
          resultText = "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

        } else if (block.name === "propose_schedule_meeting") {
          const startDT = `${input.proposedDate} at ${input.startTime}`;
          pendingProposal = {
            label: "Schedule Meeting",
            description: `Schedule "${input.subject}" on ${startDT} (${input.durationMinutes} min) with ${(input.requiredAttendees as string[]).join(", ")}`,
            payload: {
              action:             "schedule_meeting",
              subject:            input.subject,
              requiredAttendees:  input.requiredAttendees,
              optionalAttendees:  input.optionalAttendees ?? [],
              proposedDate:       input.proposedDate,
              startTime:          input.startTime,
              durationMinutes:    input.durationMinutes,
              agenda:             input.agenda,
            },
          };
          resultText = "Proposal recorded. Tell the user the meeting details and ask them to confirm to open the invite form.";

        } else if (block.name === "propose_attach_file") {
          pendingProposal = {
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
          resultText = "Proposal recorded. Tell the user what you're going to do and ask them to confirm.";

        } else {
          resultText = "Unknown tool.";
        }

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText });
      }

      messages.push({ role: "user", content: toolResults });
      // Continue loop for Claude to process tool results
    }
  }
}
