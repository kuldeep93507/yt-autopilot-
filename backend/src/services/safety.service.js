import Anthropic from "@anthropic-ai/sdk";
import supabase from "../db/supabase.js";
import { alertSafetyRisk } from "./notify.service.js";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Screens a video's metadata (title/description/tags) for YouTube policy and
// copyright risk before it goes live. This is a metadata-level guard, not a
// frame-by-frame content scanner — it catches the risks visible in text:
// misleading claims, banned terms, likely copyrighted material references,
// clickbait that trips "misleading metadata" policy, etc.
export async function screenVideo({ channelId, channelName, channelNiche, queueId, title, description, tags }) {
  if (!anthropic) {
    return { risk_level: "safe", reasons: "AI screening skipped — no ANTHROPIC_API_KEY set" };
  }

  const prompt = `You are a YouTube Trust & Safety reviewer. Screen this video's metadata for policy risk BEFORE it goes live.

Channel niche: ${channelNiche || "general"}
Title: ${title || "(none)"}
Description: ${(description || "").slice(0, 1500)}
Tags: ${tags || "(none)"}

Check for:
1. Misleading/clickbait metadata (title promises content the description doesn't support)
2. Copyright red flags (references to using others' music/footage/brand without permission, "no copyright" claims that don't hold up, reused content signals)
3. Community guideline risks (banned terms, harmful claims, spam patterns, restricted content signals)
4. Monetization risks (advertiser-unfriendly language)

Respond ONLY with this exact JSON, no other text:
{"risk_level":"safe|warn|block","reasons":"short specific explanation, empty string if safe"}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { risk_level: "safe", reasons: "" };

    await supabase.from("channel_safety_log").insert([{
      channel_id: channelId,
      queue_id:   queueId || null,
      video_title: title || "",
      risk_level: parsed.risk_level || "safe",
      reasons:    parsed.reasons || "",
    }]);

    if (parsed.risk_level === "warn" || parsed.risk_level === "block") {
      await alertSafetyRisk(channelName, title, parsed.risk_level, parsed.reasons);
    }

    return parsed;
  } catch (err) {
    // Fail open with a warning, not a hard block — a screening outage shouldn't
    // freeze the whole upload pipeline, but it should be visible.
    console.error("Safety screening failed:", err.message);
    return { risk_level: "safe", reasons: `Screening error (not blocked): ${err.message}` };
  }
}

export async function getChannelSafetyLog(channelId, limit = 50) {
  const { data, error } = await supabase
    .from("channel_safety_log")
    .select("*")
    .eq("channel_id", channelId)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
