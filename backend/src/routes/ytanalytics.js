import { Router } from "express";
import { youtubeAnalytics as createYtAnalytics } from "@googleapis/youtubeanalytics";
import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function buildOAuth(ch) {
  const oauth2 = new OAuth2Client(
    ch.client_id     || process.env.GOOGLE_CLIENT_ID,
    ch.client_secret || process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: ch.refresh_token });
  return oauth2;
}

// Helper: fetch ALL videos with pagination
async function fetchVideoList(yt, playlistId, maxFetch = 500) {
  try {
    let allItems = [];
    let pageToken = undefined;
    do {
      const plRes = await yt.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId,
        maxResults: 50,
        pageToken,
      });
      allItems.push(...(plRes.data.items || []));
      pageToken = plRes.data.nextPageToken;
    } while (pageToken && allItems.length < maxFetch);

    if (!allItems.length) return [];

    const allIds = allItems.map(v => v.snippet.resourceId.videoId);
    const videoDetails = {};
    for (let i = 0; i < allIds.length; i += 50) {
      const detRes = await yt.videos.list({
        part: ["statistics", "contentDetails", "snippet"],
        id:   allIds.slice(i, i + 50),
      });
      detRes.data.items?.forEach(v => { videoDetails[v.id] = v; });
    }

    return allItems.map(v => {
      const vid = v.snippet.resourceId.videoId;
      const det = videoDetails[vid] || {};
      return {
        id:        vid,
        title:     det.snippet?.title     || v.snippet.title,
        thumbnail: det.snippet?.thumbnails?.medium?.url,
        published: det.snippet?.publishedAt || v.snippet.publishedAt,
        duration:  det.contentDetails?.duration || "",
        views:     parseInt(det.statistics?.viewCount    || 0),
        likes:     parseInt(det.statistics?.likeCount    || 0),
        comments:  parseInt(det.statistics?.commentCount || 0),
        privacy:   det.status?.privacyStatus || "public",
      };
    });
  } catch { return []; }
}

// Helper: one tolerant Analytics query → rows as objects (fail = [])
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
    console.warn("YTA query skip:", params.dimensions || "totals", "-", e.message);
    return [];
  }
}

// Merge revenue rows into core daily rows by day, so a channel without the
// monetary scope still gets its daily table (revenue columns just stay blank).
function mergeDaily(coreRows, revRows) {
  const revByDay = {};
  (revRows || []).forEach(r => { revByDay[r.day] = r; });
  return (coreRows || []).map(r => ({ ...r, ...(revByDay[r.day] || {}) }));
}

// Reads a video's Studio-style health flags: processing errors/warnings,
// region blocks (how copyright blocks usually surface), upload rejection,
// monetization-relevant restrictions.
function buildVideoIssues(v) {
  if (!v) return [];
  const issues = [];
  const st = v.status || {};
  const cd = v.contentDetails || {};
  const sg = v.suggestions || {};
  const pd = v.processingDetails || {};

  if (st.uploadStatus === "rejected")
    issues.push({ level: "error", text: `Video reject hua: ${st.rejectionReason || "reason nahi mila"}` });
  if (st.uploadStatus === "failed")
    issues.push({ level: "error", text: `Upload fail: ${st.failureReason || "reason nahi mila"}` });
  if (pd.processingStatus === "failed")
    issues.push({ level: "error", text: "YouTube processing fail hui" });
  if (pd.processingStatus === "processing")
    issues.push({ level: "warn", text: "Abhi YouTube pe processing chal rahi hai" });

  (sg.processingErrors || []).forEach(e => issues.push({ level: "error", text: `Processing error: ${e}` }));
  (sg.processingWarnings || []).forEach(w => issues.push({ level: "warn", text: `Warning: ${w}` }));

  const blocked = cd.regionRestriction?.blocked;
  if (blocked?.length)
    issues.push({ level: "error", text: `${blocked.length} countries mein blocked hai (${blocked.slice(0,8).join(", ")}${blocked.length>8?"…":""}) — aksar copyright claim ki wajah se` });
  const allowed = cd.regionRestriction?.allowed;
  if (allowed?.length)
    issues.push({ level: "warn", text: `Sirf ${allowed.length} countries mein available hai` });

  if (st.privacyStatus && st.privacyStatus !== "public")
    issues.push({ level: "warn", text: `Privacy: ${st.privacyStatus} — public nahi hai` });
  if (st.madeForKids)
    issues.push({ level: "warn", text: "Made for Kids marked hai — ads/earning limited rehti hai" });
  if (st.embeddable === false)
    issues.push({ level: "warn", text: "Embedding off hai — external traffic kam aayega" });
  if (cd.contentRating && Object.keys(cd.contentRating).length)
    issues.push({ level: "warn", text: "Age restriction lagi hai — monetization par asar padta hai" });
  if (cd.licensedContent)
    issues.push({ level: "info", text: "Licensed content flag on hai (Content ID se match)" });

  return issues;
}

const TRAFFIC_LABELS = {
  ADVERTISING: "Ads", ANNOTATION: "Annotations", CAMPAIGN_CARD: "Campaign cards",
  END_SCREEN: "End screens", EXT_URL: "External websites", NO_LINK_EMBEDDED: "Embedded players",
  NO_LINK_OTHER: "Direct / unknown", NOTIFICATION: "Notifications", PLAYLIST: "Playlists",
  PROMOTED: "Promoted", RELATED_VIDEO: "Suggested videos", SHORTS: "Shorts feed",
  SOUND_PAGE: "Sound page", SUBSCRIBER: "Subscriptions feed", YT_CHANNEL: "Channel pages",
  YT_OTHER_PAGE: "Other YouTube pages", YT_SEARCH: "YouTube Search", VIDEO_REMIXES: "Remixes",
  LIVE_REDIRECT: "Live redirect", HASHTAGS: "Hashtag pages", PRODUCT_PAGE: "Product pages",
  IMMERSIVE_LIVE: "Immersive live", PODCASTS: "Podcasts",
};

// GET /api/ytanalytics/:channelId/video/:videoId?days=28
// Studio-style per-video deep dive: totals, revenue, daily trend, countries,
// traffic sources, devices. Har section independent hai — ek fail hone se
// baaki blank nahi hote (e.g. non-monetized channel pe revenue).
router.get("/:channelId/video/:videoId", async (req, res) => {
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
    const yt = createYoutube({ version: "v3", auth });
    const CORE = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained";

    const [meta, totalsRows, dailyCore, dailyRev, countryRows, trafficRows, deviceRows, revenueRows] = await Promise.all([
      // suggestions/processingDetails = Studio-style health flags for owned videos
      yt.videos.list({ part: ["snippet", "statistics", "contentDetails", "status", "processingDetails", "suggestions"], id: [vid] })
        // suggestions/processingDetails need ownership; fall back to basic parts
        .catch(() => yt.videos.list({ part: ["snippet", "statistics", "contentDetails", "status"], id: [vid] }).catch(() => null)),
      ytaQuery(auth, { startDate, endDate, metrics: CORE, filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched,likes,subscribersGained", dimensions: "day", sort: "day", filters }),
      // separate so a missing monetary scope doesn't wipe the whole daily table
      ytaQuery(auth, { startDate, endDate, metrics: "estimatedRevenue,cpm", dimensions: "day", sort: "day", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views", maxResults: 15, filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "views", dimensions: "deviceType", sort: "-views", filters }),
      ytaQuery(auth, { startDate, endDate, metrics: "estimatedRevenue,cpm,monetizedPlaybacks,adImpressions", filters }),
    ]);
    const dailyRows = mergeDaily(dailyCore, dailyRev);

    const v = meta?.data?.items?.[0];
    res.json({
      video: v ? {
        id: vid, title: v.snippet?.title, thumbnail: v.snippet?.thumbnails?.medium?.url,
        published: v.snippet?.publishedAt, duration: v.contentDetails?.duration,
        lifetimeViews:    parseInt(v.statistics?.viewCount    || 0),
        lifetimeLikes:    parseInt(v.statistics?.likeCount    || 0),
        lifetimeComments: parseInt(v.statistics?.commentCount || 0),
        privacy:          v.status?.privacyStatus,
        uploadStatus:     v.status?.uploadStatus,
        license:          v.status?.license,
        madeForKids:      v.status?.madeForKids,
      } : { id: vid },
      issues: buildVideoIssues(v),
      period: { startDate, endDate, days },
      totals:  totalsRows[0] || {},
      revenue: revenueRows[0] || null,
      daily:   dailyRows,
      countries: countryRows,
      trafficSources: trafficRows.map(r => ({
        ...r, label: TRAFFIC_LABELS[r.insightTrafficSourceType] || r.insightTrafficSourceType,
      })),
      devices: deviceRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ytanalytics/:channelId?days=28
router.get("/:channelId", async (req, res) => {
  const { data: ch } = await supabase
    .from("channels").select("*").eq("id", req.params.channelId).single();

  if (!ch)               return res.status(404).json({ error: "Channel nahi mila" });
  if (!ch.refresh_token) return res.status(400).json({ error: "Channel mein OAuth token nahi hai" });

  const days      = Math.min(parseInt(req.query.days || "28"), 180);
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const auth      = buildOAuth(ch);

  try {
    // 1. Channel basic info
    const yt = createYoutube({ version: "v3", auth });
    let chanRes;
    try {
      chanRes = await yt.channels.list({
        part: ["contentDetails", "statistics", "snippet"],
        mine: true,
      });
    } catch (oauthErr) {
      // invalid_grant = token expired/revoked
      const msg = oauthErr.message || "";
      if (msg.includes("invalid_grant") || msg.includes("Token has been expired")) {
        // 409, not 401: 401 means "your app session is invalid" and the client
        // logs the user out on it. This is a YouTube-side token problem.
        return res.status(409).json({
          error: "token_expired",
          message: "Refresh token expire ho gaya hai — OAuth Playground se naya token generate karo aur Channels tab mein update karo",
          channel_name: ch.name,
        });
      }
      throw oauthErr;
    }
    const chItem = chanRes.data.items?.[0];
    const stats  = chItem?.statistics || {};
    const uploadsPlaylist = chItem?.contentDetails?.relatedPlaylists?.uploads;

    // 2. All videos
    const videoList = uploadsPlaylist
      ? await fetchVideoList(yt, uploadsPlaylist)
      : [];

    // 3. YouTube Analytics API
    let analyticsData  = null;
    let videoAnalytics = [];

    try {
      const yta = createYtAnalytics({ version: "v2", auth });

      // Channel-level daily metrics.
      // NOTE: impressions/CTR Studio-only hain — API mein maangne se query 400 hoti hai.
      // Revenue metrics need the monetary scope; if they fail, retry without them
      // so a non-monetized channel still gets its full daily table.
      const CORE_DAY = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";
      let aRes;
      try {
        aRes = await yta.reports.query({
          ids: "channel==MINE", startDate, endDate,
          metrics: `${CORE_DAY},estimatedRevenue,cpm`, dimensions: "day", sort: "day",
        });
      } catch (revErr) {
        console.warn("Channel daily with revenue failed, retrying without:", revErr.message);
        aRes = await yta.reports.query({
          ids: "channel==MINE", startDate, endDate,
          metrics: CORE_DAY, dimensions: "day", sort: "day",
        });
      }
      analyticsData = aRes.data;

      // Per-video metrics (top 10) — same revenue fallback
      if (videoList.length) {
        const top10ids = videoList.slice(0, 10).map(v => v.id).join(",");
        const VID_CORE = "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares";
        const vidParams = (metrics) => ({
          ids: "channel==MINE", startDate, endDate, metrics,
          dimensions: "video", filters: `video==${top10ids}`, sort: "-views", maxResults: 10,
        });
        let vRes;
        try   { vRes = await yta.reports.query(vidParams(`${VID_CORE},estimatedRevenue`)); }
        catch { vRes = await yta.reports.query(vidParams(VID_CORE)); }
        const hdrs = vRes.data.columnHeaders?.map(h => h.name) || [];
        videoAnalytics = (vRes.data.rows || []).map(row => {
          const obj = {};
          hdrs.forEach((h, i) => { obj[h] = row[i]; });
          const meta = videoList.find(v => v.id === obj.video);
          obj.title     = meta?.title     || obj.video;
          obj.thumbnail = meta?.thumbnail || null;
          obj.published = meta?.published || null;
          return obj;
        });
      }
    } catch (aErr) {
      console.warn("YT Analytics API skip:", aErr.message);
    }

    // 3b. Channel-level breakdowns — countries, traffic sources, devices
    const [chCountries, chTraffic, chDevices] = await Promise.all([
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views", maxResults: 15 }),
      ytaQuery(auth, { startDate, endDate, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views" }),
      ytaQuery(auth, { startDate, endDate, metrics: "views", dimensions: "deviceType", sort: "-views" }),
    ]);

    // 4. Build daily chart + totals
    const hdrs     = analyticsData?.columnHeaders?.map(h => h.name) || [];
    const dailyRows = (analyticsData?.rows || []).map(row => {
      const obj = {};
      hdrs.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });

    const totals = dailyRows.reduce((acc, r) => {
      acc.views             += Number(r.views || 0);
      acc.watchMinutes      += Number(r.estimatedMinutesWatched || 0);
      acc.subscribersGained += Number(r.subscribersGained || 0);
      acc.subscribersLost   += Number(r.subscribersLost || 0);
      acc.likes             += Number(r.likes || 0);
      acc.comments          += Number(r.comments || 0);
      acc.shares            += Number(r.shares || 0);
      acc.estimatedRevenue  += Number(r.estimatedRevenue || 0);
      acc.impressions       += Number(r.impressions || 0);
      return acc;
    }, { views:0, watchMinutes:0, subscribersGained:0, subscribersLost:0, likes:0, comments:0, shares:0, estimatedRevenue:0, impressions:0 });

    const avgCTR = dailyRows.length
      ? dailyRows.reduce((s, r) => s + Number(r.impressionClickThroughRate || 0), 0) / dailyRows.length : 0;
    const avgDur = dailyRows.length
      ? dailyRows.reduce((s, r) => s + Number(r.averageViewDuration || 0), 0) / dailyRows.length : 0;

    res.json({
      channel: {
        name:        chItem?.snippet?.title || ch.name,
        thumbnail:   chItem?.snippet?.thumbnails?.default?.url,
        subscribers: parseInt(stats.subscriberCount || 0),
        hiddenSubs:  stats.hiddenSubscriberCount || false,
        totalViews:  parseInt(stats.viewCount  || 0),
        totalVideos: parseInt(stats.videoCount || 0),
      },
      period: { startDate, endDate, days },
      totals: {
        ...totals,
        watchHours:         Math.round(totals.watchMinutes / 60),
        netSubs:            totals.subscribersGained - totals.subscribersLost,
        avgCTR:             parseFloat(avgCTR.toFixed(2)),
        avgViewDurationSec: Math.round(avgDur),
      },
      dailyChart:         dailyRows,
      videos:             videoList,
      videoAnalytics,
      countries:          chCountries,
      trafficSources:     chTraffic.map(r => ({
        ...r, label: TRAFFIC_LABELS[r.insightTrafficSourceType] || r.insightTrafficSourceType,
      })),
      devices:            chDevices,
      analyticsAvailable: analyticsData !== null,
    });

  } catch (err) {
    console.error("ytanalytics error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
