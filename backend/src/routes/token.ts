import { Router, Request, Response } from "express";
import { getAccessToken } from "../salesforce/auth";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const accessToken = await getAccessToken();
    res.json({
      accessToken,
      instanceUrl: process.env.SF_INSTANCE_URL,
      agentId: process.env.SF_AGENT_ID,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
