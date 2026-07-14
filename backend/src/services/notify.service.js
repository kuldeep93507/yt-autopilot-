import axios from "axios";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function notifyTelegram(message) {
  if (!TOKEN || !CHAT_ID) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — alert skipped:", message);
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("Telegram notify failed:", err.response?.data || err.message);
  }
}

export async function alertUploadFailed(title, channelName, error) {
  await notifyTelegram(
    `🔴 <b>Upload Failed</b>\nChannel: ${channelName}\nVideo: ${title}\nError: ${error}`
  );
}

export async function alertQuotaThreshold(channelName, unitsUsed, limit) {
  await notifyTelegram(
    `⚠️ <b>YouTube Quota Warning</b>\nChannel: ${channelName}\nUsed: ${unitsUsed}/${limit} units today`
  );
}

export async function alertSafetyRisk(channelName, videoTitle, riskLevel, reasons) {
  await notifyTelegram(
    `🛡 <b>Safety Check: ${riskLevel.toUpperCase()}</b>\nChannel: ${channelName}\nVideo: ${videoTitle}\nReason: ${reasons}`
  );
}

export async function alertServerCrash(kind, err) {
  await notifyTelegram(`💥 <b>Server ${kind}</b>\n${err?.message || err}`);
}
