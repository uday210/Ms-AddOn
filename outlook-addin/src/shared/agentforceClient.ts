/**
 * Calls Salesforce Agentforce Sessions API directly from the browser,
 * bypassing the Railway backend's network restrictions.
 *
 * Flow:
 *   1. GET /api/token  →  { accessToken, instanceUrl, agentId }
 *   2. POST api.salesforce.com/.../agents/{id}/sessions  →  sessionId
 *   3. POST api.salesforce.com/.../sessions/{id}/messages  →  reply text
 */

declare const __BACKEND_URL__: string;
const BACKEND_URL = typeof __BACKEND_URL__ !== "undefined" ? __BACKEND_URL__ : "http://localhost:3001";
const AGENT_BASE = "https://api.salesforce.com/einstein/ai-agent/v1";

export interface AgentSession {
  accessToken: string;
  instanceUrl: string;
  agentId: string;
  sessionId: string;
  sequenceId: number;
}

export interface TokenInfo {
  accessToken: string;
  instanceUrl: string;
  agentId: string;
}

export async function getTokenInfo(): Promise<TokenInfo> {
  const res = await fetch(`${BACKEND_URL}/api/token`, { method: "GET" });
  if (!res.ok) throw new Error(`token fetch ${res.status}`);
  return res.json() as Promise<TokenInfo>;
}

export async function createAgentSession(info: TokenInfo): Promise<string> {
  const res = await fetch(`${AGENT_BASE}/agents/${info.agentId}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${info.accessToken}`,
      "Content-Type": "application/json",
      "x-client-name": "afdx",
    },
    body: JSON.stringify({
      externalSessionKey: crypto.randomUUID(),
      instanceConfig: { endpoint: info.instanceUrl },
      streamingCapabilities: { chunkTypes: ["Text"] },
      bypassUser: true,
    }),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}`);
  const data = await res.json() as { sessionId: string };
  return data.sessionId;
}

export async function sendAgentMessage(
  info: TokenInfo,
  sessionId: string,
  text: string,
  sequenceId: number
): Promise<string> {
  const res = await fetch(`${AGENT_BASE}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${info.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-client-name": "afdx",
    },
    body: JSON.stringify({
      message: { sequenceId, type: "Text", text },
      variables: [],
    }),
  });
  if (!res.ok) throw new Error(`sendMessage ${res.status}`);
  const data = await res.json();
  return extractReplyText(data);
}

function extractReplyText(data: unknown): string {
  if (!data || typeof data !== "object") return String(data ?? "");
  const d = data as Record<string, unknown>;

  if (typeof d.text === "string") return d.text;
  if (typeof d.message === "string") return d.message;

  if (Array.isArray(d.messages)) {
    return (d.messages as unknown[])
      .map((m) => {
        if (typeof m === "object" && m !== null) {
          const msg = m as Record<string, unknown>;
          return typeof msg.text === "string" ? msg.text : (typeof msg.message === "string" ? msg.message : "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(data);
}
