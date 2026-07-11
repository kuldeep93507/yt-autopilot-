import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (error || !user)
    return res.status(401).json({ error: "Invalid credentials" });

  if (!user.is_active)
    return res.status(403).json({ error: "Account disabled" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, is_active, created_at")
    .eq("id", req.user.id)
    .single();
  res.json(user);
});

// POST /api/auth/register  (admin only — invite team member)
router.post("/register", requireAuth, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email, password required" });

  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from("users")
    .insert([{ name, email: email.toLowerCase(), password: hash, role: role || "editor" }])
    .select("id, name, email, role")
    .single();

  if (error)
    return res.status(400).json({ error: error.message });

  res.status(201).json(data);
});

export default router;
