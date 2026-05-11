import Anthropic from "@anthropic-ai/sdk";
import { findProjects, sfUpdate, sfCreate, SFProject } from "../salesforce/directApi";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Sales Copilot assistant embedded in Microsoft Outlook. You help sales reps manage their Salesforce projects directly from email — quickly and concisely.

You have tools to look up projects and propose write actions (updates, notes). Write actions always require the user to confirm before they execute.

Guidelines:
- Extract the project name from the email context if the user does not specify one.
- After finding a project, show a brief summary: name, account, status, end date.
- When proposing a date update, always use the exact date the user specifies.
- Parse dates like "1 Jan 2030", "January 1 2030", "2030-01-01" correctly.
- Keep replies short — 2-4 sentences max.
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
];

export interface EmailCtx {
  subject: string;
  from: string;
  bodyPreview: string;
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
  return "Unknown action.";
}

// ── Main Claude handler ───────────────────────────────────────────────────────
export async function runAgent(
  userMessage: string,
  email: EmailCtx,
  history: ConversationMessage[]
): Promise<{ reply: AgentReply; updatedHistory: ConversationMessage[] }> {

  const emailContext = `Email context:\nSubject: ${email.subject}\nFrom: ${email.from}\n\n${email.bodyPreview}`;

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
