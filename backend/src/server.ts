import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat";
import tokenRouter from "./routes/token";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/token", tokenRouter);
app.use("/chat", chatRouter);

// Serve the built Outlook add-in static files in production
const addinDist = path.resolve(__dirname, "../../outlook-addin/dist");
app.use(express.static(addinDist));
app.use(express.static(path.resolve(__dirname, "../../outlook-addin/public")));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
