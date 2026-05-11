import axios from "axios";
import { getAccessToken } from "./auth";

interface Project {
  Id: string;
  Name: string;
  Status__c?: string;
  End_Date__c?: string;
  Start_Date__c?: string;
  Account__r?: { Name: string };
  OwnedBy?: { Name: string };
  Description__c?: string;
}

async function soql<T>(query: string): Promise<T[]> {
  const token = await getAccessToken();
  const base = process.env.SF_INSTANCE_URL;
  const res = await axios.get(`${base}/services/data/v63.0/query`, {
    params: { q: query },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return (res.data as { records: T[] }).records;
}

async function sfUpdate(sobject: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  const base = process.env.SF_INSTANCE_URL;
  await axios.patch(
    `${base}/services/data/v63.0/sobjects/${sobject}/${id}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
}

async function sfCreate(sobject: string, fields: Record<string, unknown>): Promise<string> {
  const token = await getAccessToken();
  const base = process.env.SF_INSTANCE_URL;
  const res = await axios.post(
    `${base}/services/data/v63.0/sobjects/${sobject}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
  return (res.data as { id: string }).id;
}

function extractProjectName(text: string, subject: string): string {
  // Try to pull a quoted name first
  const quoted = text.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1];
  // Fall back to email subject words (strip common prefixes)
  return subject.replace(/^(re:|fwd?:|fw:)\s*/i, "").trim();
}

async function findProjects(searchTerm: string): Promise<Project[]> {
  const safe = searchTerm.replace(/'/g, "\\'").slice(0, 80);
  return soql<Project>(
    `SELECT Id, Name, Status__c, End_Date__c, Start_Date__c, Account__r.Name, Description__c
     FROM Project__c
     WHERE Name LIKE '%${safe}%'
     LIMIT 5`
  );
}

function formatDate(d?: string) {
  if (!d) return "not set";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function projectSummary(p: Project): string {
  const acct = p.Account__r?.Name ?? "—";
  return (
    `**${p.Name}**\n` +
    `Account: ${acct}\n` +
    `Status: ${p.Status__c ?? "—"}\n` +
    `End Date: ${formatDate(p.End_Date__c)}\n` +
    (p.Description__c ? `Notes: ${p.Description__c.slice(0, 200)}` : "")
  ).trim();
}

export interface DirectReply {
  reply: string;
  requiresConfirm: boolean;
  proposedAction?: { label: string; description: string; payload: object };
}

export async function handleDirect(
  userMessage: string,
  emailSubject: string,
  confirmedPayload?: object
): Promise<DirectReply> {
  const msg = userMessage.toLowerCase();

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

  // ── Find / lookup project ───────────────────────────────────────────────────
  if (msg.includes("find") || msg.includes("look up") || msg.includes("project related") || msg.includes("which project")) {
    const searchTerm = extractProjectName(userMessage, emailSubject);
    const projects = await findProjects(searchTerm);
    if (!projects.length) {
      return {
        reply: `I couldn't find any projects matching "${searchTerm}". Try a different search term or check the project name in Salesforce.`,
        requiresConfirm: false,
      };
    }
    if (projects.length === 1) {
      return {
        reply: `Found it!\n\n${projectSummary(projects[0])}\n\nWhat would you like to do — update the end date, log a note, or get a full summary?`,
        requiresConfirm: false,
      };
    }
    const list = projects.map((p, i) => `${i + 1}. ${p.Name} (${p.Account__r?.Name ?? "—"}) — ${p.Status__c ?? "—"}`).join("\n");
    return {
      reply: `Found ${projects.length} projects matching "${searchTerm}":\n\n${list}\n\nWhich one did you mean?`,
      requiresConfirm: false,
    };
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (msg.includes("summar") || msg.includes("detail") || msg.includes("status") || msg.includes("overview")) {
    const searchTerm = extractProjectName(userMessage, emailSubject);
    const projects = await findProjects(searchTerm);
    if (!projects.length) {
      return { reply: `No project found for "${searchTerm}".`, requiresConfirm: false };
    }
    const p = projects[0];
    return {
      reply: `Here's the summary:\n\n${projectSummary(p)}`,
      requiresConfirm: false,
    };
  }

  // ── Update end date ─────────────────────────────────────────────────────────
  if (msg.includes("update") || msg.includes("extend") || msg.includes("push") || msg.includes("change") && msg.includes("date")) {
    const searchTerm = extractProjectName(userMessage, emailSubject);
    const projects = await findProjects(searchTerm);
    if (!projects.length) {
      return { reply: `No project found for "${searchTerm}". What's the project name?`, requiresConfirm: false };
    }
    const p = projects[0];

    // Try to extract a date from the message
    const dateMatch = userMessage.match(/\b(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
    const weeksMatch = userMessage.match(/(\d+)\s*week/i);
    let newDate: string;
    if (dateMatch) {
      newDate = new Date(dateMatch[1]).toISOString().slice(0, 10);
    } else if (weeksMatch && p.End_Date__c) {
      const d = new Date(p.End_Date__c);
      d.setDate(d.getDate() + parseInt(weeksMatch[1]) * 7);
      newDate = d.toISOString().slice(0, 10);
    } else {
      return {
        reply: `I found **${p.Name}** (current end date: ${formatDate(p.End_Date__c)}). What date should I set?`,
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

  // ── Log note ────────────────────────────────────────────────────────────────
  if (msg.includes("log") || msg.includes("note") || msg.includes("record") || msg.includes("document")) {
    const searchTerm = extractProjectName(userMessage, emailSubject);
    const projects = await findProjects(searchTerm);
    if (!projects.length) {
      return { reply: `No project found for "${searchTerm}". What's the project name?`, requiresConfirm: false };
    }
    const p = projects[0];
    const noteText = userMessage.replace(/log\s+(a\s+)?(note|this)?/i, "").replace(/on\s+\w+/i, "").trim() || "Follow-up from email";
    return {
      reply: `Confirm — log this note on **${p.Name}**?\n\n"${noteText}"`,
      requiresConfirm: true,
      proposedAction: {
        label: "Log Note",
        description: `Log note on ${p.Name}`,
        payload: { action: "log_note", projectId: p.Id, projectName: p.Name, noteSubject: `Email note — ${emailSubject}`, noteText },
      },
    };
  }

  // ── Draft reply ─────────────────────────────────────────────────────────────
  if (msg.includes("draft") || msg.includes("reply") || msg.includes("email")) {
    const searchTerm = extractProjectName(userMessage, emailSubject);
    const projects = await findProjects(searchTerm);
    const ctx = projects.length ? projectSummary(projects[0]) : "the project";
    return {
      reply: `Here's a draft reply:\n\n---\nThank you for the update. I've reviewed the project details and will ensure the necessary changes are made on our end. I'll keep you posted on any progress.\n\nBest regards\n---\n\n*(Based on: ${ctx})*`,
      requiresConfirm: false,
    };
  }

  // ── Fallback ────────────────────────────────────────────────────────────────
  return {
    reply: "I can help you find a project, get a summary, update an end date, log a note, or draft a reply. What would you like to do?",
    requiresConfirm: false,
  };
}
