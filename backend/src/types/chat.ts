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

export interface ProposedAction {
  label: string;
  description: string;
  payload: object;
}

export interface UndoToken {
  action: string;
  projectId: string;
  projectName: string;
  oldDate?: string;    // for date-update undo
  recordId?: string;   // for task-deletion undo
}

export interface ChatRequest {
  emailContext: EmailContext;
  userMessage: string;
  sessionId?: string;
  confirmed?: boolean;
  proposedActions?: object[];   // multi-action confirm
  proposedAction?: object;      // kept for backward-compat
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  requiresConfirm: boolean;
  proposedActions?: ProposedAction[];
  draftBody?: string;
  undoTokens?: UndoToken[];
}
