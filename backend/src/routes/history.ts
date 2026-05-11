import { Router, Request, Response } from "express";
import { getConv, saveConv, clearConv, storeStatus, StoredMessage } from "../store/conversationStore";

const router = Router();

// Load conversation for an email
router.post("/load", (req: Request, res: Response) => {
  const { emailKey } = req.body as { emailKey: string };
  if (!emailKey) { res.status(400).json({ error: "emailKey required" }); return; }
  const conv = getConv(emailKey);
  res.json(conv ?? { messages: [], sessionId: null });
});

// Save conversation for an email
router.post("/save", (req: Request, res: Response) => {
  const { emailKey, messages, sessionId } = req.body as { emailKey: string; messages: StoredMessage[]; sessionId?: string };
  if (!emailKey) { res.status(400).json({ error: "emailKey required" }); return; }
  saveConv(emailKey, messages, sessionId);
  res.json({ ok: true });
});

// Clear conversation for an email
router.post("/clear", (req: Request, res: Response) => {
  const { emailKey } = req.body as { emailKey: string };
  if (!emailKey) { res.status(400).json({ error: "emailKey required" }); return; }
  clearConv(emailKey);
  res.json({ ok: true });
});

// Debug: show all stored conversations
router.get("/status", (_req: Request, res: Response) => {
  res.json(storeStatus());
});

export default router;
