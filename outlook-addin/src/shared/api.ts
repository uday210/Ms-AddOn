import { EmailContext } from "./office";

declare const __BACKEND_URL__: string;
const BACKEND_URL = typeof __BACKEND_URL__ !== "undefined" ? __BACKEND_URL__ : "http://localhost:3001";

export interface ProposedAction {
  label: string;
  description: string;
  payload: object;
}

export interface UndoToken {
  action: string;
  projectId: string;
  projectName: string;
  oldDate?: string;
  recordId?: string;
}

export interface ChatRequest {
  emailContext: EmailContext;
  userMessage: string;
  sessionId?: string;
  confirmed?: boolean;
  proposedActions?: object[];
  proposedAction?: object;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  requiresConfirm: boolean;
  proposedActions?: ProposedAction[];
  draftBody?: string;
  undoTokens?: UndoToken[];
}

export type SSEEvent =
  | { type: "status"; text: string }
  | { type: "delta";  text: string }
  | { type: "clear" }
  | { type: "done"; reply: string; sessionId: string; requiresConfirm: boolean; proposedActions?: ProposedAction[]; draftBody?: string }
  | { type: "error"; message: string };

// ── Streaming chat ────────────────────────────────────────────────────────────
export async function* streamChat(req: ChatRequest): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${BACKEND_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!response.ok) throw new Error(`Backend error ${response.status}: ${await response.text()}`);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.startsWith("data: ")) yield JSON.parse(part.slice(6)) as SSEEvent;
    }
  }
}

// ── Standard (confirmations) ──────────────────────────────────────────────────
export async function sendMessage(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ChatResponse>;
}

// ── Undo ──────────────────────────────────────────────────────────────────────
export async function performUndo(tokens: UndoToken[]): Promise<string[]> {
  const results = await Promise.all(tokens.map(async (token) => {
    const res = await fetch(`${BACKEND_URL}/api/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token),
    });
    const data = await res.json() as { reply?: string; error?: string };
    return data.reply ?? data.error ?? "Undo failed";
  }));
  return results;
}

// ── File attachment ───────────────────────────────────────────────────────────
export interface AttachRequest {
  projectId: string;
  attachmentName: string;
  contentType: string;
  base64Content: string;
}

export async function attachFile(req: AttachRequest): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Attach error ${res.status}: ${await res.text()}`);
}
