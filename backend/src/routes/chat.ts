import { Router, Request, Response } from "express";
import { runAgent, executeConfirmed, ConversationMessage, EmailCtx } from "../claude/agentHandler";
import { ChatRequest, ChatResponse } from "../types/chat";

const router = Router();

interface SessionState {
  history: ConversationMessage[];
}

const sessions = new Map<string, SessionState>();

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as ChatRequest;

  if (!body.emailContext || body.userMessage === undefined) {
    res.status(400).json({ error: "emailContext and userMessage are required" });
    return;
  }

  const email: EmailCtx = {
    subject:     body.emailContext.subject,
    from:        body.emailContext.from,
    bodyPreview: body.emailContext.bodyPreview ?? "",
    attachments: body.emailContext.attachments,
  };

  try {
    // ── Confirmed write action ────────────────────────────────────────────────
    if (body.confirmed && body.proposedAction) {
      const payload = body.proposedAction as Record<string, unknown>;
      const reply = await executeConfirmed(payload);
      res.json({ reply, sessionId: body.sessionId ?? "", requiresConfirm: false } as ChatResponse);
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

// Purge sessions every 30 min
setInterval(() => sessions.clear(), 30 * 60 * 1000);

export default router;
