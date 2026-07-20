import { kv } from "@vercel/kv";

// Seed historical water logs (from data.json) to prevent data loss
const INITIAL_WATER_DATA = {
  "2026-07-12": 1800,
  "2026-07-13": 2040,
  "2026-07-14": 2500,
  "2026-07-15": 2750,
  "2026-07-16": 2500,
  "2026-07-17": 3000,
  "2026-07-19": 1750
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const KV_KEY = "water_tracker_state";

  if (req.method === "GET") {
    try {
      let state = await kv.get(KV_KEY);
      if (!state || Object.keys(state).length === 0) {
        state = INITIAL_WATER_DATA;
        await kv.set(KV_KEY, INITIAL_WATER_DATA);
      }
      return res.status(200).json({ success: true, data: state });
    } catch (err) {
      console.error("Vercel KV GET error:", err);
      // Fail-soft: return default history if server database fails
      return res.status(200).json({ success: true, data: INITIAL_WATER_DATA });
    }
  } else if (req.method === "POST") {
    try {
      const { date, amount } = req.body;
      if (!date || typeof amount !== "number") {
        return res.status(400).json({ success: false, error: "Invalid date or amount payload" });
      }

      let state = await kv.get(KV_KEY);
      if (!state || Object.keys(state).length === 0) {
        state = INITIAL_WATER_DATA;
      }

      state[date] = Math.max(0, amount);
      await kv.set(KV_KEY, state);

      return res.status(200).json({ success: true, data: state });
    } catch (err) {
      console.error("Vercel KV SET error:", err);
      return res.status(500).json({ success: false, error: "Failed to write data to server" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }
}
