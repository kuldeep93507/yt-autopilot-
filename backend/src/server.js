import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import { writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

import authRoutes    from "./routes/auth.js";
import channelRoutes from "./routes/channels.js";
import queueRoutes   from "./routes/queue.js";
import aiRoutes      from "./routes/ai.js";
import driveRoutes   from "./routes/drive.js";
import uploadRoutes  from "./routes/upload.js";
import teamRoutes    from "./routes/team.js";
import analyticsRoutes from "./routes/analytics.js";

import { startDriveWatcher } from "./services/drive.service.js";
import { setupWorker }       from "./workers/upload.worker.js";
import { requireAuth, requireRole } from "./middleware/auth.js";

const app    = express();
const server = createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
export const io = new SocketIO(server, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true },
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);
  socket.on("disconnect", () => console.log("🔌 Client disconnected:", socket.id));
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/channels",  channelRoutes);
app.use("/api/queue",     queueRoutes);
app.use("/api/ai",        aiRoutes);
app.use("/api/drive",     driveRoutes);
app.use("/api/upload",    uploadRoutes);
app.use("/api/team",      teamRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date() }));

// POST /api/settings/keys — update AI keys at runtime (admin only)
app.post("/api/settings/keys", requireAuth, requireRole("admin"), (req, res) => {
  const { anthropic, gemini } = req.body;
  if (anthropic) process.env.ANTHROPIC_API_KEY = anthropic;
  if (gemini)    process.env.GEMINI_API_KEY    = gemini;
  try {
    const envPath = join(__rootDir, ".env");
    let env = readFileSync(envPath, "utf8");
    if (anthropic) env = env.replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${anthropic}`);
    if (gemini)    env = env.replace(/^GEMINI_API_KEY=.*/m,    `GEMINI_API_KEY=${gemini}`);
    writeFileSync(envPath, env);
  } catch { /* .env write fail — runtime still updated */ }
  res.json({ success: true });
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`\n🚀 YT AutoPilot backend running on http://localhost:${PORT}`);
  await setupWorker();
  startDriveWatcher();
});
