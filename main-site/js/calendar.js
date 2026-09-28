// The daily puzzles' calendar, with no DOM, for the page and the API alike:
// which days have a daily, a month laid out in weeks, dates for people to
// read, and runs of days in a row. A date is "YYYY-MM-DD", the player's own
// date, as a daily's is; a month is "YYYY-MM".

// The first day with a daily puzzle: the site's first. Every day from here
// to today can be played, and scores as it would have on the day. The
// dailies come from a secret and the date, so an old day is as new to
// everyone as today's.
export const DAILY_FIRST = "2025-09-23";

const DAY_MS = 86400000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Days since 1970-01-01, and back.
const toDay = (date) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;
const fromDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Whether text is a real day, written as YYYY-MM-DD.
export function isDate(text) {
  return typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && fromDay(toDay(text)) === text;
}

export const addDays = (date, n) => fromDay(toDay(date) + n);
export const daysBetween = (from, to) => toDay(to) - toDay(from);

// The month `n` months on from `month`, back for a negative n.
export function addMonths(month, n) {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
}

// A month's days in weeks from Monday: rows of seven dates, with null
// before its first day and after its last.
export function monthWeeks(month) {
  const first = `${month}-01`;
  const length = daysBetween(first, `${addMonths(month, 1)}-01`);
  const lead = (new Date(toDay(first) * DAY_MS).getUTCDay() + 6) % 7;
  const cells = [...new Array(lead).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// "September 2026".
export const monthName = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
// "12 Sep", or with long, "Saturday 12 September 2026".
export function dayName(date, long = false) {
  const [d, m] = [Number(date.slice(8, 10)), MONTHS[Number(date.slice(5, 7)) - 1]];
  if (!long) return `${d} ${m.slice(0, 3)}`;
  return `${WEEKDAYS[(new Date(toDay(date) * DAY_MS).getUTCDay() + 6) % 7]} ${d} ${m} ${date.slice(0, 4)}`;
}

// Runs of days in a row among `dates`: { current, longest }. The current
// run ends today, or yesterday while today is still to play, and is 0 once
// a day has been missed. A day filled in later mends a run as if it had
// been played on the day.
export function streaks(dates, today) {
  const days = new Set([...dates].filter(isDate).map(toDay));
  let longest = 0;
  for (const d of days) {
    if (days.has(d - 1)) continue;
    let run = 1;
    while (days.has(d + run)) run++;
    longest = Math.max(longest, run);
  }
  let end = toDay(today);
  if (!days.has(end)) end--;
  let current = 0;
  while (days.has(end - current)) current++;
  return { current, longest };
}
