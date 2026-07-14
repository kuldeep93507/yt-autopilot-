import { Router } from "express";
import multer from "multer";
import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import supabase from "../db/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireChannelAccess } from "../middleware/channelAccess.js";
import { logActivity } from "../services/log.service.js";
import { screenVideo } from "../services/safety.service.js";
import { trackQuotaUsage } from "../services/quota.service.js";
import { io } from "../server.js";

const router = Router();
router.use(requireAuth);

// Multer — memory storage (PC + phone se direct upload).
// 200MB cap: the whole file sits in RAM and Render free tier has 512MB total,
// so a bigger buffer OOM-kills the server mid-upload. Bade files ke liye
// Drive-link path use karo (wo stream karta hai, RAM mein nahi rakhta).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files allowed"));
  },
});

// POST /api/upload/file  — direct video file → YouTube
// Access check runs AFTER multer: channel_id multipart body mein hai, jo
// multer parse karne se pehle available nahi hota.
router.post("/file", requireRole("admin", "manager", "uploader"),
  upload.single("video"),
  requireChannelAccess("channel_id"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No video file uploaded" });

    const { channel_id, title, description, tags, privacy, sched_date, sched_time } = req.body;
    if (!channel_id || !title) return res.status(400).json({ error: "channel_id and title required" });

    const { data: ch } = await supabase.from("channels").select("*").eq("id", channel_id).single();
    if (!ch) return res.status(404).json({ error: "Channel not found" });
    if (!ch.refresh_token) return res.status(400).json({ error: "Channel has no OAuth token" });

    // Same pre-upload safety screen as the Drive-link path — direct uploads
    // shouldn't be a backdoor around the copyright/policy agent.
    const safety = await screenVideo({
      channelId: channel_id, channelName: ch.name, channelNiche: ch.niche,
      title, description, tags,
    });
    if (safety.risk_level === "block") {
      return res.status(422).json({ error: `Safety check blocked this upload: ${safety.reasons}`, safety });
    }

    // Add to queue as "uploading"
    const { data: qItem } = await supabase.from("upload_queue").insert([{
      channel_id,
      drive_link: "direct_upload",
      title, description, tags,
      sched_date, sched_time,
      privacy: privacy || "public",
      added_by: req.user.id,
      approved: true,
      status: "uploading",
    }]).select().single();

    res.json({ message: "Upload started", queue_id: qItem?.id });

    // Upload in background so response goes back immediately
    setImmediate(async () => {
      try {
        io.emit("queue:uploading", { id: qItem?.id });

        const oauth2 = new OAuth2Client(
          ch.client_id || process.env.GOOGLE_CLIENT_ID,
          ch.client_secret || process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2.setCredentials({ refresh_token: ch.refresh_token });
        const yt = createYoutube({ version: "v3", auth: oauth2 });

        let publishAt;
        if (sched_date && sched_time)
          publishAt = new Date(`${sched_date}T${sched_time}:00+05:30`).toISOString();

        const uploadRes = await yt.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title,
              description: description || "",
              tags: tags ? tags.split(",").map((t) => t.trim()) : [],
              categoryId: "22",
            },
            status: {
              privacyStatus: publishAt ? "private" : (privacy || "public"),
              publishAt: publishAt || undefined,
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            mimeType: req.file.mimetype,
            body: Readable.from(req.file.buffer),
          },
        });

        const ytVideoId = uploadRes.data.id;
        await trackQuotaUsage(channel_id, ch.name, 1600); // videos.insert quota cost
        await supabase.from("upload_queue").update({
          status: "done", yt_video_id: ytVideoId, done_at: new Date().toISOString(),
        }).eq("id", qItem?.id);

        await logActivity(channel_id, req.user.id, "done", `Uploaded: "${title}" → https://youtu.be/${ytVideoId}`);
        io.emit("queue:upload_done", { id: qItem?.id, yt_video_id: ytVideoId });
      } catch (err) {
        await supabase.from("upload_queue").update({
          status: "error", error_msg: err.message,
        }).eq("id", qItem?.id);
        io.emit("queue:upload_error", { id: qItem?.id, error: err.message });
      }
    });
  }
);

// GET /api/upload/status/:queueId
router.get("/status/:queueId", async (req, res) => {
  const { data, error } = await supabase
    .from("upload_queue")
    .select("id, status, yt_video_id, error_msg, done_at")
    .eq("id", req.params.queueId)
    .single();
  if (error || !data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

export default router;
