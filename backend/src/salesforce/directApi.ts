/**
 * Fallback path used only when the Apex proxy (Agentforce) is unavailable.
 * No external AI API — just direct SOQL/DML on Project__c.
 */
import axios from "axios";
import { getAccessToken } from "./auth";

interface Project {
  Id: string;
  Name: string;
  Status__c?: string;
  End_Date__c?: string;
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

// ── Salesforce REST helpers ───────────────────────────────────────────────────
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
    `SELECT Id, Name, Status__c, End_Date__c, Account__r.Name, Description__c
     FROM Project__c WHERE Name LIKE '%${safe}%' LIMIT 5`
  );
}

// ── Extract project name from email body (simple pattern matching) ─────────────
// The Agentforce agent handles AI reasoning — this fallback just needs to find
// the project name well enough to do a SOQL lookup when Agentforce is down.
function extractProjectName(userMsg: string, email: EmailCtx): string | null {
  const sources = [email.body, userMsg, email.subject];

  // "project name : Fabrikam CRM Integration"
  for (const src of sources) {
    const m = src.match(/project\s+name\s*[:\-;]\s*([^\n\r,;.]{3,80})/i);
    if (m) return m[1].trim();
  }

  // Quoted name in user message
  const quoted = userMsg.match(/["']([^"']{3,80})["']/);
  if (quoted) return quoted[1];

  // Fall back to cleaned email subject
  const cleaned = email.subject.replace(/^(re:|fwd?:|fw:)\s*/i, "").trim();
  return cleaned || null;
}

function formatDate(d?: string | null) {
  if (!d) return "not set";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function projectCard(p: Project): string {
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

  // Confirmed write actions
  if (confirmedPayload) {
    const p = confirmedPayload as Record<string, unknown>;
    if (p.action === "update_date") {
      await sfUpdate("Project__c", p.projectId as string, { End_Date__c: p.newDate });
      return { reply: `Done! End date for **${p.projectName}** updated to **${formatDate(p.newDate as string)}**.`, requiresConfirm: false };
    }
    if (p.action === "log_note") {
      await sfCreate("Task", {
        Subject: p.noteSubject, Description: p.noteText, WhatId: p.projectId,
        Status: "Completed", ActivityDate: new Date().toISOString().slice(0, 10),
      });
      return { reply: `Note logged on **${p.projectName}**: "${p.noteText}"`, requiresConfirm: false };
    }
  }

  const msg = userMessage.toLowerCase();
  const projectName = extractProjectName(userMessage, email);
  const projects = projectName ? await findProjects(projectName) : [];

  if (msg.includes("find") || msg.includes("look up") || msg.includes("project related")) {
    if (!projects.length) return { reply: `Couldn't find a project${projectName ? ` matching "${projectName}"` : ""}. Can you confirm the project name?`, requiresConfirm: false };
    if (projects.length === 1) return { reply: `Found it!\n\n${projectCard(projects[0])}\n\nWhat would you like to do next?`, requiresConfirm: false };
    const list = projects.map((p, i) => `${i + 1}. ${p.Name} (${p.Account__r?.Name ?? "—"})`).join("\n");
    return { reply: `Found ${projects.length} matches:\n\n${list}\n\nWhich one?`, requiresConfirm: false };
  }

  if (msg.includes("summar") || msg.includes("detail") || msg.includes("status")) {
    if (!projects.length) return { reply: `No project found. What's the project name?`, requiresConfirm: false };
    return { reply: projectCard(projects[0]), requiresConfirm: false };
  }

  if (msg.includes("update") || msg.includes("extend") || msg.includes("push")) {
    if (!projects.length) return { reply: `No project found. What's the project name?`, requiresConfirm: false };
    const p = projects[0];
    const allText = `${userMessage} ${email.body}`;
    const monthMatch = allText.match(/(\d+)\s*(?:more\s+)?months?/i);
    const weekMatch = allText.match(/(\d+)\s*(?:more\s+)?weeks?/i);
    let newDate: string | undefined;
    if (monthMatch && p.End_Date__c) { const d = new Date(p.End_Date__c); d.setMonth(d.getMonth() + parseInt(monthMatch[1])); newDate = d.toISOString().slice(0, 10); }
    else if (weekMatch && p.End_Date__c) { const d = new Date(p.End_Date__c); d.setDate(d.getDate() + parseInt(weekMatch[1]) * 7); newDate = d.toISOString().slice(0, 10); }
    if (!newDate) return { reply: `Found **${p.Name}** (end date: ${formatDate(p.End_Date__c)}). What date should I set?`, requiresConfirm: false };
    return {
      reply: `Confirm — move **${p.Name}** end date from **${formatDate(p.End_Date__c)}** to **${formatDate(newDate)}**?`,
      requiresConfirm: true,
      proposedAction: { label: "Update End Date", description: `Set end date to ${formatDate(newDate)}`, payload: { action: "update_date", projectId: p.Id, projectName: p.Name, oldDate: p.End_Date__c, newDate } },
    };
  }

  if (msg.includes("log") || msg.includes("note")) {
    if (!projects.length) return { reply: `No project found. What's the project name?`, requiresConfirm: false };
    const p = projects[0];
    const noteText = `Follow-up: ${email.subject}`;
    return {
      reply: `Confirm — log this note on **${p.Name}**?\n\n"${noteText}"`,
      requiresConfirm: true,
      proposedAction: { label: "Log Note", description: `Log note on ${p.Name}`, payload: { action: "log_note", projectId: p.Id, projectName: p.Name, noteSubject: `Email — ${email.subject}`, noteText } },
    };
  }

  return { reply: "I can help you **find a project**, get a **summary**, **update the end date**, **log a note**, or **draft a reply**. What would you like to do?", requiresConfirm: false };
}
