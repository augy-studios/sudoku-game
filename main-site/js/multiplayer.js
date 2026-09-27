// Network games: one device hosts and the other joins with a six character
// code, over net.js. Two kinds:
//
//   race   The same puzzle, each player on their own board. Each board is
//          its player's own, like a solo game, and each side can go on the
//          leaderboard. The host runs the match: the puzzle, the start
//          ticket, and who finished first.
//   co-op  One board, both players on it. The host holds the board, per
//          STUN-p2p-spec.md: the guest sends what it wants to do, the host
//          applies it and sends the whole game back. Not scored.
//
// The host sends a snapshot 20 times a second and on every change.
//
// Messages, beyond the spec's hello, state, bye and full:
//
//   { type: "progress", match, filled, mistakes, hints, done, solved }
//                                       race guest to host, its own board
//   { type: "act", match, k, c, d }    co-op guest to host, one action
//   { type: "ping" }                   guest to host, the guest's heartbeat
//
// A message about a match that has moved on since is ignored, and the next
// snapshot heals it.

import { Host, Guest, generateCode, isValidCode, normaliseCode, CODE_LENGTH, PROTOCOL_VERSION } from "./net.js";
import * as game from "./game.js";
import { KINDS } from "./record.js";
import { newSeed, parseSeed } from "./seed.js";
import { qrToSvg } from "./qr.js";
import { copyText, hydrateIcons, store } from "./ui.js";

const HOST_CODE_KEY = "uwusudoku.hostCode";
const LAST_CODE_KEY = "uwusudoku.lastCode";
const SNAPSHOT_MS = 50;
// Silence checks and the guest's bar need nothing like the snapshot rate.
const TICK_MS = 250;
const PING_MS = 1000;
const HOST_SILENCE_MS = 8000;
// Time, not missed snapshots: at 20 a second a few missed ones is an
// ordinary wifi stall, and a background host tab only ticks once a second.
const GUEST_STALE_MS = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const $ = (id) => document.getElementById(id);

let role = null; // "host" | "guest" | null
let host = null;
let guest = null;
let code = "";
// host: the next game. kind "race" or "coop", level, seed (pasted, or null
// for the server to pick), maxHints.
let plan = null;
let match = 0;
let startingGame = false;
let retriedTaken = false;
let lastHeard = 0;
let lastState = 0;
let reconnects = 0;
let wakeLock = null;
// A race: each side's progress, and the order they finished in.
let sides = [null, null];
let order = [];

/* ---- the adapter game.js calls ---- */

const adapter = {
  connected() {
    if (role === "host") return Boolean(host && host.links.size > 0);
    if (role === "guest") return guest?.status === "connected" && Date.now() - lastState < GUEST_STALE_MS * 3;
    return false;
  },
  changed() {
    const g = game.current();
    if (role === "host") {
      if (g?.mode === "race") noteProgress(0, game.progress());
      broadcast();
    } else if (role === "guest" && g?.mode === "race") {
      sendProgress();
    }
    renderBar();
  },
  host(next) {
    startHosting(next);
  },
  sendAction(a) {
    guest?.send({ type: "act", match: game.current()?.netMatch ?? 0, k: a.k, c: a.c, d: a.d });
  },
  leave() {
    if (role === "host") stopHosting();
    else leaveGuest();
  },
  nextGame() {
    if (role !== "host" || !plan) return;
    // A fresh seed for every game after the first, picked by the server.
    plan.seed = null;
    startNetworkGame();
  },
  // The other player in a race, for the strip above the board.
  opponent() {
    const g = game.current();
    if (g?.mode !== "race" || !role) return null;
    const theirs = sides[role === "host" ? 1 : 0];
    if (!theirs) return { text: this.connected() ? "Your opponent is starting." : "Waiting for your opponent.", fraction: 0 };
    const fraction = theirs.blanks ? theirs.filled / theirs.blanks : 0;
    let text = `Opponent: ${theirs.filled} of ${theirs.blanks}, ${theirs.mistakes} ${theirs.mistakes === 1 ? "mistake" : "mistakes"}`;
    if (theirs.solved) text = "Your opponent used Solve.";
    else if (theirs.done) text = "Your opponent has finished.";
    return { text, fraction };
  },
  // 1 or 2 once this player has finished a race, otherwise null.
  place() {
    const mine = role === "host" ? 0 : 1;
    const at = order.indexOf(mine);
    return at < 0 ? null : at + 1;
  },
};

/* ---- hosting ---- */

function readStored(key) {
  const value = store.get(key);
  return isValidCode(value) ? normaliseCode(value) : null;
}

function joinLink(c) {
  return `${location.origin}/?join=${c}`;
}

async function startHosting(next) {
  closeAll();
  role = "host";
  plan = { ...next };
  match = 0;
  code = readStored(HOST_CODE_KEY) ?? generateCode();
  store.set(HOST_CODE_KEY, code);

  game.showPanel("net");
  $("hostView").classList.remove("hidden");
  $("hostCode").textContent = code;
  $("hostQr").innerHTML = qrToSvg(joinLink(code));
  $("copyLinkLabel").textContent = "Copy link";
  $("newCodeBtn").classList.remove("hidden");
  $("netRetryBtn").classList.add("hidden");
  $("netKind").textContent = plan.kind === "race" ? "A race: the same puzzle, each on your own board." : "Co-op: one board, solved together.";
  setNetStatus(navigator.onLine === false ? "Network games need a connection to pair." : "Setting up the code.");

  const mine = new Host({ maxGuests: 1 });
  host = mine;
  mine.addEventListener("status", ({ detail }) => {
    if (host !== mine) return;
    if (detail.taken && !retriedTaken) {
      // Another tab holds it, or the broker has not let go of it yet.
      retriedTaken = true;
      restartWithFreshCode();
      return;
    }
    if (detail.status === "waiting") retriedTaken = false;
    onHostStatus(detail);
  });
  mine.addEventListener("message", ({ detail }) => {
    if (host === mine) onHostMessage(detail.message, detail.from);
  });
  mine.addEventListener("leave", () => {
    if (host === mine) {
      game.refresh();
      renderBar();
    }
  });

  try {
    await mine.start(code);
  } catch {
    if (host !== mine) return;
    host = null;
    setNetStatus("Could not load pairing. Check your connection.", true);
  }
}

function onHostStatus({ status, message }) {
  if (status === "error") {
    // With a game under way the board stays; the bar says what happened.
    if (game.current()?.role) renderBar(message);
    else setNetStatus(message, true);
    return;
  }
  if (status === "waiting" && !game.current()) setNetStatus("Waiting for the other device to join.");
  if (status === "connected") acquireWakeLock();
  renderBar();
  game.refresh();
}

function restartWithFreshCode() {
  store.remove(HOST_CODE_KEY);
  startHosting(plan);
}

function stopHosting() {
  host?.close();
  host = null;
  role = null;
  releaseWakeLock();
}

// The game starts once the guest has said hello, so the clock and the
// server's ticket start from when both are there.
async function startNetworkGame() {
  if (startingGame) return;
  startingGame = true;
  sides = [null, null];
  order = [];
  try {
    const next = ++match;
    let g;
    if (plan.kind === "race") {
      g = await game.launch({ mode: "race", role: "host", level: plan.level, seed: plan.seed, maxHints: plan.maxHints });
    } else {
      g = game.startGame({ mode: "coop", role: "host", seed: plan.seed ?? newSeed(plan.level), maxHints: plan.maxHints });
    }
    if (g) {
      g.netMatch = next;
      if (g.mode === "race") noteProgress(0, game.progress());
    }
  } finally {
    startingGame = false;
  }
  broadcast();
}

// A race side's progress, and its place once it has finished.
function noteProgress(side, p) {
  if (!p) return;
  sides[side] = p;
  if (p.done && !p.solved && !order.includes(side)) order.push(side);
}

function broadcast() {
  const g = game.current();
  if (role !== "host" || !host || !g || !g.role || !g.netMatch) return;
  host.send({ type: "state", v: PROTOCOL_VERSION, match: g.netMatch, ...game.snapshotData(), sides, order });
}

function validProgress(p) {
  return (
    p &&
    Number.isInteger(p.filled) &&
    Number.isInteger(p.blanks) &&
    p.blanks > 0 &&
    p.blanks <= 81 &&
    p.filled >= 0 &&
    p.filled <= p.blanks &&
    Number.isInteger(p.mistakes) &&
    p.mistakes >= 0 &&
    p.mistakes < 100000 &&
    Number.isInteger(p.hints) &&
    p.hints >= 0 &&
    p.hints <= 81 &&
    typeof p.done === "boolean" &&
    typeof p.solved === "boolean"
  );
}

// Rebuilt field by field, so nothing unexpected rides along.
const cleanProgress = (p) => ({ filled: p.filled, blanks: p.blanks, mistakes: p.mistakes, hints: p.hints, done: p.done, solved: p.solved });

function onHostMessage(message, from) {
  lastHeard = Date.now();
  const g = game.current();
  const current = g && g.role === "host" && message.match === g.netMatch;

  switch (message.type) {
    case "hello":
      if (message.v !== PROTOCOL_VERSION) {
        host.send({ type: "old", v: PROTOCOL_VERSION }, from);
        return;
      }
      if (!g || g.role !== "host") startNetworkGame();
      else broadcast();
      renderBar();
      return;
    case "progress":
      if (!current || g.mode !== "race" || !validProgress(message)) return;
      noteProgress(1, cleanProgress(message));
      game.refresh();
      break;
    case "act":
      if (!current || g.mode !== "coop") return;
      if (!KINDS.includes(message.k) || !Number.isInteger(message.c) || !Number.isInteger(message.d)) return;
      if (message.c < 0 || message.c > 80 || message.d < 0 || message.d > 9) return;
      // Anything that cannot be played is refused by the replay, quietly.
      game.applyAction({ k: message.k, c: message.c, d: message.d, b: 1 });
      return;
    case "bye":
      // Leaving on purpose: this code is spent, and the game with it.
      store.remove(HOST_CODE_KEY);
      game.endGame();
      startHosting({ ...plan, seed: null });
      setNetStatus("Your opponent left. Share the new code to play again.");
      return;
    default:
      // ping, and anything this build does not know: ignored, never thrown on.
      return;
  }
  broadcast();
}

/* ---- joining ---- */

export async function join(input) {
  const c = normaliseCode(input);
  if (!isValidCode(c)) {
    setNetStatus(`A code is ${CODE_LENGTH} characters.`, true);
    const field = $("joinInput");
    field.classList.remove("shake");
    void field.offsetWidth;
    field.classList.add("shake");
    field.focus();
    return;
  }
  if (role !== "guest" || code !== c) reconnects = 0;
  closeAll();
  role = "guest";
  code = c;
  lastState = 0;

  if (!game.current()?.role) {
    game.showPanel("net");
    $("hostView").classList.add("hidden");
    $("newCodeBtn").classList.add("hidden");
    $("netKind").textContent = "";
  }
  $("netRetryBtn").classList.add("hidden");
  setNetStatus(navigator.onLine === false ? "Network games need a connection to pair." : `Connecting to ${c}.`);

  const mine = new Guest();
  guest = mine;
  mine.addEventListener("status", ({ detail }) => {
    if (guest === mine) onGuestStatus(detail);
  });
  mine.addEventListener("message", ({ detail }) => {
    if (guest === mine) onGuestMessage(detail.message);
  });

  try {
    await mine.connect(c);
    store.set(LAST_CODE_KEY, c);
  } catch {
    if (guest !== mine) return;
    guest = null;
    setNetStatus("Could not load pairing. Check your connection.", true);
    $("netRetryBtn").classList.remove("hidden");
  }
}

const UNREACHABLE =
  "Could not reach the other device. Both have to be on the same network: join the same wifi, or turn on a hotspot on one and join it from the other. Check the code is still the one on screen.";

function onGuestStatus({ status, message }) {
  const inGame = Boolean(game.current()?.role);
  if (status === "connected") {
    reconnects = 0;
    acquireWakeLock();
    if (!inGame) setNetStatus("Connected. Waiting for the host's game.");
  } else if (status === "dropped") {
    // Probably coming back: try again quietly a few times.
    if (reconnects < 3) {
      reconnects++;
      setTimeout(() => role === "guest" && guest?.status === "dropped" && join(code), 1500);
    } else if (!inGame) {
      setNetStatus("The connection dropped.", true);
      $("netRetryBtn").classList.remove("hidden");
    }
  } else if (status === "unreachable" || status === "error") {
    const text = status === "unreachable" ? UNREACHABLE : message;
    if (inGame) {
      renderBar(text);
    } else {
      setNetStatus(text, true);
      $("netRetryBtn").classList.remove("hidden");
    }
  }
  renderBar();
  game.refresh();
}

function validWireLog(log) {
  return (
    Array.isArray(log) &&
    log.length <= 2000 &&
    log.every((e) => Array.isArray(e) && e.length >= 4 && e.length <= 5 && e.every((x) => typeof x === "string" || Number.isInteger(x)))
  );
}

function validSnapshot(s) {
  return (
    s.type === "state" &&
    Number.isInteger(s.match) &&
    (s.kind === "race" || s.kind === "coop") &&
    typeof s.seed === "string" &&
    s.seed.length <= 20 &&
    parseSeed(s.seed) !== null &&
    (s.gameId === null || (typeof s.gameId === "string" && UUID.test(s.gameId))) &&
    typeof s.serverSeed === "boolean" &&
    (s.maxHints === null || (Number.isInteger(s.maxHints) && s.maxHints >= 0 && s.maxHints <= 81)) &&
    Number.isFinite(s.elapsed) &&
    s.elapsed >= 0 &&
    s.elapsed < 86400000 &&
    (s.kind === "coop" ? validWireLog(s.log) : s.log === null) &&
    Array.isArray(s.sides) &&
    s.sides.length === 2 &&
    s.sides.every((p) => p === null || validProgress(p)) &&
    Array.isArray(s.order) &&
    s.order.length <= 2 &&
    s.order.every((n) => n === 0 || n === 1)
  );
}

function onGuestMessage(message) {
  switch (message.type) {
    case "state":
      if (!validSnapshot(message)) return;
      lastState = Date.now();
      sides = message.sides.map((p) => p && cleanProgress(p));
      order = message.order.slice();
      game.loadSnapshot({
        match: message.match,
        kind: message.kind,
        seed: message.seed,
        gameId: message.gameId,
        serverSeed: message.serverSeed,
        maxHints: message.maxHints,
        elapsed: message.elapsed,
        log: message.log,
      });
      // The host only knows what this board has told it. A snapshot that is
      // behind, such as the first of a new match, gets told again.
      if (message.kind === "race") {
        const mine = game.progress();
        const told = message.sides[1];
        if (mine && (!told || told.filled !== mine.filled || told.done !== mine.done || told.mistakes !== mine.mistakes)) sendProgress();
      }
      renderBar();
      return;
    case "full":
      setNetStatus("That game already has two players.", true);
      return;
    case "old":
      setNetStatus("The host's device is on a different version. Reload both and try again.", true);
      return;
    default:
      return;
  }
}

function sendProgress() {
  const g = game.current();
  const p = game.progress();
  if (!g || !p || g.mode !== "race") return;
  guest?.send({ type: "progress", match: g.netMatch, ...p });
}

function leaveGuest() {
  guest?.leave();
  guest = null;
  role = null;
  store.remove(LAST_CODE_KEY);
  releaseWakeLock();
}

/* ---- both ---- */

function closeAll() {
  host?.close();
  host = null;
  guest?.close();
  guest = null;
}

function setNetStatus(text, error = false) {
  const el = $("netStatus");
  el.textContent = text;
  el.classList.toggle("error", error);
}

// The line under the board in a network game.
function renderBar(problem) {
  const g = game.current();
  const bar = $("netBar");
  if (!g?.role) {
    bar.classList.add("hidden");
    return;
  }
  let tone = "busy";
  let text;
  if (role === "host") {
    if (host?.links.size) {
      tone = "ok";
      text = "Connected";
    } else {
      tone = "warn";
      text = `The other player disconnected. They can rejoin with ${code}.`;
    }
  } else if (role === "guest") {
    const fresh = Date.now() - lastState < GUEST_STALE_MS;
    if (guest?.status === "connected" && fresh) {
      tone = "ok";
      text = "Connected to the host";
    } else if (guest?.status === "connected") {
      tone = "warn";
      text = "The connection looks stale.";
    } else if (guest?.status === "connecting" || guest?.status === "dropped") {
      text = "Reconnecting.";
    } else {
      tone = "error";
      text = "Disconnected.";
    }
  } else {
    tone = "error";
    text = "Not connected.";
  }
  if (problem) {
    tone = "error";
    text = problem;
  }
  bar.dataset.tone = tone;
  $("netBarText").textContent = text;
  bar.classList.remove("hidden");
}

async function acquireWakeLock() {
  try {
    if (!wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    }
  } catch {
    // Refused or unsupported: the screen may sleep, nothing else changes.
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function tick() {
  if (role === "host" && host) {
    // A guest silent this long has probably gone; its seat reopens.
    if (host.links.size && Date.now() - lastHeard > HOST_SILENCE_MS) {
      host.dropAll();
      game.refresh();
    }
  }
  if (role === "guest") {
    renderBar();
    // A co-op guest can only play while connected; redraw as that changes.
    if (game.current()?.mode === "coop") game.refresh();
  }
}

export function initMultiplayer({ joinCode } = {}) {
  game.setNet(adapter);

  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    join($("joinInput").value);
  });
  $("joinInput").addEventListener("input", (e) => {
    const c = normaliseCode(e.target.value);
    if (c !== e.target.value) e.target.value = c;
  });
  $("copyLinkBtn").addEventListener("click", async () => {
    $("copyLinkLabel").textContent = (await copyText(joinLink(code))) ? "Copied" : "Copy failed";
  });
  $("newCodeBtn").addEventListener("click", () => {
    if (role === "host") restartWithFreshCode();
  });
  $("netRetryBtn").addEventListener("click", () => {
    if (role === "guest" || code) join(code);
  });
  $("netCancelBtn").addEventListener("click", () => {
    if (role === "host") stopHosting();
    else leaveGuest();
    game.endGame();
  });

  // The steady beat, which doubles as the host's heartbeat.
  setInterval(() => role === "host" && broadcast(), SNAPSHOT_MS);
  setInterval(tick, TICK_MS);
  setInterval(() => role === "guest" && guest?.send({ type: "ping" }), PING_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (role && adapter.connected()) acquireWakeLock();
    // Back from the background with a channel that died meanwhile.
    if (role === "guest" && guest?.status === "dropped") join(code);
  });

  // From a join link, or from last time.
  const initial = normaliseCode(joinCode) || readStored(LAST_CODE_KEY) || "";
  if (initial) $("joinInput").value = initial;
  hydrateIcons($("net"));
}
