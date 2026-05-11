import { Router, Request, Response } from "express";
import { runAgent, executeConfirmed, ConversationMessage, EmailCtx } from "../claude/agentHandler";
import { ChatRequest, ChatResponse, UndoToken } from "../types/chat";

const router = Router();

interface SessionState { history: ConversationMessage[] }
const sessions = new Map<string, SessionState>();

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as ChatRequest;

  if (!body.emailContext || body.userMessage === undefined) {
    res.status(400).json({ error: "emailContext and userMessage are required" });
    return;
  }

  const email: EmailCtx = {
    subject: body.emailContext.subject,
    from:    body.emailContext.from,
    to:      body.emailContext.to,
    cc:      body.emailContext.cc,
    bodyPreview: body.emailContext.bodyPreview ?? "",
    attachments: body.emailContext.attachments,
  };

  try {
    // ── Confirmed write actions (single or multi) ─────────────────────────────
    if (body.confirmed) {
      const payloads = body.proposedActions
        ? (body.proposedActions as Record<string, unknown>[])
        : body.proposedAction
          ? [body.proposedAction as Record<string, unknown>]
          : [];

      const replies: string[]    = [];
      const undoTokens: UndoToken[] = [];

      for (const payload of payloads) {
        const { reply, undoToken } = await executeConfirmed(payload);
        replies.push(reply);
        if (undoToken) undoTokens.push(undoToken);
      }

      res.json({
        reply: replies.join("\n\n"),
        sessionId: body.sessionId ?? "",
        requiresConfirm: false,
        undoTokens: undoTokens.length ? undoTokens : undefined,
      } as ChatResponse);
      return;
    }

    // ── Normal message → Claude ───────────────────────────────────────────────
    const sessionId = body.sessionId ?? `s-${Date.now()}`;
    const state = sessions.get(sessionId) ?? { history: [] };

    const { reply, updatedHistory } = await runAgent(body.userMessage, email, state.history);
    state.history = updatedHistory;
    sessions.set(sessionId, state);

    res.json({ ...reply, sessionId } as ChatResponse);

  } catch (err) {
    const e = err as Error;
    console.error("[chat] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

setInterval(() => sessions.clear(), 30 * 60 * 1000);
export default router;
