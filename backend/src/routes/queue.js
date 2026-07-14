import { Router } from "express";
import supabase from "../db/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireChannelAccess, requireRowChannelAccess } from "../middleware/channelAccess.js";
import { addUploadJob } from "../workers/upload.worker.js";
import { logActivity } from "../services/log.service.js";
import { screenVideo, getChannelSafetyLog } from "../services/safety.service.js";

const router = Router();
router.use(requireAuth);

// GET /api/queue
router.get("/", async (req, res) => {
  let query = supabase
    .from("upload_queue")
    .select("*, channels(name, niche)")
    .order("added_at", { ascending: false });

  if (!["admin", "manager"].includes(req.user.role)) {
    const { data: access } = await supabase
      .from("team_channel_access").select("channel_id").eq("user_id", req.user.id);
    const allowedIds = (access || []).map(a => a.channel_id);
    if (!allowedIds.length) return res.json([]);
    query = query.in("channel_id", allowedIds);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/queue  — add video to queue
router.post("/", requireChannelAccess("channel_id"), async (req, res) => {
  const { channel_id, drive_link, title, description, tags,
          sched_date, sched_time, privacy } = req.body;

  if (!channel_id || !drive_link)
    return res.status(400).json({ error: "channel_id and drive_link required" });

  const { data, error } = await supabase
    .from("upload_queue")
    .insert([{
      channel_id, drive_link, title, description, tags,
      sched_date, sched_time, privacy: privacy || "public",
      added_by: req.user.id,
      approved: req.user.role === "admin" || req.user.role === "manager",
    }])
    .select("*, channels(name)")
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logActivity(channel_id, req.user.id, "queued", `Queued: "${title}"`);
  res.status(201).json(data);
});

// PATCH /api/queue/:id/approve  — manager/admin approve
router.patch("/:id/approve", requireRole("admin", "manager"), async (req, res) => {
  const { data, error } = await supabase
    .from("upload_queue")
    .update({ approved: true, approved_by: req.user.id })
    .eq("id", req.params.id)
    .select("*, channels(name)")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(data.channel_id, req.user.id, "done", `Approved: "${data.title}"`);
  res.json(data);
});

// POST /api/queue/:id/upload  — trigger actual upload
router.post("/:id/upload", requireRole("admin", "manager", "uploader"),
  requireRowChannelAccess("upload_queue", "id"), async (req, res) => {
  const { data: item, error } = await supabase
    .from("upload_queue")
    .select("*, channels(name, niche)")
    .eq("id", req.params.id)
    .single();

  if (error || !item) return res.status(404).json({ error: "Queue item not found" });
  if (!item.approved)  return res.status(400).json({ error: "Must be approved first" });
  if (item.status === "done") return res.status(400).json({ error: "Already uploaded" });

  // Safety/copyright screen before it ever reaches YouTube
  const safety = await screenVideo({
    channelId:   item.channel_id,
    channelName: item.channels?.name,
    channelNiche: item.channels?.niche,
    queueId:     item.id,
    title:       item.title,
    description: item.description,
    tags:        item.tags,
  });
  if (safety.risk_level === "block") {
    return res.status(422).json({ error: `Safety check blocked this upload: ${safety.reasons}`, safety });
  }

  await supabase.from("upload_queue").update({ status: "uploading" }).eq("id", item.id);

  // Push to BullMQ worker
  await addUploadJob(item);
  res.json({ message: "Upload job queued", id: item.id, safety });
});

// GET /api/queue/safety/:channelId  — recent safety screening log for a channel
router.get("/safety/:channelId", requireChannelAccess("channelId"), async (req, res) => {
  try {
    const log = await getChannelSafetyLog(req.params.channelId);
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/queue/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  await supabase.from("upload_queue")
    .update({ status: "cancelled" }).eq("id", req.params.id);
  res.json({ success: true });
});

// POST /api/queue/bulk  — add multiple at once
router.post("/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "items array required" });

  if (!["admin", "manager"].includes(req.user.role)) {
    const { data: access } = await supabase
      .from("team_channel_access").select("channel_id").eq("user_id", req.user.id);
    const allowedIds = new Set((access || []).map(a => a.channel_id));
    const disallowed = items.find(i => !allowedIds.has(i.channel_id));
    if (disallowed) return res.status(403).json({ error: "In mein se kisi channel ka access nahi hai" });
  }

  const rows = items.map((item) => ({
    ...item,
    added_by: req.user.id,
    approved: req.user.role === "admin" || req.user.role === "manager",
  }));

  const { data, error } = await supabase.from("upload_queue").insert(rows).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
