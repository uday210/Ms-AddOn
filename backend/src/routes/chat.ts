import { Router, Request, Response } from "express";
import { callApexProxy } from "../salesforce/apexProxy";
import { handleDirect, EmailCtx } from "../salesforce/directApi";
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

  const emailCtx: EmailCtx = {
    subject: body.emailContext.subject,
    body: body.emailContext.bodyPreview ?? "",
    from: body.emailContext.from,
  };

  try {
    let state = body.sessionId ? sessions.get(body.sessionId) : undefined;
    let conversationId = body.sessionId;

    // ── Direct API path (already locked in for this conversation) ───────────
    if (state?.useDirectApi) {
      const confirmed = body.confirmed ? body.proposedAction : undefined;
      const result = await handleDirect(body.userMessage, emailCtx, confirmed);
      res.json({ ...result, sessionId: conversationId! } as ChatResponse);
      return;
    }

    // ── Confirmed write action through Apex proxy ────────────────────────────
    if (state && !state.useDirectApi && body.confirmed && body.proposedAction) {
      state.sequenceId += 1;
      const apexRes = await callApexProxy({
        userMessage: `The user confirmed. Please proceed: ${JSON.stringify(body.proposedAction)}`,
        sfSessionId: state.sfSessionId,
        sequenceId: state.sequenceId,
        emailContext: body.emailContext,
      });
      state.sequenceId = apexRes.sequenceId;
      res.json({
        reply: apexRes.reply,
        sessionId: conversationId!,
        requiresConfirm: false,
      } as ChatResponse);
      return;
    }

    // ── New conversation: try Apex proxy → fall back to direct API ───────────
    if (!state) {
      try {
        const apexRes = await callApexProxy({
          userMessage: body.userMessage.trim(),
          sequenceId: 0,
          emailContext: body.emailContext,
        });
        conversationId = apexRes.sfSessionId;
        state = { sfSessionId: apexRes.sfSessionId, sequenceId: apexRes.sequenceId, useDirectApi: false };
        sessions.set(conversationId, state);

        res.json({
          reply: apexRes.reply,
          sessionId: conversationId,
          requiresConfirm: false,
        } as ChatResponse);
        return;

      } catch (apexErr) {
        // Apex proxy unavailable — fall back to direct Salesforce REST + Claude
        console.warn("[chat] Apex proxy failed, using direct API:", (apexErr as Error).message);
        conversationId = `direct-${Date.now()}`;
        state = { sfSessionId: "", sequenceId: 0, useDirectApi: true };
        sessions.set(conversationId, state);

        const confirmed = body.confirmed ? body.proposedAction : undefined;
        const result = await handleDirect(body.userMessage, emailCtx, confirmed);
        res.json({ ...result, sessionId: conversationId } as ChatResponse);
        return;
      }
    }

    // ── Ongoing Apex proxy conversation ──────────────────────────────────────
    state.sequenceId += 1;
    const apexRes = await callApexProxy({
      userMessage: body.userMessage.trim(),
      sfSessionId: state.sfSessionId,
      sequenceId: state.sequenceId,
      emailContext: body.emailContext,
    });
    state.sequenceId = apexRes.sequenceId;

    res.json({
      reply: apexRes.reply,
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

// Clean up sessions every 30 min
setInterval(() => {
  sessions.clear();
}, 30 * 60 * 1000);

export default router;
