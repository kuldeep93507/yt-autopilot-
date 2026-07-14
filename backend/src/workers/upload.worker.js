import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import supabase from "../db/supabase.js";
import { uploadToYouTube } from "../services/youtube.service.js";
import { alertUploadFailed } from "../services/notify.service.js";
import { io } from "../server.js";

let connection, uploadQueue;

try {
  connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
    lazyConnect: true,
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  });
  await connection.connect().catch(() => { throw new Error("Redis connect failed"); });
  uploadQueue = new Queue("yt-upload", { connection });
  console.log("✅ Redis connected");
} catch (e) {
  console.warn("⚠️  Redis unavailable — job queue disabled. Set REDIS_URL to enable.");
  connection = null; uploadQueue = null;
}

export async function addUploadJob(queueItem) {
  if (!uploadQueue) {
    console.warn("Job queue unavailable — direct upload fallback");
    uploadToYouTube(queueItem).catch(console.error);
    return;
  }
  const delay = getDelay(queueItem.sched_date, queueItem.sched_time);
  await uploadQueue.add("upload", queueItem, {
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    jobId: queueItem.id,
  });
  console.log(`📥 Job added: ${queueItem.title} (delay: ${Math.round(delay/1000)}s)`);
}

function getDelay(schedDate, schedTime) {
  if (!schedDate || !schedTime) return 0;
  // Explicit IST offset — server runs in UTC (Render), user schedules in IST.
  // Without this, uploads fire 5.5 hours off.
  const target = new Date(`${schedDate}T${schedTime}:00+05:30`);
  const diff   = target.getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

export async function setupWorker() {
  if (!connection) return;
  const worker = new Worker(
    "yt-upload",
    async (job) => {
      const item = job.data;
      console.log(`🚀 Starting upload: ${item.title}`);

      // Push progress to dashboard
      io.emit("queue:uploading", { id: item.id });

      try {
        const ytId = await uploadToYouTube(item);
        console.log(`✅ Uploaded: ${item.title} → https://youtu.be/${ytId}`);
      } catch (err) {
        // Mark error in DB
        await supabase
          .from("upload_queue")
          .update({ status: "error", error_msg: err.message })
          .eq("id", item.id);

        io.emit("queue:upload_error", { id: item.id, error: err.message });
        throw err; // Let BullMQ retry
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on("failed", async (job, err) => {
    console.error(`❌ Job failed (${job?.data?.title}):`, err.message);
    // Only alert once all retries are exhausted — avoid spamming per-attempt
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      const { data: ch } = await supabase
        .from("channels").select("name").eq("id", job.data.channel_id).single();
      await alertUploadFailed(job.data.title, ch?.name || "Unknown", err.message);
    }
  });

  console.log("⚙️  Upload worker started (concurrency: 2)");
}

export { uploadQueue };
