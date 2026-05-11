import { Router, Request, Response } from "express";
import { runAgentStream, AgentStreamEvent, EmailCtx } from "../claude/agentHandler";
import { ChatRequest } from "../types/chat";
import { ConversationMessage } from "../claude/agentHandler";

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

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const sessionId = body.sessionId ?? `s-${Date.now()}`;
  const state = sessions.get(sessionId) ?? { history: [] };

  const email: EmailCtx = {
    subject:     body.emailContext.subject,
    from:        body.emailContext.from,
    to:          body.emailContext.to,
    cc:          body.emailContext.cc,
    bodyPreview: body.emailContext.bodyPreview ?? "",
    attachments: body.emailContext.attachments,
  };

  try {
    await runAgentStream(body.userMessage, email, state.history, (event: AgentStreamEvent) => {
      if (event.type === "done") {
        state.history = event.updatedHistory;
        sessions.set(sessionId, state);
        send({
          type:           "done",
          reply:          event.reply.reply,
          sessionId,
          requiresConfirm: event.reply.requiresConfirm,
          proposedAction:  event.reply.proposedAction,
          draftBody:       event.reply.draftBody,
        });
      } else {
        send(event);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stream] error:", msg);
    send({ type: "error", message: msg });
  }

  res.end();
});

// Purge sessions every 30 min
setInterval(() => sessions.clear(), 30 * 60 * 1000);

export default router;
