// Game seeds. A seed decides the puzzle, and the same seed always gives the
// same puzzle, in any browser and on the server. That is what lets a seed be
// copied and played again, a replay link carry a whole game, and the API
// check a submitted one.
//
// Written as "H-BXK4-M9TR". The letter is the level (E, M, H or X for
// Expert); the eight characters after it are the seed proper.
//
// A puzzle someone made has a seed too, a longer one that carries the
// puzzle itself rather than what to generate: see madeSeed below. It has
// `made: true`, and scores only on its own board. A made variant puzzle's
// seed starts with its rules' letters, as in "KD-H-...": K for killer cages,
// which the seed then carries too, and D, N, G and W for the switch rules
// (variant.js).

import { LEVELS, LEVEL_IDS } from "./levels.js";
import { generate, solve, countSolutions, COL } from "./sudoku.js";
import { variantSolve, variantSolutions, cageProblem, RULES } from "./variant.js";

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

/* ---- made puzzles ---- */

// A made puzzle's seed packs the puzzle into one number: which cells hold
// clues as 81 bits, and above them the clues in base 9, in reading order.
// Written in the seed alphabet and never shorter than MADE_MIN, so it cannot
// be taken for a generated seed's eight characters.
const MADE_MIN = 12;
const MASK_BITS = 81n;
const BASE = BigInt(ALPHABET.length);
// Fewer clues than this never has one answer.
const MIN_CLUES = 17;

function encodeGrid(grid) {
  let mask = 0n;
  let digits = 0n;
  grid.forEach((d, c) => {
    if (!d) return;
    mask |= 1n << BigInt(c);
    digits = digits * 9n + BigInt(d - 1);
  });
  let n = (digits << MASK_BITS) | mask;
  let body = "";
  while (n > 0n) {
    body = ALPHABET[Number(n % BASE)] + body;
    n /= BASE;
  }
  return body.padStart(MADE_MIN, ALPHABET[0]);
}

function decodeGrid(body) {
  let n = 0n;
  for (const ch of body) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * BASE + BigInt(v);
  }
  const mask = n & ((1n << MASK_BITS) - 1n);
  let digits = n >> MASK_BITS;
  const cells = [];
  for (let c = 0; c < 81; c++) if (mask & (1n << BigInt(c))) cells.push(c);
  const grid = new Array(81).fill(0);
  for (let i = cells.length - 1; i >= 0; i--) {
    grid[cells[i]] = Number(digits % 9n) + 1;
    digits /= 9n;
  }
  // Anything left over is not a grid this wrote.
  return digits === 0n ? grid : null;
}

/* A made killer puzzle's seed is one number too, read as a run of mixed
   radix digits, first digit lowest: for each cell whether it holds a clue,
   then the clues, then for each cell whether it is in a cage, then for each
   pair of caged neighbours (right, then below) whether they share a cage,
   then each cage's sum, cages in order of their first cell. Cages are joined
   edge to edge, so the shared edges give back the cages exactly. */

function packDigits(digits) {
  let n = 0n;
  for (let i = digits.length - 1; i >= 0; i--) n = n * BigInt(digits[i][1]) + BigInt(digits[i][0]);
  return n;
}

function toBody(n) {
  let body = "";
  for (; n > 0n; n /= BASE) body = ALPHABET[Number(n % BASE)] + body;
  return body.padStart(MADE_MIN, ALPHABET[0]);
}

function fromBody(body) {
  let n = 0n;
  for (const ch of body) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * BASE + BigInt(v);
  }
  return n;
}

// Neighbour pairs to the right and below, in reading order.
function* neighbourPairs() {
  for (let c = 0; c < 81; c++) {
    if (COL[c] < 8) yield [c, c + 1];
    if (c < 72) yield [c, c + 9];
  }
}

function encodeKiller(grid, cages) {
  const digits = [];
  for (let c = 0; c < 81; c++) digits.push([grid[c] ? 1 : 0, 2]);
  for (let c = 0; c < 81; c++) if (grid[c]) digits.push([grid[c] - 1, 9]);
  const of = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
  for (let c = 0; c < 81; c++) digits.push([of[c] >= 0 ? 1 : 0, 2]);
  for (const [a, b] of neighbourPairs()) if (of[a] >= 0 && of[b] >= 0) digits.push([of[a] === of[b] ? 1 : 0, 2]);
  for (const cage of sortCages(cages)) digits.push([cage.sum, 46]);
  return toBody(packDigits(digits));
}

function decodeKiller(body) {
  let n = fromBody(body);
  if (n == null) return null;
  const take = (radix) => {
    const r = BigInt(radix);
    const v = Number(n % r);
    n /= r;
    return v;
  };
  const grid = new Array(81).fill(0);
  const clued = [];
  for (let c = 0; c < 81; c++) if (take(2)) clued.push(c);
  for (const c of clued) grid[c] = take(9) + 1;
  const caged = [];
  for (let c = 0; c < 81; c++) caged.push(Boolean(take(2)));
  // Cells joined by shared edges, gathered into cages.
  const root = [...Array(81).keys()];
  const find = (c) => (root[c] === c ? c : (root[c] = find(root[c])));
  for (const [a, b] of neighbourPairs()) if (caged[a] && caged[b] && take(2)) root[find(a)] = find(b);
  const groups = new Map();
  for (let c = 0; c < 81; c++) {
    if (!caged[c]) continue;
    const r = find(c);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  const cages = [...groups.values()].map((cells) => ({ sum: take(46), cells }));
  return n === 0n ? { grid, cages } : null;
}

// Cages in order of their first cell, each cage's cells in reading order.
function sortCages(cages) {
  return cages.map((cage) => ({ sum: cage.sum, cells: cage.cells.slice().sort((a, b) => a - b) })).sort((a, b) => a.cells[0] - b.cells[0]);
}

// The letters that start a variant seed, in this order.
const PREFIX = ["K", ...RULES.map((r) => r.letter)];

function prefixFor(cages, rules) {
  return (cages.length ? "K" : "") + RULES.filter((r) => rules & r.bit).map((r) => r.letter).join("");
}

// The seed of a made puzzle. variant: { cages, rules } for a variant
// puzzle (variant.js), or nothing for a classic one. `level` is the maker's
// rating; it names the level on screen and nothing else. The puzzle should
// have one answer: parseSeed refuses one that does not.
export function madeSeed(level, grid, variant = null) {
  const groups = (body) => body.match(/.{1,4}/g).join("-");
  const cages = variant?.cages?.length ? sortCages(variant.cages) : [];
  const rules = variant?.rules ?? 0;
  const prefix = prefixFor(cages, rules);
  const body = cages.length ? encodeKiller(grid, cages) : encodeGrid(grid);
  const text = prefix ? `${prefix}-${level}-${groups(body)}` : `${level}-${groups(body)}`;
  const seed = { level, body, text, made: true, grid: grid.slice(), rules };
  if (cages.length) seed.cages = cages;
  return seed;
}

// The variant a seed's text names, from its letters alone, without
// checking it: "Killer, Diagonal", or "" for a classic seed.
export function seedVariantName(text) {
  const head = String(text).split("-")[0];
  if (LEVEL_IDS.includes(head)) return "";
  return [...head].map((ch) => (ch === "K" ? "Killer" : RULES.find((r) => r.letter === ch)?.name)).filter(Boolean).join(", ");
}

// Parsing one means checking it has one answer, so the last few are kept.
const madeParsed = new Map();

// prefix: the variant's letters, "" for a classic puzzle.
function parseMade(prefix, level, body) {
  const key = `${prefix}-${level}${body}`;
  if (madeParsed.has(key)) return madeParsed.get(key);
  let seed = null;
  const rules = RULES.filter((r) => prefix.includes(r.letter)).reduce((m, r) => m | r.bit, 0);
  if (prefix.includes("K")) {
    const got = decodeKiller(body);
    const ok = got && got.cages.length && !cageProblem(got.cages) && variantSolutions(got.grid, { cages: got.cages, rules }, 2)?.length === 1;
    seed = ok ? madeSeed(level, got.grid, { cages: got.cages, rules }) : null;
  } else if (rules) {
    // The rules do some of the clues' work, so there is no least number.
    const grid = decodeGrid(body);
    const ok = grid && variantSolutions(grid, { rules }, 2)?.length === 1;
    seed = ok ? madeSeed(level, grid, { rules }) : null;
  } else {
    const grid = decodeGrid(body);
    const ok = grid && grid.filter(Boolean).length >= MIN_CLUES && countSolutions(grid, 2) === 1;
    seed = ok ? madeSeed(level, grid) : null;
  }
  madeParsed.set(key, seed);
  if (madeParsed.size > 16) madeParsed.delete(madeParsed.keys().next().value);
  return seed;
}

// Whatever was typed or pasted, forgiving about case, spaces and dashes.
// Eight characters with no level take `level`. A made puzzle's longer seed
// counts only if its puzzle has one answer. null if it is not a seed.
export function parseSeed(input, level = null) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === BODY_LENGTH + 1 && LEVEL_IDS.includes(raw[0]) && isBody(raw.slice(1))) {
    return buildSeed(raw[0], raw.slice(1));
  }
  if (raw.length >= MADE_MIN + 1 && LEVEL_IDS.includes(raw[0])) return parseMade("", raw[0], raw.slice(1));
  // A variant's letters, then the level. None of the letters is a level's.
  let at = 0;
  while (at < PREFIX.length && PREFIX.includes(raw[at])) at++;
  const prefix = raw.slice(0, at);
  if (at && raw.length >= at + MADE_MIN + 1 && LEVEL_IDS.includes(raw[at]) && new Set(prefix).size === at) {
    return parseMade(prefix, raw[at], raw.slice(at + 1));
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
  const { puzzle, solution } = seed.made
    ? { puzzle: seed.grid.slice(), solution: seed.cages || seed.rules ? variantSolve(seed.grid, seed) : solve(seed.grid) }
    : generate(randomSource(hashString(`puzzle|${seed.text}`)), LEVELS[seed.level].blanks);
  const out = { puzzle, solution, blanks: puzzle.filter((d) => d === 0).length };
  made.set(seed.text, out);
  if (made.size > 8) made.delete(made.keys().next().value);
  return out;
}
