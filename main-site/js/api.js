// The leaderboard API. Games are played entirely in the browser; the API
// hands out start tickets, and checks and scores finished games.

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
  // No seed: the server picks one at `level`. A daily takes the player's date.
  start: ({ mode, level, seed, maxHints, date }) =>
    call("POST", "/api/game/start", { client_key: clientKey(), mode, level, seed, max_hints: maxHints, date }),
  finish: (body) => call("POST", "/api/game/finish", { ...body, client_key: clientKey() }),
  submit: (body) => call("POST", "/api/game/submit", { ...body, client_key: clientKey() }),
  checkName: (name) => call("POST", "/api/leaderboard/name", { name }),
  leaderboard: (board, date) =>
    call("GET", `/api/leaderboard?board=${encodeURIComponent(board)}${date ? `&date=${encodeURIComponent(date)}` : ""}`),
};

// This device's date as YYYY-MM-DD, which is what a daily puzzle is for.
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
