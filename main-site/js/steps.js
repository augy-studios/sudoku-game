// The solver's help, worked out from a grid with no DOM: reading a pasted
// puzzle, the digits that clash, what can still go in each empty cell, and
// the next cell a person could fill just by looking, with why. Grids are as
// in sudoku.js. A set of candidates is a mask with digits as bits 1 to 9,
// the same as a cell's notes, so the board can draw one as the other.
//
// Each takes a variant, { cages, thermos, arrows, whispers, renbans,
// palindromes, zippers, betweens, lockouts, entropics, modulars, dots, xvs,
// sandwiches, littles, skyscrapers, xsums, regions, rules }
// (variant.js), as an optional last argument; without one the rules are the
// classic ones.

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
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  entropicProblem,
  modularProblem,
  ENTROPIC_KINDS,
  MODULAR_KINDS,
  betweenInside,
  lockoutOutside,
  dotProblem,
  xvProblem,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  regionProblem,
  markKeeps,
  barredSides,
  seen,
  SANDWICH_LINES,
  VIEWS,
} from "./variant.js";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0b1111111110;

const DRAWN = ["cages", "thermos", "arrows", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "entropics", "modulars", "dots", "xvs", "sandwiches", "littles", "skyscrapers", "xsums"];
// A Jigsaw's regions, or null; a seed without them reads them as empty.
const regionsOf = (v) => (v?.regions?.length ? v.regions : null);
const isVariant = (v) => Boolean(v?.rules || regionsOf(v) || DRAWN.some((list) => v?.[list]?.length));
// The cells each cell must differ from: its row, column and box, or under a
// variant its region and the rules' too.
const peersOf = (v) => (v?.rules || regionsOf(v) ? layout(v.rules ?? 0, regionsOf(v)).peers : PEERS);

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
// and box, or a Jigsaw's region, and under the variant's rules its
// diagonal, window, a knight's
// move or a king's diagonal step away, or its cage; the digits of a cage
// that go past its sum, or that fill it to some other sum; the digits of
// a thermometer that do not rise fast enough from the bulb: two cells three
// steps apart need digits at least three apart; an arrow's digits, with
// its circle's, once they go past the circle (or past 9 with the circle
// empty), or fill the arrow to some other sum; digits next to each other on
// a German Whispers line less than 5 apart; a renban line's digits that
// repeat, or all of them once they spread wider than the line is long; two
// digits the same way in from either end of a palindrome line that differ;
// a zipper line's pairs that make a total other than its middle digit, or
// with no middle digit yet, every pair once two make different totals, or
// a total past 9 where there is a middle cell; a between line's digits not
// strictly between its circles', and a lockout line's not outside its
// diamonds', with the ends, and ends that cannot be; a digit on either the
// same as a filled end's; two digits on an entropic or a modular line of
// one kind where their places differ, or of different kinds where their
// places are the same, counted in threes;
// the two digits either side of a dot or an XV mark they break, or of a
// side Anti-consecutive, Strict Kropki or Strict XV bars them from; a
// sandwich's 1, 9 and the digits between once those go past its sum, or
// fill it to some other sum; a Little Killer diagonal's digits once they go
// past its sum, or fill it to some other sum; the digits of a Skyscraper
// view, from the clue on, once more can be seen than it counts, or once
// they reach its 9 and some other number can; and an X-Sum's first X
// digits once they go past its sum, or fill it to some other.
export function clashes(grid, variant = null) {
  const peers = peersOf(variant);
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
  for (const t of variant?.palindromes ?? []) {
    for (let i = 0, j = t.length - 1; i < j; i++, j--) {
      if (grid[t[i]] && grid[t[j]] && grid[t[i]] !== grid[t[j]]) {
        out.add(t[i]);
        out.add(t[j]);
      }
    }
  }
  for (const t of variant?.zippers ?? []) {
    const n = t.length;
    const mid = n % 2 ? t[(n - 1) / 2] : -1;
    const pairs = [];
    for (let i = 0, j = n - 1; i < j; i++, j--) if (grid[t[i]] && grid[t[j]]) pairs.push([t[i], t[j]]);
    const total = ([a, b]) => grid[a] + grid[b];
    const target = mid >= 0 ? grid[mid] : 0;
    let off;
    if (target) off = pairs.filter((p) => total(p) !== target);
    else if (pairs.some((p) => total(p) !== total(pairs[0]))) off = pairs;
    else off = mid >= 0 ? pairs.filter((p) => total(p) > 9) : [];
    off.flat().forEach((c) => out.add(c));
    if (off.length && target) out.add(mid);
  }
  for (const [list, inside] of [
    ["betweens", betweenInside],
    ["lockouts", lockoutOutside],
  ]) {
    for (const t of variant?.[list] ?? []) {
      const [a, b] = [t[0], t.at(-1)];
      const filled = t.slice(1, -1).filter((c) => grid[c]);
      if (grid[a] && grid[b]) {
        const m = inside(grid[a], grid[b]);
        const off = m < 0 ? [] : filled.filter((c) => !(m & (1 << grid[c])));
        if (m < 0 || (!m && t.length > 2) || off.length) [a, b, ...off].forEach((c) => out.add(c));
      }
      for (const end of [a, b]) {
        const same = filled.filter((c) => grid[end] && grid[c] === grid[end]);
        if (same.length) [end, ...same].forEach((c) => out.add(c));
      }
    }
  }
  for (const [list, kinds] of [
    ["entropics", ENTROPIC_KINDS],
    ["modulars", MODULAR_KINDS],
  ]) {
    const kind = (d) => kinds.findIndex((m) => m & (1 << d));
    for (const t of variant?.[list] ?? []) {
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          const [a, b] = [t[i], t[j]];
          if (grid[a] && grid[b] && (kind(grid[a]) === kind(grid[b])) !== ((j - i) % 3 === 0)) {
            out.add(a);
            out.add(b);
          }
        }
      }
    }
  }
  for (const { cells, mark } of [...(variant?.dots ?? []), ...(variant?.xvs ?? [])]) {
    const [a, b] = cells;
    if (grid[a] && grid[b] && !markKeeps(mark, grid[a], grid[b])) {
      out.add(a);
      out.add(b);
    }
  }
  for (const { cells, marks } of barredSides(variant?.rules, variant?.dots, variant?.xvs)) {
    const [a, b] = cells;
    if (grid[a] && grid[b] && marks.some((mark) => markKeeps(mark, grid[a], grid[b]))) {
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
  for (const { view, count } of variant?.skyscrapers ?? []) {
    const cells = VIEWS[view];
    // The digits from the clue on, up to the first gap.
    const gap = cells.findIndex((c) => !grid[c]);
    const run = gap < 0 ? cells : cells.slice(0, gap);
    const digits = run.map((c) => grid[c]);
    const shown = seen(digits);
    if (shown > count || (digits.includes(9) && shown !== count)) run.forEach((c) => out.add(c));
  }
  for (const { view, sum } of variant?.xsums ?? []) {
    const cells = VIEWS[view];
    const x = grid[cells[0]];
    if (!x) continue;
    const filled = cells.slice(0, x).filter((c) => grid[c]);
    const total = filled.reduce((t, c) => t + grid[c], 0);
    if (total > sum || (filled.length === x && total !== sum)) filled.forEach((c) => out.add(c));
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
// house: a row, column or box, a Jigsaw's region, or a variant's diagonal
// or window. A unit is
// { kind, index, cells }.
function* steps(grid, variant) {
  const cand = candidates(grid, variant);
  for (let c = 0; c < 81; c++) {
    if (!grid[c] && bitCount(cand[c]) === 1) yield { c, d: DIGITS.find((d) => cand[c] === 1 << d), kind: "single" };
  }
  for (const unit of layout(variant?.rules ?? 0, regionsOf(variant)).houses) {
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
// "cages", "thermos", "arrows", "whispers", "renbans", "palindromes",
// "zippers", "betweens", "lockouts", "entropics", "modulars", "dots", "xvs",
// "sandwiches", "littles", "skyscrapers", "xsums" or "regions" (and
// problem, from cageProblem, thermoProblem and so on),
// "few" (and n, the clues there
// are), "none", "hard" (the checker gave up), or "many" (and c, a cell two
// of the answers disagree on, and the two digits they put there). A
// variant's rules do some of the clues' work, so it has no least number of
// clues, and one with anything drawn, cages or lines or clues outside, can
// have none at all.
export function checkClues(clues, variant = null) {
  const killer = Boolean(variant?.cages?.length);
  const n = clues.filter(Boolean).length;
  // A Jigsaw's regions first: until they are nine of nine, nothing else
  // about the puzzle means much.
  const regionsWrong = regionsOf(variant) && regionProblem(variant.regions);
  if (regionsWrong) return { ok: false, why: "regions", problem: regionsWrong };
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
  if (variant?.palindromes?.length) {
    const problem = palindromeProblem(variant.palindromes);
    if (problem) return { ok: false, why: "palindromes", problem };
  }
  for (const [list, lineProblem] of [
    ["zippers", zipperProblem],
    ["betweens", betweenProblem],
    ["lockouts", lockoutProblem],
    ["entropics", entropicProblem],
    ["modulars", modularProblem],
  ]) {
    const problem = variant?.[list]?.length && lineProblem(variant[list]);
    if (problem) return { ok: false, why: list, problem };
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
  if (variant?.skyscrapers?.length) {
    const problem = skyscraperProblem(variant.skyscrapers);
    if (problem) return { ok: false, why: "skyscrapers", problem };
  }
  if (variant?.xsums?.length) {
    const problem = xsumProblem(variant.xsums);
    if (problem) return { ok: false, why: "xsums", problem };
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
  // A killer puzzle, or one with clues outside the grid, usually has few
  // clues or none, so blanks say little: what counts is how far singles get
  // with the cages and the sums.
  if (["cages", "sandwiches", "littles", "skyscrapers", "xsums"].some((list) => variant?.[list]?.length)) return grid.every(Boolean) ? (blanks <= 60 ? "M" : "H") : "X";
  if (!grid.every(Boolean)) return blanks <= 50 ? "H" : "X";
  return blanks <= 44 ? "E" : blanks <= 50 ? "M" : blanks <= 56 ? "H" : "X";
}
