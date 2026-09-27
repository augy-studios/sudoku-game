// The solver's help, worked out from a grid with no DOM: reading a pasted
// puzzle, the digits that clash, what can still go in each empty cell, and
// the next cell a person could fill just by looking, with why. Grids are as
// in sudoku.js. A set of candidates is a mask with digits as bits 1 to 9,
// the same as a cell's notes, so the board can draw one as the other.

import { ROW, COL, BOX, PEERS, countSolutions, findSolutions } from "./sudoku.js";

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

// Cells whose digit is also in another cell of their row, column or box.
export function clashes(grid) {
  const out = new Set();
  for (let c = 0; c < 81; c++) {
    if (grid[c] && PEERS[c].some((o) => grid[o] === grid[c])) out.add(c);
  }
  return out;
}

// What can go in each empty cell, going by its row, column and box alone;
// 0 for a filled cell.
export function candidates(grid) {
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
function* steps(grid) {
  const cand = candidates(grid);
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
export function nextStep(grid, prefer = null) {
  let first = null;
  for (const step of steps(grid)) {
    if (prefer == null || step.c === prefer) return step;
    first ??= step;
  }
  return first;
}

// Fewer clues than this never has one answer.
export const MIN_CLUES = 17;

// Whether typed-in clues make a proper puzzle, with one answer:
// { ok: true, solution }, or { ok: false, why } with why "empty", "clash",
// "few" (and n, the clues there are), "none", or "many" (and c, a cell two
// of the answers disagree on, and the two digits they put there).
export function checkClues(clues) {
  const n = clues.filter(Boolean).length;
  if (!n) return { ok: false, why: "empty" };
  if (clashes(clues).size) return { ok: false, why: "clash" };
  if (n < MIN_CLUES) return { ok: false, why: "few", n };
  if (countSolutions(clues, 2) === 0) return { ok: false, why: "none" };
  const [a, b] = findSolutions(clues, 2);
  if (!b) return { ok: true, solution: a };
  const c = a.findIndex((d, i) => d !== b[i]);
  return { ok: false, why: "many", c, digits: [a[c], b[c]].sort((x, y) => x - y) };
}

// A made puzzle's level, roughly: how many blanks it leaves, against the
// levels' own 40, 48, 52 and up to 64, and at least Hard if singles alone
// cannot finish it. Takes a puzzle with one answer.
export function rateLevel(clues) {
  const grid = clues.slice();
  for (let step = nextStep(grid); step; step = nextStep(grid)) grid[step.c] = step.d;
  const blanks = clues.filter((d) => !d).length;
  if (!grid.every(Boolean)) return blanks <= 50 ? "H" : "X";
  return blanks <= 44 ? "E" : blanks <= 50 ? "M" : blanks <= 56 ? "H" : "X";
}
