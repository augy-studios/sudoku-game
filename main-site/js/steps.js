// The solver's help, worked out from a grid with no DOM: reading a pasted
// puzzle, the digits that clash, what can still go in each empty cell, and
// the next cell a person could fill just by looking, with why. Grids are as
// in sudoku.js. A set of candidates is a mask with digits as bits 1 to 9,
// the same as a cell's notes, so the board can draw one as the other.
//
// Each takes the killer puzzle's cages as an optional last argument (see
// killer.js); without them the rules are the classic ones.

import { ROW, COL, BOX, PEERS, countSolutions, findSolutions } from "./sudoku.js";
import { killerCandidates, killerSolutions, cageProblem } from "./killer.js";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0b1111111110;

// The 27 units: the rows, then the columns, then the boxes.
export const UNITS = [];
for (const [kind, of] of [["row", ROW], ["column", COL], ["box", BOX]]) {
  for (let index = 0; index < 9; index++) {
    const cells = [];
    for (let c = 0; c < 81; c++) if (of[c] === index) cells.push(c);
    UNITS.push({ kind, index, cells });
  }
}

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

// Cells whose digit is also in another cell of their row, column or box,
// or of their cage; and the digits of a cage that go past its sum, or that
// fill it to some other sum.
export function clashes(grid, cages = null) {
  const out = new Set();
  for (let c = 0; c < 81; c++) {
    if (grid[c] && PEERS[c].some((o) => grid[o] === grid[c])) out.add(c);
  }
  for (const { sum, cells } of cages ?? []) {
    const filled = cells.filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    const repeats = filled.filter((c) => filled.some((o) => o !== c && grid[o] === grid[c]));
    if (total > sum || (filled.length === cells.length && total !== sum)) filled.forEach((c) => out.add(c));
    repeats.forEach((c) => out.add(c));
  }
  return out;
}

// What can go in each empty cell, going by its row, column and box, and its
// cage if it has one; 0 for a filled cell.
export function candidates(grid, cages = null) {
  if (cages?.length) return killerCandidates(grid, cages);
  const out = new Array(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL;
    for (const o of PEERS[c]) m &= ~(1 << grid[o]);
    out[c] = m;
  }
  return out;
}

// Every cell that can be filled by looking, in reading order and then unit
// order: { c, d, kind: "single" } where only one digit fits the cell, and
// { c, d, kind: "hidden", unit } where a digit has one place left in a unit.
function* steps(grid, cages) {
  const cand = candidates(grid, cages);
  for (let c = 0; c < 81; c++) {
    if (!grid[c] && bitCount(cand[c]) === 1) yield { c, d: DIGITS.find((d) => cand[c] === 1 << d), kind: "single" };
  }
  for (const unit of UNITS) {
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
export function nextStep(grid, prefer = null, cages = null) {
  let first = null;
  for (const step of steps(grid, cages)) {
    if (prefer == null || step.c === prefer) return step;
    first ??= step;
  }
  return first;
}

// Fewer clues than this never has one answer.
export const MIN_CLUES = 17;

// Whether typed-in clues make a proper puzzle, with one answer:
// { ok: true, solution }, or { ok: false, why } with why "empty", "clash",
// "cages" (and problem, from cageProblem), "few" (and n, the clues there
// are), "none", "hard" (the checker gave up), or "many" (and c, a cell two
// of the answers disagree on, and the two digits they put there). A killer
// puzzle needs no clues: its cages can be enough.
export function checkClues(clues, cages = null) {
  const killer = Boolean(cages?.length);
  const n = clues.filter(Boolean).length;
  if (!n && !killer) return { ok: false, why: "empty" };
  if (clashes(clues, cages).size) return { ok: false, why: "clash" };
  if (killer) {
    const problem = cageProblem(cages);
    if (problem) return { ok: false, why: "cages", problem };
  } else if (n < MIN_CLUES) return { ok: false, why: "few", n };
  const found = killer ? killerSolutions(clues, cages, 2) : countSolutions(clues, 2) ? findSolutions(clues, 2) : [];
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
export function rateLevel(clues, cages = null) {
  const grid = clues.slice();
  for (let step = nextStep(grid, null, cages); step; step = nextStep(grid, null, cages)) grid[step.c] = step.d;
  const blanks = clues.filter((d) => !d).length;
  // A killer puzzle usually has few clues or none, so blanks say little:
  // what counts is how far singles get with the cages.
  if (cages?.length) return grid.every(Boolean) ? (blanks <= 60 ? "M" : "H") : "X";
  if (!grid.every(Boolean)) return blanks <= 50 ? "H" : "X";
  return blanks <= 44 ? "E" : blanks <= 50 ? "M" : blanks <= 56 ? "H" : "X";
}
