import { drive as createDrive } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";
import supabase from "../db/supabase.js";
import { logActivity } from "./log.service.js";
import { io } from "../server.js";
import cron from "node-cron";

// Build OAuth2 client for a specific channel
function getOAuthClient(channel) {
  const oauth2 = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: channel.refresh_token });
  return oauth2;
}

// Check a single channel's Drive folder for new files
async function checkChannel(channel) {
  if (!channel.drive_folder_id || !channel.refresh_token) return;

  try {
    const auth  = getOAuthClient(channel);
    const drive = createDrive({ version: "v3", auth });

    const since = channel.last_checked
      ? new Date(channel.last_checked).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const res = await drive.files.list({
      q: `'${channel.drive_folder_id}' in parents and mimeType contains 'video/' and createdTime > '${since}' and trashed = false`,
      fields: "files(id, name, size, mimeType, webViewLink, createdTime)",
      pageSize: 20,
    });

    const files = res.data.files || [];
    for (const file of files) {
      // Check if already detected
      const { data: existing } = await supabase
        .from("drive_items")
        .select("id")
        .eq("drive_file_id", file.id)
        .single();

      if (existing) continue;

      const { data: item } = await supabase
        .from("drive_items")
        .insert([{
          channel_id:    channel.id,
          drive_file_id: file.id,
          name:          file.name,
          size:          parseInt(file.size || "0"),
          mime_type:     file.mimeType,
          drive_link:    file.webViewLink,
          status:        "detected",
        }])
        .select()
        .single();

      await logActivity(channel.id, null, "detected",
        `New file detected: ${file.name}`);

      // Emit real-time event to dashboard
      io.emit("drive:new_file", { channel_id: channel.id, item });
    }

    // Update last_checked
    await supabase
      .from("channels")
      .update({ last_checked: new Date().toISOString() })
      .eq("id", channel.id);

  } catch (err) {
    console.error(`Drive check failed for ${channel.name}:`, err.message);
  }
}

// Start the watcher — polls all auto_watch channels on their interval
export function startDriveWatcher() {
  // Run every minute; each channel has its own interval check
  cron.schedule("* * * * *", async () => {
    const { data: channels } = await supabase
      .from("channels")
      .select("*")
      .eq("auto_watch", true)
      .eq("enabled", true);

    if (!channels?.length) return;

    const now = Date.now();
    for (const ch of channels) {
      const intervalMs = (ch.watch_interval || 5) * 60 * 1000;
      const lastMs     = ch.last_checked ? new Date(ch.last_checked).getTime() : 0;
      if (now - lastMs >= intervalMs) {
        checkChannel(ch);
      }
    }
  });

  console.log("📁 Drive Watcher started");
}

export { checkChannel };
