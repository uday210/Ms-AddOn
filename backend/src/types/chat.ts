export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export interface EmailContext {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bodyPreview: string;
  attachments?: EmailAttachment[];
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
  draftBody?: string;
}
