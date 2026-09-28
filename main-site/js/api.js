// The leaderboard API. Games are played entirely in the browser; the API
// hands out start tickets, and checks and scores finished games. It also
// keeps the short codes long made seeds are shared by (short codes, below).

import { parseSeed, parseCode, needsCode } from "./seed.js";

const KEY_STORAGE = "uwusudoku.clientKey";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// A random id tying this browser's submissions to the games it started. Not
// an identity: it grants nothing and is never shown.
function makeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let memoryKey = null;

export function clientKey() {
  try {
    let key = localStorage.getItem(KEY_STORAGE);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(key ?? "")) {
      key = makeKey();
      localStorage.setItem(KEY_STORAGE, key);
    }
    return key;
  } catch {
    memoryKey ??= makeKey();
    return memoryKey;
  }
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "That needs a connection.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // An HTML error page from the platform, not the API.
  }
  if (!response.ok) throw new ApiError(response.status, data?.error ?? "server", data?.message);
  return data;
}

export const api = {
  // No seed: the server picks one at `level`. A daily takes the player's date
  // and its kind, "classic" or "killer".
  start: ({ mode, level, seed, maxHints, date, kind }) =>
    call("POST", "/api/game/start", { client_key: clientKey(), mode, level, seed, max_hints: maxHints, date, kind }),
  finish: (body) => call("POST", "/api/game/finish", { ...body, client_key: clientKey() }),
  submit: (body) => call("POST", "/api/game/submit", { ...body, client_key: clientKey() }),
  checkName: (name) => call("POST", "/api/leaderboard/name", { name }),
  // extra: { date, kind } for the daily, { seed } for a made puzzle's board, or
  // { q } to search made puzzles.
  leaderboard: (board, extra = {}) => {
    const params = new URLSearchParams({ board });
    for (const [k, v] of Object.entries(extra)) if (v != null) params.set(k, v);
    return call("GET", `/api/leaderboard?${params}`);
  },
  shorten: (seed) => call("POST", "/api/seed/shorten", { seed }),
  lookup: (code) => call("GET", `/api/seed/lookup?code=${encodeURIComponent(code)}`),
};

/* ---- short codes ---- */

// The short codes this browser has made or opened, each as written with
// the whole seed it stands for, so one opens again offline and a seed shows
// its code at once. A code never changes, so they never go stale; the
// newest CODES_KEPT are kept.
const CODES_STORAGE = "uwusudoku.seedCodes";
const CODES_KEPT = 100;
let memoryCodes = {};

function knownCodes() {
  try {
    const kept = JSON.parse(localStorage.getItem(CODES_STORAGE));
    return kept && typeof kept === "object" ? kept : memoryCodes;
  } catch {
    return memoryCodes;
  }
}

function remember(code, seed) {
  const all = { ...knownCodes() };
  delete all[code];
  all[code] = seed;
  const keys = Object.keys(all);
  for (const key of keys.slice(0, Math.max(0, keys.length - CODES_KEPT))) delete all[key];
  memoryCodes = all;
  try {
    localStorage.setItem(CODES_STORAGE, JSON.stringify(all));
  } catch {
    // Kept for this visit only.
  }
}

// The short code a seed's text is known by here, or null.
export function knownCode(text) {
  return Object.entries(knownCodes()).find(([, seed]) => seed === text)?.[0] ?? null;
}

// What to show and copy for a seed: its short code once known, or else
// the seed itself.
export const seedLabel = (seed) => knownCode(seed.text) ?? seed.text;

// Asks for a long made seed's short code, if it has not got one here yet.
// Resolves with the code as written, or null: a seed short enough as it
// is, or no connection, which leaves the seed itself to share.
export async function fetchCode(seed) {
  if (!seed?.made || !needsCode(seed.text)) return null;
  const known = knownCode(seed.text);
  if (known) return known;
  try {
    const { code } = await api.shorten(seed.text);
    remember(code, seed.text);
    return code;
  } catch {
    return null;
  }
}

// Why a short code did not open, from findSeed.
export const CODE_TROUBLE = {
  offline: "A short seed needs a connection to look up the first time. The whole seed plays offline.",
  unknown: "No puzzle has that short seed. Check it for a mistyped letter.",
  failed: "That short seed did not load. Try again in a moment.",
};

// A seed from what was typed: at once for a whole seed, or for a short
// code this browser has opened before; any other short code is looked up.
// { seed }, or { seed: null, why } with why "bad" (neither), or a key of
// CODE_TROUBLE. `level` is parseSeed's, for eight characters alone.
export async function findSeed(text, level = null) {
  const seed = parseSeed(text, level);
  if (seed) return { seed };
  const code = parseCode(text);
  if (!code) return { seed: null, why: "bad" };
  let whole = knownCodes()[code.text] ?? Object.entries(knownCodes()).find(([known]) => parseCode(known)?.code === code.code)?.[1];
  if (!whole) {
    try {
      whole = (await api.lookup(code.text)).seed;
    } catch (err) {
      return { seed: null, why: err.code === "offline" ? "offline" : err.status === 404 ? "unknown" : "failed" };
    }
  }
  const found = parseSeed(whole);
  if (!found) return { seed: null, why: "unknown" };
  // As written with the seed's own level, whatever was typed in front.
  remember(parseCode(`${found.level}${code.code}`).text, found.text);
  return { seed: found };
}

// This device's date as YYYY-MM-DD, which is what a daily puzzle is for.
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
