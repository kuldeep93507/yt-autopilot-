import { Router } from "express";
import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import Anthropic from "@anthropic-ai/sdk";
import supabase from "../db/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireChannelAccess, requireRowChannelAccess } from "../middleware/channelAccess.js";
import { logActivity } from "../services/log.service.js";

const router = Router();
router.use(requireAuth);

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function buildOAuth(ch) {
  const oauth2 = new OAuth2Client(
    ch.client_id     || process.env.GOOGLE_CLIENT_ID,
    ch.client_secret || process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: ch.refresh_token });
  return oauth2;
}

// ── GET /api/trends/:channelId?type=short|long — discover trending ideas ───
// Uses search.list (order=viewCount, last 7 days) as a niche-relevant proxy
// for "trending" since YouTube's mostPopular chart is region-wide, not niche
// specific. Then cross-checks actual duration via videos.list to separate
// shorts (<=60s) from long-form.
router.get("/:channelId", requireChannelAccess("channelId"), async (req, res) => {
  const type = req.query.type === "short" ? "short" : "long";
  const { data: ch } = await supabase.from("channels").select("*").eq("id", req.params.channelId).single();
  if (!ch) return res.status(404).json({ error: "Channel not found" });
  if (!ch.refresh_token) return res.status(400).json({ error: "Channel has no OAuth token" });

  try {
    const yt = createYoutube({ version: "v3", auth: buildOAuth(ch) });
    const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const searchRes = await yt.search.list({
      part: ["snippet"],
      q: ch.niche || ch.name,
      type: ["video"],
      order: "viewCount",
      publishedAfter,
      videoDuration: type === "short" ? "short" : "any",
      regionCode: "IN",
      relevanceLanguage: (ch.lang || "hi").slice(0, 2).toLowerCase(),
      maxResults: 20,
    });

    const ids = (searchRes.data.items || []).map(i => i.id.videoId).filter(Boolean);
    if (!ids.length) return res.json({ ideas: [] });

    const detRes = await yt.videos.list({ part: ["snippet", "statistics", "contentDetails"], id: ids });
    const details = detRes.data.items || [];

    const parseDuration = (iso) => {
      const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return 0;
      return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
    };

    const candidates = details
      .filter(v => {
        const secs = parseDuration(v.contentDetails?.duration);
        return type === "short" ? secs <= 60 : secs > 60;
      })
      .sort((a, b) => parseInt(b.statistics?.viewCount || 0) - parseInt(a.statistics?.viewCount || 0))
      .slice(0, 10);

    // Insert as pending ideas, skip ones already captured for this channel
    const { data: existingIdeas } = await supabase
      .from("content_ideas").select("source_video_id").eq("channel_id", ch.id);
    const seen = new Set((existingIdeas || []).map(i => i.source_video_id));

    const toInsert = candidates
      .filter(v => !seen.has(v.id))
      .map(v => ({
        channel_id:     ch.id,
        source_video_id: v.id,
        source_title:   v.snippet.title,
        source_channel: v.snippet.channelTitle,
        video_type:     type,
        title_idea:     v.snippet.title,
        status:         "pending",
        created_by:     req.user.id,
      }));

    if (toInsert.length) {
      await supabase.from("content_ideas").insert(toInsert);
      await logActivity(ch.id, req.user.id, "done", `${toInsert.length} naye trending ideas mile (${type})`);
    }

    const { data: ideas } = await supabase
      .from("content_ideas").select("*").eq("channel_id", ch.id).order("created_at", { ascending: false }).limit(30);
    res.json({ ideas: ideas || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/trends/:channelId/ideas — list saved ideas without refetching ──
router.get("/:channelId/ideas", requireChannelAccess("channelId"), async (req, res) => {
  const { data, error } = await supabase
    .from("content_ideas").select("*").eq("channel_id", req.params.channelId)
    .order("created_at", { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PATCH /api/trends/idea/:id — approve/reject/mark filmed/ready ──────────
router.patch("/idea/:id", requireRole("admin", "manager"), async (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "approved", "rejected", "scripted", "filmed", "ready"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const { data, error } = await supabase
    .from("content_ideas").update({ status }).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── POST /api/trends/idea/:id/script — generate full script via Claude ─────
router.post("/idea/:id/script", requireRole("admin", "manager"), async (req, res) => {
  if (!anthropic) return res.status(400).json({ error: "ANTHROPIC_API_KEY not set" });

  const { data: idea } = await supabase.from("content_ideas").select("*, channels(name, niche, lang)").eq("id", req.params.id).single();
  if (!idea) return res.status(404).json({ error: "Idea not found" });

  const ch = idea.channels;
  const lengthGuide = idea.video_type === "short"
    ? "This is a YouTube SHORT (under 60 seconds). Write a tight, high-hook script: first line must be a scroll-stopping hook, total spoken length ~120-150 words."
    : "This is a LONG-FORM video. Write a full script with: hook (first 15 sec), intro, 3-5 main sections with clear beats, and an outro with a subscribe CTA. Aim for a natural spoken length matching a 6-10 minute video.";

  const prompt = `You are a professional YouTube scriptwriter for the "${ch?.name}" channel (niche: ${ch?.niche || "general"}, language: ${ch?.lang || "Hindi"}).

A trending video titled "${idea.source_title}" (by ${idea.source_channel}) is performing well in this niche right now.

Write an ORIGINAL script inspired by why that topic/format is working — do NOT copy it — for a new video on this channel.

${lengthGuide}

Write naturally in ${ch?.lang || "Hindi"} (or Hinglish if that fits the channel's usual style). Respond with the script only, no extra commentary, no markdown headers.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const script = msg.content[0].text;

    const { data: updated, error } = await supabase
      .from("content_ideas")
      .update({ script, status: "scripted" })
      .eq("id", idea.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(idea.channel_id, req.user.id, "done", `Script ready: "${idea.title_idea}"`);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/trends/idea/:id ──────────────────────────────────────────────
router.delete("/idea/:id", requireRole("admin", "manager"), async (req, res) => {
  const { error } = await supabase.from("content_ideas").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

export default router;
