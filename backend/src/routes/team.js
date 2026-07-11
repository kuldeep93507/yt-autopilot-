import { Router } from "express";
import supabase from "../db/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/team
router.get("/", requireRole("admin", "manager"), async (_req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, is_active, created_at, team_channel_access(channel_id)")
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/team/:id
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const { name, role, is_active } = req.body;
  const { data, error } = await supabase
    .from("users")
    .update({ name, role, is_active })
    .eq("id", req.params.id)
    .select("id, name, email, role, is_active")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/team/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: "Apne aap ko delete nahi kar sakte" });
  await supabase.from("team_channel_access").delete().eq("user_id", req.params.id);
  const { error } = await supabase.from("users").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/team/:id/channels  — assign channels to member
router.post("/:id/channels", requireRole("admin", "manager"), async (req, res) => {
  const { channel_ids } = req.body;
  // Remove old assignments
  await supabase.from("team_channel_access").delete().eq("user_id", req.params.id);
  // Insert new
  if (channel_ids?.length) {
    const rows = channel_ids.map((cid) => ({ user_id: req.params.id, channel_id: cid }));
    await supabase.from("team_channel_access").insert(rows);
  }
  res.json({ success: true });
});

export default router;
