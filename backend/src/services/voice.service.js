import axios from "axios";

// OmniDimension REST API — the MCP tool used to create this agent only works
// inside a Claude session, so the deployed backend calls the same underlying
// HTTP API directly to trigger real alert calls in production.
const OMNIDIM_API_KEY = process.env.OMNIDIM_API_KEY;
const ALERT_AGENT_ID  = process.env.OMNIDIM_ALERT_AGENT_ID || "215319"; // "YT AutoPilot Alert Line"
const ALERT_PHONE     = process.env.OMNIDIM_ALERT_PHONE; // team member to call, e.g. +91XXXXXXXXXX

export async function dispatchAlertCall({ channelName, alertType, details }) {
  if (!OMNIDIM_API_KEY || !ALERT_PHONE) {
    console.warn("⚠️  OMNIDIM_API_KEY/OMNIDIM_ALERT_PHONE not set — voice alert skipped");
    return;
  }
  try {
    await axios.post(
      "https://backend.omnidim.io/api/v1/calls/dispatch",
      {
        agent_id: Number(ALERT_AGENT_ID),
        to_number: ALERT_PHONE,
        call_context: {
          channel_name: channelName || "Unknown channel",
          alert_type:   alertType,
          details:      details || "",
        },
      },
      { headers: { Authorization: `Bearer ${OMNIDIM_API_KEY}` } }
    );
  } catch (err) {
    console.error("Voice alert dispatch failed:", err.response?.data || err.message);
  }
}
