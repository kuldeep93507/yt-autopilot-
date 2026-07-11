import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import supabase from "../db/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { logActivity } from "../services/log.service.js";

const router = Router();
router.use(requireAuth);

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

  // Agar video topic diya hai toh usse use karo, warna channel niche se
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

  const useAnthropic = (provider === "anthropic" || provider === "auto") && process.env.ANTHROPIC_API_KEY;
  const useGemini    = (provider === "gemini" || (provider === "auto" && !useAnthropic)) && process.env.GEMINI_API_KEY;

  try {
    if (useAnthropic) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      text = msg.content[0].text;
    } else if (useGemini) {
      const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } else {
      return res.status(400).json({ error: "Koi AI key nahi — ANTHROPIC_API_KEY ya GEMINI_API_KEY .env mein daalo" });
    }

    // JSON parse karo
    let parsed = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback: old regex style
      parsed = {
        title:       text.match(/"title"\s*:\s*"([^"]+)"/)?.[1]?.trim()       || "",
        description: text.match(/"description"\s*:\s*"([\s\S]+?)(?=",\s*"tags)/)
                         ?.[1]?.replace(/\\n/g, "\n")?.trim()                  || "",
        tags:        text.match(/"tags"\s*:\s*"([^"]+)"/)?.[1]?.trim()         || "",
        hashtags:    text.match(/"hashtags"\s*:\s*"([^"]+)"/)?.[1]?.trim()     || "",
      };
    }

    await logActivity(channel_id, req.user.id, "done",
      `AI metadata: "${parsed.title}" (topic: ${video_topic || "channel niche"})`);

    res.json({
      title:       parsed.title       || "",
      description: parsed.description || "",
      tags:        parsed.tags        || "",
      hashtags:    parsed.hashtags    || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
