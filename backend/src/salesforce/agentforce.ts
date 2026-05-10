import crypto from "crypto";
import { clearToken, getAccessToken } from "./auth";

const base = () =>
  `${process.env.SF_INSTANCE_URL}/einstein/ai-agent/v1`;

export async function createSession(): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(
    `${base()}/agents/${process.env.SF_AGENT_ID}/sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        externalSessionKey: crypto.randomUUID(),
        instanceConfig: { endpoint: process.env.SF_INSTANCE_URL },
        streamingCapabilities: { chunkTypes: ["Text"] },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) clearToken();
    throw new Error(`createSession ${res.status}: ${body}`);
  }

  const data = await res.json() as { sessionId: string };
  console.log("[agentforce] session created:", data.sessionId);
  return data.sessionId;
}

export async function sendMessage(
  sfSessionId: string,
  text: string,
  sequenceId: number
): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${base()}/sessions/${sfSessionId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
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
    await fetch(`${base()}/sessions/${sfSessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
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
