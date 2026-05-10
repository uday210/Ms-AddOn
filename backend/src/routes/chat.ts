import { Router, Request, Response } from "express";
import { createSession, endSession, sendMessage } from "../salesforce/agentforce";
import { ChatRequest, ChatResponse } from "../types/chat";

const router = Router();

interface SessionState {
  sfSessionId: string;
  sequenceId: number;
}

const sessions = new Map<string, SessionState>();

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as ChatRequest;

  if (!body.emailContext || body.userMessage === undefined) {
    res.status(400).json({ error: "emailContext and userMessage are required" });
    return;
  }

  try {
    let state = body.sessionId ? sessions.get(body.sessionId) : undefined;
    let conversationId = body.sessionId;

    // Start a new Agentforce session if we don't have one
    if (!state) {
      const sfSessionId = await createSession();
      conversationId = sfSessionId;
      state = { sfSessionId, sequenceId: 0 };
      sessions.set(conversationId, state);

      // Seed the session with email context so the agent is oriented
      const context =
        `Email context:\nSubject: ${body.emailContext.subject}\n` +
        `From: ${body.emailContext.from}\nTo: ${body.emailContext.to}\n` +
        `Body preview: ${body.emailContext.bodyPreview}`;

      state.sequenceId += 1;
      await sendMessage(state.sfSessionId, context, state.sequenceId);
    }

    // Build the outgoing message
    let outgoing = body.userMessage.trim();

    if (body.confirmed && body.proposedAction) {
      outgoing = `The user confirmed. Please proceed: ${JSON.stringify(body.proposedAction)}`;
    }

    if (!outgoing) {
      res.status(400).json({ error: "userMessage is empty" });
      return;
    }

    state.sequenceId += 1;
    const agentReply = await sendMessage(state.sfSessionId, outgoing, state.sequenceId);

    const response: ChatResponse = {
      reply: agentReply || "(no response from agent)",
      sessionId: conversationId!,
      requiresConfirm: false,
    };

    res.json(response);
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    console.error("[chat] error:", e.message, e.cause ?? "");
    const detail = e.cause ? `${e.message}: ${String(e.cause)}` : e.message;
    res.status(500).json({ error: detail });
  }
});

// Clean up old sessions every 30 min
setInterval(() => {
  for (const [id, state] of sessions.entries()) {
    endSession(state.sfSessionId).then(() => sessions.delete(id));
  }
}, 30 * 60 * 1000);

export default router;
