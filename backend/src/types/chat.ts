export interface EmailContext {
  subject: string;
  from: string;
  to: string;
  bodyPreview: string;
}

export interface ChatRequest {
  emailContext: EmailContext;
  userMessage: string;
  sessionId?: string;
  confirmed?: boolean;
  proposedAction?: object;
}

export interface ProposedAction {
  label: string;
  description: string;
  payload: object;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  requiresConfirm: boolean;
  proposedAction?: ProposedAction;
}
