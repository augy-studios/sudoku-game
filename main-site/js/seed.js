// Game seeds. A seed decides the puzzle, and the same seed always gives the
// same puzzle, in any browser and on the server. That is what lets a seed be
// copied and played again, a replay link carry a whole game, and the API
// check a submitted one.
//
// Written as "H-BXK4-M9TR". The letter is the level (E, M, H or X for
// Expert); the eight characters after it are the seed proper.

import { LEVELS, LEVEL_IDS } from "./levels.js";
import { generate } from "./sudoku.js";

// No vowels, and no 0 O 1 I, as for pairing codes: a seed read aloud cannot
// be misheard and cannot spell a word.
export const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";
const BODY_LENGTH = 8;

// 32 bit string hash (cyrb53's mixing, one half of it).
export function hashString(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

// A small, fast, well mixed generator. Returns unsigned 32 bit integers.
export function randomSource(seedNumber) {
  let a = seedNumber >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Eight seed characters from random bytes. Bytes at or above the limit would
// make some characters likelier, so they are skipped. Returns null if the
// bytes run out first.
export function bodyFromBytes(bytes) {
  const limit = 256 - (256 % ALPHABET.length);
  let body = "";
  for (const byte of bytes) {
    if (body.length === BODY_LENGTH) break;
    if (byte < limit) body += ALPHABET[byte % ALPHABET.length];
  }
  return body.length === BODY_LENGTH ? body : null;
}

function randomBody() {
  let body = null;
  while (!body) body = bodyFromBytes(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return body;
}

const isBody = (s) => s.length === BODY_LENGTH && [...s].every((c) => ALPHABET.includes(c));

export function buildSeed(level, body) {
  const text = `${level}-${body.slice(0, 4)}-${body.slice(4)}`;
  return { level, body, text };
}

export function newSeed(level = "M") {
  return buildSeed(LEVEL_IDS.includes(level) ? level : "M", randomBody());
}

// Whatever was typed or pasted, forgiving about case, spaces and dashes.
// Eight characters with no level take `level`. null if it is not a seed.
export function parseSeed(input, level = null) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === BODY_LENGTH + 1 && LEVEL_IDS.includes(raw[0]) && isBody(raw.slice(1))) {
    return buildSeed(raw[0], raw.slice(1));
  }
  if (level && LEVEL_IDS.includes(level) && isBody(raw)) return buildSeed(level, raw);
  return null;
}

// The seed's puzzle and its solution. Generating takes a few milliseconds,
// so the last few are kept.
const made = new Map();

export function puzzleFor(seed) {
  const hit = made.get(seed.text);
  if (hit) return hit;
  const { puzzle, solution } = generate(randomSource(hashString(`puzzle|${seed.text}`)), LEVELS[seed.level].blanks);
  const out = { puzzle, solution, blanks: puzzle.filter((d) => d === 0).length };
  made.set(seed.text, out);
  if (made.size > 8) made.delete(made.keys().next().value);
  return out;
}
