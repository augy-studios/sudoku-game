// The daily puzzle. Its seed comes from DAILY_SECRET and the date, so nobody
// can work out tomorrow's puzzle from this code and solve it in advance.
// Each day has two: a classic one, and a killer one at the same level, whose
// seed is a made killer puzzle's, grown from the secret the same way.

import { createHmac } from "node:crypto";
import { LEVEL_IDS } from "../../js/levels.js";
import { bodyFromBytes, buildSeed, killerSeed, randomSource } from "../../js/seed.js";
import { DAILY_FIRST, isDate, addDays } from "../../js/calendar.js";
import { HttpError } from "./http.js";

export function dailyConfigured() {
  return Boolean(process.env.DAILY_SECRET);
}

// "YYYY-MM-DD", the player's own date: any day from the first daily on,
// picked from the calendar, up to tomorrow in UTC, which is today somewhere.
// An old day scores as it would have on the day.
export function dailyDate(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!isDate(text)) throw new HttpError(400, "bad_date");
  const tomorrow = addDays(new Date(Date.now()).toISOString().slice(0, 10), 1);
  if (text < DAILY_FIRST || text > tomorrow) throw new HttpError(400, "bad_date", "There is no daily puzzle for that day.");
  return text;
}

export const DAILY_KINDS = ["classic", "killer"];

// The daily's kind from a request: classic unless it says killer.
export function dailyKind(value) {
  if (value == null) return "classic";
  if (!DAILY_KINDS.includes(value)) throw new HttpError(400, "bad_kind", "A daily puzzle is classic or killer.");
  return value;
}

// Killer dailies already made, by date, for a warm function's next start.
const killers = new Map();

export function dailySeed(date, kind = "classic") {
  const mac = (label) => createHmac("sha256", process.env.DAILY_SECRET).update(`${label}|${date}`).digest();
  const first = mac("daily");
  const level = LEVEL_IDS[first[0] % LEVEL_IDS.length];
  if (kind === "killer") {
    if (!killers.has(date)) {
      killers.set(date, killerSeed(randomSource(mac("daily-killer").readUInt32BE(0)), level));
      if (killers.size > 8) killers.delete(killers.keys().next().value);
    }
    return killers.get(date);
  }
  // 31 bytes almost never run short of 8 usable ones; a second hash covers it.
  const body = bodyFromBytes(first.subarray(1)) ?? bodyFromBytes(mac("daily-more"));
  return buildSeed(level, body);
}
