// Variant sudoku: the classic rules with more on top. Pure, with no DOM, and
// the API imports it too, to work out a made variant puzzle's answer.
//
// A variant is { cages, thermos, arrows, whispers, renbans, dots, xvs,
// sandwiches, littles, rules }:
//
//   cages    killer cages, [{ sum, cells }] with cells in reading order. A
//            cage's digits add up to its sum and never repeat within it. A
//            cell is in at most one cage; cells in none are allowed.
//   thermos  thermometers, each a path of cells from the bulb, every step
//            to a cell touching the last, corners included. Digits rise
//            strictly from the bulb. Thermometers may share cells.
//   arrows   arrows, each a path like a thermometer's, from the circle. The
//            digits along the arrow, past the circle, add up to the
//            circle's digit, and may repeat where the rules allow. Arrows
//            may share cells, and circles.
//   whispers German Whispers lines, paths like a thermometer's: digits next
//            to each other on one differ by at least 5, so no 5 is ever on
//            one. They may share cells.
//   renbans  renban lines, paths like a thermometer's: a line's digits are
//            a run of consecutive digits in any order, with no repeats.
//            They may share cells.
//   dots     Kropki dots, [{ cells: [a, b], mark }] on the side two cells
//            share, a before b in reading order. A "white" dot's digits are
//            consecutive; a "black" dot's are one double the other.
//   xvs      XV marks, as dots: an "x" mark's digits add up to 10, a "v"
//            mark's to 5. Cells with no dot or mark between them may be
//            anything the other rules allow.
//   sandwiches  Sandwich clues outside the grid, [{ line, sum }]: line 0 to
//            8 a row, its clue on the left, and 9 to 17 a column, its clue
//            above. The digits between the line's 1 and its 9 add up to the
//            sum, 0 when they sit side by side.
//   littles  Little Killer clues outside the grid, [{ cells, sum }]: cells
//            a whole diagonal, from the edge the clue sits by to the far
//            edge, two cells at least. Its digits add up to the sum, and may
//            repeat where the rules allow.
//   rules    switches, as bits (RULES below): Diagonal, both long
//            diagonals hold 1 to 9; Anti-knight, cells a knight's move apart
//            differ; Anti-king, cells touching at a corner differ; Windoku,
//            four more 3x3 windows hold 1 to 9.
//
// Diagonals and windows are extra houses, like rows, columns and boxes; the
// knight's and king's moves are extra pairs of cells that must differ.

import { ROW, COL, BOX } from "./sudoku.js";

const ALL = 0b1111111110;
const POP = new Uint8Array(1024);
for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);

// In the order their letters go in a seed.
export const RULES = [
  { key: "diagonal", bit: 1, letter: "D", name: "Diagonal" },
  { key: "antiknight", bit: 2, letter: "N", name: "Anti-knight" },
  { key: "antiking", bit: 4, letter: "G", name: "Anti-king" },
  { key: "windoku", bit: 8, letter: "W", name: "Windoku" },
];
export const ALL_RULES = RULES.reduce((m, r) => m | r.bit, 0);
const has = (rules, key) => Boolean(rules & RULES.find((r) => r.key === key).bit);

// The rules' names, for a label: "Killer, Thermo, Diagonal".
export function variantName({ cages, thermos, arrows, whispers, renbans, dots, xvs, sandwiches, littles, rules } = {}) {
  const names = RULES.filter((r) => rules & r.bit).map((r) => r.name);
  if (littles?.length) names.unshift("Little Killer");
  if (sandwiches?.length) names.unshift("Sandwich");
  if (xvs?.length) names.unshift("XV");
  if (dots?.length) names.unshift("Kropki");
  if (renbans?.length) names.unshift("Renban");
  if (whispers?.length) names.unshift("German Whispers");
  if (arrows?.length) names.unshift("Arrow");
  if (thermos?.length) names.unshift("Thermo");
  if (cages?.length) names.unshift("Killer");
  return names.join(", ");
}

/* ---- the layout a set of rules makes ---- */

const cellAt = (r, c) => r * 9 + c;
const WINDOW_CORNERS = [
  [1, 1],
  [1, 5],
  [5, 1],
  [5, 5],
];

// { houses: [{ kind, index, cells }], housesOf: per cell, the houses it is
// in, pairs: per cell, the cells that must differ from it outside its
// houses, peers: per cell, every cell that must differ from it }. Rows,
// columns and boxes come first, in that order, as the classic solver has
// them.
const layouts = new Map();

export function layout(rules = 0) {
  if (layouts.has(rules)) return layouts.get(rules);
  const houses = [];
  for (const [kind, of] of [["row", ROW], ["column", COL], ["box", BOX]]) {
    for (let index = 0; index < 9; index++) houses.push({ kind, index, cells: [...Array(81).keys()].filter((c) => of[c] === index) });
  }
  if (has(rules, "diagonal")) {
    houses.push({ kind: "diagonal", index: 0, cells: [...Array(9).keys()].map((i) => cellAt(i, i)) });
    houses.push({ kind: "diagonal", index: 1, cells: [...Array(9).keys()].map((i) => cellAt(i, 8 - i)) });
  }
  if (has(rules, "windoku")) {
    WINDOW_CORNERS.forEach(([r0, c0], index) => {
      const cells = [];
      for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) cells.push(cellAt(r, c));
      houses.push({ kind: "window", index, cells });
    });
  }
  const housesOf = Array.from({ length: 81 }, () => []);
  houses.forEach((h, i) => h.cells.forEach((c) => housesOf[c].push(i)));

  const moves = [];
  if (has(rules, "antiknight")) moves.push([1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]);
  if (has(rules, "antiking")) moves.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  const pairs = [];
  const peers = [];
  for (let c = 0; c < 81; c++) {
    const housed = new Set(housesOf[c].flatMap((h) => houses[h].cells));
    housed.delete(c);
    const extra = new Set();
    for (const [dr, dc] of moves) {
      const r = ROW[c] + dr;
      const col = COL[c] + dc;
      if (r < 0 || r > 8 || col < 0 || col > 8) continue;
      const o = cellAt(r, col);
      if (!housed.has(o)) extra.add(o);
    }
    pairs.push([...extra].sort((a, b) => a - b));
    peers.push([...housed, ...extra].sort((a, b) => a - b));
  }
  const out = { houses, housesOf, pairs, peers };
  layouts.set(rules, out);
  return out;
}

/* ---- cages ---- */

// COMBOS[k][s]: every set of k different digits adding up to s, as masks.
const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let m = 2; m < 1024; m += 2) {
  let sum = 0;
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) sum += d;
  COMBOS[POP[m]][sum].push(m);
}

// Digits the rest of a cage can still use: those in some set of `left`
// unused digits adding up to `rest`.
export function cageAllows(left, rest, used) {
  if (left < 0 || left > 9 || rest < 0 || rest > 45) return 0;
  if (left === 0) return rest === 0 ? ALL : 0;
  let out = 0;
  for (const m of COMBOS[left][rest]) if (!(m & used)) out |= m;
  return out;
}

// Whether cages are well formed: cells 0 to 80, none in two cages, each
// cage one to nine cells joined edge to edge, and a sum nine different
// digits could make. null if so, or what is wrong: { why, cage }.
export function cageProblem(cages) {
  const seen = new Set();
  for (let i = 0; i < cages.length; i++) {
    const { sum, cells } = cages[i];
    if (!Array.isArray(cells) || !cells.length || cells.length > 9) return { why: "size", cage: i };
    for (const c of cells) {
      if (!Number.isInteger(c) || c < 0 || c > 80) return { why: "cell", cage: i };
      if (seen.has(c)) return { why: "overlap", cage: i };
      seen.add(c);
    }
    if (!Number.isInteger(sum) || !COMBOS[cells.length][sum]?.length) return { why: "sum", cage: i };
    if (!joined(cells)) return { why: "apart", cage: i };
  }
  return null;
}

// Every cell reachable from the first through edges within the group.
function joined(cells) {
  const set = new Set(cells);
  const reached = new Set([cells[0]]);
  const todo = [cells[0]];
  while (todo.length) {
    const c = todo.pop();
    const next = [c - 9, c + 9, COL[c] > 0 ? c - 1 : -1, COL[c] < 8 ? c + 1 : -1];
    for (const n of next) {
      if (set.has(n) && !reached.has(n)) {
        reached.add(n);
        todo.push(n);
      }
    }
  }
  return reached.size === set.size;
}

// For each cell, the index of its cage, or -1.
export function cageOf(cages) {
  const out = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (out[c] = i)));
  return out;
}

/* ---- thermometers, arrows and the other lines ---- */

// Whether two cells touch, along an edge or at a corner.
export const touching = (a, b) => a !== b && Math.abs(ROW[a] - ROW[b]) <= 1 && Math.abs(COL[a] - COL[b]) <= 1;

// Whether lines, thermometers, arrows or the others, are well formed: forty at most,
// each two to nine cells on the board, each touching the one before, none
// twice. null if so, or what is wrong: { why, line }.
function lineProblem(lines) {
  // A seed has room for forty.
  if (lines.length > 40) return { why: "count", line: 40 };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!Array.isArray(t) || t.length < 2 || t.length > 9) return { why: "length", line: i };
    const seen = new Set();
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      if (!Number.isInteger(c) || c < 0 || c > 80) return { why: "cell", line: i };
      if (seen.has(c)) return { why: "loop", line: i };
      seen.add(c);
      if (j && !touching(t[j - 1], c)) return { why: "apart", line: i };
    }
  }
  return null;
}

export const thermoProblem = lineProblem;
export const arrowProblem = lineProblem;
export const whisperProblem = lineProblem;
export const renbanProblem = lineProblem;

// ABOVE[k]: the digits over k, for k 0 to 9. BELOW[k]: those under it, for
// k 1 to 10. LOW and HIGH: a mask's least and greatest digit.
const ABOVE = [];
const BELOW = [];
for (let k = 0; k <= 10; k++) {
  ABOVE[k] = ALL & ~((2 << k) - 1);
  BELOW[k] = ALL & ((1 << k) - 1);
}
const LOW = new Uint8Array(1024);
const HIGH = new Uint8Array(1024);
for (let m = 1; m < 1024; m++) {
  LOW[m] = 31 - Math.clz32(m & -m);
  HIGH[m] = 31 - Math.clz32(m);
}

// Squeezes candidates along each thermometer: every cell above the least
// the cell before it can be, and below the most the one after it can be.
// A placed digit counts as a mask of one. Empty cells' masks in `free` are
// narrowed in place; false if a thermometer cannot be filled, or its placed
// digits do not rise.
function thermoBounds(thermos, g, free) {
  for (const t of thermos) {
    let lo = 0;
    for (const c of t) {
      const m = (g[c] ? 1 << g[c] : free[c]) & ABOVE[lo];
      if (!m) return false;
      if (!g[c]) free[c] = m;
      lo = LOW[m];
    }
    let hi = 10;
    for (let i = t.length - 1; i >= 0; i--) {
      const c = t[i];
      const m = (g[c] ? 1 << g[c] : free[c]) & BELOW[hi];
      if (!m) return false;
      if (!g[c]) free[c] = m;
      hi = HIGH[m];
    }
  }
  return true;
}

// The digits from lo to hi, as a mask; lo and hi may be off the 1 to 9 range.
function between(lo, hi) {
  lo = Math.max(lo, 1);
  hi = Math.min(hi, 9);
  return lo > hi ? 0 : ALL & ((2 << hi) - 1) & ~((1 << lo) - 1);
}

// Squeezes candidates along each arrow: the circle between the least and
// the most its arrow's cells can add up to, and each of those cells between
// what the circle leaves once the others are at their most and at their
// least. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if an arrow cannot add up.
function arrowBounds(arrows, g, free) {
  for (const a of arrows) {
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < a.length; i++) {
      const m = g[a[i]] ? 1 << g[a[i]] : free[a[i]];
      if (!m) return false;
      lo += LOW[m];
      hi += HIGH[m];
    }
    const circle = a[0];
    const cm = (g[circle] ? 1 << g[circle] : free[circle]) & between(lo, hi);
    if (!cm) return false;
    if (!g[circle]) free[circle] = cm;
    for (let i = 1; i < a.length; i++) {
      const c = a[i];
      if (g[c]) continue;
      const m = free[c] & between(LOW[cm] - (hi - HIGH[free[c]]), HIGH[cm] - (lo - LOW[free[c]]));
      if (!m) return false;
      free[c] = m;
    }
  }
  return true;
}

// FAR[m]: the digits at least 5 away from some digit in m. Never 5, which
// has nothing that far.
const FAR = new Int32Array(1024);
for (let m = 2; m < 1024; m += 2) {
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) FAR[m] |= between(1, d - 5) | between(d + 5, 9);
}

// Narrows candidates along each German Whispers line, forwards and then
// backwards: every cell to the digits far enough from some digit the cell
// before it can be. Placed digits count as masks of one, and `free` is
// narrowed in place, as in thermoBounds; false if a line cannot be filled,
// or two placed digits next to each other are too close.
function whisperBounds(whispers, g, free) {
  for (const t of whispers) {
    for (const back of [false, true]) {
      let before = 0;
      for (let j = 0; j < t.length; j++) {
        const c = t[back ? t.length - 1 - j : j];
        let m = g[c] ? 1 << g[c] : free[c];
        if (j) m &= FAR[before];
        if (!m) return false;
        if (!g[c]) free[c] = m;
        before = m;
      }
    }
  }
  return true;
}

// Narrows candidates on each renban line to the runs it could still be: a
// run of as many digits as the line has cells, holding its placed digits,
// with each of the run's other digits in reach of some empty cell and every
// empty cell able to take one of them. Placed digits count as masks of one,
// and `free` is narrowed in place, as in thermoBounds; false if no run
// fits, or a placed digit repeats.
function renbanBounds(renbans, g, free) {
  for (const t of renbans) {
    let placed = 0;
    for (const c of t) {
      if (!g[c]) continue;
      const bit = 1 << g[c];
      if (placed & bit) return false;
      placed |= bit;
    }
    let fits = false;
    let allow = 0;
    for (let lo = 1; lo + t.length - 1 <= 9; lo++) {
      const run = between(lo, lo + t.length - 1);
      if (placed & ~run) continue;
      const need = run & ~placed;
      let reach = 0;
      let ok = true;
      for (const c of t) {
        if (g[c]) continue;
        const m = free[c] & need;
        if (!m) {
          ok = false;
          break;
        }
        reach |= m;
      }
      if (ok && reach === need) {
        fits = true;
        allow |= need;
      }
    }
    if (!fits) return false;
    for (const c of t) if (!g[c]) free[c] &= allow;
  }
  return true;
}

/* ---- dots and marks between two cells ---- */

export const DOT_MARKS = ["white", "black"];
export const XV_MARKS = ["x", "v"];

// Whether digits a and b may sit either side of a mark.
const KEEPS = {
  white: (a, b) => Math.abs(a - b) === 1,
  black: (a, b) => a === 2 * b || b === 2 * a,
  x: (a, b) => a + b === 10,
  v: (a, b) => a + b === 5,
};
export const markKeeps = (mark, a, b) => KEEPS[mark](a, b);

// ACROSS[mark][m]: the digits that may sit across the mark from some digit
// in m.
const ACROSS = {};
for (const [mark, keeps] of Object.entries(KEEPS)) {
  ACROSS[mark] = new Int32Array(1024);
  for (let m = 2; m < 1024; m += 2) {
    for (let d = 1; d <= 9; d++) {
      if (!(m & (1 << d))) continue;
      for (let e = 1; e <= 9; e++) if (keeps(d, e)) ACROSS[mark][m] |= 1 << e;
    }
  }
}

// Whether cell a comes just before cell b along a row or a column: the two
// share a side.
export const beside = (a, b) => (b === a + 1 && ROW[a] === ROW[b]) || b === a + 9;

// Whether dots or XV marks are well formed: each on the side two cells
// share, the first cell first, a mark of `marks`, no side twice. null if so,
// or what is wrong: { why, at }.
function edgeProblem(edges, marks) {
  const seen = new Set();
  for (let i = 0; i < edges.length; i++) {
    const cells = edges[i]?.cells;
    if (!Array.isArray(cells) || cells.length !== 2 || !cells.every((c) => Number.isInteger(c) && c >= 0 && c <= 80)) return { why: "cell", at: i };
    const [a, b] = cells;
    if (!beside(a, b)) return { why: "apart", at: i };
    if (!marks.includes(edges[i].mark)) return { why: "mark", at: i };
    if (seen.has(a * 81 + b)) return { why: "twice", at: i };
    seen.add(a * 81 + b);
  }
  return null;
}

export const dotProblem = (dots) => edgeProblem(dots, DOT_MARKS);
export const xvProblem = (xvs) => edgeProblem(xvs, XV_MARKS);

// Narrows the two cells of each dot or mark to digits that may sit across
// it from one the other cell can be. Placed digits count as masks of one,
// and `free` is narrowed in place, as in thermoBounds; false if a pair
// cannot be filled, or its placed digits break the mark.
function edgeBounds(edges, g, free) {
  for (const { cells, mark } of edges) {
    const [a, b] = cells;
    const ma = (g[a] ? 1 << g[a] : free[a]) & ACROSS[mark][g[b] ? 1 << g[b] : free[b]];
    if (!ma) return false;
    const mb = (g[b] ? 1 << g[b] : free[b]) & ACROSS[mark][ma];
    if (!mb) return false;
    if (!g[a]) free[a] = ma;
    if (!g[b]) free[b] = mb;
  }
  return true;
}

/* ---- clues outside the grid ---- */

// A Sandwich clue's row or column: its cells, from the clue's side.
export const SANDWICH_LINES = [
  ...[...Array(9).keys()].map((r) => [...Array(9).keys()].map((c) => cellAt(r, c))),
  ...[...Array(9).keys()].map((c) => [...Array(9).keys()].map((r) => cellAt(r, c))),
];
// The most the digits 2 to 8 add up to.
export const SANDWICH_MAX = 35;

// Whether Sandwich clues are well formed: a line and a sum 0 to 35 each, no
// line twice. null if so, or what is wrong: { why, at }.
export function sandwichProblem(sandwiches) {
  const seen = new Set();
  for (let i = 0; i < sandwiches.length; i++) {
    const { line, sum } = sandwiches[i] ?? {};
    if (!Number.isInteger(line) || line < 0 || line > 17) return { why: "line", at: i };
    if (!Number.isInteger(sum) || sum < 0 || sum > SANDWICH_MAX) return { why: "sum", at: i };
    if (seen.has(line)) return { why: "twice", at: i };
    seen.add(line);
  }
  return null;
}

// The diagonal from row r, column c, stepping dr and dc, to the far edge;
// empty if (r, c) is off the board.
export function diagonalFrom(r, c, dr, dc) {
  const out = [];
  for (; r >= 0 && r < 9 && c >= 0 && c < 9; r += dr, c += dc) out.push(cellAt(r, c));
  return out;
}

// Whether Little Killer clues are well formed: each a whole diagonal of two
// cells or more, from an edge of the board to the far one, a sum its cells
// could make, and no two from the same cell the same way. null if so, or
// what is wrong: { why, at }.
export function littleProblem(littles) {
  const seen = new Set();
  for (let i = 0; i < littles.length; i++) {
    const { cells, sum } = littles[i] ?? {};
    if (!Array.isArray(cells) || cells.length < 2 || !cells.every((c) => Number.isInteger(c) && c >= 0 && c <= 80)) return { why: "cell", at: i };
    const dr = ROW[cells[1]] - ROW[cells[0]];
    const dc = COL[cells[1]] - COL[cells[0]];
    const whole = diagonalFrom(ROW[cells[0]], COL[cells[0]], dr, dc);
    const fromEdge = !diagonalFrom(ROW[cells[0]] - dr, COL[cells[0]] - dc, dr, dc).length;
    if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1 || !fromEdge || whole.join() !== cells.join()) return { why: "diagonal", at: i };
    if (!Number.isInteger(sum) || sum < cells.length || sum > 9 * cells.length) return { why: "sum", at: i };
    const key = `${cells[0]},${cells[1]}`;
    if (seen.has(key)) return { why: "twice", at: i };
    seen.add(key);
  }
  return null;
}

// The digits 2 to 8, which a sandwich's filling is made of, and MIDDLE[k][s]:
// every set of k of them adding up to s.
const INNER = ALL & ~(1 << 1) & ~(1 << 9);
const MIDDLE = COMBOS.map((row) => row.map((sets) => sets.filter((m) => !(m & ~INNER))));

// Narrows each Sandwich clue's line to the ways it could still go: for each
// place its 1 and its 9 could take, whether the cells between could add up
// to the sum with different digits 2 to 8, and if so what each cell could
// then be. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if no way is left.
function sandwichBounds(sandwiches, g, free) {
  const allow = new Int32Array(9);
  for (const { line, sum } of sandwiches) {
    const cells = SANDWICH_LINES[line];
    const m = cells.map((c) => (g[c] ? 1 << g[c] : free[c]));
    allow.fill(0);
    let fits = false;
    for (let i = 0; i < 9; i++) {
      if (!(m[i] & (1 << 1))) continue;
      for (let j = 0; j < 9; j++) {
        if (j === i || !(m[j] & (1 << 9))) continue;
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        let placed = 0;
        let rest = sum;
        let left = 0;
        let room = 0;
        let ok = true;
        for (let k = lo + 1; k < hi && ok; k++) {
          const d = g[cells[k]];
          if (!d) {
            left++;
            room |= m[k];
          } else if (INNER & ~placed & (1 << d)) {
            placed |= 1 << d;
            rest -= d;
          } else ok = false;
        }
        if (!ok || rest < 0) continue;
        let inner = 0;
        for (const set of MIDDLE[left][rest] ?? []) if (!(set & placed) && !(set & ~room)) inner |= set;
        if (left ? !inner : rest) continue;
        fits = true;
        for (let k = 0; k < 9; k++) {
          if (k === i) allow[k] |= 1 << 1;
          else if (k === j) allow[k] |= 1 << 9;
          else allow[k] |= k > lo && k < hi ? inner | placed : INNER;
        }
      }
    }
    if (!fits) return false;
    for (let k = 0; k < 9; k++) {
      const c = cells[k];
      if (g[c]) {
        if (!(allow[k] & (1 << g[c]))) return false;
      } else if (!(free[c] &= allow[k])) return false;
    }
  }
  return true;
}

// Squeezes each Little Killer diagonal as arrowBounds squeezes an arrow,
// with the sum for the circle: each cell between what the sum leaves once
// the others are at their most and at their least. Placed digits count as
// masks of one, and `free` is narrowed in place; false if a diagonal cannot
// add up.
function littleBounds(littles, g, free) {
  for (const { cells, sum } of littles) {
    let lo = 0;
    let hi = 0;
    for (const c of cells) {
      const m = g[c] ? 1 << g[c] : free[c];
      if (!m) return false;
      lo += LOW[m];
      hi += HIGH[m];
    }
    if (sum < lo || sum > hi) return false;
    for (const c of cells) {
      if (g[c]) continue;
      const m = free[c] & between(sum - (hi - HIGH[free[c]]), sum - (lo - LOW[free[c]]));
      if (!m) return false;
      free[c] = m;
    }
  }
  return true;
}

/* ---- candidates and solving ---- */

const norm = (v) => ({
  cages: v?.cages ?? [],
  thermos: v?.thermos ?? [],
  arrows: v?.arrows ?? [],
  whispers: v?.whispers ?? [],
  renbans: v?.renbans ?? [],
  dots: v?.dots ?? [],
  xvs: v?.xvs ?? [],
  sandwiches: v?.sandwiches ?? [],
  littles: v?.littles ?? [],
  rules: v?.rules ?? 0,
});

// What can go in each empty cell, by every cell it must differ from, its
// cage, its thermometers, arrows and other lines, its dots and marks, and
// the clues outside; 0 for a filled cell. A cage allows digits not already
// in it that some way of filling the rest of it can use.
export function variantCandidates(grid, variant) {
  const { cages, thermos, arrows, whispers, renbans, dots, xvs, sandwiches, littles, rules } = norm(variant);
  const { peers } = layout(rules);
  const allow = cages.map((cage) => {
    let used = 0;
    let rest = cage.sum;
    let left = 0;
    for (const c of cage.cells) {
      if (grid[c]) {
        used |= 1 << grid[c];
        rest -= grid[c];
      } else left++;
    }
    return cageAllows(left, rest, used) & ~used;
  });
  const of = cageOf(cages);
  const out = new Array(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL;
    for (const o of peers[c]) m &= ~(1 << grid[o]);
    if (of[c] >= 0) m &= allow[of[c]];
    out[c] = m;
  }
  thermoBounds(thermos, grid, out);
  arrowBounds(arrows, grid, out);
  whisperBounds(whispers, grid, out);
  renbanBounds(renbans, grid, out);
  edgeBounds(dots, grid, out);
  edgeBounds(xvs, grid, out);
  sandwichBounds(sandwiches, grid, out);
  littleBounds(littles, grid, out);
  return out;
}

// Depth first search. At each step every empty cell's candidates are worked
// out from its houses, the cells it must differ from, its thermometers,
// arrows and other lines, its dots and marks, the clues outside, and its
// cage, where a
// cage allows only the digit sets that make its sum and that its empty cells
// could still hold. Then a digit with one place left in a house, or one a
// cage cannot do without and only one of its cells can take, goes there;
// otherwise the search branches on the cell with the fewest candidates. A
// digit with no place left, or a cell with no candidate, ends the branch.
// `found` is called on each solution and returns true to stop.
//
// It gives up after BUDGET steps and says so, returning false: a layout
// with too much freedom can take minutes to settle. The count is the same
// everywhere, so the page and the server always agree on a puzzle.
export const BUDGET = 400000;

function search(grid, variant, found) {
  const { cages, thermos, arrows, whispers, renbans, dots, xvs, sandwiches, littles, rules } = norm(variant);
  const { houses, housesOf, pairs } = layout(rules);
  let steps = 0;
  const hm = new Int32Array(houses.length);
  const of = cageOf(cages);
  const n = cages.length;
  const used = new Int32Array(n);
  const rest = new Int32Array(n);
  const left = new Int32Array(n);
  cages.forEach((cage, i) => {
    rest[i] = cage.sum;
    left[i] = cage.cells.length;
  });
  const g = grid.slice();
  for (let c = 0; c < 81; c++) {
    const d = g[c];
    if (!d) continue;
    const bit = 1 << d;
    const k = of[c];
    let taken = k >= 0 ? used[k] : 0;
    for (const h of housesOf[c]) taken |= hm[h];
    for (const o of pairs[c]) if (o < c && g[o] === d) taken |= bit;
    if (taken & bit) return true;
    for (const h of housesOf[c]) hm[h] |= bit;
    if (k >= 0) {
      used[k] |= bit;
      rest[k] -= d;
      left[k]--;
    }
  }
  // Scratch for each depth, so a step never allocates.
  const frees = Array.from({ length: 82 }, () => new Int32Array(81));
  const allow = new Int32Array(n);
  const need = new Int32Array(n);

  // The next placement: { cell, mask } to branch on, or null on a dead end,
  // or cell -1 when the grid is full.
  const choose = (free) => {
    for (let c = 0; c < 81; c++) {
      if (g[c]) {
        free[c] = 0;
        continue;
      }
      let m = ALL;
      for (const h of housesOf[c]) m &= ~hm[h];
      for (const o of pairs[c]) if (g[o]) m &= ~(1 << g[o]);
      free[c] = m;
    }
    if (thermos.length && !thermoBounds(thermos, g, free)) return null;
    if (arrows.length && !arrowBounds(arrows, g, free)) return null;
    if (whispers.length && !whisperBounds(whispers, g, free)) return null;
    if (renbans.length && !renbanBounds(renbans, g, free)) return null;
    if (dots.length && !edgeBounds(dots, g, free)) return null;
    if (xvs.length && !edgeBounds(xvs, g, free)) return null;
    if (sandwiches.length && !sandwichBounds(sandwiches, g, free)) return null;
    if (littles.length && !littleBounds(littles, g, free)) return null;
    for (let k = 0; k < n; k++) {
      if (!left[k]) {
        if (rest[k]) return null;
        allow[k] = ALL;
        need[k] = 0;
        continue;
      }
      let room = 0;
      for (const c of cages[k].cells) if (!g[c]) room |= free[c];
      let a = 0;
      let all = ALL;
      for (const m of COMBOS[left[k]][rest[k]]) {
        if (m & used[k] || m & ~room) continue;
        a |= m;
        all &= m;
      }
      if (!a) return null;
      allow[k] = a;
      need[k] = all;
    }
    let best = -1;
    let bestCount = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      if (of[c] >= 0) free[c] &= allow[of[c]];
      const count = POP[free[c]];
      if (count === 0) return null;
      if (count < bestCount) {
        best = c;
        bestCount = count;
      }
    }
    if (best < 0) return { cell: -1, mask: 0 };
    if (bestCount === 1) return { cell: best, mask: free[best] };

    // A digit with one place in a house, or none.
    for (const { cells } of houses) {
      let once = 0;
      let twice = 0;
      let placed = 0;
      for (const c of cells) {
        if (g[c]) placed |= 1 << g[c];
        else {
          twice |= once & free[c];
          once |= free[c];
        }
      }
      if ((ALL & ~placed) & ~once) return null;
      const single = once & ~twice;
      if (single) {
        const bit = single & -single;
        for (const c of cells) if (!g[c] && free[c] & bit) return { cell: c, mask: bit };
      }
    }
    // A digit a cage must have, with one cell to take it, or none.
    for (let k = 0; k < n; k++) {
      let must = need[k] & ~used[k];
      while (must) {
        const bit = must & -must;
        must &= must - 1;
        let spot = -1;
        let count = 0;
        for (const c of cages[k].cells) {
          if (!g[c] && free[c] & bit) {
            spot = c;
            count++;
          }
        }
        if (count === 0) return null;
        if (count === 1) return { cell: spot, mask: bit };
      }
    }
    return { cell: best, mask: free[best] };
  };

  let spent = false;
  const step = (depth) => {
    if (++steps > BUDGET) {
      spent = true;
      return true;
    }
    const next = choose(frees[depth]);
    if (!next) return false;
    if (next.cell < 0) return found(g);
    const { cell, mask } = next;
    const hs = housesOf[cell];
    const k = of[cell];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (!(mask & bit)) continue;
      g[cell] = d;
      for (const h of hs) hm[h] |= bit;
      if (k >= 0) {
        used[k] |= bit;
        rest[k] -= d;
        left[k]--;
      }
      if (step(depth + 1)) return true;
      for (const h of hs) hm[h] &= ~bit;
      if (k >= 0) {
        used[k] &= ~bit;
        rest[k] += d;
        left[k]++;
      }
      g[cell] = 0;
    }
    return false;
  };
  step(0);
  return !spent;
}

// Up to `limit` of the solutions, or null if the search ran out of budget
// before it could say.
export function variantSolutions(grid, variant, limit = 2) {
  const out = [];
  const settled = search(grid, variant, (g) => {
    out.push(g.slice());
    return out.length >= limit;
  });
  return settled || out.length >= limit ? out : null;
}

export function variantSolve(grid, variant) {
  return variantSolutions(grid, variant, 1)?.[0] ?? null;
}
