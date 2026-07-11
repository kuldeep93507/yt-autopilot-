import { Router } from "express";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/analytics/summary
router.get("/summary", async (_req, res) => {
  const [channels, queue, drive, team, logs] = await Promise.all([
    supabase.from("channels").select("id, name, niche, enabled"),
    supabase.from("upload_queue").select("id, channel_id, status"),
    supabase.from("drive_items").select("id, status"),
    supabase.from("users").select("id, is_active"),
    supabase.from("activity_logs").select("id, channel_id, status, message, created_at")
      .order("created_at", { ascending: false }).limit(50),
  ]);

  const q = queue.data || [];
  res.json({
    channels:        channels.data || [],
    activeChannels:  channels.data?.filter((c) => c.enabled).length || 0,
    totalUploaded:   q.filter((v) => v.status === "done").length,
    inQueue:         q.filter((v) => v.status === "queued").length,
    driveDetected:   drive.data?.filter((d) => d.status === "detected").length || 0,
    activeMembers:   team.data?.filter((u) => u.is_active).length || 0,
    perChannel:      buildPerChannel(channels.data || [], q),
    logs:            logs.data || [],
  });
});

function buildPerChannel(channels, queue) {
  return channels.map((ch) => ({
    id:       ch.id,
    name:     ch.name,
    uploaded: queue.filter((v) => v.channel_id === ch.id && v.status === "done").length,
    pending:  queue.filter((v) => v.channel_id === ch.id && v.status === "queued").length,
  }));
}

export default router;
