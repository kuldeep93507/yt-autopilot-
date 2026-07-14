import { Router } from "express";
import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import multer from "multer";
import { Readable } from "stream";
import supabase from "../db/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireChannelAccess } from "../middleware/channelAccess.js";
import { getQuotaStatus } from "../services/quota.service.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);

// Helper — build OAuth client for a channel
function buildOAuth(ch) {
  const oauth2 = new OAuth2Client(
    ch.client_id  || process.env.GOOGLE_CLIENT_ID,
    ch.client_secret || process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: ch.refresh_token });
  return oauth2;
}

// ── GET /api/channels ───────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  let query = supabase.from("channels").select("*").order("created_at", { ascending: true });

  // editor/uploader only see channels explicitly assigned to them
  if (!["admin", "manager"].includes(req.user.role)) {
    const { data: access } = await supabase
      .from("team_channel_access").select("channel_id").eq("user_id", req.user.id);
    const allowedIds = (access || []).map(a => a.channel_id);
    if (!allowedIds.length) return res.json([]);
    query = query.in("id", allowedIds);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (req.user.role !== "admin") {
    data.forEach((c) => {
      c.youtube_api_key = c.youtube_api_key ? "***" : null;
      c.client_secret   = c.client_secret   ? "***" : null;
      c.refresh_token   = c.refresh_token   ? "***" : null;
    });
  }
  res.json(data);
});

// ── GET /api/channels/lookup?url= — auto-fill from YouTube URL ──────────────
router.get("/lookup", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param required" });

  // Extract handle or channel ID from URL
  let identifier = null;
  let idType = "forHandle";
  const patterns = [
    [/youtube\.com\/@([^/?&]+)/, "forHandle"],
    [/youtube\.com\/c\/([^/?&]+)/, "forHandle"],
    [/youtube\.com\/user\/([^/?&]+)/, "forUsername"],
    [/youtube\.com\/channel\/(UC[^/?&]+)/, "id"],
  ];
  for (const [re, type] of patterns) {
    const m = url.match(re);
    if (m) { identifier = m[1]; idType = type; break; }
  }
  if (!identifier) return res.status(400).json({ error: "Valid YouTube channel URL nahi hai" });

  try {
    const oauth2 = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    // Use existing channel's refresh token if available
    const { data: existingCh } = await supabase
      .from("channels").select("refresh_token").not("refresh_token","is",null).limit(1).single();
    if (existingCh?.refresh_token) oauth2.setCredentials({ refresh_token: existingCh.refresh_token });

    const yt = createYoutube({ version: "v3", auth: oauth2 });
    const params = { part: ["snippet","statistics","contentDetails"] };
    if (idType === "id")        params.id = [identifier];
    else if (idType === "forHandle")   params.forHandle = identifier;
    else if (idType === "forUsername") params.forUsername = identifier;

    const r = await yt.channels.list(params);
    const ch = r.data.items?.[0];
    if (!ch) return res.status(404).json({ error: "Channel nahi mila" });

    res.json({
      channel_id:   ch.id,
      name:         ch.snippet.title,
      description:  ch.snippet.description,
      thumbnail:    ch.snippet.thumbnails?.default?.url,
      subscribers:  ch.statistics.subscriberCount,
      total_videos: ch.statistics.videoCount,
      total_views:  ch.statistics.viewCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/channels/:id/quota — today's YouTube API quota usage ──────────
router.get("/:id/quota", requireChannelAccess("id"), async (req, res) => {
  const status = await getQuotaStatus(req.params.id);
  res.json(status);
});

// ── GET /api/channels/:id/videos — full stats + ALL videos (paginated) ─────
router.get("/:id/videos", requireChannelAccess("id"), async (req, res) => {
  const { data: ch } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!ch) return res.status(404).json({ error: "Channel not found" });
  if (!ch.refresh_token) return res.status(400).json({ error: "Channel has no OAuth token" });

  const maxFetch = parseInt(req.query.max || "500"); // default fetch up to 500 videos

  try {
    const yt = createYoutube({ version: "v3", auth: buildOAuth(ch) });

    const chanRes = await yt.channels.list({
      part: ["contentDetails","statistics","snippet"],
      mine: true,
    });
    const item     = chanRes.data.items?.[0];
    const stats    = item?.statistics || {};
    const playlist = item?.contentDetails?.relatedPlaylists?.uploads;

    let allItems = [];

    if (playlist) {
      // ── Paginate through ALL videos ──
      let pageToken = undefined;
      do {
        const plRes = await yt.playlistItems.list({
          part:      ["snippet","contentDetails"],
          playlistId: playlist,
          maxResults: 50,
          pageToken,
        });
        allItems.push(...(plRes.data.items || []));
        pageToken = plRes.data.nextPageToken;
      } while (pageToken && allItems.length < maxFetch);

      // ── Fetch video details in batches of 50 ──
      const allIds = allItems.map(v => v.snippet.resourceId.videoId);
      const videoDetails = {};

      for (let i = 0; i < allIds.length; i += 50) {
        const batch = allIds.slice(i, i + 50);
        const detRes = await yt.videos.list({
          part: ["statistics","contentDetails","status"],
          id:   batch,
        });
        detRes.data.items?.forEach(v => { videoDetails[v.id] = v; });
      }

      // ── Build final video list ──
      const videos = allItems.map((v) => {
        const vid = v.snippet.resourceId.videoId;
        const det = videoDetails[vid] || {};
        return {
          id:          vid,
          title:       v.snippet.title,
          description: v.snippet.description,
          thumbnail:   v.snippet.thumbnails?.medium?.url,
          published:   v.snippet.publishedAt,
          views:       parseInt(det.statistics?.viewCount    || 0),
          likes:       parseInt(det.statistics?.likeCount    || 0),
          comments:    parseInt(det.statistics?.commentCount || 0),
          privacy:     det.status?.privacyStatus || "public",
          duration:    det.contentDetails?.duration || "",
        };
      });

      return res.json({
        total_videos:  parseInt(stats.videoCount      || 0),
        total_views:   parseInt(stats.viewCount       || 0),
        subscribers:   parseInt(stats.subscriberCount || 0),
        hidden_subs:   stats.hiddenSubscriberCount    || false,
        channel_name:  item?.snippet?.title           || ch.name,
        fetched_count: videos.length,
        recent_videos: videos,
      });
    }

    res.json({
      total_videos:  parseInt(stats.videoCount      || 0),
      total_views:   parseInt(stats.viewCount       || 0),
      subscribers:   parseInt(stats.subscriberCount || 0),
      hidden_subs:   stats.hiddenSubscriberCount    || false,
      channel_name:  item?.snippet?.title           || ch.name,
      fetched_count: 0,
      recent_videos: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/channels/:id/yt-videos/:videoId — edit YT video metadata + thumbnail ──
router.patch("/:id/yt-videos/:videoId", requireRole("admin","manager"), upload.single("thumbnail"), async (req, res) => {
  const { data: ch } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!ch || !ch.refresh_token) return res.status(400).json({ error: "Channel not configured" });

  const { title, description, tags, privacy } = req.body;
  try {
    const yt   = createYoutube({ version: "v3", auth: buildOAuth(ch) });
    const cur  = await yt.videos.list({ part: ["snippet","status"], id: [req.params.videoId] });
    const existing = cur.data.items?.[0];
    if (!existing) return res.status(404).json({ error: "Video not found on YouTube" });

    const updated = await yt.videos.update({
      part: ["snippet","status"],
      requestBody: {
        id: req.params.videoId,
        snippet: {
          title:       title       || existing.snippet.title,
          description: description || existing.snippet.description,
          tags:        tags ? tags.split(",").map(t => t.trim()) : existing.snippet.tags,
          categoryId:  existing.snippet.categoryId || "22",
        },
        status: {
          privacyStatus: privacy || existing.status.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
    });

    // Upload thumbnail if provided
    if (req.file) {
      const stream = Readable.from(req.file.buffer);
      await yt.thumbnails.set({
        videoId: req.params.videoId,
        media:   { mimeType: req.file.mimetype, body: stream },
      });
    }

    res.json({ success: true, video: updated.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/channels/:id/yt-videos/:videoId — delete from YouTube ──────
router.delete("/:id/yt-videos/:videoId", requireRole("admin"), async (req, res) => {
  const { data: ch } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!ch || !ch.refresh_token) return res.status(400).json({ error: "Channel not configured" });
  try {
    const yt = createYoutube({ version: "v3", auth: buildOAuth(ch) });
    await yt.videos.delete({ id: req.params.videoId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/channels/:id/playlists — create YouTube playlist ──────────────
router.post("/:id/playlists", requireRole("admin","manager"), async (req, res) => {
  const { data: ch } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!ch || !ch.refresh_token) return res.status(400).json({ error: "Channel OAuth not configured" });
  const { title, description = "", privacy = "public" } = req.body;
  if (!title) return res.status(400).json({ error: "Playlist title required" });
  try {
    const yt = createYoutube({ version: "v3", auth: buildOAuth(ch) });
    const { data: pl } = await yt.playlists.insert({
      part: ["snippet","status"],
      requestBody: {
        snippet: { title, description },
        status:  { privacyStatus: privacy },
      },
    });
    res.json({ playlist_id: pl.id, title: pl.snippet?.title, privacy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/channels ──────────────────────────────────────────────────────
router.post("/", requireRole("admin"), async (req, res) => {
  const { name, niche, lang, youtube_api_key, client_id, client_secret,
          refresh_token, drive_folder_id, drive_folder_name,
          upload_time, privacy, auto_watch, watch_interval } = req.body;
  const { data, error } = await supabase
    .from("channels")
    .insert([{ name, niche, lang, youtube_api_key, client_id, client_secret,
               refresh_token, drive_folder_id, drive_folder_name,
               upload_time, privacy, auto_watch, watch_interval }])
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PATCH /api/channels/:id ─────────────────────────────────────────────────
router.patch("/:id", requireRole("admin","manager"), async (req, res) => {
  const { data, error } = await supabase
    .from("channels").update(req.body).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/channels/:id ────────────────────────────────────────────────
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const { error } = await supabase.from("channels").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

export default router;
