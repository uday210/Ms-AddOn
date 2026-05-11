import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat";
import tokenRouter from "./routes/token";
import attachRouter from "./routes/attach";
import streamRouter from "./routes/stream";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/token", tokenRouter);
app.use("/api/attach", attachRouter);
app.use("/chat/stream", streamRouter);
app.use("/chat", chatRouter);

// Serve the built Outlook add-in static files in production
const addinDist = path.resolve(__dirname, "../../outlook-addin/dist");
// HTML files: never cache (so new bundle hash is always picked up)
app.use(express.static(addinDist, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  },
}));
app.use(express.static(path.resolve(__dirname, "../../outlook-addin/public")));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
