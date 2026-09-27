// A game as a seed and a log of actions, replayed into everything the page,
// the replay and the API need. Pure, like sudoku.js.
//
// An action is { k, c, d, t, b }:
//
//   k  "p" place digit d in cell c
//      "e" erase cell c: its digit, or its notes if it has no digit
//      "n" toggle note d in cell c
//      "h" hint: cell c gets its answer
//      "u" undo the player's last action that still stands
//      "s" solve: every cell gets its answer, and the game is not ranked
//   c  cell, 0 to 80 in reading order (0 for u and s)
//   d  digit 1 to 9 for p and n, otherwise 0
//   t  milliseconds since the game started
//   b  player, 0 or 1. Only a co-op game has a player 1.
//
// Undo is unlimited and is itself an action, so the log keeps everything that
// happened: a mistake that was undone still happened, and the replay and the
// score both see it.

import { PEERS } from "./sudoku.js";

export const KINDS = ["p", "e", "n", "h", "u", "s"];
export const MAX_ACTIONS = 2000;

function apply(values, notes, a, solution) {
  const { k, c } = a;
  if (k === "p" || k === "h") {
    const d = k === "h" ? solution[c] : a.d;
    values[c] = d;
    notes[c] = 0;
    const bit = 1 << d;
    for (const o of PEERS[c]) notes[o] &= ~bit;
  } else if (k === "e") {
    if (values[c]) values[c] = 0;
    else notes[c] = 0;
  } else if (k === "n") {
    notes[c] ^= 1 << a.d;
  } else if (k === "s") {
    for (let i = 0; i < 81; i++) {
      values[i] = solution[i];
      notes[i] = 0;
    }
  }
}

// Why an action cannot be played in this state, or null if it can.
function problem(a, puzzle, solution, values, notes) {
  const { k, c, d } = a;
  if (k === "u" || k === "s") return null;
  if (!Number.isInteger(c) || c < 0 || c > 80) return "bad_cell";
  if (puzzle[c]) return "given";
  if (k === "p") return Number.isInteger(d) && d >= 1 && d <= 9 && values[c] !== d ? null : "bad_digit";
  if (k === "n") return Number.isInteger(d) && d >= 1 && d <= 9 && !values[c] ? null : "bad_note";
  if (k === "e") return values[c] || notes[c] ? null : "empty";
  if (k === "h") return values[c] !== solution[c] ? null : "no_hint";
  return "bad_kind";
}

const isComplete = (values, solution) => values.every((v, i) => v === solution[i]);

// Replays `log` over the puzzle. Stops at the first action that cannot be
// played and says where. With `frames`, also returns the grid after every
// action, for the replay.
//
// steps[i] says what action i did: ok (a placed digit was right), credit (it
// filled that cell correctly for the first time), and undid (the index of
// the action an undo took back).
export function play(puzzle, solution, log, { frames = false } = {}) {
  let values = puzzle.slice();
  let notes = new Array(81).fill(0);
  const credited = new Array(81).fill(false);
  const standing = []; // indexes into log of the actions still in effect
  const steps = [];
  const shots = frames ? [{ values: values.slice(), notes: notes.slice() }] : null;
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
    const why = problem(a, puzzle, solution, values, notes);
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
      for (const j of standing) apply(values, notes, log[j], solution);
    } else {
      if (a.k === "p") step.ok = a.d === solution[a.c];
      if ((a.k === "p" && step.ok) || a.k === "h") {
        step.credit = !credited[a.c];
        credited[a.c] = true;
      }
      standing.push(i);
      apply(values, notes, a, solution);
      if (a.k === "s") solved = true;
    }
    steps.push(step);
    complete = isComplete(values, solution);
    if (shots) shots.push({ values: values.slice(), notes: notes.slice() });
  }

  return { values, notes, steps, error, complete: complete && !solved, solved, frames: shots };
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
    if (!Number.isInteger(d) || d < 0 || d > 9) return null;
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

/* ---- packing a game into a link ----
   Two bytes an action: the kind, the player, the cell and the digit. Times
   are left out, so a shared replay plays at an even pace. A damaged link
   cannot unpack to an impossible game: the page replays it and stops. */

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
    if (!k || c > 80 || d > 9) return null;
    log.push({ k, c, d, t: i * 500, b: (v >> 11) & 1 });
  }
  return play(puzzle, solution, log).error ? null : log;
}

// "r3c5", for labels and the replay's list.
export function cellName(c) {
  return `r${Math.floor(c / 9) + 1}c${(c % 9) + 1}`;
}
