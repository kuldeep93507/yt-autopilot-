import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { logActivity } from "../services/log.service.js";

const router = Router();
router.use(requireAuth);

function generateTemplateMetadata(topic, channelName, lang) {
  const t = topic.trim() || "trending video";
  const isHindi = (lang || "Hindi").toLowerCase().includes("hindi");

  const titles = isHindi ? [
    `${t} | ${channelName} 🔥`,
    `${t} — Full Video | ${channelName}`,
    `${t} | Best ${new Date().getFullYear()} | ${channelName}`,
  ] : [
    `${t} | ${channelName} 🔥`,
    `${t} — Full Video | ${channelName}`,
    `${t} | Best of ${new Date().getFullYear()}`,
  ];
  const title = titles[Math.floor(Math.random() * titles.length)].slice(0, 70);

  const words = t.split(/\s+/).filter(w => w.length > 2);
  const tagList = [...new Set([
    ...words,
    t,
    channelName,
    `${t} ${new Date().getFullYear()}`,
    `${t} video`,
    `${t} hindi`,
    `best ${t}`,
    `${t} full video`,
    `${channelName} ${t}`,
    `${t} latest`,
    `trending ${t}`,
    `${t} new`,
    `top ${t}`,
    `${t} viral`,
  ])].slice(0, 15).join(", ");

  const hashtags = words.slice(0, 5).map(w => `#${w.replace(/[^a-zA-Z0-9ऀ-ॿ]/g, "")}`).join(" ");

  const desc = isHindi
    ? `${title}\n\n` +
      `Is video mein aapko milega ${t} ka complete experience! 🎬\n\n` +
      `⏰ Timestamps:\n00:00 Intro\n01:00 ${t} Start\n05:00 Main Content\n\n` +
      `📌 Is video mein:\n• ${t} full details\n• Best quality content\n• ${channelName} exclusive\n\n` +
      `👍 Agar video pasand aaye toh LIKE karo, SHARE karo aur SUBSCRIBE karo!\n` +
      `🔔 Bell icon dabao taaki koi video miss na ho!\n\n` +
      `📺 Channel: ${channelName}\n` +
      `${hashtags}\n\n` +
      `© ${channelName} ${new Date().getFullYear()} — All Rights Reserved`
    : `${title}\n\n` +
      `Watch the complete ${t} experience! 🎬\n\n` +
      `⏰ Timestamps:\n00:00 Intro\n01:00 ${t} Begins\n05:00 Main Content\n\n` +
      `📌 In this video:\n• ${t} full details\n• Best quality content\n• ${channelName} exclusive\n\n` +
      `👍 If you enjoyed this video, LIKE, SHARE and SUBSCRIBE!\n` +
      `🔔 Hit the bell icon so you never miss an upload!\n\n` +
      `📺 Channel: ${channelName}\n` +
      `${hashtags}\n\n` +
      `© ${channelName} ${new Date().getFullYear()} — All Rights Reserved`;

  return { title, description: desc, tags: tagList, hashtags };
}

// POST /api/ai/metadata
router.post("/metadata", async (req, res) => {
  const { channel_id, video_topic = "", provider = "auto" } = req.body;
  if (!channel_id) return res.status(400).json({ error: "channel_id required" });

  const { data: ch } = await supabase
    .from("channels")
    .select("name, niche, lang")
    .eq("id", channel_id)
    .single();

  if (!ch) return res.status(404).json({ error: "Channel not found" });

  const topicLine = video_topic.trim()
    ? `Video Topic: ${video_topic.trim()}`
    : `Channel Niche: ${ch.niche || "general"} (user ne koi topic nahi diya)`;

  const prompt = `You are a YouTube SEO expert. Generate viral, highly optimized metadata for a YouTube video.

${topicLine}
Channel Name: ${ch.name || ""}
Language: ${ch.lang || "Hindi"}

IMPORTANT: Generate metadata STRICTLY based on the video topic above. Do NOT generate random or generic content.

Respond EXACTLY in this JSON format (no extra text, no markdown):
{
  "title": "catchy SEO title max 70 chars related to the video topic",
  "description": "300 word SEO description with emojis, 3-4 timestamps placeholder like 00:00 Intro, keywords naturally placed, subscribe CTA at end - MUST be about the video topic",
  "tags": "15 comma-separated tags directly related to the video topic",
  "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5 (5 trending hashtags for the video)"
}`;

  let text = "";
  let usedProvider = "template";

  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini    = !!process.env.GEMINI_API_KEY;

  const providerOrder = [];
  if (provider === "anthropic" && hasAnthropic) providerOrder.push("anthropic");
  else if (provider === "gemini" && hasGemini) providerOrder.push("gemini");
  else {
    if (hasGemini)    providerOrder.push("gemini");
    if (hasAnthropic) providerOrder.push("anthropic");
  }

  let parsed = null;

  for (const p of providerOrder) {
    try {
      if (p === "anthropic") {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        });
        text = msg.content[0].text;
      } else {
        const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        text = result.response.text();
      }
      usedProvider = p;

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = {
          title:       text.match(/"title"\s*:\s*"([^"]+)"/)?.[1]?.trim()       || "",
          description: text.match(/"description"\s*:\s*"([\s\S]+?)(?=",\s*"tags)/)?.[1]?.replace(/\\n/g, "\n")?.trim() || "",
          tags:        text.match(/"tags"\s*:\s*"([^"]+)"/)?.[1]?.trim()         || "",
          hashtags:    text.match(/"hashtags"\s*:\s*"([^"]+)"/)?.[1]?.trim()     || "",
        };
      }
      break;
    } catch (e) {
      console.error(`AI provider "${p}" failed:`, e.message);
    }
  }

  if (!parsed) {
    console.log("All AI providers failed — using template fallback");
    parsed = generateTemplateMetadata(video_topic, ch.name || "Channel", ch.lang);
    usedProvider = "template";
  }

  await logActivity(channel_id, req.user.id, "done",
    `AI metadata (${usedProvider}): "${parsed.title}" (topic: ${video_topic || "channel niche"})`);

  res.json({
    title:       parsed.title       || "",
    description: parsed.description || "",
    tags:        parsed.tags        || "",
    hashtags:    parsed.hashtags    || "",
    provider:    usedProvider,
  });
});

export default router;
