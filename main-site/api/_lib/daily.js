// The daily puzzle. Its seed comes from DAILY_SECRET and the date, so nobody
// can work out tomorrow's puzzle from this code and solve it in advance.

import { createHmac } from "node:crypto";
import { LEVEL_IDS } from "../../js/levels.js";
import { bodyFromBytes, buildSeed } from "../../js/seed.js";
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

export function dailySeed(date) {
  const mac = (label) => createHmac("sha256", process.env.DAILY_SECRET).update(`${label}|${date}`).digest();
  const first = mac("daily");
  // 31 bytes almost never run short of 8 usable ones; a second hash covers it.
  const body = bodyFromBytes(first.subarray(1)) ?? bodyFromBytes(mac("daily-more"));
  return buildSeed(LEVEL_IDS[first[0] % LEVEL_IDS.length], body);
}
