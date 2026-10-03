// A game as a seed and a log of actions, replayed into everything the page,
// the replay and the API need. Pure, like sudoku.js.
//
// An action is { k, c, d, t, b }:
//
//   k  "p" place digit d in cell c
//      "e" erase cell c: its digit, or its notes if it has no digit
//      "n" toggle note d in cell c
//      "h" hint: cell c gets its answer, under Yin-Yang its shade too
//      "u" undo the player's last action that still stands
//      "s" solve: every cell gets its answer, and the game is not ranked
//      "y" Yin-Yang: cell c's shade becomes d
//   c  cell, 0 to 80 in reading order (0 for u and s)
//   d  digit 1 to 9 for p and n, or 10 for Doppelgänger's 0 in a puzzle
//      whose answer has one; for y, 1 shaded, 2 unshaded, 0 neither;
//      otherwise 0
//   t  milliseconds since the game started
//   b  player, 0 or 1. Only a co-op game has a player 1.
//
// Undo is unlimited and is itself an action, so the log keeps everything that
// happened: a mistake that was undone still happened, and the replay and the
// score both see it.
//
// A Yin-Yang puzzle has a shading to find as well as digits: puzzle.shades
// gives the circles' shades, and solution.shading the answer (seed.js), and
// a board is complete once its shaded cells are the answer's too, a cell
// left unmarked counting as unshaded. Shading never scores, and is never a
// mistake.

import { PEERS } from "./sudoku.js";

export const KINDS = ["p", "e", "n", "h", "u", "s", "y"];
export const MAX_ACTIONS = 2000;

// peers: the cells a placed digit clears that note from. shading: under
// Yin-Yang, each cell's shade, or null.
function apply(values, notes, a, solution, peers, shading) {
  const { k, c } = a;
  // A hint on a cell whose digit is right already only shades it.
  if (k === "p" || (k === "h" && values[c] !== solution[c])) {
    const d = k === "h" ? solution[c] : a.d;
    values[c] = d;
    notes[c] = 0;
    const bit = 1 << d;
    for (const o of peers[c]) notes[o] &= ~bit;
  }
  if (k === "h" && shading) shading[c] = solution.shading[c];
  if (k === "y") shading[c] = a.d;
  if (k === "e") {
    if (values[c]) values[c] = 0;
    else notes[c] = 0;
  } else if (k === "n") {
    notes[c] ^= 1 << a.d;
  } else if (k === "s") {
    for (let i = 0; i < 81; i++) {
      values[i] = solution[i];
      notes[i] = 0;
      // Shaded as the answer is; marks of unshaded, a circle's or the
      // player's, stay, and nothing more is marked.
      if (shading && solution.shading[i] === 1) shading[i] = 1;
      else if (shading?.[i] === 1) shading[i] = 0;
    }
  }
}

// Whether a Yin-Yang cell's shade is wrong: shaded where the answer is not,
// or the other way round.
const shadeWrong = (shading, solution, c) => Boolean(shading) && (shading[c] === 1) !== (solution.shading[c] === 1);

// Why an action cannot be played in this state, or null if it can. A cell
// with its digit given can still be shaded, and hinted for its shade.
function problem(a, puzzle, solution, values, notes, shading, top) {
  const { k, c, d } = a;
  if (k === "u" || k === "s") return null;
  if (!Number.isInteger(c) || c < 0 || c > 80) return "bad_cell";
  if (k === "y") {
    if (!shading) return "bad_kind";
    if (puzzle.shades?.[c]) return "given";
    return Number.isInteger(d) && d >= 0 && d <= 2 && shading[c] !== d ? null : "bad_shade";
  }
  if (puzzle[c]) return k === "h" && shadeWrong(shading, solution, c) ? null : "given";
  if (k === "p") return Number.isInteger(d) && d >= 1 && d <= top && values[c] !== d ? null : "bad_digit";
  if (k === "n") return Number.isInteger(d) && d >= 1 && d <= top && !values[c] ? null : "bad_note";
  if (k === "e") return values[c] || notes[c] ? null : "empty";
  if (k === "h") return values[c] !== solution[c] || shadeWrong(shading, solution, c) ? null : "no_hint";
  return "bad_kind";
}

const topDigit = (solution) => (solution.includes(10) ? 10 : 9);

const isComplete = (values, solution, shading) => values.every((v, i) => v === solution[i] && !shadeWrong(shading, solution, i));

// Replays `log` over the puzzle. Stops at the first action that cannot be
// played and says where. With `frames`, also returns the grid after every
// action, for the replay. `peers`, for each cell those a digit placed there
// clears its note from: its row, column and box unless a Jigsaw's regions
// take the boxes' place. Notes never count for the score, so the API can
// leave it out.
//
// steps[i] says what action i did: ok (a placed digit was right), credit (it
// filled that cell correctly for the first time), and undid (the index of
// the action an undo took back). Under Yin-Yang, shading is each cell's
// shade, starting from the circles', and every frame has it too.
export function play(puzzle, solution, log, { frames = false, peers = PEERS } = {}) {
  let values = puzzle.slice();
  let notes = new Array(81).fill(0);
  const startShading = () => (solution.shading ? Array.from(puzzle.shades ?? new Array(81).fill(0)) : null);
  let shading = startShading();
  // The highest digit: 9, or Doppelgänger's 0, 10, if the answer has it.
  const top = topDigit(solution);
  const shot = () => ({ values: values.slice(), notes: notes.slice(), ...(shading ? { shading: shading.slice() } : {}) });
  const credited = new Array(81).fill(false);
  const standing = []; // indexes into log of the actions still in effect
  const steps = [];
  const shots = frames ? [shot()] : null;
  let error = null;
  let complete = false;
  let solved = false;

  for (let i = 0; i < log.length; i++) {
    const a = log[i];
    if (i >= MAX_ACTIONS) {
      error = { at: i, reason: "too_long" };
      break;
    }
    if (complete || solved) {
      error = { at: i, reason: "after_end" };
      break;
    }
    const why = problem(a, puzzle, solution, values, notes, shading, top);
    if (why) {
      error = { at: i, reason: why };
      break;
    }

    const step = { ok: false, credit: false, undid: -1 };
    if (a.k === "u") {
      let at = -1;
      for (let j = standing.length - 1; j >= 0; j--) {
        if (log[standing[j]].b === a.b) {
          at = j;
          break;
        }
      }
      if (at < 0) {
        error = { at: i, reason: "nothing_to_undo" };
        break;
      }
      step.undid = standing[at];
      standing.splice(at, 1);
      // Rebuilt from the start, which puts back anything the undone action
      // cleared, such as notes a placed digit took out of its row.
      values = puzzle.slice();
      notes = new Array(81).fill(0);
      shading = startShading();
      for (const j of standing) apply(values, notes, log[j], solution, peers, shading);
    } else {
      if (a.k === "p") step.ok = a.d === solution[a.c];
      if ((a.k === "p" && step.ok) || a.k === "h") {
        step.credit = !credited[a.c];
        credited[a.c] = true;
      }
      standing.push(i);
      apply(values, notes, a, solution, peers, shading);
      if (a.k === "s") solved = true;
    }
    steps.push(step);
    complete = isComplete(values, solution, shading);
    if (shots) shots.push(shot());
  }

  return { values, notes, shading, steps, error, complete: complete && !solved, solved, frames: shots };
}

/* ---- checking a log from elsewhere ----
   Storage, the network and the API all send a log as an array of
   [k, c, d, t] or [k, c, d, t, b]. */

export function toWire(log) {
  return log.map((a) => (a.b ? [a.k, a.c, a.d, a.t, a.b] : [a.k, a.c, a.d, a.t]));
}

// The log an array stands for, or null if any entry is malformed. Times must
// never go backwards. `players` is how many players may appear.
export function fromWire(value, players = 1) {
  if (!Array.isArray(value) || value.length > MAX_ACTIONS) return null;
  const out = [];
  let last = 0;
  for (const e of value) {
    if (!Array.isArray(e) || e.length < 4 || e.length > 5) return null;
    const [k, c, d, t, b = 0] = e;
    if (!KINDS.includes(k)) return null;
    if (!Number.isInteger(c) || c < 0 || c > 80) return null;
    if (!Number.isInteger(d) || d < 0 || d > 10) return null;
    if (!Number.isInteger(t) || t < last || t > 86400000) return null;
    if (b !== 0 && !(b === 1 && players > 1)) return null;
    last = t;
    out.push({ k, c, d, t, b });
  }
  return out;
}

// One string per log, which is how the database compares two submissions of
// one game.
export function logText(log) {
  return log.map((a) => `${a.k}${a.c}.${a.d}.${a.t}`).join(" ");
}

/* ---- the first replay links ----
   Two bytes an action: the kind, the player, the cell and the digit. New
   links use the shorter form below; this one is still read, for links
   already shared. Times are left out, so a shared replay plays at an even
   pace. A damaged link cannot unpack to an impossible game: the page
   replays it and stops. */

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export function packLog(log) {
  const bytes = [];
  for (const a of log) {
    const v = (KINDS.indexOf(a.k) << 12) | ((a.b & 1) << 11) | (a.c << 4) | a.d;
    bytes.push(v >> 8, v & 255);
  }
  return toBase64Url(bytes);
}

// The log a packed string stands for, with made up even times, or null if it
// is damaged.
export function unpackLog(packed, puzzle, solution) {
  const bytes = fromBase64Url(packed ?? "");
  if (!bytes || bytes.length % 2 || bytes.length / 2 > MAX_ACTIONS) return null;
  const log = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const v = (bytes[i] << 8) | bytes[i + 1];
    const k = KINDS[v >> 12];
    const c = (v >> 4) & 127;
    const d = v & 15;
    if (!k || c > 80 || d > 10) return null;
    log.push({ k, c, d, t: i * 500, b: (v >> 11) & 1 });
  }
  return play(puzzle, solution, log).error ? null : log;
}

/* ---- the shorter replay link ----
   About half the length of the two bytes an action above, which is kept to
   read links already shared. The reader has the puzzle's answer too, so a
   right digit needs only its cell. Each action is a kind, then what that
   kind needs, then in a co-op game the player, all packed as one number in
   mixed radix and written in base 64. The number starts from 1, so it ends
   where the log does. Times are left out, as above. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Kind 0, the commonest by far, is a right digit placed. A digit is one of
// `top`: 9, or 10 in a Doppelgänger game's link, so the links before it
// read as they did.
const shortKindsOf = (top) => [
  { radix: 81, is: (a, sol) => a.k === "p" && a.d === sol[a.c], pack: (a) => a.c, unpack: (v, sol) => ({ k: "p", c: v, d: sol[v] }) },
  { radix: 81 * top, is: (a) => a.k === "p", pack: (a) => a.c * top + a.d - 1, unpack: (v) => ({ k: "p", c: Math.floor(v / top), d: (v % top) + 1 }) },
  { radix: 81 * top, is: (a) => a.k === "n", pack: (a) => a.c * top + a.d - 1, unpack: (v) => ({ k: "n", c: Math.floor(v / top), d: (v % top) + 1 }) },
  { radix: 81, is: (a) => a.k === "e", pack: (a) => a.c, unpack: (v) => ({ k: "e", c: v, d: 0 }) },
  { radix: 81, is: (a) => a.k === "h", pack: (a) => a.c, unpack: (v) => ({ k: "h", c: v, d: 0 }) },
  { radix: 1, is: (a) => a.k === "u", pack: () => 0, unpack: () => ({ k: "u", c: 0, d: 0 }) },
  { radix: 1, is: (a) => a.k === "s", pack: () => 0, unpack: () => ({ k: "s", c: 0, d: 0 }) },
];
const SHORT = shortKindsOf(9);
const SHORT_ZERO = shortKindsOf(10);
// A Yin-Yang puzzle's shading too, a cell and a shade: only in links to
// one, so the links before it read as they did.
const SHADE_SHORT = { radix: 243, is: (a) => a.k === "y", pack: (a) => a.c * 3 + a.d, unpack: (v) => ({ k: "y", c: Math.floor(v / 3), d: v % 3 }) };
const shortKinds = (solution) => {
  const kinds = topDigit(solution) === 10 ? SHORT_ZERO : SHORT;
  return solution.shading ? [...kinds, SHADE_SHORT] : kinds;
};

// players: 2 for a co-op game, whose actions each say whose they were.
export function packReplay(log, solution, players = 1) {
  const kinds = shortKinds(solution);
  const count = BigInt(kinds.length);
  let n = 1n;
  for (let i = log.length - 1; i >= 0; i--) {
    const a = log[i];
    const kind = kinds.findIndex((s) => s.is(a, solution));
    if (players === 2) n = n * 2n + BigInt(a.b & 1);
    n = n * BigInt(kinds[kind].radix) + BigInt(kinds[kind].pack(a));
    n = n * count + BigInt(kind);
  }
  let out = "";
  for (; n > 0n; n /= 64n) out = B64[Number(n % 64n)] + out;
  return out;
}

// The log a packed replay stands for, with made up even times, or null if
// it is damaged.
export function unpackReplay(packed, puzzle, solution, players = 1) {
  const text = String(packed ?? "");
  if (!text || text.length > MAX_ACTIONS * 3) return null;
  let n = 0n;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    n = n * 64n + BigInt(v);
  }
  const kinds = shortKinds(solution);
  const count = BigInt(kinds.length);
  const log = [];
  while (n > 1n) {
    if (log.length >= MAX_ACTIONS) return null;
    const kind = kinds[Number(n % count)];
    n /= count;
    const radix = BigInt(kind.radix);
    const a = kind.unpack(Number(n % radix), solution);
    n /= radix;
    let b = 0;
    if (players === 2) {
      b = Number(n % 2n);
      n /= 2n;
    }
    log.push({ ...a, t: log.length * 1000, b });
  }
  if (n !== 1n) return null;
  return play(puzzle, solution, log).error ? null : log;
}

// "r3c5", for labels and the replay's list.
export function cellName(c) {
  return `r${Math.floor(c / 9) + 1}c${(c % 9) + 1}`;
}
