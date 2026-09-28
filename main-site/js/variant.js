// Variant sudoku: the classic rules with more on top. Pure, with no DOM, and
// the API imports it too, to work out a made variant puzzle's answer.
//
// A variant is { cages, thermos, arrows, whispers, renbans, palindromes,
// zippers, betweens, lockouts, dots, xvs, sandwiches, littles, skyscrapers,
// xsums, regions, rules }:
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
//   palindromes  palindrome lines, paths like a thermometer's: a line's
//            digits read the same from either end, so cells the same way
//            in from each end hold the same digit. They may share cells.
//   zippers  zipper lines, paths like a thermometer's: each two cells the
//            same way in from either end add up to the same total, and on a
//            line with a middle cell, that cell's digit is the total. They
//            may share cells.
//   betweens between lines, paths like a thermometer's with a circle at
//            each end: the digits along the line, the ends left out, lie
//            strictly between the two circles' digits. They may share cells.
//   lockouts lockout lines, paths like a thermometer's with a diamond at
//            each end: the diamonds' digits differ by at least LOCKOUT_GAP,
//            and the digits along the line, the ends left out, lie outside
//            them, never between or equal to either. They may share cells.
//   dots    Kropki dots, [{ cells: [a, b], mark }] on the side two cells
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
//   skyscrapers  Skyscraper clues outside the grid, [{ view, count }]: view
//            a row or column seen from one side (VIEWS below). Reading from
//            that side, count digits are each taller than every one before.
//   xsums    X-Sum clues outside the grid, [{ view, sum }]: the first digit
//            from that side, X, and the X digits from there, it included,
//            add up to the sum.
//   regions  a Jigsaw puzzle's regions in place of the 3x3 boxes: for each
//            cell, 0 to 8, which region it is in. Each region is nine cells
//            joined edge to edge, and holds 1 to 9.
//   rules    switches, as bits (RULES below): Diagonal, both long
//            diagonals hold 1 to 9; Anti-knight, cells a knight's move apart
//            differ; Anti-king, cells touching at a corner differ; Windoku,
//            four more 3x3 windows hold 1 to 9; Disjoint Groups, the cells
//            in the same place in each 3x3 box hold 1 to 9; Anti-consecutive,
//            cells sharing a side never hold consecutive digits; Strict
//            Kropki, cells sharing a side with no dot there are neither
//            consecutive nor one double the other; Strict XV, cells sharing
//            a side with no X or V there add up to neither 10 nor 5.
//
// Diagonals, windows and disjoint groups are extra houses, like rows,
// columns and boxes; the knight's and king's moves are extra pairs of cells
// that must differ. A Jigsaw's regions are houses in the boxes' place, and
// disjoint groups still go by the 3x3 boxes. The rules about sides are
// sides barred from some marks' relations (barredSides below).

import { ROW, COL, BOX } from "./sudoku.js";

const ALL = 0b1111111110;
const POP = new Uint8Array(1024);
for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);

// In the order their letters go in a seed. Once the single letters ran out,
// a rule's letter became Q and two more (seed.js).
export const RULES = [
  { key: "diagonal", bit: 1, letter: "D", name: "Diagonal" },
  { key: "antiknight", bit: 2, letter: "N", name: "Anti-knight" },
  { key: "antiking", bit: 4, letter: "G", name: "Anti-king" },
  { key: "windoku", bit: 8, letter: "W", name: "Windoku" },
  { key: "disjoint", bit: 16, letter: "QDG", name: "Disjoint Groups" },
  { key: "anticonsecutive", bit: 32, letter: "QAC", name: "Anti-consecutive" },
  { key: "strictkropki", bit: 64, letter: "QSK", name: "Strict Kropki" },
  { key: "strictxv", bit: 128, letter: "QSX", name: "Strict XV" },
];
export const ALL_RULES = RULES.reduce((m, r) => m | r.bit, 0);
const has = (rules, key) => Boolean(rules & RULES.find((r) => r.key === key).bit);

// The rules' names, for a label: "Killer, Thermo, Diagonal".
export function variantName({ cages, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, dots, xvs, sandwiches, littles, skyscrapers, xsums, regions, rules } = {}) {
  const names = RULES.filter((r) => rules & r.bit).map((r) => r.name);
  if (regions?.length) names.unshift("Jigsaw");
  if (xsums?.length) names.unshift("X-Sums");
  if (skyscrapers?.length) names.unshift("Skyscrapers");
  if (littles?.length) names.unshift("Little Killer");
  if (sandwiches?.length) names.unshift("Sandwich");
  if (xvs?.length) names.unshift("XV");
  if (dots?.length) names.unshift("Kropki");
  if (lockouts?.length) names.unshift("Lockout");
  if (betweens?.length) names.unshift("Between");
  if (zippers?.length) names.unshift("Zipper");
  if (palindromes?.length) names.unshift("Palindrome");
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
// them; with a Jigsaw's `regions`, regions in the boxes' place.
const layouts = new Map();

export function layout(rules = 0, regions = null) {
  const key = `${rules}|${regions ? regions.join("") : ""}`;
  if (layouts.has(key)) return layouts.get(key);
  const houses = [];
  for (const [kind, of] of [["row", ROW], ["column", COL], regions ? ["region", regions] : ["box", BOX]]) {
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
  // Group i: the i-th cell, in reading order, of every 3x3 box.
  if (has(rules, "disjoint")) {
    for (let index = 0; index < 9; index++) {
      const [r, c] = [Math.floor(index / 3), index % 3];
      houses.push({ kind: "group", index, cells: [...Array(9).keys()].map((b) => cellAt(Math.floor(b / 3) * 3 + r, (b % 3) * 3 + c)) });
    }
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
  layouts.set(key, out);
  // A maker trying one region after another makes a new layout each time.
  if (layouts.size > 64) layouts.delete(layouts.keys().next().value);
  return out;
}

/* ---- a Jigsaw's regions ---- */

// Whether regions are well formed: a region 0 to 8 for each cell, each
// region nine cells, joined edge to edge. null if so, or what is wrong:
// { why, region, size }.
export function regionProblem(regions) {
  if (!Array.isArray(regions) || regions.length !== 81 || !regions.every((r) => Number.isInteger(r) && r >= 0 && r <= 8)) return { why: "cell", region: -1 };
  for (let region = 0; region < 9; region++) {
    const cells = [...Array(81).keys()].filter((c) => regions[c] === region);
    if (cells.length !== 9) return { why: "size", region, size: cells.length };
    if (!joined(cells)) return { why: "apart", region };
  }
  return null;
}

// Regions numbered in order of their first cell, the same regions however
// they were numbered before.
export function sortRegions(regions) {
  const order = [];
  for (const r of regions) if (!order.includes(r)) order.push(r);
  return regions.map((r) => order.indexOf(r));
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
export const palindromeProblem = lineProblem;
export const zipperProblem = lineProblem;
export const betweenProblem = lineProblem;
export const lockoutProblem = lineProblem;

// How far apart a lockout line's diamonds are at least, as most puzzles
// have it.
export const LOCKOUT_GAP = 4;

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

// Narrows each pair of cells the same way in from either end of a
// palindrome line to the digits both can be; a line's middle cell, if it has
// one, is free. Placed digits count as masks of one, and `free` is narrowed
// in place, as in thermoBounds; false if a pair has no digit in common.
function palindromeBounds(palindromes, g, free) {
  for (const t of palindromes) {
    for (let i = 0, j = t.length - 1; i < j; i++, j--) {
      const [a, b] = [t[i], t[j]];
      const m = (g[a] ? 1 << g[a] : free[a]) & (g[b] ? 1 << g[b] : free[b]);
      if (!m) return false;
      if (!g[a]) free[a] = m;
      if (!g[b]) free[b] = m;
    }
  }
  return true;
}

// The totals a digit of ma and a digit of mb can make, as a mask with bit s
// for a total of s, 2 to 18.
function pairTotals(ma, mb) {
  let out = 0;
  for (let d = 1; d <= 9; d++) if (ma & (1 << d)) out |= mb << d;
  return out;
}

// The digits of ma that make one of `totals` with some digit of mb.
function totalPartners(ma, mb, totals) {
  let out = 0;
  for (let d = 1; d <= 9; d++) if (ma & (1 << d) && (mb << d) & totals) out |= 1 << d;
  return out;
}

// Narrows each zipper line to the totals it could still have: those every
// pair of cells the same way in from either end can make, and on a line with
// a middle cell, that cell's digits. Each cell of a pair then keeps the
// digits that make one of them with a digit its partner can be, and the
// middle cell the totals. Placed digits count as masks of one, and `free` is
// narrowed in place, as in thermoBounds; false if no total is left.
function zipperBounds(zippers, g, free) {
  for (const t of zippers) {
    const n = t.length;
    const mid = n % 2 ? t[(n - 1) / 2] : -1;
    let totals = mid >= 0 ? (g[mid] ? 1 << g[mid] : free[mid]) : -1;
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      totals &= pairTotals(g[t[i]] ? 1 << g[t[i]] : free[t[i]], g[t[j]] ? 1 << g[t[j]] : free[t[j]]);
    }
    if (!totals) return false;
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      const [a, b] = [t[i], t[j]];
      const ma = g[a] ? 1 << g[a] : free[a];
      const mb = g[b] ? 1 << g[b] : free[b];
      if (!g[a]) free[a] = totalPartners(ma, mb, totals);
      if (!g[b]) free[b] = totalPartners(mb, ma, totals);
    }
    if (mid >= 0 && !g[mid]) free[mid] = totals;
  }
  return true;
}

// For each way the ends of a between or lockout line could be filled, what
// its other cells may hold, from inside(x, y) with x and y at the ends: a
// mask, or -1 if the ends cannot be those two at all. The ends keep the
// digits of the ways every other cell can go along with, and each other
// cell the digits those ways allow it. Placed digits count as masks of one,
// and `free` is narrowed in place, as in thermoBounds; false if no way is
// left.
const endAllow = new Int32Array(9);
function endBounds(lines, g, free, inside) {
  for (const t of lines) {
    const n = t.length;
    const [a, b] = [t[0], t[n - 1]];
    const ma = g[a] ? 1 << g[a] : free[a];
    const mb = g[b] ? 1 << g[b] : free[b];
    let na = 0;
    let nb = 0;
    endAllow.fill(0);
    for (let x = 1; x <= 9; x++) {
      if (!(ma & (1 << x))) continue;
      for (let y = 1; y <= 9; y++) {
        if (!(mb & (1 << y))) continue;
        const m = inside(x, y);
        if (m < 0) continue;
        let k = 1;
        while (k < n - 1 && (g[t[k]] ? 1 << g[t[k]] : free[t[k]]) & m) k++;
        if (k < n - 1) continue;
        na |= 1 << x;
        nb |= 1 << y;
        for (k = 1; k < n - 1; k++) endAllow[k] |= m;
      }
    }
    if (!na) return false;
    if (!g[a]) free[a] = na;
    if (!g[b]) free[b] = nb;
    for (let k = 1; k < n - 1; k++) if (!g[t[k]]) free[t[k]] &= endAllow[k];
  }
  return true;
}

// What the other cells of a between line with x and y at its ends may hold:
// the digits strictly between, none when x and y are the same or next to
// each other, so a line with cells between its ends cannot be.
export const betweenInside = (x, y) => between(Math.min(x, y) + 1, Math.max(x, y) - 1);
// The same for a lockout line: the digits outside x and y, and neither of
// them, or -1 when x and y are too close to be its ends.
export const lockoutOutside = (x, y) => (Math.abs(x - y) >= LOCKOUT_GAP ? ALL & ~between(Math.min(x, y), Math.max(x, y)) : -1);

const betweenBounds = (betweens, g, free) => endBounds(betweens, g, free, betweenInside);
const lockoutBounds = (lockouts, g, free) => endBounds(lockouts, g, free, lockoutOutside);

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

// Narrows cells a and b, either side of a side, to digits that may sit
// across it from one the other can be, by `across` as ACROSS has it. Placed
// digits count as masks of one, and `free` is narrowed in place, as in
// thermoBounds; false if the two cannot be filled, or their placed digits
// cannot sit across it.
function sideBounds(a, b, across, g, free) {
  const ma = (g[a] ? 1 << g[a] : free[a]) & across[g[b] ? 1 << g[b] : free[b]];
  if (!ma) return false;
  const mb = (g[b] ? 1 << g[b] : free[b]) & across[ma];
  if (!mb) return false;
  if (!g[a]) free[a] = ma;
  if (!g[b]) free[b] = mb;
  return true;
}

// The two cells of each dot or mark, by sideBounds.
function edgeBounds(edges, g, free) {
  for (const { cells, mark } of edges) if (!sideBounds(cells[0], cells[1], ACROSS[mark], g, free)) return false;
  return true;
}

// The sides the switch rules bar some marks' relations from, with no mark of
// their own there: every side, under Anti-consecutive, from a white dot's;
// under Strict Kropki, those with no dot, from a white and a black dot's;
// under Strict XV, those with no X or V, from an X's and a V's. [{ cells:
// [a, b], marks, across }], a before b in reading order: the digits either
// side keep none of `marks`, and across[m] is the digits that can sit across
// from some digit in m. Empty if no such rule is on.
const APART = new Map();
export function barredSides(rules = 0, dots = [], xvs = []) {
  const out = [];
  if (!(rules & (SIDE_RULES))) return out;
  const marked = (edges) => new Set(edges.map((e) => e.cells[0] * 81 + e.cells[1]));
  const dotted = marked(dots);
  const crossed = marked(xvs);
  for (let a = 0; a < 81; a++) {
    for (const b of [COL[a] < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
      if (b < 0) continue;
      const marks = new Set();
      if (has(rules, "anticonsecutive")) marks.add("white");
      if (has(rules, "strictkropki") && !dotted.has(a * 81 + b)) DOT_MARKS.forEach((m) => marks.add(m));
      if (has(rules, "strictxv") && !crossed.has(a * 81 + b)) XV_MARKS.forEach((m) => marks.add(m));
      if (!marks.size) continue;
      const key = [...marks].join();
      if (!APART.has(key)) {
        const across = new Int32Array(1024);
        for (let m = 2; m < 1024; m += 2) {
          for (let d = 1; d <= 9; d++) {
            if (!(m & (1 << d))) continue;
            for (let e = 1; e <= 9; e++) if (![...marks].some((mark) => KEEPS[mark](d, e))) across[m] |= 1 << e;
          }
        }
        APART.set(key, across);
      }
      out.push({ cells: [a, b], marks: [...marks], across: APART.get(key) });
    }
  }
  return out;
}
const SIDE_RULES = ["anticonsecutive", "strictkropki", "strictxv"].reduce((m, key) => m | RULES.find((r) => r.key === key).bit, 0);

// Each barred side's two cells, by sideBounds.
function barredBounds(sides, g, free) {
  for (const { cells, across } of sides) if (!sideBounds(cells[0], cells[1], across, g, free)) return false;
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

// A row or column seen from one side, for a Skyscraper or X-Sum clue: 0 to
// 8 each row from the left, 9 to 17 each column from the top, 18 to 26 each
// row from the right and 27 to 35 each column from the bottom. Its cells,
// nearest the clue first.
export const VIEWS = [...SANDWICH_LINES, ...SANDWICH_LINES.map((cells) => cells.slice().reverse())];

// Whether clues on views are well formed: a view and a value from `least`
// to `most` under `key` each, no view twice. null if so, or what is wrong:
// { why, at }.
function viewProblem(clues, key, least, most) {
  const seen = new Set();
  for (let i = 0; i < clues.length; i++) {
    const { view, [key]: value } = clues[i] ?? {};
    if (!Number.isInteger(view) || view < 0 || view >= VIEWS.length) return { why: "view", at: i };
    if (!Number.isInteger(value) || value < least || value > most) return { why: key, at: i };
    if (seen.has(view)) return { why: "twice", at: i };
    seen.add(view);
  }
  return null;
}

export const skyscraperProblem = (skyscrapers) => viewProblem(skyscrapers, "count", 1, 9);
export const xsumProblem = (xsums) => viewProblem(xsums, "sum", 1, 45);

// How many digits of a line, read from its first, are taller than every
// one before them: as many as a Skyscraper clue there would count.
export function seen(digits) {
  let count = 0;
  let top = 0;
  for (const d of digits) {
    if (d > top) {
      count++;
      top = d;
    }
  }
  return count;
}

// Narrows each Skyscraper clue's view. The cell k places from the clue is
// no taller than 10 - count + k, or too few could be seen past it; a count
// of 1 is the 9 first. Then, over the digits already placed from the clue
// on: no more seen than the count, and enough taller digits left for the
// rest, with the 9 always seen; once one short, the next cell cannot be
// seen unless it is the 9. Placed digits count as masks of one, and `free`
// is narrowed in place, as in thermoBounds; false if the view cannot be.
function skyscraperBounds(skyscrapers, g, free) {
  for (const { view, count } of skyscrapers) {
    const cells = VIEWS[view];
    for (let k = 0; k < 9; k++) {
      const m = BELOW[Math.min(10, 11 - count + k)] & (count === 1 && k === 0 ? 1 << 9 : ALL);
      const c = cells[k];
      if (g[c]) {
        if (!(m & (1 << g[c]))) return false;
      } else if (!(free[c] &= m)) return false;
    }
    let shown = 0;
    let top = 0;
    let k = 0;
    for (; k < 9 && g[cells[k]]; k++) {
      if (g[cells[k]] > top) {
        top = g[cells[k]];
        shown++;
      }
    }
    if (top === 9 ? shown !== count : shown >= count || shown + 9 - top < count) return false;
    if (k < 9 && shown === count - 1 && !(free[cells[k]] &= BELOW[top + 1] | (1 << 9))) return false;
  }
  return true;
}

// Narrows each X-Sum clue's view, as sandwichBounds does a sandwich: for
// each digit X its first cell could be, whether the X - 1 cells after it
// could add up to what X leaves of the sum with different digits, and if so
// what each could then be. Placed digits count as masks of one, and `free`
// is narrowed in place; false if no X is left.
function xsumBounds(xsums, g, free) {
  const allow = new Int32Array(9);
  for (const { view, sum } of xsums) {
    const cells = VIEWS[view];
    const m = cells.map((c) => (g[c] ? 1 << g[c] : free[c]));
    allow.fill(0);
    let fits = false;
    for (let x = 1; x <= 9; x++) {
      if (!(m[0] & (1 << x))) continue;
      let placed = 1 << x;
      let rest = sum - x;
      let left = 0;
      let room = 0;
      let ok = true;
      for (let k = 1; k < x && ok; k++) {
        const d = g[cells[k]];
        if (!d) {
          left++;
          room |= m[k];
        } else if (placed & (1 << d)) ok = false;
        else {
          placed |= 1 << d;
          rest -= d;
        }
      }
      if (!ok || rest < 0) continue;
      let inner = 0;
      for (const set of COMBOS[left][rest] ?? []) if (!(set & placed) && !(set & ~room)) inner |= set;
      if (left ? !inner : rest) continue;
      fits = true;
      allow[0] |= 1 << x;
      // placed holds X too, to keep it out of the sets; the cells after it
      // hold the rest.
      for (let k = 1; k < 9; k++) allow[k] |= k < x ? inner | (placed & ~(1 << x)) : ALL;
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
  palindromes: v?.palindromes ?? [],
  zippers: v?.zippers ?? [],
  betweens: v?.betweens ?? [],
  lockouts: v?.lockouts ?? [],
  dots: v?.dots ?? [],
  xvs: v?.xvs ?? [],
  sandwiches: v?.sandwiches ?? [],
  littles: v?.littles ?? [],
  skyscrapers: v?.skyscrapers ?? [],
  xsums: v?.xsums ?? [],
  regions: v?.regions?.length ? v.regions : null,
  rules: v?.rules ?? 0,
});

// What can go in each empty cell, by every cell it must differ from, its
// cage, its thermometers, arrows and other lines, its dots and marks, and
// the clues outside; 0 for a filled cell. A cage allows digits not already
// in it that some way of filling the rest of it can use.
export function variantCandidates(grid, variant) {
  const { cages, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, dots, xvs, sandwiches, littles, skyscrapers, xsums, regions, rules } = norm(variant);
  const { peers } = layout(rules, regions);
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
  palindromeBounds(palindromes, grid, out);
  zipperBounds(zippers, grid, out);
  betweenBounds(betweens, grid, out);
  lockoutBounds(lockouts, grid, out);
  edgeBounds(dots, grid, out);
  edgeBounds(xvs, grid, out);
  barredBounds(barredSides(rules, dots, xvs), grid, out);
  sandwichBounds(sandwiches, grid, out);
  littleBounds(littles, grid, out);
  skyscraperBounds(skyscrapers, grid, out);
  xsumBounds(xsums, grid, out);
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
  const { cages, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, dots, xvs, sandwiches, littles, skyscrapers, xsums, regions, rules } = norm(variant);
  const { houses, housesOf, pairs } = layout(rules, regions);
  const barred = barredSides(rules, dots, xvs);
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
    if (palindromes.length && !palindromeBounds(palindromes, g, free)) return null;
    if (zippers.length && !zipperBounds(zippers, g, free)) return null;
    if (betweens.length && !betweenBounds(betweens, g, free)) return null;
    if (lockouts.length && !lockoutBounds(lockouts, g, free)) return null;
    if (dots.length && !edgeBounds(dots, g, free)) return null;
    if (xvs.length && !edgeBounds(xvs, g, free)) return null;
    if (barred.length && !barredBounds(barred, g, free)) return null;
    if (sandwiches.length && !sandwichBounds(sandwiches, g, free)) return null;
    if (littles.length && !littleBounds(littles, g, free)) return null;
    if (skyscrapers.length && !skyscraperBounds(skyscrapers, g, free)) return null;
    if (xsums.length && !xsumBounds(xsums, g, free)) return null;
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
