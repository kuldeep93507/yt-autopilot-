import supabase from "../db/supabase.js";

// admin/manager see everything (matches existing team.js pattern where both
// roles can manage the whole team). editor/uploader are scoped to whatever
// channels are explicitly assigned to them in team_channel_access.
const UNRESTRICTED_ROLES = ["admin", "manager"];

async function hasAccess(userId, channelId) {
  const { data } = await supabase
    .from("team_channel_access")
    .select("channel_id")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();
  return !!data;
}

// Use when the channel id is directly in the route param, e.g. /:id or /:channelId
export function requireChannelAccess(paramName = "id") {
  return async (req, res, next) => {
    if (UNRESTRICTED_ROLES.includes(req.user.role)) return next();
    const channelId = req.params[paramName] || req.body?.channel_id;
    if (!channelId) return next();
    if (await hasAccess(req.user.id, channelId)) return next();
    res.status(403).json({ error: "Is channel ka access nahi hai — admin se assign karwao" });
  };
}

// Use when only a queue/idea row id is in params — looks up its channel_id first.
export function requireRowChannelAccess(table, paramName = "id") {
  return async (req, res, next) => {
    if (UNRESTRICTED_ROLES.includes(req.user.role)) return next();
    const { data: row } = await supabase
      .from(table).select("channel_id").eq("id", req.params[paramName]).single();
    if (!row) return next(); // let the route's own 404 handling take over
    req.channelId = row.channel_id;
    if (await hasAccess(req.user.id, row.channel_id)) return next();
    res.status(403).json({ error: "Is channel ka access nahi hai — admin se assign karwao" });
  };
}
