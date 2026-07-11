import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import supabase from "../db/supabase.js";
import { uploadToYouTube } from "../services/youtube.service.js";
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
  const target = new Date(`${schedDate}T${schedTime}:00`);
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

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed (${job?.data?.title}):`, err.message);
  });

  console.log("⚙️  Upload worker started (concurrency: 2)");
}

export { uploadQueue };
