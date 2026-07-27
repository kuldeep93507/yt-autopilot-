import { Router } from "express";
import { youtubeAnalytics as createYtAnalytics } from "@googleapis/youtubeanalytics";
import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Helper — build OAuth client for a channel
function buildOAuth(ch) {
  const oauth2 = new OAuth2Client(
    ch.client_id     || process.env.GOOGLE_CLIENT_ID,
    ch.client_secret || process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: ch.refresh_token });
  return oauth2;
}

// ── GET /api/analytics/summary — app internal stats ─────────────────────────
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
    channels:       channels.data || [],
    activeChannels: channels.data?.filter((c) => c.enabled).length || 0,
    totalUploaded:  q.filter((v) => v.status === "done").length,
    inQueue:        q.filter((v) => v.status === "queued").length,
    driveDetected:  drive.data?.filter((d) => d.status === "detected").length || 0,
    activeMembers:  team.data?.filter((u) => u.is_active).length || 0,
    perChannel:     buildPerChannel(channels.data || [], q),
    logs:           logs.data || [],
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

// ── GET /api/analytics/youtube/:channelId?days=28 ───────────────────────────
// Real YouTube Analytics: views, watch time, subscribers, revenue (if YPP)
router.get("/youtube/:channelId", async (req, res) => {
  const { data: ch } = await supabase
    .from("channels").select("*").eq("id", req.params.channelId).single();

  if (!ch)               return res.status(404).json({ error: "Channel nahi mila" });
  if (!ch.refresh_token) return res.status(400).json({ error: "Channel mein OAuth token nahi hai — pehle Configure karo" });

  const days     = Math.min(parseInt(req.query.days || "28"), 180);
  const endDate  = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const auth = buildOAuth(ch);

  try {
    // 1. YouTube Data API — channel info + per-video stats
    const yt      = createYoutube({ version: "v3", auth });
    const chanRes = await yt.channels.list({
      part: ["statistics", "snippet"],
      mine: true,
    });
    const chItem = chanRes.data.items?.[0];
    const stats  = chItem?.statistics || {};

    // 2. Upload playlist — top 50 videos with stats
    const uploadsPlaylist = chItem?.contentDetails?.relatedPlaylists?.uploads;
    let videoList = [];

    if (!uploadsPlaylist) {
      // fetch contentDetails separately
      const cd = await yt.channels.list({ part: ["contentDetails"], mine: true });
      const playlist2 = cd.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (playlist2) {
        videoList = await fetchVideoList(yt, playlist2);
      }
    } else {
      videoList = await fetchVideoList(yt, uploadsPlaylist);
    }

    // 3. YouTube Analytics API — aggregate metrics
    let analyticsData = null;
    try {
      const ytAnalytics = createYtAnalytics({ version: "v2", auth });
      const analyticsRes = await ytAnalytics.reports.query({
        ids:         "channel==MINE",
        startDate,
        endDate,
        // NOTE: "impressions"/"impressionClickThroughRate" are NOT valid API
        // metrics (Studio-only) — including them 400s the whole query and
        // zeroes out the entire analytics tab.
        metrics:     "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares,estimatedRevenue,cpm",
        dimensions:  "day",
        sort:        "day",
      });
      analyticsData = analyticsRes.data;
    } catch (analyticsErr) {
      // Analytics API might not be enabled — gracefully skip
      console.warn("YouTube Analytics API error:", analyticsErr.message);
    }

    // 3b. Channel-level breakdowns — countries, traffic sources, devices
    const [chCountries, chTraffic, chDevices] = await Promise.all([
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views", maxResults: 15 }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views" }),
      ytaQuery(auth, { startDate, endDate, metrics: "views", dimensions: "deviceType", sort: "-views" }),
    ]);

    // 4. Per-video analytics (top 10 by views)
    let videoAnalytics = [];
    if (videoList.length && analyticsData !== null) {
      try {
        const ytAnalytics = createYtAnalytics({ version: "v2", auth });
        const top10 = videoList.slice(0, 10).map(v => v.id).join(",");
        const vidRes = await ytAnalytics.reports.query({
          ids:        "channel==MINE",
          startDate,
          endDate,
          metrics:    "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,estimatedRevenue",
          dimensions: "video",
          filters:    `video==${top10}`,
          sort:       "-views",
          maxResults: 10,
        });
        const headers = vidRes.data.columnHeaders?.map(h => h.name) || [];
        videoAnalytics = (vidRes.data.rows || []).map(row => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i]; });
          // Attach title from videoList
          const meta = videoList.find(v => v.id === obj.video);
          obj.title     = meta?.title     || obj.video;
          obj.thumbnail = meta?.thumbnail || null;
          obj.published = meta?.published || null;
          return obj;
        });
      } catch (e) {
        console.warn("Per-video analytics error:", e.message);
      }
    }

    // 5. Process daily rows into chart-friendly format
    const headers = analyticsData?.columnHeaders?.map(h => h.name) || [];
    const dailyRows = (analyticsData?.rows || []).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });

    // Totals for the period
    const totals = dailyRows.reduce((acc, row) => {
      acc.views                += Number(row.views || 0);
      acc.watchMinutes         += Number(row.estimatedMinutesWatched || 0);
      acc.subscribersGained    += Number(row.subscribersGained || 0);
      acc.subscribersLost      += Number(row.subscribersLost || 0);
      acc.likes                += Number(row.likes || 0);
      acc.comments             += Number(row.comments || 0);
      acc.shares               += Number(row.shares || 0);
      acc.estimatedRevenue     += Number(row.estimatedRevenue || 0);
      acc.impressions          += Number(row.impressions || 0);
      return acc;
    }, {
      views:0, watchMinutes:0, subscribersGained:0, subscribersLost:0,
      likes:0, comments:0, shares:0, estimatedRevenue:0, impressions:0,
    });

    // Averages
    const avgCTR = dailyRows.length
      ? dailyRows.reduce((s, r) => s + Number(r.impressionClickThroughRate || 0), 0) / dailyRows.length
      : 0;
    const avgViewDuration = dailyRows.length
      ? dailyRows.reduce((s, r) => s + Number(r.averageViewDuration || 0), 0) / dailyRows.length
      : 0;

    res.json({
      channel: {
        name:        chItem?.snippet?.title || ch.name,
        thumbnail:   chItem?.snippet?.thumbnails?.default?.url,
        subscribers: parseInt(stats.subscriberCount || 0),
        hiddenSubs:  stats.hiddenSubscriberCount || false,
        totalViews:  parseInt(stats.viewCount     || 0),
        totalVideos: parseInt(stats.videoCount    || 0),
      },
      period: { startDate, endDate, days },
      totals: {
        ...totals,
        watchHours:   Math.round(totals.watchMinutes / 60),
        netSubs:      totals.subscribersGained - totals.subscribersLost,
        avgCTR:       parseFloat(avgCTR.toFixed(2)),
        avgViewDurationSec: Math.round(avgViewDuration),
      },
      dailyChart: dailyRows,        // for chart rendering
      videos:     videoList,        // basic video list (views, likes, etc.)
      videoAnalytics,               // per-video analytics for top 10
      countries:  chCountries,
      trafficSources: chTraffic.map(r => ({
        ...r,
        label: TRAFFIC_LABELS[r.insightTrafficSourceType] || r.insightTrafficSourceType,
      })),
      devices:    chDevices,
      analyticsAvailable: analyticsData !== null,
    });

  } catch (err) {
    console.error("YouTube analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: run one Analytics API query tolerantly — returns rows as objects or []
async function ytaQuery(auth, params) {
  try {
    const yta = createYtAnalytics({ version: "v2", auth });
    const r = await yta.reports.query({ ids: "channel==MINE", ...params });
    const headers = r.data.columnHeaders?.map(h => h.name) || [];
    return (r.data.rows || []).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
  } catch (e) {
    console.warn("YTA query failed:", params.dimensions || params.metrics, "-", e.message);
    return [];
  }
}

// Readable labels for traffic source types (API returns enum codes)
const TRAFFIC_LABELS = {
  ADVERTISING: "Ads", ANNOTATION: "Annotations", CAMPAIGN_CARD: "Campaign cards",
  END_SCREEN: "End screens", EXT_URL: "External websites", NO_LINK_EMBEDDED: "Embedded (no link)",
  NO_LINK_OTHER: "Direct / unknown", NOTIFICATION: "Notifications", PLAYLIST: "Playlists",
  PROMOTED: "Promoted", RELATED_VIDEO: "Suggested videos", SHORTS: "Shorts feed",
  SOUND_PAGE: "Sound page", SUBSCRIBER: "Subscriptions feed", YT_CHANNEL: "Channel pages",
  YT_OTHER_PAGE: "Other YouTube pages", YT_SEARCH: "YouTube Search", VIDEO_REMIXES: "Remixes",
  LIVE_REDIRECT: "Live redirect", HASHTAGS: "Hashtag pages", PRODUCT_PAGE: "Product pages",
  IMMERSIVE_LIVE: "Immersive live", PODCASTS: "Podcasts",
};

// ── GET /api/analytics/youtube/:channelId/video/:videoId?days=28 ────────────
// Full per-video deep dive — Studio-style: totals, daily trend, countries,
// traffic sources, devices, revenue. Each section is fetched independently so
// one failing report (e.g. revenue on a non-monetized channel) doesn't blank
// the rest.
router.get("/youtube/:channelId/video/:videoId", async (req, res) => {
  const { data: ch } = await supabase
    .from("channels").select("*").eq("id", req.params.channelId).single();
  if (!ch)               return res.status(404).json({ error: "Channel nahi mila" });
  if (!ch.refresh_token) return res.status(400).json({ error: "Channel mein OAuth token nahi hai" });

  const vid       = req.params.videoId;
  const days      = Math.min(parseInt(req.query.days || "28"), 365);
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const auth      = buildOAuth(ch);
  const filters   = `video==${vid}`;

  try {
    // Video metadata (lifetime stats) via Data API
    const yt = createYoutube({ version: "v3", auth });
    const metaPromise = yt.videos.list({ part: ["snippet", "statistics", "contentDetails"], id: [vid] });

    const CORE = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained";
    const [meta, totalsRows, dailyRows, countryRows, trafficRows, deviceRows, revenueRows] = await Promise.all([
      metaPromise,
      ytaQuery(auth, { startDate, endDate, metrics: CORE, filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched,likes", dimensions: "day", sort: "day", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views", maxResults: 15, filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views", dimensions: "deviceType", sort: "-views", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "estimatedRevenue,cpm,monetizedPlaybacks,adImpressions", filters }),
    ]);

    const v = meta.data.items?.[0];
    res.json({
      video: v ? {
        id: vid, title: v.snippet?.title, thumbnail: v.snippet?.thumbnails?.medium?.url,
        published: v.snippet?.publishedAt, duration: v.contentDetails?.duration,
        lifetimeViews: parseInt(v.statistics?.viewCount || 0),
        lifetimeLikes: parseInt(v.statistics?.likeCount || 0),
        lifetimeComments: parseInt(v.statistics?.commentCount || 0),
      } : { id: vid },
      period: { startDate, endDate, days },
      totals: totalsRows[0] || {},
      revenue: revenueRows[0] || null,   // null => not monetized or no rev data
      daily: dailyRows,
      countries: countryRows,
      trafficSources: trafficRows.map(r => ({
        ...r,
        label: TRAFFIC_LABELS[r.insightTrafficSourceType] || r.insightTrafficSourceType,
      })),
      devices: deviceRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: fetch latest 50 videos with statistics
async function fetchVideoList(yt, playlistId) {
  try {
    const plRes = await yt.playlistItems.list({
      part:       ["snippet", "contentDetails"],
      playlistId,
      maxResults: 50,
    });
    const ids = (plRes.data.items || []).map(v => v.snippet.resourceId.videoId);
    if (!ids.length) return [];

    const detRes = await yt.videos.list({
      part: ["statistics", "contentDetails", "snippet"],
      id:   ids,
    });
    return (detRes.data.items || []).map(v => ({
      id:        v.id,
      title:     v.snippet.title,
      thumbnail: v.snippet.thumbnails?.medium?.url,
      published: v.snippet.publishedAt,
      duration:  v.contentDetails?.duration || "",
      views:     parseInt(v.statistics?.viewCount   || 0),
      likes:     parseInt(v.statistics?.likeCount   || 0),
      comments:  parseInt(v.statistics?.commentCount || 0),
      privacy:   v.status?.privacyStatus || "public",
    }));
  } catch {
    return [];
  }
}

export default router;
