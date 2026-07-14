import supabase from "../db/supabase.js";
import { alertQuotaThreshold } from "./notify.service.js";

const DAILY_QUOTA_LIMIT = 10000; // default Google Cloud project quota
const WARN_THRESHOLD = 0.8;      // alert at 80%

export async function trackQuotaUsage(channelId, channelName, units) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("quota_usage")
    .select("*")
    .eq("channel_id", channelId)
    .eq("usage_date", today)
    .maybeSingle();

  const newTotal = (existing?.units_used || 0) + units;

  if (existing) {
    await supabase.from("quota_usage")
      .update({ units_used: newTotal })
      .eq("id", existing.id);
  } else {
    await supabase.from("quota_usage")
      .insert([{ channel_id: channelId, usage_date: today, units_used: newTotal }]);
  }

  const prevRatio = (existing?.units_used || 0) / DAILY_QUOTA_LIMIT;
  const newRatio  = newTotal / DAILY_QUOTA_LIMIT;
  if (prevRatio < WARN_THRESHOLD && newRatio >= WARN_THRESHOLD) {
    await alertQuotaThreshold(channelName, newTotal, DAILY_QUOTA_LIMIT);
  }

  return { unitsUsed: newTotal, limit: DAILY_QUOTA_LIMIT };
}

export async function getQuotaStatus(channelId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("quota_usage")
    .select("units_used")
    .eq("channel_id", channelId)
    .eq("usage_date", today)
    .maybeSingle();
  return { unitsUsed: data?.units_used || 0, limit: DAILY_QUOTA_LIMIT };
}
