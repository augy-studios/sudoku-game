// The daily puzzle. Its seed comes from DAILY_SECRET and the date, so nobody
// can work out tomorrow's puzzle from this code and solve it in advance.

import { createHmac } from "node:crypto";
import { LEVEL_IDS } from "../../js/levels.js";
import { bodyFromBytes, buildSeed } from "../../js/seed.js";
import { HttpError } from "./http.js";

const DAY_MS = 86400000;

export function dailyConfigured() {
  return Boolean(process.env.DAILY_SECRET);
}

// "YYYY-MM-DD", the player's own date. Anything from yesterday to tomorrow
// in UTC is accepted, which covers every time zone.
export function dailyDate(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const at = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(at).toISOString().slice(0, 10) !== text) throw new HttpError(400, "bad_date");
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  if (Math.abs(at - today) > DAY_MS) throw new HttpError(400, "bad_date", "That is not today's puzzle.");
  return text;
}

export function dailySeed(date) {
  const mac = (label) => createHmac("sha256", process.env.DAILY_SECRET).update(`${label}|${date}`).digest();
  const first = mac("daily");
  // 31 bytes almost never run short of 8 usable ones; a second hash covers it.
  const body = bodyFromBytes(first.subarray(1)) ?? bodyFromBytes(mac("daily-more"));
  return buildSeed(LEVEL_IDS[first[0] % LEVEL_IDS.length], body);
}
