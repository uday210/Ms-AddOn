import { Router } from "express";
import { undoAction } from "../claude/agentHandler";
import { UndoToken } from "../types/chat";

const router = Router();

router.post("/", async (req, res) => {
  const token = req.body as UndoToken;

  if (!token.action || !token.projectId) {
    res.status(400).json({ error: "Invalid undo token" });
    return;
  }

  try {
    const reply = await undoAction(token);
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[undo] error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
