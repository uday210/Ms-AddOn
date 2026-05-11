import { Router } from "express";
import { sfAttachFile } from "../salesforce/directApi";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { projectId, attachmentName, contentType, base64Content } = req.body as {
      projectId: string;
      attachmentName: string;
      contentType: string;
      base64Content: string;
    };

    if (!projectId || !attachmentName || !base64Content) {
      res.status(400).json({ error: "projectId, attachmentName, and base64Content are required" });
      return;
    }

    const cvId = await sfAttachFile(
      projectId,
      attachmentName,
      contentType ?? "application/octet-stream",
      base64Content
    );

    res.json({ success: true, contentVersionId: cvId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[attach] error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
