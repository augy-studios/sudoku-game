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
// `made: true`, and scores only on its own board. Past twenty characters it
// is shared as a short code the server looks up, as in "H-B7K4Q-M9TRZ"
// (short codes, below). A made variant puzzle's
// seed starts with its rules' letters, as in "KD-H-...": K for killer cages,
// QRC for Rellik cages, QLB for lunchboxes, QLS for Look and Say cages, QEC
// for Equality cages, QES for Equal Sum cages, QSV for Same Values cages,
// QCV for Connected Values cages, QCD for Count Distinct cages,
// T for thermometers, A for arrows, QDA for double arrows, QPA for pill
// arrows, S for German Whispers lines, R for renban lines, O for
// palindrome lines, QDL for Dutch Whispers lines, Z for zipper lines, C for between lines, F for
// lockout lines, QEN for entropic lines, QMO for modular
// lines, QSL for sum lines, QRS for region sum lines, QVX for value
// indexing lines, P for Kropki dots, V for XV marks, QGT for Greater Than signs, QQD
// for quads, QCC for Counting Circles and QCS for more sets of them, QCA
// for Chaos Arrows, QCO for Chaos Counts, QYY for Yin-Yang's circles, B for
// Sandwich clues, L for Little Killer clues, Y for Skyscraper clues, U for
// X-Sum clues, QHS for Hidden Skyscraper clues, QNR for Numbered Room clues,
// QFR for Full Rank clues, QRX for Row/Column Indexing marks, QCX for single
// indexing cells and J for a Jigsaw's regions, which the seed then carries
// too, and D, N, G, W, QDG, QAC, QSK, QSX, QGE, QGM, QAT, QDF, QDW, QNT,
// QCT, QCH and QDP for the switch rules (variant.js), then QGS for
// Connected Values cages' group sizes, QAM for Chaos Arrows' own arms and
// QCL for Chaos Counts' own cells (DETAILS). Under Doppelgänger,
// QDP, the clues go in base 10, its 0 the tenth. Once the single
// letters ran out, a new one became Q and two more: Q is read with the two
// after it, and never alone, so a seed from before reads as it did.

import { LEVELS, LEVEL_IDS } from "./levels.js";
import { generate, solve, countSolutions, randomSolution, shuffled, COL } from "./sudoku.js";
import {
  variantSolve,
  variantSolutions,
  cageProblem,
  rellikProblem,
  lunchboxProblem,
  lookSayProblem,
  equalityProblem,
  equalSumProblem,
  sameValueProblem,
  connectedProblem,
  distinctProblem,
  piecesFor,
  tidyPieces,
  clueMask,
  LUNCHBOX_MAX,
  thermoProblem,
  arrowProblem,
  doubleProblem,
  pillProblem,
  PILL_ARROW_MOST,
  touching,
  whisperProblem,
  dutchProblem,
  renbanProblem,
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  entropicProblem,
  modularProblem,
  sumLineProblem,
  regionSumProblem,
  indexProblem,
  LONG_LINE_MOST,
  SUM_LINE_MAX,
  INDEX_LINE_MOST,
  dotProblem,
  xvProblem,
  signProblem,
  quadProblem,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  hiddenProblem,
  roomProblem,
  circleProblem,
  CIRCLES_MOST,
  circleSetProblem,
  CIRCLE_SETS_MOST,
  chaosArrowProblem,
  chaosCountProblem,
  countCell,
  sideOf,
  hasRule,
  shadeProblem,
  zeroClash,
  rankProblem,
  RANK_MOST,
  indexingProblem,
  indexCellProblem,
  INDEX_CELLS_MOST,
  renamed,
  regionProblem,
  sortRegions,
  VIEWS,
  diagonalFrom,
  SANDWICH_MAX,
  DOT_MARKS,
  XV_MARKS,
  SIGN_MARKS,
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

// Eight seed characters from random bytes, or `length`. Bytes at or above
// the limit would make some characters likelier, so they are skipped.
// Returns null if the bytes run out first.
export function bodyFromBytes(bytes, length = BODY_LENGTH) {
  const limit = 256 - (256 % ALPHABET.length);
  let body = "";
  for (const byte of bytes) {
    if (body.length === length) break;
    if (byte < limit) body += ALPHABET[byte % ALPHABET.length];
  }
  return body.length === length ? body : null;
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

// base: how many digits there are, 9, or 10 under Doppelgänger, whose 0,
// ZERO, is the tenth.
function encodeGrid(grid, base = 9) {
  let mask = 0n;
  let digits = 0n;
  grid.forEach((d, c) => {
    if (!d) return;
    mask |= 1n << BigInt(c);
    digits = digits * BigInt(base) + BigInt(d - 1);
  });
  let n = (digits << MASK_BITS) | mask;
  let body = "";
  while (n > 0n) {
    body = ALPHABET[Number(n % BASE)] + body;
    n /= BASE;
  }
  return body.padStart(MADE_MIN, ALPHABET[0]);
}

function decodeGrid(body, base = 9) {
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
    grid[cells[i]] = Number(digits % BigInt(base)) + 1;
    digits /= BigInt(base);
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
   edges give back the cages exactly. Rellik cages, lunchboxes, Look and Say
   cages and Equality cages follow the same way, each kind on its own: a
   Rellik cage's and a lunchbox's clue is its sum, a Look and Say cage's is
   how many pairs and each pair's count and digit, and an Equality cage has
   none. Equal Sum and Same Values cages follow as their pieces, each piece
   written as a cage with no clue, then for each piece in order of its first
   cell which cage it is in: one already begun, or the next. A Connected
   Values cage's clue is its digits, a Count Distinct cage's which of its
   cells, in reading order, is the control. Then thermometers: how many, and for
   each its length, its bulb, and which way each step goes. Then arrows, the
   same way, from the circle, and double arrows the same way. Then pill
   arrows: how many, and for each its pill's size, first cell and which way
   it runs, then its arrow's length, the pill cell it starts beside, which
   way it steps from there and each step after. Then German Whispers,
   renban, palindrome, zipper, between, lockout, entropic and modular lines
   as thermometers are. Then sum lines, each its sum and then as a
   thermometer, a loop with its first cell again at the end, region sum
   lines and value indexing lines as thermometers,
   their lengths in a wider digit for their longer lines. Then Kropki dots, and then XV marks, as whichever is
   shorter: how many, and for each its side and which of the two marks it
   is; or for every side, its mark or none; and Greater Than signs the same
   way. Then quads: how many, and for each its corner, how many digits and
   each digit. Then Counting Circles, as whichever is shorter: how many,
   and each one's cell; or for every cell, whether it has one; then how
   many more sets of them, and each the same way. Then Chaos Arrows: how
   many, and each one's cell and ways; then Chaos Counts as Counting
   Circles are. Then Yin-Yang's circles, as whichever is shorter: how many,
   and each one's cell and shade; or every cell's shade, or none. Then
   Sandwich clues, for each
   row and then each column its sum, or none; then Little Killer clues: how
   many, and for each its first cell, which way it runs and its sum. Then
   Skyscraper clues, then X-Sum clues, then Hidden Skyscraper clues, then
   Numbered Room clues, then Full Rank clues, each as whichever is shorter:
   how many, and for each its view and its value; or for every view, its
   value or none. Then Row/Column Indexing marks: for each row and then
   each column, whether it has one; then single indexing cells: how many,
   and each one's cell and whether it goes by its row or its column. Then
   a Jigsaw's regions: for each pair of neighbours, whether
   they share a region, which gives back the regions as the shared edges
   give back cages. Then the details: for each Connected Values cage its
   group size or none; for each Chaos Arrow whether it has arms of its own,
   and if so how many and each one's length and steps; for each Chaos Count
   whether it counts cells of its own, and if so how many and each cell.
   Each part, and each detail, is there only when the seed's letters say
   so, so a seed from before a part came reads as it did. Equal Sum and
   Same Values pieces side by side need nothing more: as pieces are written
   as cages, the sides between them say where one ends. */

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
function encodeParts(grid, parts, base = 9) {
  const digits = [];
  for (let c = 0; c < 81; c++) digits.push([grid[c] ? 1 : 0, 2]);
  for (let c = 0; c < 81; c++) if (grid[c]) digits.push([grid[c] - 1, base]);
  for (const p of PARTS) if (parts[p.list].length) p.write(digits, parts[p.list]);
  for (const d of detailsOf(parts)) d.write(digits, parts[d.list]);
  return toBody(packDigits(digits));
}

// Cages of one kind, `clue` writing each one's clue: a killer's sum unless
// a kind says.
function writeCages(digits, cages, clue = (cage) => digits.push([cage.sum, 46])) {
  const of = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
  for (let c = 0; c < 81; c++) digits.push([of[c] >= 0 ? 1 : 0, 2]);
  for (const [a, b] of neighbourPairs()) if (of[a] >= 0 && of[b] >= 0) digits.push([of[a] === of[b] ? 1 : 0, 2]);
  for (const cage of sortCages(cages)) clue(cage);
}

// A Look and Say clue: how many pairs, then each pair's count and digit.
function writeSay(digits, { clue }) {
  const pairs = clue.match(/\d\d/g);
  digits.push([pairs.length - 1, 9]);
  for (const [n, d] of pairs) digits.push([Number(n), 10], [Number(d) - 1, 9]);
}

// Cages in pieces, Equal Sum or Same Values: the pieces as cages, then for
// each piece, in order of its first cell, which cage it is in, counting
// cages as their first piece comes: one of those so far, or the next.
// Pieces side by side are told apart as cages are, by the sides between
// them, so they need nothing more.
function writePieces(digits, cages) {
  const pieces = cages.flatMap((cage, k) => piecesFor(cage).map((cells) => ({ cells, k }))).sort((a, b) => a.cells[0] - b.cells[0]);
  writeCages(digits, pieces, () => {});
  const order = new Map();
  for (const { k } of pieces) {
    const n = order.size;
    if (!order.has(k)) order.set(k, n);
    digits.push([order.get(k), n + 1]);
  }
}

// The other way: each cage's pieces, kept as `pieces` only where some sit
// side by side, so a seed from before reads as it did.
function readPieces(take) {
  const cages = [];
  for (const { cells } of readCages(take, () => ({}))) {
    const k = take(cages.length + 1);
    if (k === cages.length) cages.push([]);
    cages[k].push(cells);
  }
  return cages.map((pieces) => tidyPieces(pieces.flat().sort((a, b) => a - b), pieces));
}

function readSay(take) {
  const n = take(9) + 1;
  let clue = "";
  for (let i = 0; i < n; i++) clue += `${take(10)}${take(9) + 1}`;
  return { clue };
}

// Lines of one kind: how many, then each one's length, first cell and
// steps, `line` writing each line's clue before it if it has one. A kind
// with lines longer than nine cells says how long they get, `most`.
function writeLines(digits, lines, most = 9, line = () => {}) {
  digits.push([lines.length, MAX_LINES + 1]);
  for (const t of lines) {
    line(t);
    const cells = t.cells ?? t;
    digits.push([cells.length - 2, most - 1], [cells[0], 81]);
    for (let i = 1; i < cells.length; i++) digits.push([stepOf(cells[i - 1], cells[i]), 8]);
  }
}

// Which of STEPS goes from cell a to cell b, touching it.
function stepOf(a, b) {
  const dr = Math.floor(b / 9) - Math.floor(a / 9);
  const dc = (b % 9) - (a % 9);
  return STEPS.findIndex(([r, c]) => r === dr && c === dc);
}

// The cell step k of STEPS goes to from cell a, or -1 off the board.
function stepFrom(a, k) {
  const [dr, dc] = STEPS[k];
  const r = Math.floor(a / 9) + dr;
  const c = (a % 9) + dc;
  return r < 0 || r > 8 || c < 0 || c > 8 ? -1 : r * 9 + c;
}

// The other way, from `take`, which reads the next digit, `line` reading a
// line's clue and giving back the line with it; null if a line steps off
// the board.
function readLines(take, most = 9, line = null) {
  const lines = [];
  const count = take(MAX_LINES + 1);
  for (let i = 0; i < count; i++) {
    const clue = line?.();
    const length = take(most - 1) + 2;
    const t = [take(81)];
    for (let j = 1; j < length; j++) {
      const c = stepFrom(t[j - 1], take(8));
      if (c < 0) return null;
      t.push(c);
    }
    lines.push(clue ? { ...clue, cells: t } : t);
  }
  return lines;
}

// Which way a pill runs from its first cell: along its row, or down its
// column.
const ALONG = [1, 9];

// Pill arrows: how many, then each one's pill's size, first cell and which
// way it runs, its arrow's length, the pill cell it starts beside, and its
// steps from there.
function writePills(digits, pills) {
  digits.push([pills.length, MAX_LINES + 1]);
  for (const { pill, arrow } of pills) {
    const from = pill.findIndex((c) => touching(c, arrow[0]));
    digits.push([pill.length - 2, 2], [pill[0], 81], [ALONG.indexOf(pill[1] - pill[0]), 2], [arrow.length - 1, PILL_ARROW_MOST], [from, 3]);
    [pill[from], ...arrow].forEach((c, i, t) => i && digits.push([stepOf(t[i - 1], c), 8]));
  }
}

// The other way; null if an arrow steps off the board, or starts beside a
// pill cell there is not. A pill that runs off the board, or round onto the
// next row, reads as written, so that checking it refuses the seed.
function readPills(take) {
  const out = [];
  const count = take(MAX_LINES + 1);
  for (let i = 0; i < count; i++) {
    const size = take(2) + 2;
    const first = take(81);
    const along = ALONG[take(2)];
    const pill = Array.from({ length: size }, (_, j) => first + j * along);
    const length = take(PILL_ARROW_MOST) + 1;
    const from = take(3);
    if (from >= size || pill[from] > 80) return null;
    const arrow = [];
    for (let j = 0, at = pill[from]; j < length; j++) {
      at = stepFrom(at, take(8));
      if (at < 0) return null;
      arrow.push(at);
    }
    out.push({ pill, arrow });
  }
  return out;
}

const copyPills = (pills) => pills.map((p) => ({ pill: p.pill.slice(), arrow: p.arrow.slice() }));

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

// The 64 corners a quad can sit on, by the top left of its four cells.
const CORNERS = [...Array(71).keys()].filter((c) => COL[c] < 8);

// Quads: how many, then each one's corner, how many digits and each digit.
function writeQuads(digits, quads) {
  digits.push([quads.length, CORNERS.length + 1]);
  for (const { cell, digits: ds } of quads) {
    digits.push([CORNERS.indexOf(cell), CORNERS.length], [ds.length - 1, 4]);
    for (const d of ds) digits.push([d - 1, 9]);
  }
}

function readQuads(take) {
  const out = [];
  const count = take(CORNERS.length + 1);
  for (let i = 0; i < count; i++) {
    const cell = CORNERS[take(CORNERS.length)];
    const n = take(4) + 1;
    out.push({ cell, digits: Array.from({ length: n }, () => take(9) + 1) });
  }
  return out;
}

// By corner, each one's digits in order.
const sortQuads = (quads) => quads.map((q) => ({ cell: q.cell, digits: q.digits.slice().sort((a, b) => a - b) })).sort((a, b) => a.cell - b.cell);

// Counting Circles: a flag, then either how many and each one's cell, or
// every cell's flag, 1 for a circle; whichever is shorter. Chaos Counts
// the same way, `most` how many there can be.
function writeCircles(digits, circles, most = CIRCLES_MOST) {
  if (Math.log2(most) + circles.length * Math.log2(81) <= 81) {
    digits.push([0, 2], [circles.length - 1, most]);
    for (const c of circles) digits.push([c, 81]);
  } else {
    digits.push([1, 2]);
    for (let c = 0; c < 81; c++) digits.push([circles.includes(c) ? 1 : 0, 2]);
  }
}

// The other way. A cell listed twice reads as written, so that checking it
// refuses the seed.
function readCircles(take, most = CIRCLES_MOST) {
  if (take(2)) return [...Array(81).keys()].filter(() => take(2));
  const count = take(most) + 1;
  return Array.from({ length: count }, () => take(81));
}

const sortCircles = (circles) => circles.slice().sort((a, b) => a - b);

// More sets of Counting Circles: how many, then each as writeCircles has
// it.
function writeCircleSets(digits, sets) {
  digits.push([sets.length - 1, CIRCLE_SETS_MOST]);
  for (const set of sets) writeCircles(digits, set);
}

function readCircleSets(take) {
  const count = take(CIRCLE_SETS_MOST) + 1;
  return Array.from({ length: count }, () => readCircles(take));
}

// Each set's cells in order, the sets as they were drawn.
const sortCircleSets = (sets) => sets.map(sortCircles);

// Chaos Arrows: how many, then each one's cell and its ways. One with arms
// of its own has them written after every part (DETAILS), and 1 here.
function writeChaosArrows(digits, arrows) {
  digits.push([arrows.length - 1, 81]);
  for (const { cell, ways } of arrows) digits.push([cell, 81], [(ways ?? 1) - 1, 15]);
}

function readChaosArrows(take) {
  const count = take(81) + 1;
  return Array.from({ length: count }, () => ({ cell: take(81), ways: take(15) + 1 }));
}

const sortChaosArrows = (arrows) =>
  arrows.map(({ cell, ways, arms }) => (arms ? { cell, arms: arms.map((arm) => arm.slice()) } : { cell, ways })).sort((a, b) => a.cell - b.cell);

// A Chaos Arrow's own arms, for each arrow in order: 0 for none, or 1 and
// how many, and each one's length and steps, each to the cell beside the
// last, up, right, down or left, from the arrow's cell.
const SIDE_STEPS = [-9, 1, 9, -1];
function writeArms(digits, arrows) {
  for (const { cell, arms } of arrows) {
    digits.push([arms ? 1 : 0, 2]);
    if (!arms) continue;
    digits.push([arms.length - 1, 4]);
    for (const arm of arms) {
      digits.push([arm.length - 1, 80]);
      arm.forEach((c, i) => digits.push([SIDE_STEPS.indexOf(c - (i ? arm[i - 1] : cell)), 4]));
    }
  }
}

// The other way; null if an arm steps off the board or round onto the next
// row.
function readArms(take, arrows) {
  const out = [];
  for (const { cell, ways } of arrows) {
    if (!take(2)) {
      out.push({ cell, ways });
      continue;
    }
    const arms = [];
    for (let a = take(4) + 1; a > 0; a--) {
      const arm = [];
      for (let n = take(80) + 1, at = cell; n > 0; n--) {
        const next = at + SIDE_STEPS[take(4)];
        if (next < 0 || next > 80 || sideOf(at, next) < 0) return null;
        arm.push((at = next));
      }
      arms.push(arm);
    }
    out.push({ cell, arms });
  }
  return out;
}

// A Chaos Count's own cells, for each count in order: 0 for none, or 1 and
// how many, and each cell.
function writeCounted(digits, counts) {
  for (const count of counts) {
    const own = typeof count !== "number";
    digits.push([own ? 1 : 0, 2]);
    if (!own) continue;
    digits.push([count.cells.length - 1, 80]);
    for (const c of count.cells) digits.push([c, 81]);
  }
}

function readCounted(take, counts) {
  return counts.map((cell) => {
    if (!take(2)) return cell;
    const n = take(80) + 1;
    return { cell, cells: Array.from({ length: n }, () => take(81)) };
  });
}

// By cell, those of their own with their cells in reading order.
const sortCounts = (counts) =>
  counts.map((x) => (typeof x === "number" ? x : { cell: x.cell, cells: x.cells.slice().sort((a, b) => a - b) })).sort((a, b) => countCell(a) - countCell(b));

// Yin-Yang's circles: a flag, then either how many and each one's cell and
// shade, or every cell's shade, 0 for none; whichever is shorter.
function writeShades(digits, shades) {
  if (Math.log2(81) + shades.length * Math.log2(162) <= 81 * Math.log2(3)) {
    digits.push([0, 2], [shades.length - 1, 81]);
    for (const { cell, shade } of shades) digits.push([cell, 81], [shade - 1, 2]);
  } else {
    const of = new Map(shades.map(({ cell, shade }) => [cell, shade]));
    digits.push([1, 2]);
    for (let c = 0; c < 81; c++) digits.push([of.get(c) ?? 0, 3]);
  }
}

// The other way. A cell listed twice reads as written, so that checking it
// refuses the seed.
function readShades(take) {
  if (take(2)) return [...Array(81).keys()].map((cell) => ({ cell, shade: take(3) })).filter(({ shade }) => shade);
  const count = take(81) + 1;
  return Array.from({ length: count }, () => ({ cell: take(81), shade: take(2) + 1 }));
}

const sortShades = (shades) => shades.map(({ cell, shade }) => ({ cell, shade })).sort((a, b) => a.cell - b.cell);

// Single indexing cells: how many, then each one's cell and its line: 0
// for its column, doing as a marked column's cells do, 1 for its row.
function writeIndexCells(digits, indexcells) {
  digits.push([indexcells.length - 1, INDEX_CELLS_MOST]);
  for (const { cell, line } of indexcells) digits.push([cell, 81], [line < 9 ? 1 : 0, 2]);
}

function readIndexCells(take) {
  const count = take(INDEX_CELLS_MOST) + 1;
  return Array.from({ length: count }, () => {
    const cell = take(81);
    return { cell, line: take(2) ? Math.floor(cell / 9) : 9 + (cell % 9) };
  });
}

// By cell, a column's way before a row's.
const sortIndexCells = (indexcells) => indexcells.map(({ cell, line }) => ({ cell, line })).sort((a, b) => a.cell - b.cell || b.line - a.line);

// Row/Column Indexing marks: for each of the 18 lines, 1 for a mark.
function writeIndexings(digits, indexings) {
  const marked = new Set(indexings.map((i) => i.line));
  for (let line = 0; line < 18; line++) digits.push([marked.has(line) ? 1 : 0, 2]);
}

const readIndexings = (take) => [...Array(18).keys()].filter(() => take(2)).map((line) => ({ line }));
const sortIndexings = (indexings) => indexings.map((i) => ({ line: i.line })).sort((a, b) => a.line - b.line);

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

// Clues on views, their value under `key` from 1 to `most`: a flag, then
// either how many and each one's view and value, or every view's value, 0
// for none; whichever is shorter.
function writeViews(digits, clues, key, most) {
  const values = new Map(clues.map((clue) => [clue.view, clue[key]]));
  const listed = Math.log2(VIEWS.length + 1) + values.size * Math.log2(VIEWS.length * most);
  if (listed <= VIEWS.length * Math.log2(most + 1)) {
    digits.push([0, 2], [values.size, VIEWS.length + 1]);
    for (const view of [...values.keys()].sort((a, b) => a - b)) digits.push([view, VIEWS.length], [values.get(view) - 1, most]);
  } else {
    digits.push([1, 2]);
    VIEWS.forEach((_, view) => digits.push([values.get(view) ?? 0, most + 1]));
  }
}

// The other way, from `take`, which reads the next digit.
function readViews(take, key, most) {
  const out = [];
  if (take(2)) {
    VIEWS.forEach((_, view) => {
      const value = take(most + 1);
      if (value) out.push({ view, [key]: value });
    });
  } else {
    const count = take(VIEWS.length + 1);
    for (let i = 0; i < count; i++) out.push({ view: take(VIEWS.length), [key]: take(most) + 1 });
  }
  return out;
}

// A Jigsaw's regions: for each pair of neighbours, whether they share one.
function writeRegions(digits, regions) {
  for (const [a, b] of SIDES) digits.push([regions[a] === regions[b] ? 1 : 0, 2]);
}

// The other way: cells joined where they share, numbered in order of their
// first cell. Checking them after refuses a seed whose regions are not
// nine of nine.
function readRegions(take) {
  const root = [...Array(81).keys()];
  const find = (c) => (root[c] === c ? c : (root[c] = find(root[c])));
  for (const [a, b] of SIDES) if (take(2)) root[find(a)] = find(b);
  return sortRegions([...Array(81).keys()].map(find));
}

// Clues on views in order of their views, each a copy.
const sortViews = (clues) => clues.map((clue) => ({ ...clue })).sort((a, b) => a.view - b.view);
const views = (list, letter, name, problem, key, most) => ({
  list,
  letter,
  name,
  problem,
  write: (digits, clues) => writeViews(digits, clues, key, most),
  read: (take) => readViews(take, key, most),
  sort: sortViews,
});

const sortSandwiches = (sandwiches) => sandwiches.map((s) => ({ line: s.line, sum: s.sum })).sort((a, b) => a.line - b.line);
// By first cell, then by second, which is which way each runs.
const sortLittles = (littles) =>
  littles
    .map((l) => ({ cells: l.cells.slice(), sum: l.sum }))
    .sort((a, b) => a.cells[0] - b.cells[0] || b.cells[1] - a.cells[1]);

// withs: which parts the seed's letters say it has, { cages, thermos, ... }
// as PARTS names them; details, the DETAILS they name; base as encodeGrid
// has it.
function decodeParts(body, withs, details = [], base = 9) {
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
  for (const c of clued) grid[c] = take(base) + 1;
  const out = { grid };
  for (const p of PARTS) {
    out[p.list] = withs[p.list] ? p.read(take) : [];
    if (!out[p.list]) return null;
  }
  for (const d of details) {
    if (!out[d.list].length) return null;
    out[d.list] = d.read(take, out[d.list]);
    if (!out[d.list]) return null;
  }
  return n === 0n ? out : null;
}

// A killer seed's cages, from `take`, which reads the next digit, or
// another kind's, `clue` reading each one's clue from its cells.
function readCages(take, clue = () => ({ sum: take(46) })) {
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
  return [...groups.values()].map((cells) => ({ ...clue(cells), cells }));
}

// Cages in order of their first cell, each cage's cells in reading order,
// with its clue, if its kind has one, and its control, if it has one.
// A Connected Values cage keeps its size, and a cage in pieces side by side
// its pieces.
function sortCages(cages) {
  return cages
    .map(({ sum, clue, control, size, cells, pieces }) => ({
      ...(sum != null ? { sum } : {}),
      ...(clue != null ? { clue } : {}),
      ...(control != null ? { control } : {}),
      ...(size != null ? { size } : {}),
      ...(pieces ? tidyPieces(cells.slice().sort((a, b) => a - b), pieces) : { cells: cells.slice().sort((a, b) => a - b) }),
    }))
    .sort((a, b) => a.cells[0] - b.cells[0]);
}

// A kind of cage other than a killer's, `write` and `read` its clue's, read
// taking the cage's cells.
const cageKind = (list, letter, name, problem, write, read) => ({
  list,
  letter,
  name,
  problem,
  write: (digits, cages) => writeCages(digits, cages, (cage) => write(digits, cage)),
  read: (take) => readCages(take, (cells) => read(take, cells)),
  sort: sortCages,
});

// A Connected Values clue, as which of the digits 1 to 9 it names: one to
// eight of them, never all nine.
const writeLink = (digits, { clue }) => digits.push([(clueMask(clue) >> 1) - 1, 510]);
function readLink(take) {
  const m = take(510) + 1;
  return { clue: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << (d - 1))).join("") };
}

// The drawn parts, with their letters and names, in the order their letters
// start a seed and their parts go in its body: how each is written, read,
// checked, and put in the one order a seed keeps it in.
const copyLines = (lines) => lines.map((t) => t.slice());
const lines = (list, letter, name, problem, most = 9) => ({
  list,
  letter,
  name,
  problem,
  write: (digits, found) => writeLines(digits, found, most),
  read: (take) => readLines(take, most),
  sort: copyLines,
});
// Sum lines, each with its sum before its cells. A loop is written with its
// first cell again at the end, which no other line has, so a seed from
// before loops reads as it did.
const sumLines = {
  list: "sumlines",
  letter: "QSL",
  name: "Sum Line",
  problem: sumLineProblem,
  write: (digits, found) =>
    writeLines(
      digits,
      found.map((t) => (t.loop ? { sum: t.sum, cells: [...t.cells, t.cells[0]] } : t)),
      LONG_LINE_MOST,
      ({ sum }) => digits.push([sum - 1, SUM_LINE_MAX])
    ),
  read: (take) =>
    readLines(take, LONG_LINE_MOST, () => ({ sum: take(SUM_LINE_MAX) + 1 }))?.map((t) =>
      t.cells.length > 3 && t.cells.at(-1) === t.cells[0] ? { sum: t.sum, cells: t.cells.slice(0, -1), loop: true } : t
    ),
  sort: (found) => found.map(({ sum, cells, loop }) => ({ sum, cells: cells.slice(), ...(loop ? { loop: true } : {}) })),
};
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
  // ruled: its check takes the rules too, as a sum may hold Doppelgänger's 0.
  { list: "cages", letter: "K", name: "Killer", problem: cageProblem, ruled: true, write: (digits, cages) => writeCages(digits, cages), read: (take) => readCages(take), sort: sortCages },
  cageKind("relliks", "QRC", "Rellik Cage", rellikProblem, (digits, { sum }) => digits.push([sum, 46]), (take) => ({ sum: take(46) })),
  { ...cageKind("lunchboxes", "QLB", "Lunchbox", lunchboxProblem, (digits, { sum }) => digits.push([sum, LUNCHBOX_MAX + 1]), (take) => ({ sum: take(LUNCHBOX_MAX + 1) })), ruled: true },
  cageKind("looksays", "QLS", "Look and Say", lookSayProblem, writeSay, readSay),
  cageKind("equalities", "QEC", "Equality Cage", equalityProblem, () => {}, () => ({})),
  { list: "equalsums", letter: "QES", name: "Equal Sum", problem: equalSumProblem, write: writePieces, read: readPieces, sort: sortCages },
  { list: "samevalues", letter: "QSV", name: "Same Values", problem: sameValueProblem, write: writePieces, read: readPieces, sort: sortCages },
  cageKind("connecteds", "QCV", "Connected Values", connectedProblem, writeLink, readLink),
  cageKind(
    "distincts",
    "QCD",
    "Count Distinct",
    distinctProblem,
    (digits, { control, cells }) => digits.push([cells.indexOf(control), cells.length]),
    (take, cells) => ({ control: cells[take(cells.length)] })
  ),
  lines("thermos", "T", "Thermo", thermoProblem),
  lines("arrows", "A", "Arrow", arrowProblem),
  lines("doubles", "QDA", "Double Arrow", doubleProblem),
  { list: "pills", letter: "QPA", name: "Pill Arrow", problem: pillProblem, write: writePills, read: readPills, sort: copyPills },
  lines("whispers", "S", "German Whispers", whisperProblem),
  lines("dutches", "QDL", "Dutch Whispers", dutchProblem),
  lines("renbans", "R", "Renban", renbanProblem),
  lines("palindromes", "O", "Palindrome", palindromeProblem),
  lines("zippers", "Z", "Zipper", zipperProblem),
  lines("betweens", "C", "Between", betweenProblem),
  lines("lockouts", "F", "Lockout", lockoutProblem),
  lines("entropics", "QEN", "Entropic", entropicProblem),
  lines("modulars", "QMO", "Modular", modularProblem),
  sumLines,
  lines("regionsums", "QRS", "Region Sum Line", regionSumProblem, LONG_LINE_MOST),
  lines("indexes", "QVX", "Value Indexing", indexProblem, INDEX_LINE_MOST),
  edges("dots", "P", "Kropki", dotProblem, DOT_MARKS),
  edges("xvs", "V", "XV", xvProblem, XV_MARKS),
  edges("signs", "QGT", "Greater Than", signProblem, SIGN_MARKS),
  { list: "quads", letter: "QQD", name: "Quad", problem: quadProblem, write: writeQuads, read: readQuads, sort: sortQuads },
  { list: "circles", letter: "QCC", name: "Counting Circles", problem: circleProblem, write: writeCircles, read: readCircles, sort: sortCircles },
  // Only ever with the first set, QCC.
  { list: "circlesets", letter: "QCS", name: "Counting Circles", with: "circles", problem: circleSetProblem, write: writeCircleSets, read: readCircleSets, sort: sortCircleSets },
  // Only ever under Chaos Construction, QCH.
  { list: "chaosarrows", letter: "QCA", name: "Chaos Arrow", rule: "chaos", problem: chaosArrowProblem, write: writeChaosArrows, read: readChaosArrows, sort: sortChaosArrows },
  {
    list: "chaoscounts",
    letter: "QCO",
    name: "Chaos Count",
    rule: "chaos",
    problem: chaosCountProblem,
    // A count of its own cells is written by its cell here, and its cells
    // after every part (DETAILS).
    write: (digits, counts) => writeCircles(digits, counts.map(countCell), 81),
    read: (take) => readCircles(take, 81),
    sort: sortCounts,
  },
  { list: "shades", letter: "QYY", name: "Yin-Yang", problem: shadeProblem, write: writeShades, read: readShades, sort: sortShades },
  { list: "sandwiches", letter: "B", name: "Sandwich", problem: sandwichProblem, write: writeSandwiches, read: readSandwiches, sort: sortSandwiches },
  { list: "littles", letter: "L", name: "Little Killer", problem: littleProblem, ruled: true, write: writeLittles, read: readLittles, sort: sortLittles },
  views("skyscrapers", "Y", "Skyscrapers", skyscraperProblem, "count", 9),
  views("xsums", "U", "X-Sums", xsumProblem, "sum", 45),
  views("hiddens", "QHS", "Hidden Skyscraper", hiddenProblem, "height", 8),
  views("rooms", "QNR", "Numbered Room", roomProblem, "digit", 9),
  views("ranks", "QFR", "Full Rank", rankProblem, "rank", RANK_MOST),
  { list: "indexings", letter: "QRX", name: "Row/Column Indexing", problem: indexingProblem, write: writeIndexings, read: readIndexings, sort: sortIndexings },
  { list: "indexcells", letter: "QCX", name: "Row/Column Indexing", problem: indexCellProblem, write: writeIndexCells, read: readIndexCells, sort: sortIndexCells },
  { list: "regions", letter: "J", name: "Jigsaw", problem: regionProblem, write: writeRegions, read: readRegions, sort: sortRegions },
];

// More about parts already written, each under letters of its own and in
// the body after every part, so a seed without them reads its parts as
// they always were: a Connected Values cage's group size, a Chaos Arrow's
// own arms and a Chaos Count's own cells. For each: the list it adds to,
// whether a list needs it, and how it is written and read, read giving the
// list with it, or null if it cannot be.
const DETAILS = [
  {
    list: "connecteds",
    letter: "QGS",
    name: "Connected Values",
    needed: (cages) => cages.some((k) => k.size != null),
    // For each cage in order, its size, or 0 for none.
    write: (digits, cages) => cages.forEach((k) => digits.push([k.size ?? 0, 82])),
    read: (take, cages) =>
      cages.map((k) => {
        const size = take(82);
        return size ? { ...k, size } : k;
      }),
  },
  { list: "chaosarrows", letter: "QAM", name: "Chaos Arrow", needed: (arrows) => arrows.some((a) => a.arms), write: writeArms, read: readArms },
  { list: "chaoscounts", letter: "QCL", name: "Chaos Count", needed: (counts) => counts.some((x) => typeof x !== "number"), write: writeCounted, read: readCounted },
];

// The letters that start a variant seed, in this order.
const PREFIX = [...PARTS.map((p) => p.letter), ...RULES.map((r) => r.letter), ...DETAILS.map((d) => d.letter)];

// The variant's letters at the front of `raw`, as PREFIX has them: one
// character each, or Q and the two after it. { letters, at }, `at` where
// they stop: at the level, if the seed is a variant's. A letter twice ends
// them there too, so such a seed is none.
function readLetters(raw) {
  const letters = [];
  let at = 0;
  for (;;) {
    const letter = raw[at] === "Q" ? raw.slice(at, at + 3) : raw[at];
    if (!letter || !PREFIX.includes(letter) || letters.includes(letter)) return { letters, at };
    letters.push(letter);
    at += letter.length;
  }
}

// parts: { cages, thermos, ... }, each a list, empty for none.
function prefixFor(parts, rules) {
  return (
    PARTS.filter((p) => parts[p.list].length).map((p) => p.letter).join("") +
    RULES.filter((r) => rules & r.bit).map((r) => r.letter).join("") +
    detailsOf(parts).map((d) => d.letter).join("")
  );
}

// The DETAILS the parts need.
const detailsOf = (parts) => DETAILS.filter((d) => parts[d.list].length && d.needed(parts[d.list]));

// The seed of a made puzzle. variant: { cages, relliks, lunchboxes,
// looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, dutches, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars,
// sumlines, regionsums, indexes, dots, xvs, signs, quads, circles, circlesets, sandwiches, littles, skyscrapers, xsums, hiddens,
// rooms, ranks, indexings, indexcells, regions, rules } for a variant puzzle (variant.js), or nothing for
// a classic one.
// `level` is
// the maker's rating; it names the level on screen and nothing else. The
// puzzle should have one answer: parseSeed refuses one that does not.
export function madeSeed(level, grid, variant = null) {
  const groups = (body) => body.match(/.{1,4}/g).join("-");
  const parts = {};
  for (const p of PARTS) parts[p.list] = variant?.[p.list]?.length ? p.sort(variant[p.list]) : [];
  const rules = variant?.rules ?? 0;
  const prefix = prefixFor(parts, rules);
  const drawn = PARTS.some((p) => parts[p.list].length);
  const base = hasRule(rules, "doppelganger") ? 10 : 9;
  const body = drawn ? encodeParts(grid, parts, base) : encodeGrid(grid, base);
  const text = prefix ? `${prefix}-${level}-${groups(body)}` : `${level}-${groups(body)}`;
  const seed = { level, body, text, made: true, grid: grid.slice(), rules };
  for (const { list } of PARTS) if (parts[list].length) seed[list] = parts[list];
  return seed;
}

/* ---- killer puzzles ---- */

// How many clues a killer puzzle at each level tries to take out, as
// generate does with LEVELS' blanks. Cages do most of the clues' work, so
// Expert tries every one.
export const KILLER_BLANKS = { E: 62, M: 70, H: 76, X: 81 };

// A killer puzzle picked by `rand` (unsigned 32 bit integers, as generate
// takes), as a made seed at `level`: a full grid, cages grown over every
// cell from random ones, edge to edge, two to four cells with no digit
// twice (fewer where a cage has no room to grow), then clues taken out in an
// order drawn from `rand`, each only if the puzzle keeps its one answer,
// until KILLER_BLANKS[level] are gone or none more can go. A clue the
// checker gives up on stays. The daily killer is made this way (api/_lib/daily.js).
export function killerSeed(rand, level) {
  const solution = randomSolution(rand);
  const of = new Array(81).fill(-1);
  const cages = [];
  const beside = (c) => [c - 9, c + 9, COL[c] > 0 ? c - 1 : -1, COL[c] < 8 ? c + 1 : -1].filter((o) => o >= 0 && o < 81);
  for (const start of shuffled([...Array(81).keys()], rand)) {
    if (of[start] >= 0) continue;
    const want = 2 + (rand() % 3);
    const cells = [start];
    of[start] = cages.length;
    while (cells.length < want) {
      const next = [...new Set(cells.flatMap(beside))].filter((o) => of[o] < 0 && !cells.some((c) => solution[c] === solution[o]));
      if (!next.length) break;
      const o = next[rand() % next.length];
      of[o] = cages.length;
      cells.push(o);
    }
    cells.sort((a, b) => a - b);
    cages.push({ sum: cells.reduce((t, c) => t + solution[c], 0), cells });
  }
  const variant = { cages: cages.sort((a, b) => a.cells[0] - b.cells[0]) };
  const puzzle = solution.slice();
  let removed = 0;
  for (const c of shuffled([...Array(81).keys()], rand)) {
    if (removed >= KILLER_BLANKS[level]) break;
    const keep = puzzle[c];
    puzzle[c] = 0;
    if (variantSolutions(puzzle, variant, 2)?.length === 1) removed++;
    else puzzle[c] = keep;
  }
  return madeSeed(level, puzzle, variant);
}

// The variant a seed's text names, from its letters alone, without
// checking it: "Killer, Diagonal", or "" for a classic seed.
export function seedVariantName(text) {
  const head = String(text).split("-")[0].toUpperCase();
  if (LEVEL_IDS.includes(head)) return "";
  const { letters } = readLetters(head);
  const names = letters.map((letter) => [...PARTS, ...RULES, ...DETAILS].find((p) => p.letter === letter).name);
  const rules = RULES.filter((r) => letters.includes(r.letter)).reduce((m, r) => m | r.bit, 0);
  // A part with two letters, such as Counting Circles' sets, is named once.
  return renamed([...new Set(names)], rules).join(", ");
}

// Parsing one means checking it has one answer, so the last few are kept.
const madeParsed = new Map();

// letters: the variant's, as readLetters gives them, none for a classic
// puzzle.
function parseMade(letters, level, body) {
  const key = `${letters.join("")}-${level}${body}`;
  if (madeParsed.has(key)) return madeParsed.get(key);
  let seed = null;
  const rules = RULES.filter((r) => letters.includes(r.letter)).reduce((m, r) => m | r.bit, 0);
  const withs = Object.fromEntries(PARTS.map((p) => [p.list, letters.includes(p.letter)]));
  const details = DETAILS.filter((d) => letters.includes(d.letter));
  const base = hasRule(rules, "doppelganger") ? 10 : 9;
  if (PARTS.some((p) => withs[p.list])) {
    const got = decodeParts(body, withs, details, base);
    const variant = got && { ...got, rules };
    // Each part the letters name is there, well formed, and with the part or
    // the rule it comes with, if it has one; each detail named is one its
    // part needs; and drawn regions never come with regions found while
    // solving.
    const ok =
      variant &&
      PARTS.every((p) => !withs[p.list] || (variant[p.list].length && !(p.ruled ? p.problem(variant[p.list], rules) : p.problem(variant[p.list])) && (!p.with || withs[p.with]) && (!p.rule || hasRule(rules, p.rule)))) &&
      details.every((d) => d.needed(variant[d.list])) &&
      !(withs.regions && hasRule(rules, "chaos")) &&
      !zeroClash(variant) &&
      variantSolutions(got.grid, variant, 2)?.length === 1;
    seed = ok ? madeSeed(level, got.grid, variant) : null;
  } else if (details.length) {
    // Details of parts the seed does not have.
    seed = null;
  } else if (rules) {
    // The rules do some of the clues' work, so there is no least number.
    const grid = decodeGrid(body, base);
    const ok = grid && !zeroClash({ rules }) && variantSolutions(grid, { rules }, 2)?.length === 1;
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
  if (raw.length >= MADE_MIN + 1 && LEVEL_IDS.includes(raw[0])) return parseMade([], raw[0], raw.slice(1));
  // A variant's letters, then the level. None of the letters is a level's,
  // and a Q's two after it are read with it.
  const { letters, at } = readLetters(raw);
  if (at && raw.length >= at + MADE_MIN + 1 && LEVEL_IDS.includes(raw[at])) {
    return parseMade(letters, raw[at], raw.slice(at + 1));
  }
  if (level && LEVEL_IDS.includes(level) && isBody(raw)) return buildSeed(level, raw);
  return null;
}

/* ---- short codes ---- */

// A made seed longer than CODE_OVER characters is shared as a short code:
// its level and CODE_LENGTH seed characters, written "H-B7K4Q-M9TRZ". The
// server keeps the whole seed each code stands for (api/seed/), so a code
// needs a connection to open the first time. It is longer than a generated
// seed's eight characters and shorter than a made seed's twelve, so
// parseSeed never takes one for a seed, and never returns one.
export const CODE_OVER = 20;
export const CODE_LENGTH = 10;

// Whether a seed's text is long enough to be shared by a short code: only a
// made seed ever is.
export const needsCode = (text) => typeof text === "string" && text.length > CODE_OVER;

// A short code as it is written, from its level and its characters.
export const codeText = (level, code) => `${level}-${code.slice(0, 5)}-${code.slice(5)}`;

// A short code from whatever was typed, forgiving about case, spaces and
// dashes as parseSeed is: { level, code, text }, or null if it is not one.
export function parseCode(input) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = raw.slice(1);
  if (raw.length !== CODE_LENGTH + 1 || !LEVEL_IDS.includes(raw[0]) || ![...code].every((ch) => ALPHABET.includes(ch))) return null;
  return { level: raw[0], code, text: codeText(raw[0], code) };
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
  // Yin-Yang's circles go with the puzzle, as each cell's shade given, 0
  // for none, and the shading with its answer (variantSolutions).
  if (seed.shades) {
    puzzle.shades = new Array(81).fill(0);
    for (const { cell, shade } of seed.shades) puzzle.shades[cell] = shade;
  }
  const out = { puzzle, solution, blanks: puzzle.filter((d) => d === 0).length };
  made.set(seed.text, out);
  if (made.size > 8) made.delete(made.keys().next().value);
  return out;
}
