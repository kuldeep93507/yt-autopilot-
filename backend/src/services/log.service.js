import supabase from "../db/supabase.js";

export async function logActivity(channelId, userId, status, message) {
  await supabase.from("activity_logs").insert([{
    channel_id: channelId || null,
    user_id:    userId    || null,
    status,
    message,
  }]);
}
