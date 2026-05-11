import { Router, Request, Response } from "express";
import { createSession, endSession, sendMessage } from "../salesforce/agentforce";
import { handleDirect } from "../salesforce/directApi";
import { ChatRequest, ChatResponse } from "../types/chat";

const router = Router();

interface SessionState {
  sfSessionId: string;
  sequenceId: number;
  useDirectApi: boolean;
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

    // ── Direct API path (already determined for this conversation) ──────────
    if (state?.useDirectApi) {
      const confirmedPayload = body.confirmed ? body.proposedAction : undefined;
      const result = await handleDirect(body.userMessage, { subject: body.emailContext.subject, body: body.emailContext.bodyPreview ?? "", from: body.emailContext.from }, confirmedPayload);
      res.json({ ...result, sessionId: conversationId! } as ChatResponse);
      return;
    }

    // ── Try Agentforce ───────────────────────────────────────────────────────
    if (!state) {
      try {
        const sfSessionId = await createSession();
        conversationId = sfSessionId;
        state = { sfSessionId, sequenceId: 0, useDirectApi: false };
        sessions.set(conversationId, state);

        const context =
          `Email context:\nSubject: ${body.emailContext.subject}\n` +
          `From: ${body.emailContext.from}\nTo: ${body.emailContext.to}\n` +
          `Body preview: ${body.emailContext.bodyPreview}`;

        state.sequenceId += 1;
        await sendMessage(state.sfSessionId, context, state.sequenceId);
      } catch (agentErr) {
        // Agentforce unavailable — fall back to direct Salesforce REST API
        console.warn("[chat] Agentforce unavailable, switching to direct API:", (agentErr as Error).message);
        conversationId = `direct-${Date.now()}`;
        state = { sfSessionId: "", sequenceId: 0, useDirectApi: true };
        sessions.set(conversationId, state);

        const confirmedPayload = body.confirmed ? body.proposedAction : undefined;
        const result = await handleDirect(body.userMessage, { subject: body.emailContext.subject, body: body.emailContext.bodyPreview ?? "", from: body.emailContext.from }, confirmedPayload);
        res.json({ ...result, sessionId: conversationId } as ChatResponse);
        return;
      }
    }

    // ── Send message to Agentforce ───────────────────────────────────────────
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

    res.json({
      reply: agentReply || "(no response from agent)",
      sessionId: conversationId!,
      requiresConfirm: false,
    } as ChatResponse);

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
    if (!state.useDirectApi) endSession(state.sfSessionId).catch(() => {});
    sessions.delete(id);
  }
}, 30 * 60 * 1000);

export default router;
