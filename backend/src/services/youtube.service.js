import { youtube as createYoutube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import supabase from "../db/supabase.js";
import { logActivity } from "./log.service.js";
import { io } from "../server.js";

function getOAuthClient(channel) {
  const oauth2 = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: channel.refresh_token });
  return oauth2;
}

// Convert Google Drive share link → direct download URL
function getDriveDownloadUrl(link) {
  const match = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Invalid Drive link format");
  return `https://drive.google.com/uc?export=download&id=${match[1]}&confirm=t`;
}

export async function uploadToYouTube(queueItem) {
  // 1. Fetch the channel record (needs refresh_token, client creds)
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", queueItem.channel_id)
    .single();

  if (!channel?.refresh_token)
    throw new Error("Channel has no OAuth refresh_token configured");

  // 2. Build OAuth client
  const auth    = getOAuthClient(channel);
  const youtube = createYoutube({ version: "v3", auth });

  // 3. Stream video from Drive
  const downloadUrl = getDriveDownloadUrl(queueItem.drive_link);
  const videoRes    = await axios.get(downloadUrl, { responseType: "stream" });
  const videoStream = videoRes.data;

  // 4. Build scheduledStartTime if date+time provided
  let publishAt;
  if (queueItem.sched_date && queueItem.sched_time) {
    publishAt = new Date(`${queueItem.sched_date}T${queueItem.sched_time}:00`).toISOString();
  }

  // 5. YouTube upload
  const uploadRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title:       queueItem.title,
        description: queueItem.description || "",
        tags:        queueItem.tags ? queueItem.tags.split(",").map((t) => t.trim()) : [],
        categoryId:  "22", // People & Blogs (change per niche if needed)
      },
      status: {
        privacyStatus:      publishAt ? "private" : (queueItem.privacy || "public"),
        publishAt:          publishAt || undefined,
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: videoStream },
  });

  const ytVideoId = uploadRes.data.id;

  // 6. Mark done in DB
  await supabase
    .from("upload_queue")
    .update({ status: "done", yt_video_id: ytVideoId, done_at: new Date().toISOString() })
    .eq("id", queueItem.id);

  await logActivity(channel.id, null, "done",
    `Uploaded: "${queueItem.title}" → https://youtu.be/${ytVideoId}`);

  // 7. Realtime push to dashboard
  io.emit("queue:upload_done", { id: queueItem.id, yt_video_id: ytVideoId });

  return ytVideoId;
}
