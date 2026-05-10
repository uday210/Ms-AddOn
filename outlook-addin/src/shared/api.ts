import { EmailContext } from "./office";

declare const __BACKEND_URL__: string;
const BACKEND_URL = (typeof __BACKEND_URL__ !== "undefined" && __BACKEND_URL__)
  ? __BACKEND_URL__
  : "http://localhost:3001";

export interface ChatRequest {
  emailContext: EmailContext;
  userMessage: string;
  sessionId?: string;
  confirmed?: boolean;
  proposedAction?: object;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  requiresConfirm: boolean;
  proposedAction?: {
    label: string;
    description: string;
    payload: object;
  };
}

export async function sendMessage(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error ${res.status}: ${text}`);
  }

  return res.json() as Promise<ChatResponse>;
}
