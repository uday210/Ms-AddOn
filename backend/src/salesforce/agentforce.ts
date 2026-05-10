import crypto from "crypto";
import axios, { AxiosError } from "axios";
import { clearToken, getAccessToken } from "./auth";

// Agentforce Sessions API — sf CLI tries api., test.api., dev.api. prefixes.
// Railway's undici-based fetch can't reach api.salesforce.com; axios (http/https module) can.
const getApiBases = () => [
  "https://api.salesforce.com/einstein/ai-agent/v1",
  "https://test.api.salesforce.com/einstein/ai-agent/v1",
  `${process.env.SF_INSTANCE_URL}/einstein/ai-agent/v1`,
];

// Resolved base after a successful createSession — avoids re-probing on every message
let resolvedBase = "https://api.salesforce.com/einstein/ai-agent/v1";

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

  for (const base of getApiBases()) {
    try {
      const res = await axios.post(
        `${base}/agents/${process.env.SF_AGENT_ID}/sessions`,
        {
          externalSessionKey: crypto.randomUUID(),
          instanceConfig: { endpoint: process.env.SF_INSTANCE_URL },
          streamingCapabilities: { chunkTypes: ["Text"] },
          bypassUser: true,
        },
        { headers: agentHeaders(token), validateStatus: () => true }
      );

      if (res.status === 401) {
        clearToken();
        throw new Error(`createSession 401: ${JSON.stringify(res.data)}`);
      }

      if (res.status !== 200 && res.status !== 201) {
        lastError = `createSession ${res.status} (${base}): ${JSON.stringify(res.data)}`;
        console.warn(`[agentforce] ${lastError} — trying next base`);
        continue;
      }

      resolvedBase = base;
      const sessionId: string = res.data.sessionId;
      console.log("[agentforce] session created via", base, ":", sessionId);
      return sessionId;
    } catch (err) {
      const ae = err as AxiosError;
      // Only continue to next base if it's a network error (no response)
      if (!ae.response) {
        lastError = `createSession network error (${base}): ${ae.message}`;
        console.warn(`[agentforce] ${lastError} — trying next base`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(lastError || "createSession failed: all API bases exhausted");
}

export async function sendMessage(
  sfSessionId: string,
  text: string,
  sequenceId: number
): Promise<string> {
  const token = await getAccessToken();
  const res = await axios.post(
    `${resolvedBase}/sessions/${sfSessionId}/messages`,
    { message: { sequenceId, type: "Text", text }, variables: [] },
    {
      headers: { ...agentHeaders(token), Accept: "application/json" },
      validateStatus: () => true,
    }
  );

  if (res.status === 401) { clearToken(); throw new Error(`sendMessage 401`); }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`sendMessage ${res.status}: ${JSON.stringify(res.data)}`);
  }

  const contentType = String(res.headers["content-type"] ?? "");
  if (contentType.includes("text/event-stream")) {
    return parseSSE(typeof res.data === "string" ? res.data : JSON.stringify(res.data));
  }

  return extractText(res.data as Record<string, unknown>);
}

export async function endSession(sfSessionId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await axios.delete(`${resolvedBase}/sessions/${sfSessionId}`, {
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
  return JSON.stringify(data);
}
