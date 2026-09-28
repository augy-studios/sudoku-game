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
// T for thermometers, A for arrows, S for German Whispers lines, R for
// renban lines, P for Kropki dots, V for XV marks, B for Sandwich clues and
// L for Little Killer clues, which the seed then carries too, and D, N, G
// and W for the switch rules (variant.js).

import { LEVELS, LEVEL_IDS } from "./levels.js";
import { generate, solve, countSolutions, COL } from "./sudoku.js";
import {
  variantSolve,
  variantSolutions,
  cageProblem,
  thermoProblem,
  arrowProblem,
  whisperProblem,
  renbanProblem,
  dotProblem,
  xvProblem,
  sandwichProblem,
  littleProblem,
  diagonalFrom,
  SANDWICH_MAX,
  DOT_MARKS,
  XV_MARKS,
  RULES,
} from "./variant.js";

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

/* A made puzzle with anything drawn on it has a seed of one number too, read
   as a run of mixed radix digits, first digit lowest: for each cell whether it
   holds a clue, then the clues. A killer's cages follow: for each cell
   whether it is in a cage, then for each pair of caged neighbours (right,
   then below) whether they share a cage, then each cage's sum, cages in
   order of their first cell. Cages are joined edge to edge, so the shared
   edges give back the cages exactly. Then thermometers: how many, and for
   each its length, its bulb, and which way each step goes. Then arrows, the
   same way, from the circle, and German Whispers lines and renban lines the
   same way again. Then Kropki dots, and then XV marks, as whichever is
   shorter: how many, and for each its side and which of the two marks it
   is; or for every side, its mark or none. Then Sandwich clues, for each
   row and then each column its sum, or none; then Little Killer clues: how
   many, and for each its first cell, which way it runs and its sum. Each
   part is there only when the seed's letters say so, so a seed from before
   a part came reads as it did. */

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

// The 144 sides two cells share, in that order, and each one's place in it
// by its cells.
const SIDES = [...neighbourPairs()];
const SIDE_AT = new Map(SIDES.map(([a, b], i) => [a * 81 + b, i]));

// The eight ways a line can step, corners included.
const STEPS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const MAX_LINES = 40;

// parts: { cages, thermos, ... } as PARTS names them, each a list, empty
// when the puzzle has none, so the reader knows from the seed's letters what
// to read.
function encodeParts(grid, parts) {
  const digits = [];
  for (let c = 0; c < 81; c++) digits.push([grid[c] ? 1 : 0, 2]);
  for (let c = 0; c < 81; c++) if (grid[c]) digits.push([grid[c] - 1, 9]);
  for (const p of PARTS) if (parts[p.list].length) p.write(digits, parts[p.list]);
  return toBody(packDigits(digits));
}

function writeCages(digits, cages) {
  const of = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
  for (let c = 0; c < 81; c++) digits.push([of[c] >= 0 ? 1 : 0, 2]);
  for (const [a, b] of neighbourPairs()) if (of[a] >= 0 && of[b] >= 0) digits.push([of[a] === of[b] ? 1 : 0, 2]);
  for (const cage of sortCages(cages)) digits.push([cage.sum, 46]);
}

// Lines of one kind: how many, then each one's length, first cell and
// steps.
function writeLines(digits, lines) {
  digits.push([lines.length, MAX_LINES + 1]);
  for (const t of lines) {
    digits.push([t.length - 2, 8], [t[0], 81]);
    for (let i = 1; i < t.length; i++) {
      const dr = Math.floor(t[i] / 9) - Math.floor(t[i - 1] / 9);
      const dc = (t[i] % 9) - (t[i - 1] % 9);
      digits.push([STEPS.findIndex(([r, c]) => r === dr && c === dc), 8]);
    }
  }
}

// The other way, from `take`, which reads the next digit; null if a line
// steps off the board.
function readLines(take) {
  const lines = [];
  const count = take(MAX_LINES + 1);
  for (let i = 0; i < count; i++) {
    const length = take(8) + 2;
    const t = [take(81)];
    for (let j = 1; j < length; j++) {
      const [dr, dc] = STEPS[take(8)];
      const r = Math.floor(t[j - 1] / 9) + dr;
      const c = (t[j - 1] % 9) + dc;
      if (r < 0 || r > 8 || c < 0 || c > 8) return null;
      t.push(r * 9 + c);
    }
    lines.push(t);
  }
  return lines;
}

// Dots or XV marks, `marks` naming their two kinds: a flag, then either how
// many and each one's side and kind, or every side's kind, 0 for none;
// whichever is shorter.
function writeEdges(digits, edges, marks) {
  const kinds = new Map(edges.map((e) => [SIDE_AT.get(e.cells[0] * 81 + e.cells[1]), marks.indexOf(e.mark)]));
  const listed = Math.log2(SIDES.length + 1) + kinds.size * Math.log2(SIDES.length * 2);
  if (listed <= SIDES.length * Math.log2(3)) {
    digits.push([0, 2], [kinds.size, SIDES.length + 1]);
    for (const side of [...kinds.keys()].sort((a, b) => a - b)) digits.push([side, SIDES.length], [kinds.get(side), 2]);
  } else {
    digits.push([1, 2]);
    SIDES.forEach((_, side) => digits.push([kinds.has(side) ? kinds.get(side) + 1 : 0, 3]));
  }
}

// The other way, from `take`, which reads the next digit.
function readEdges(take, marks) {
  const edges = [];
  if (take(2)) {
    SIDES.forEach((cells, side) => {
      const kind = take(3);
      if (kind) edges.push({ cells: cells.slice(), mark: marks[kind - 1] });
    });
  } else {
    const count = take(SIDES.length + 1);
    for (let i = 0; i < count; i++) edges.push({ cells: SIDES[take(SIDES.length)].slice(), mark: marks[take(2)] });
  }
  return edges;
}

// Dots or marks in the order of their sides, each a copy.
const sortEdges = (edges) =>
  edges.map((e) => ({ cells: e.cells.slice(), mark: e.mark })).sort((p, q) => p.cells[0] * 81 + p.cells[1] - (q.cells[0] * 81 + q.cells[1]));

// Sandwich clues: for each of the 18 lines, 0 for none or its sum and 1.
function writeSandwiches(digits, sandwiches) {
  const sums = new Map(sandwiches.map((s) => [s.line, s.sum]));
  for (let line = 0; line < 18; line++) digits.push([sums.has(line) ? sums.get(line) + 1 : 0, SANDWICH_MAX + 2]);
}

function readSandwiches(take) {
  const out = [];
  for (let line = 0; line < 18; line++) {
    const v = take(SANDWICH_MAX + 2);
    if (v) out.push({ line, sum: v - 1 });
  }
  return out;
}

// The four ways a Little Killer diagonal can run.
const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
// A Little Killer diagonal's sum can be as much as nine 9s.
const LITTLE_SUMS = 82;

function writeLittles(digits, littles) {
  digits.push([littles.length, MAX_LINES + 1]);
  for (const { cells, sum } of littles) {
    const dr = Math.floor(cells[1] / 9) - Math.floor(cells[0] / 9);
    const dc = (cells[1] % 9) - (cells[0] % 9);
    digits.push([cells[0], 81], [DIAGONALS.findIndex(([r, c]) => r === dr && c === dc), 4], [sum, LITTLE_SUMS]);
  }
}

// The other way; a diagonal of one cell, which no clue has, reads as
// written so that checking it refuses the seed.
function readLittles(take) {
  const out = [];
  const count = take(MAX_LINES + 1);
  for (let i = 0; i < count; i++) {
    const first = take(81);
    const [dr, dc] = DIAGONALS[take(4)];
    out.push({ cells: diagonalFrom(Math.floor(first / 9), first % 9, dr, dc), sum: take(LITTLE_SUMS) });
  }
  return out;
}

const sortSandwiches = (sandwiches) => sandwiches.map((s) => ({ line: s.line, sum: s.sum })).sort((a, b) => a.line - b.line);
// By first cell, then by second, which is which way each runs.
const sortLittles = (littles) =>
  littles
    .map((l) => ({ cells: l.cells.slice(), sum: l.sum }))
    .sort((a, b) => a.cells[0] - b.cells[0] || b.cells[1] - a.cells[1]);

// withs: which parts the seed's letters say it has, { cages, thermos, ... }
// as PARTS names them.
function decodeParts(body, withs) {
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
  const out = { grid };
  for (const p of PARTS) {
    out[p.list] = withs[p.list] ? p.read(take) : [];
    if (!out[p.list]) return null;
  }
  return n === 0n ? out : null;
}

// A killer seed's cages, from `take`, which reads the next digit.
function readCages(take) {
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
  return [...groups.values()].map((cells) => ({ sum: take(46), cells }));
}

// Cages in order of their first cell, each cage's cells in reading order.
function sortCages(cages) {
  return cages.map((cage) => ({ sum: cage.sum, cells: cage.cells.slice().sort((a, b) => a - b) })).sort((a, b) => a.cells[0] - b.cells[0]);
}

// The drawn parts, with their letters and names, in the order their letters
// start a seed and their parts go in its body: how each is written, read,
// checked, and put in the one order a seed keeps it in.
const copyLines = (lines) => lines.map((t) => t.slice());
const lines = (list, letter, name, problem) => ({ list, letter, name, problem, write: writeLines, read: readLines, sort: copyLines });
const edges = (list, letter, name, problem, marks) => ({
  list,
  letter,
  name,
  problem,
  write: (digits, found) => writeEdges(digits, found, marks),
  read: (take) => readEdges(take, marks),
  sort: sortEdges,
});
const PARTS = [
  { list: "cages", letter: "K", name: "Killer", problem: cageProblem, write: writeCages, read: readCages, sort: sortCages },
  lines("thermos", "T", "Thermo", thermoProblem),
  lines("arrows", "A", "Arrow", arrowProblem),
  lines("whispers", "S", "German Whispers", whisperProblem),
  lines("renbans", "R", "Renban", renbanProblem),
  edges("dots", "P", "Kropki", dotProblem, DOT_MARKS),
  edges("xvs", "V", "XV", xvProblem, XV_MARKS),
  { list: "sandwiches", letter: "B", name: "Sandwich", problem: sandwichProblem, write: writeSandwiches, read: readSandwiches, sort: sortSandwiches },
  { list: "littles", letter: "L", name: "Little Killer", problem: littleProblem, write: writeLittles, read: readLittles, sort: sortLittles },
];

// The letters that start a variant seed, in this order.
const PREFIX = [...PARTS.map((p) => p.letter), ...RULES.map((r) => r.letter)];

// parts: { cages, thermos, ... }, each a list, empty for none.
function prefixFor(parts, rules) {
  return (
    PARTS.filter((p) => parts[p.list].length).map((p) => p.letter).join("") +
    RULES.filter((r) => rules & r.bit).map((r) => r.letter).join("")
  );
}

// The seed of a made puzzle. variant: { cages, thermos, arrows, whispers,
// renbans, dots, xvs, sandwiches, littles, rules } for a variant puzzle
// (variant.js), or nothing for a classic one. `level` is
// the maker's rating; it names the level on screen and nothing else. The
// puzzle should have one answer: parseSeed refuses one that does not.
export function madeSeed(level, grid, variant = null) {
  const groups = (body) => body.match(/.{1,4}/g).join("-");
  const parts = {};
  for (const p of PARTS) parts[p.list] = variant?.[p.list]?.length ? p.sort(variant[p.list]) : [];
  const rules = variant?.rules ?? 0;
  const prefix = prefixFor(parts, rules);
  const drawn = PARTS.some((p) => parts[p.list].length);
  const body = drawn ? encodeParts(grid, parts) : encodeGrid(grid);
  const text = prefix ? `${prefix}-${level}-${groups(body)}` : `${level}-${groups(body)}`;
  const seed = { level, body, text, made: true, grid: grid.slice(), rules };
  for (const { list } of PARTS) if (parts[list].length) seed[list] = parts[list];
  return seed;
}

// The variant a seed's text names, from its letters alone, without
// checking it: "Killer, Diagonal", or "" for a classic seed.
export function seedVariantName(text) {
  const head = String(text).split("-")[0];
  if (LEVEL_IDS.includes(head)) return "";
  return [...head].map((ch) => (PARTS.find((p) => p.letter === ch) ?? RULES.find((r) => r.letter === ch))?.name).filter(Boolean).join(", ");
}

// Parsing one means checking it has one answer, so the last few are kept.
const madeParsed = new Map();

// prefix: the variant's letters, "" for a classic puzzle.
function parseMade(prefix, level, body) {
  const key = `${prefix}-${level}${body}`;
  if (madeParsed.has(key)) return madeParsed.get(key);
  let seed = null;
  const rules = RULES.filter((r) => prefix.includes(r.letter)).reduce((m, r) => m | r.bit, 0);
  const withs = Object.fromEntries(PARTS.map((p) => [p.list, prefix.includes(p.letter)]));
  if (PARTS.some((p) => withs[p.list])) {
    const got = decodeParts(body, withs);
    const variant = got && { ...got, rules };
    // Each part the letters name is there, and well formed.
    const ok =
      variant &&
      PARTS.every((p) => !withs[p.list] || (variant[p.list].length && !p.problem(variant[p.list]))) &&
      variantSolutions(got.grid, variant, 2)?.length === 1;
    seed = ok ? madeSeed(level, got.grid, variant) : null;
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
    ? { puzzle: seed.grid.slice(), solution: PARTS.some((p) => seed[p.list]) || seed.rules ? variantSolve(seed.grid, seed) : solve(seed.grid) }
    : generate(randomSource(hashString(`puzzle|${seed.text}`)), LEVELS[seed.level].blanks);
  const out = { puzzle, solution, blanks: puzzle.filter((d) => d === 0).length };
  made.set(seed.text, out);
  if (made.size > 8) made.delete(made.keys().next().value);
  return out;
}
