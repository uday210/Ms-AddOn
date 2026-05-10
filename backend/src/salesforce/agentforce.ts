import crypto from "crypto";
import { clearToken, getAccessToken } from "./auth";

// Agentforce Sessions API lives on api.salesforce.com, not the org instance URL.
// The sf CLI tries these prefixes in order: api., test.api., dev.api.
const API_BASES = [
  "https://api.salesforce.com/einstein/ai-agent/v1",
  "https://test.api.salesforce.com/einstein/ai-agent/v1",
];

// Resolved base after a successful createSession — avoids re-probing on every message
let resolvedBase = API_BASES[0];

function agentHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-client-name": "afdx",
  };
}

export async function createSession(): Promise<string> {
  const token = await getAccessToken();
  let lastError = "";

  for (const base of API_BASES) {
    const res = await fetch(
      `${base}/agents/${process.env.SF_AGENT_ID}/sessions`,
      {
        method: "POST",
        headers: agentHeaders(token),
        body: JSON.stringify({
          externalSessionKey: crypto.randomUUID(),
          instanceConfig: { endpoint: process.env.SF_INSTANCE_URL },
          streamingCapabilities: { chunkTypes: ["Text"] },
          bypassUser: true,
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401) clearToken();
      lastError = `createSession ${res.status} (${base}): ${body}`;
      // 404 means wrong endpoint — try next; other errors are terminal
      if (res.status !== 404) throw new Error(lastError);
      console.warn(`[agentforce] ${lastError} — trying next base`);
      continue;
    }

    const data = await res.json() as { sessionId: string };
    resolvedBase = base;
    console.log("[agentforce] session created via", base, ":", data.sessionId);
    return data.sessionId;
  }

  throw new Error(lastError || "createSession failed: all API bases exhausted");
}

export async function sendMessage(
  sfSessionId: string,
  text: string,
  sequenceId: number
): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${resolvedBase}/sessions/${sfSessionId}/messages`, {
    method: "POST",
    headers: { ...agentHeaders(token), Accept: "application/json" },
    body: JSON.stringify({
      message: { sequenceId, type: "Text", text },
      variables: [],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) clearToken();
    throw new Error(`sendMessage ${res.status}: ${body}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  if (contentType.includes("text/event-stream")) {
    return parseSSE(raw);
  }

  try {
    return extractText(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export async function endSession(sfSessionId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${resolvedBase}/sessions/${sfSessionId}`, {
      method: "DELETE",
      headers: agentHeaders(token),
    });
    console.log("[agentforce] session ended:", sfSessionId);
  } catch {
    // best-effort
  }
}

function parseSSE(raw: string): string {
  const chunks: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") break;
    try {
      const t = extractText(JSON.parse(payload));
      if (t) chunks.push(t);
    } catch { /* skip malformed */ }
  }
  return chunks.join("");
}

function extractText(data: Record<string, unknown>): string {
  if (typeof data.text === "string") return data.text;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.messages)) {
    return (data.messages as Record<string, unknown>[])
      .map((m) => (m.text ?? m.message ?? "") as string)
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
