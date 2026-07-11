import { Router } from "express";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { checkChannel } from "../services/drive.service.js";

const router = Router();
router.use(requireAuth);

// GET /api/drive/items
router.get("/items", async (_req, res) => {
  const { data, error } = await supabase
    .from("drive_items")
    .select("*, channels(name)")
    .order("detected_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/drive/check/:channelId  — manual trigger
router.post("/check/:channelId", async (req, res) => {
  const { data: ch } = await supabase
    .from("channels")
    .select("*")
    .eq("id", req.params.channelId)
    .single();
  if (!ch) return res.status(404).json({ error: "Channel not found" });
  await checkChannel(ch);
  res.json({ message: "Drive check triggered" });
});

// PATCH /api/drive/items/:id/ignore
router.patch("/items/:id/ignore", async (req, res) => {
  const { data, error } = await supabase
    .from("drive_items")
    .update({ status: "ignored" })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
