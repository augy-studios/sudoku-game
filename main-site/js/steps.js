// The solver's help, worked out from a grid with no DOM: reading a pasted
// puzzle, the digits that clash, what can still go in each empty cell, and
// the next cell a person could fill just by looking, with why. Grids are as
// in sudoku.js. A set of candidates is a mask with digits as bits 1 to 9,
// the same as a cell's notes, so the board can draw one as the other.
//
// Each takes a variant, { cages, thermos, arrows, whispers, renbans, dots,
// xvs, sandwiches, littles, rules } (variant.js), as an optional last
// argument; without one the rules are the classic ones.

import { PEERS, countSolutions, findSolutions } from "./sudoku.js";
import {
  layout,
  variantCandidates,
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
  markKeeps,
  SANDWICH_LINES,
} from "./variant.js";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0b1111111110;

const DRAWN = ["cages", "thermos", "arrows", "whispers", "renbans", "dots", "xvs", "sandwiches", "littles"];
const isVariant = (v) => Boolean(v?.rules || DRAWN.some((list) => v?.[list]?.length));

// 81 cells in reading order: digits for clues, 0 or . for blanks. Anything
// else, such as spaces and grid lines, is skipped.
export function parseGrid(text) {
  const cells = String(text ?? "").replace(/[^0-9.]/g, "");
  if (cells.length !== 81) return null;
  return [...cells].map((ch) => (ch === "." ? 0 : Number(ch)));
}

// The other way: a grid as 81 characters, . for a blank, which parseGrid
// and most sudoku apps read.
export function puzzleText(grid) {
  return grid.map((d) => (d ? String(d) : ".")).join("");
}

export function bitCount(mask) {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

// Cells whose digit is also in a cell it must differ from: its row, column
// and box, and under the variant's rules its diagonal, window, a knight's
// move or a king's diagonal step away, or its cage; the digits of a cage
// that go past its sum, or that fill it to some other sum; the digits of
// a thermometer that do not rise fast enough from the bulb: two cells three
// steps apart need digits at least three apart; an arrow's digits, with
// its circle's, once they go past the circle (or past 9 with the circle
// empty), or fill the arrow to some other sum; digits next to each other on
// a German Whispers line less than 5 apart; a renban line's digits that
// repeat, or all of them once they spread wider than the line is long; and
// the two digits either side of a dot or an XV mark they break; a
// sandwich's 1, 9 and the digits between once those go past its sum, or
// fill it to some other sum; and a Little Killer diagonal's digits once
// they go past its sum, or fill it to some other sum.
export function clashes(grid, variant = null) {
  const peers = variant?.rules ? layout(variant.rules).peers : PEERS;
  const out = new Set();
  for (let c = 0; c < 81; c++) {
    if (grid[c] && peers[c].some((o) => grid[o] === grid[c])) out.add(c);
  }
  for (const { sum, cells } of variant?.cages ?? []) {
    const filled = cells.filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    const repeats = filled.filter((c) => filled.some((o) => o !== c && grid[o] === grid[c]));
    if (total > sum || (filled.length === cells.length && total !== sum)) filled.forEach((c) => out.add(c));
    repeats.forEach((c) => out.add(c));
  }
  for (const t of variant?.thermos ?? []) {
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        if (grid[t[i]] && grid[t[j]] && grid[t[j]] - grid[t[i]] < j - i) {
          out.add(t[i]);
          out.add(t[j]);
        }
      }
    }
  }
  for (const [circle, ...cells] of variant?.arrows ?? []) {
    const filled = cells.filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    const target = grid[circle] || 9;
    if (total > target || (grid[circle] && filled.length === cells.length && total !== target)) {
      filled.forEach((c) => out.add(c));
      if (grid[circle]) out.add(circle);
    }
  }
  for (const t of variant?.whispers ?? []) {
    for (let i = 1; i < t.length; i++) {
      const [a, b] = [t[i - 1], t[i]];
      if (grid[a] && grid[b] && Math.abs(grid[a] - grid[b]) < 5) {
        out.add(a);
        out.add(b);
      }
    }
  }
  for (const t of variant?.renbans ?? []) {
    const filled = t.filter((c) => grid[c]);
    const digits = filled.map((c) => grid[c]);
    if (Math.max(...digits) - Math.min(...digits) >= t.length) filled.forEach((c) => out.add(c));
    filled.filter((c) => filled.some((o) => o !== c && grid[o] === grid[c])).forEach((c) => out.add(c));
  }
  for (const { cells, mark } of [...(variant?.dots ?? []), ...(variant?.xvs ?? [])]) {
    const [a, b] = cells;
    if (grid[a] && grid[b] && !markKeeps(mark, grid[a], grid[b])) {
      out.add(a);
      out.add(b);
    }
  }
  for (const { line, sum } of variant?.sandwiches ?? []) {
    const cells = SANDWICH_LINES[line];
    const i = cells.findIndex((c) => grid[c] === 1);
    const j = cells.findIndex((c) => grid[c] === 9);
    if (i < 0 || j < 0) continue;
    const inside = cells.slice(Math.min(i, j) + 1, Math.max(i, j));
    const filled = inside.filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    if (total > sum || (filled.length === inside.length && total !== sum)) [cells[i], cells[j], ...filled].forEach((c) => out.add(c));
  }
  for (const { cells, sum } of variant?.littles ?? []) {
    const filled = cells.filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    if (total > sum || (filled.length === cells.length && total !== sum)) filled.forEach((c) => out.add(c));
  }
  return out;
}

// What can go in each empty cell, going by every cell it must differ from,
// and its cage if it has one; 0 for a filled cell.
export function candidates(grid, variant = null) {
  if (isVariant(variant)) return variantCandidates(grid, variant);
  const out = new Array(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL;
    for (const o of PEERS[c]) m &= ~(1 << grid[o]);
    out[c] = m;
  }
  return out;
}

// Every cell that can be filled by looking, in reading order and then house
// order: { c, d, kind: "single" } where only one digit fits the cell, and
// { c, d, kind: "hidden", unit } where a digit has one place left in a
// house: a row, column or box, or a variant's diagonal or window. A unit is
// { kind, index, cells }.
function* steps(grid, variant) {
  const cand = candidates(grid, variant);
  for (let c = 0; c < 81; c++) {
    if (!grid[c] && bitCount(cand[c]) === 1) yield { c, d: DIGITS.find((d) => cand[c] === 1 << d), kind: "single" };
  }
  for (const unit of layout(variant?.rules ?? 0).houses) {
    for (const d of DIGITS) {
      const bit = 1 << d;
      let spot = -1;
      let n = 0;
      for (const c of unit.cells) {
        if (grid[c] === d) {
          n = -1;
          break;
        }
        if (cand[c] & bit) {
          spot = c;
          n++;
        }
      }
      if (n === 1) yield { c: spot, d, kind: "hidden", unit };
    }
  }
}

// The next easy step, one at `prefer` if that cell has one, or null when
// nothing on the board can be filled by looking. It takes the digits on the
// board as right: with a wrong one there, a step can be wrong too.
export function nextStep(grid, prefer = null, variant = null) {
  let first = null;
  for (const step of steps(grid, variant)) {
    if (prefer == null || step.c === prefer) return step;
    first ??= step;
  }
  return first;
}

// Fewer clues than this never has one answer, in a classic puzzle.
export const MIN_CLUES = 17;

// Whether typed-in clues make a proper puzzle, with one answer:
// { ok: true, solution }, or { ok: false, why } with why "empty", "clash",
// "cages", "thermos", "arrows", "whispers", "renbans", "dots", "xvs",
// "sandwiches" or "littles" (and problem, from cageProblem, thermoProblem
// and so on),
// "few" (and n, the clues there
// are), "none", "hard" (the checker gave up), or "many" (and c, a cell two
// of the answers disagree on, and the two digits they put there). A
// variant's rules do some of the clues' work, so it has no least number of
// clues, and one with anything drawn, cages or lines or clues outside, can
// have none at all.
export function checkClues(clues, variant = null) {
  const killer = Boolean(variant?.cages?.length);
  const n = clues.filter(Boolean).length;
  if (!n && !DRAWN.some((list) => variant?.[list]?.length)) return { ok: false, why: "empty" };
  if (clashes(clues, variant).size) return { ok: false, why: "clash" };
  if (killer) {
    const problem = cageProblem(variant.cages);
    if (problem) return { ok: false, why: "cages", problem };
  } else if (!isVariant(variant) && n < MIN_CLUES) return { ok: false, why: "few", n };
  if (variant?.thermos?.length) {
    const problem = thermoProblem(variant.thermos);
    if (problem) return { ok: false, why: "thermos", problem };
  }
  if (variant?.arrows?.length) {
    const problem = arrowProblem(variant.arrows);
    if (problem) return { ok: false, why: "arrows", problem };
  }
  if (variant?.whispers?.length) {
    const problem = whisperProblem(variant.whispers);
    if (problem) return { ok: false, why: "whispers", problem };
  }
  if (variant?.renbans?.length) {
    const problem = renbanProblem(variant.renbans);
    if (problem) return { ok: false, why: "renbans", problem };
  }
  if (variant?.dots?.length) {
    const problem = dotProblem(variant.dots);
    if (problem) return { ok: false, why: "dots", problem };
  }
  if (variant?.xvs?.length) {
    const problem = xvProblem(variant.xvs);
    if (problem) return { ok: false, why: "xvs", problem };
  }
  if (variant?.sandwiches?.length) {
    const problem = sandwichProblem(variant.sandwiches);
    if (problem) return { ok: false, why: "sandwiches", problem };
  }
  if (variant?.littles?.length) {
    const problem = littleProblem(variant.littles);
    if (problem) return { ok: false, why: "littles", problem };
  }
  const found = isVariant(variant) ? variantSolutions(clues, variant, 2) : countSolutions(clues, 2) ? findSolutions(clues, 2) : [];
  if (!found) return { ok: false, why: "hard" };
  if (!found.length) return { ok: false, why: "none" };
  const [a, b] = found;
  if (!b) return { ok: true, solution: a };
  const c = a.findIndex((d, i) => d !== b[i]);
  return { ok: false, why: "many", c, digits: [a[c], b[c]].sort((x, y) => x - y) };
}

// A made puzzle's level, roughly: how many blanks it leaves, against the
// levels' own 40, 48, 52 and up to 64, and at least Hard if singles alone
// cannot finish it. Takes a puzzle with one answer.
export function rateLevel(clues, variant = null) {
  const grid = clues.slice();
  for (let step = nextStep(grid, null, variant); step; step = nextStep(grid, null, variant)) grid[step.c] = step.d;
  const blanks = clues.filter((d) => !d).length;
  // A killer, sandwich or little killer puzzle usually has few clues or
  // none, so blanks say little: what counts is how far singles get with the
  // cages and the sums.
  if (["cages", "sandwiches", "littles"].some((list) => variant?.[list]?.length)) return grid.every(Boolean) ? (blanks <= 60 ? "M" : "H") : "X";
  if (!grid.every(Boolean)) return blanks <= 50 ? "H" : "X";
  return blanks <= 44 ? "E" : blanks <= 50 ? "M" : blanks <= 56 ? "H" : "X";
}
