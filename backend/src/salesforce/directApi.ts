import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";
import { getAccessToken } from "./auth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Project {
  Id: string;
  Name: string;
  Status__c?: string;
  End_Date__c?: string;
  Start_Date__c?: string;
  Account__r?: { Name: string };
  Description__c?: string;
}

export interface EmailCtx {
  subject: string;
  body: string;
  from: string;
}

export interface DirectReply {
  reply: string;
  requiresConfirm: boolean;
  proposedAction?: { label: string; description: string; payload: object };
}

interface ExtractedIntent {
  action: "find" | "summary" | "update_date" | "log_note" | "draft_reply" | "unknown";
  projectName?: string;
  newDate?: string;      // ISO yyyy-mm-dd
  monthsToAdd?: number;
  weeksToAdd?: number;
  noteText?: string;
}

// ── Action 1: Extract intent + entities from email using a prompt ─────────────
// Passes the full email content to Claude and gets back structured data.
// This is the "Extract Email Info" agent action — no regex, pure LLM reasoning.
async function extractIntent(userMsg: string, email: EmailCtx): Promise<ExtractedIntent> {
  const prompt = `You are a Salesforce sales assistant. A sales rep is looking at an email and made a request.

EMAIL SUBJECT: ${email.subject}
EMAIL FROM: ${email.from}
EMAIL BODY:
${email.body}

SALES REP REQUEST: ${userMsg}

Your job: read the email carefully and extract key details. Return a single JSON object:
{
  "action": one of "find" | "summary" | "update_date" | "log_note" | "draft_reply" | "unknown",
  "projectName": the Salesforce project name found ANYWHERE in the email subject, body, or request (string or null),
  "newDate": explicit new end date in yyyy-mm-dd format if mentioned (string or null),
  "monthsToAdd": number of months to extend if mentioned like "3 months", "2 more months" (integer or null),
  "weeksToAdd": number of weeks to extend if mentioned (integer or null),
  "noteText": text to log as a note if the action is log_note (string or null)
}

Rules:
- action comes from what the SALES REP asked, not the email content.
- projectName can be anywhere — look in the body for patterns like "project name: X" or a proper noun.
- Return ONLY valid JSON, nothing else.`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (msg.content[0] as { type: string; text: string }).text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned non-JSON: " + text);
  return JSON.parse(jsonMatch[0]) as ExtractedIntent;
}

// ── Salesforce helpers ────────────────────────────────────────────────────────
async function soql<T>(query: string): Promise<T[]> {
  const token = await getAccessToken();
  const res = await axios.get(`${process.env.SF_INSTANCE_URL}/services/data/v63.0/query`, {
    params: { q: query },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return (res.data as { records: T[] }).records;
}

async function sfUpdate(sobject: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  await axios.patch(
    `${process.env.SF_INSTANCE_URL}/services/data/v63.0/sobjects/${sobject}/${id}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
}

async function sfCreate(sobject: string, fields: Record<string, unknown>): Promise<string> {
  const token = await getAccessToken();
  const res = await axios.post(
    `${process.env.SF_INSTANCE_URL}/services/data/v63.0/sobjects/${sobject}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
  return (res.data as { id: string }).id;
}

async function findProjects(term: string): Promise<Project[]> {
  const safe = term.replace(/'/g, "\\'").slice(0, 80);
  return soql<Project>(
    `SELECT Id, Name, Status__c, End_Date__c, Start_Date__c, Account__r.Name, Description__c
     FROM Project__c WHERE Name LIKE '%${safe}%' LIMIT 5`
  );
}

function formatDate(d?: string | null) {
  if (!d) return "not set";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function projectSummary(p: Project): string {
  return [
    `**${p.Name}**`,
    `Account: ${p.Account__r?.Name ?? "—"}`,
    `Status: ${p.Status__c ?? "—"}`,
    `End Date: ${formatDate(p.End_Date__c)}`,
    p.Description__c ? `Notes: ${p.Description__c.slice(0, 200)}` : "",
  ].filter(Boolean).join("\n");
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function handleDirect(
  userMessage: string,
  email: EmailCtx,
  confirmedPayload?: object
): Promise<DirectReply> {

  // ── Confirmed write action ──────────────────────────────────────────────────
  if (confirmedPayload) {
    const p = confirmedPayload as Record<string, unknown>;
    if (p.action === "update_date") {
      await sfUpdate("Project__c", p.projectId as string, { End_Date__c: p.newDate });
      return {
        reply: `Done! End date for **${p.projectName}** updated to **${formatDate(p.newDate as string)}**.`,
        requiresConfirm: false,
      };
    }
    if (p.action === "log_note") {
      await sfCreate("Task", {
        Subject: p.noteSubject,
        Description: p.noteText,
        WhatId: p.projectId,
        Status: "Completed",
        ActivityDate: new Date().toISOString().slice(0, 10),
      });
      return {
        reply: `Note logged on **${p.projectName}**: "${p.noteText}"`,
        requiresConfirm: false,
      };
    }
  }

  // ── Use Claude to understand intent + extract project name / dates ──────────
  const intent = await extractIntent(userMessage, email);
  console.log("[directApi] intent:", JSON.stringify(intent));

  // Lookup project in Salesforce
  let projects: Project[] = [];
  if (intent.projectName) {
    projects = await findProjects(intent.projectName);
  }

  // ── Route by action ─────────────────────────────────────────────────────────
  switch (intent.action) {

    case "find":
    case "summary": {
      if (!projects.length) {
        return {
          reply: `I couldn't find a project${intent.projectName ? ` matching "${intent.projectName}"` : ""} in Salesforce. Could you confirm the project name?`,
          requiresConfirm: false,
        };
      }
      if (projects.length === 1) {
        const verb = intent.action === "find" ? "Found it!" : "Here's the summary:";
        return {
          reply: `${verb}\n\n${projectSummary(projects[0])}\n\nWhat would you like to do — update the end date, log a note, or draft a reply?`,
          requiresConfirm: false,
        };
      }
      const list = projects.map((p, i) => `${i + 1}. ${p.Name} (${p.Account__r?.Name ?? "—"}) — ${p.Status__c ?? "—"}`).join("\n");
      return {
        reply: `Found ${projects.length} projects:\n\n${list}\n\nWhich one?`,
        requiresConfirm: false,
      };
    }

    case "update_date": {
      if (!projects.length) {
        return { reply: `No project found${intent.projectName ? ` for "${intent.projectName}"` : ""}. What's the project name?`, requiresConfirm: false };
      }
      const p = projects[0];
      let newDate: string | undefined = intent.newDate ?? undefined;

      if (!newDate && intent.monthsToAdd && p.End_Date__c) {
        const d = new Date(p.End_Date__c);
        d.setMonth(d.getMonth() + intent.monthsToAdd);
        newDate = d.toISOString().slice(0, 10);
      } else if (!newDate && intent.weeksToAdd && p.End_Date__c) {
        const d = new Date(p.End_Date__c);
        d.setDate(d.getDate() + intent.weeksToAdd * 7);
        newDate = d.toISOString().slice(0, 10);
      }

      if (!newDate) {
        return {
          reply: `Found **${p.Name}** (current end date: ${formatDate(p.End_Date__c)}). What date should I set?`,
          requiresConfirm: false,
        };
      }
      return {
        reply: `Confirm — move **${p.Name}** end date from **${formatDate(p.End_Date__c)}** to **${formatDate(newDate)}**?`,
        requiresConfirm: true,
        proposedAction: {
          label: "Update End Date",
          description: `Change end date to ${formatDate(newDate)}`,
          payload: { action: "update_date", projectId: p.Id, projectName: p.Name, oldDate: p.End_Date__c, newDate },
        },
      };
    }

    case "log_note": {
      if (!projects.length) {
        return { reply: `No project found${intent.projectName ? ` for "${intent.projectName}"` : ""}. What's the project name?`, requiresConfirm: false };
      }
      const p = projects[0];
      const noteText = intent.noteText || `Follow-up: ${email.subject}`;
      return {
        reply: `Confirm — log this note on **${p.Name}**?\n\n"${noteText}"`,
        requiresConfirm: true,
        proposedAction: {
          label: "Log Note",
          description: `Log note on ${p.Name}`,
          payload: { action: "log_note", projectId: p.Id, projectName: p.Name, noteSubject: `Email — ${email.subject}`, noteText },
        },
      };
    }

    case "draft_reply": {
      const ctx = projects.length ? projectSummary(projects[0]) : email.subject;
      return {
        reply: `Here's a draft reply:\n\n---\nThank you for the update. I've reviewed the project details and will ensure the necessary changes are made on our end. I'll keep you posted on any progress.\n\nBest regards\n---\n\n*(Based on: ${ctx})*`,
        requiresConfirm: false,
      };
    }

    default:
      return {
        reply: "I can help you **find a project**, get a **summary**, **update the end date**, **log a note**, or **draft a reply**. What would you like to do?",
        requiresConfirm: false,
      };
  }
}
