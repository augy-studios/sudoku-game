// The solver's help, worked out from a grid with no DOM: reading a pasted
// puzzle, the digits that clash, what can still go in each empty cell, and
// the next cell a person could fill just by looking, with why. Grids are as
// in sudoku.js. A set of candidates is a mask with digits as bits 1 to 9,
// the same as a cell's notes, so the board can draw one as the other.
//
// Each takes a variant, { cages, relliks, lunchboxes, looksays, equalities,
// equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles,
// pills, whispers, renbans, palindromes, zippers, betweens, lockouts,
// entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs,
// quads, circles, sandwiches, littles, skyscrapers, xsums, hiddens, rooms,
// ranks, indexings, regions, rules }
// (variant.js), as an optional last argument; without one the rules are the
// classic ones.

import { PEERS, countSolutions, findSolutions } from "./sudoku.js";
import {
  layout,
  variantCandidates,
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
  sayCounts,
  piecesOf,
  clueMask,
  CAGE_LISTS,
  thermoProblem,
  arrowProblem,
  doubleProblem,
  pillProblem,
  scales,
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
  sumLineProblem,
  regionSumProblem,
  indexProblem,
  regionRuns,
  betweenInside,
  lockoutOutside,
  dotProblem,
  xvProblem,
  signProblem,
  quadProblem,
  quadCells,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  hiddenProblem,
  roomProblem,
  circleProblem,
  rankProblem,
  rankStart,
  rankBelow,
  indexingProblem,
  INDEXERS,
  regionProblem,
  markKeeps,
  barredSides,
  squareKinds,
  SQUARES,
  hasRule,
  TAXICAB,
  seen,
  SANDWICH_LINES,
  VIEWS,
} from "./variant.js";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0b1111111110;

const DRAWN = ["cages", "relliks", "lunchboxes", "looksays", "equalities", "equalsums", "samevalues", "connecteds", "distincts", "thermos", "arrows", "doubles", "pills", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "entropics", "modulars", "sumlines", "regionsums", "indexes", "dots", "xvs", "signs", "quads", "circles", "sandwiches", "littles", "skyscrapers", "xsums", "hiddens", "rooms", "ranks", "indexings"];
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
// that go past its sum, or that fill it to some other sum; the digits of a
// Rellik cage that together make its sum; digits twice in a lunchbox, or
// all of its digits once it is full and those between its smallest and
// largest make some other sum; a digit in a Look and Say cage more times
// than its clue says, or all of the cage's digits once the empty cells are
// too few for what it still owes; a 5 in an Equality cage, a digit twice
// in one, or the digits of a half (low, high, odd or even) once it holds
// more than half the cage; the digits of an Equal Sum cage's full pieces
// once they make different totals, or of a piece that goes past the total
// they agree on; a digit in a piece of a Same Values cage more times than
// another piece has room for; a Connected Values cage's cells holding the
// clue's digits once they are cut off from each other, or all its cells
// once it is full with none of them; a Count Distinct cage's control, with
// the digits counted, once more different ones are placed than it says, or
// too few cells are left to reach it; the digits of
// a thermometer that do not rise fast enough from the bulb: two cells three
// steps apart need digits at least three apart; an arrow's digits, with
// its circle's, once they go past the circle (or past 9 with the circle
// empty), or fill the arrow to some other sum; the digits between a double
// arrow's circles, and those along a pill arrow, with the circles' or the
// pill's, once they go past the most those could make, or fill the line
// short of the least; digits next to each other on
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
// places are the same, counted in threes; a sum line's digits, read from
// either end up to its first empty cell, in the run that goes past its sum,
// or at a full end, the run left short of it; the digits of a region sum
// line's full runs once they make different totals, or of a run that goes
// past the total they agree on; a value indexing line's count when it
// counts past the line's end, or with the first cell's digit and the one
// counted to when those differ;
// the two digits either side of a dot, an XV mark or a Greater Than sign
// they break; a quad's digits, once the digits it still needs outnumber
// its empty cells; the two digits either side of a
// side Anti-consecutive, Strict Kropki or Strict XV bars them from; the
// digits of a kind repeated in a 2x2 square, under Global Entropy or Global
// Mod, once the square has too few cells left for the kinds it lacks; two
// digits X exactly X steps apart, under Anti-taxicab; a 5 with neither a 1
// above it nor a 9 below it left possible, under Dutch Flatmates, with the
// digits in those two cells; a sandwich's 1, 9 and the digits between once those go past its sum, or
// fill it to some other sum; a Little Killer diagonal's digits once they go
// past its sum, or fill it to some other sum; the digits of a Skyscraper
// view, from the clue on, once more can be seen than it counts, or once
// they reach its 9 and some other number can; an X-Sum's first X digits
// once they go past its sum, or fill it to some other; a Hidden Skyscraper
// view's digits from the clue on, once the first hidden one is some other
// height, or its height shows; a Numbered Room's first digit, with the
// digit it points at when that is some other, or with the clue's digit when
// that sits somewhere else; a digit in more circles than itself, or all of
// its circles once too few are left empty to make up the count; a Full
// Rank view's first digit when it is not its rank's, or with the views
// starting with it once more of them are smaller, or larger, than the rank
// allows, the places that decide it, or once one is the same number; and an
// indexing cell, with the cell it points at when that holds some other
// digit, or with its line's number when that sits somewhere else.
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
  // Every set of a Rellik cage's digits, by which of them it takes.
  for (const { sum, cells } of variant?.relliks ?? []) {
    const filled = cells.filter((c) => grid[c]);
    for (let set = 1; set < 1 << filled.length; set++) {
      const taken = filled.filter((_, i) => set & (1 << i));
      if (taken.reduce((t, c) => t + grid[c], 0) === sum) taken.forEach((c) => out.add(c));
    }
  }
  for (const { sum, cells } of variant?.lunchboxes ?? []) {
    const filled = cells.filter((c) => grid[c]);
    filled.filter((c) => filled.some((o) => o !== c && grid[o] === grid[c])).forEach((c) => out.add(c));
    if (filled.length < cells.length) continue;
    const digits = cells.map((c) => grid[c]);
    const [i, j] = [digits.indexOf(Math.min(...digits)), digits.indexOf(Math.max(...digits))].sort((p, q) => p - q);
    if (digits.slice(i + 1, j).reduce((t, d) => t + d, 0) !== sum) cells.forEach((c) => out.add(c));
  }
  for (const { clue, cells } of variant?.looksays ?? []) {
    const want = sayCounts(clue);
    if (!want) continue;
    const filled = cells.filter((c) => grid[c]);
    let owed = 0;
    for (let d = 1; d <= 9; d++) {
      if (want[d] < 0) continue;
      const have = filled.filter((c) => grid[c] === d);
      if (have.length > want[d]) have.forEach((c) => out.add(c));
      owed += Math.max(0, want[d] - have.length);
    }
    if (owed > cells.length - filled.length) filled.forEach((c) => out.add(c));
  }
  for (const { cells } of variant?.equalities ?? []) {
    const filled = cells.filter((c) => grid[c]);
    filled.filter((c) => grid[c] === 5 || filled.some((o) => o !== c && grid[o] === grid[c])).forEach((c) => out.add(c));
    for (const half of [[1, 2, 3, 4], [6, 7, 8, 9], [1, 3, 7, 9], [2, 4, 6, 8]]) {
      const some = filled.filter((c) => half.includes(grid[c]));
      if (some.length > cells.length / 2) some.forEach((c) => out.add(c));
    }
  }
  for (const { cells } of variant?.equalsums ?? []) {
    const pieces = piecesOf(cells).map((piece) => {
      const filled = piece.filter((c) => grid[c]);
      return { filled, empty: piece.length - filled.length, total: filled.reduce((t, c) => t + grid[c], 0) };
    });
    const totals = new Set(pieces.filter((p) => !p.empty).map((p) => p.total));
    if (totals.size > 1) pieces.filter((p) => !p.empty).forEach((p) => p.filled.forEach((c) => out.add(c)));
    else if (totals.size) {
      // Each empty cell adds 1 at least.
      const [total] = totals;
      pieces.filter((p) => p.total + p.empty > total).forEach((p) => p.filled.forEach((c) => out.add(c)));
    }
  }
  for (const { cells } of variant?.samevalues ?? []) {
    const pieces = piecesOf(cells);
    for (const piece of pieces) {
      for (let d = 1; d <= 9; d++) {
        const have = piece.filter((c) => grid[c] === d);
        if (pieces.some((o) => o.filter((c) => grid[c] === d || !grid[c]).length < have.length)) have.forEach((c) => out.add(c));
      }
    }
  }
  for (const { clue, cells } of variant?.connecteds ?? []) {
    if (typeof clue !== "string") continue;
    const want = clueMask(clue);
    const holds = cells.filter((c) => grid[c] && want & (1 << grid[c]));
    // The parts the cells that could still hold one make, and how many of
    // those parts the digits placed are in.
    const parts = piecesOf(cells.filter((c) => !grid[c] || want & (1 << grid[c])));
    if (new Set(holds.map((c) => parts.findIndex((p) => p.includes(c)))).size > 1) holds.forEach((c) => out.add(c));
    if (!holds.length && cells.every((c) => grid[c])) cells.forEach((c) => out.add(c));
  }
  for (const { control, cells } of variant?.distincts ?? []) {
    const k = grid[control];
    if (!k) continue;
    const counted = cells.filter((c) => c !== control);
    const filled = counted.filter((c) => grid[c]);
    const seen = new Set(filled.map((c) => grid[c])).size;
    if (seen > k || seen + counted.length - filled.length < k) [control, ...filled].forEach((c) => out.add(c));
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
  // The cells weighing over 0 make the total, their empty ones at their
  // least and their most; the others add up to it.
  for (const { cells, weights } of scales(variant?.doubles, variant?.pills)) {
    let lo = 0;
    let hi = 0;
    let total = 0;
    let full = true;
    cells.forEach((c, i) => {
      const w = weights[i];
      if (w > 0) {
        lo += w * (grid[c] || 1);
        hi += w * (grid[c] || 9);
      } else if (grid[c]) total -= w * grid[c];
      else full = false;
    });
    if (total > hi || (full && total < lo)) cells.filter((c) => grid[c]).forEach((c) => out.add(c));
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
  for (const { sum, cells } of variant?.sumlines ?? []) {
    for (const t of [cells, cells.slice().reverse()]) {
      let run = [];
      let total = 0;
      let i = 0;
      for (; i < t.length && grid[t[i]]; i++) {
        run.push(t[i]);
        total += grid[t[i]];
        if (total > sum) break;
        if (total === sum) {
          run = [];
          total = 0;
        }
      }
      // Only a full line's last run can be short: it has nothing to go on.
      if (total > sum || (i === t.length && total)) run.forEach((c) => out.add(c));
    }
  }
  for (const runs of regionRuns(variant?.regionsums, regionsOf(variant))) {
    const full = runs.filter((run) => run.every((c) => grid[c]));
    const totals = full.map((run) => run.reduce((t, c) => t + grid[c], 0));
    if (new Set(totals).size > 1) {
      full.flat().forEach((c) => out.add(c));
      continue;
    }
    if (!full.length) continue;
    // Each empty cell of a run adds 1 at least.
    for (const run of runs) {
      const filled = run.filter((c) => grid[c]);
      if (filled.reduce((t, c) => t + grid[c], 0) + run.length - filled.length > totals[0]) filled.forEach((c) => out.add(c));
    }
  }
  for (const t of variant?.indexes ?? []) {
    const [v, k] = t;
    if (!grid[k]) continue;
    if (grid[k] > t.length - 2) out.add(k);
    else if (grid[v] && grid[t[grid[k] + 1]] && grid[t[grid[k] + 1]] !== grid[v]) [v, k, t[grid[k] + 1]].forEach((c) => out.add(c));
  }
  for (const { cell, digits } of variant?.quads ?? []) {
    const cells = quadCells(cell);
    const empty = cells.filter((c) => !grid[c]).length;
    // The digits it still needs, counting a digit listed twice twice.
    const missing = [...new Set(digits)].reduce((n, d) => n + Math.max(0, digits.filter((e) => e === d).length - cells.filter((c) => grid[c] === d).length), 0);
    if (missing > empty) cells.filter((c) => grid[c]).forEach((c) => out.add(c));
  }
  for (const { cells, mark } of [...(variant?.dots ?? []), ...(variant?.xvs ?? []), ...(variant?.signs ?? [])]) {
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
  for (const kinds of squareKinds(variant?.rules)) {
    const kind = (d) => kinds.findIndex((m) => m & (1 << d));
    for (const square of SQUARES) {
      const filled = square.filter((c) => grid[c]);
      const got = new Set(filled.map((c) => kind(grid[c])));
      // Too few cells left for the kinds it has not got.
      if (got.size + 4 - filled.length < 3) {
        filled.filter((c) => filled.some((o) => o !== c && kind(grid[o]) === kind(grid[c]))).forEach((c) => out.add(c));
      }
    }
  }
  if (hasRule(variant?.rules, "antitaxicab")) {
    for (let c = 0; c < 81; c++) {
      if (grid[c] && TAXICAB[c][grid[c]].some((o) => grid[o] === grid[c])) out.add(c);
    }
  }
  if (hasRule(variant?.rules, "dutchflatmates")) {
    for (let c = 0; c < 81; c++) {
      if (grid[c] !== 5) continue;
      // -1 off the grid, 0 still empty.
      const above = c >= 9 ? grid[c - 9] : -1;
      const below = c < 72 ? grid[c + 9] : -1;
      if (above !== 0 && above !== 1 && below !== 0 && below !== 9) [c - 9, c, c + 9].filter((o) => grid[o] > 0).forEach((o) => out.add(o));
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
  for (const { view, height } of variant?.hiddens ?? []) {
    const cells = VIEWS[view];
    let top = 0;
    for (let k = 0; k < 9 && grid[cells[k]]; k++) {
      const d = grid[cells[k]];
      const hidden = d < top;
      if (hidden ? d !== height : d === height) cells.slice(0, k + 1).forEach((c) => out.add(c));
      if (hidden) break;
      top = d;
    }
  }
  for (const { view, digit } of variant?.rooms ?? []) {
    const cells = VIEWS[view];
    const x = grid[cells[0]];
    if (!x) continue;
    const pointed = cells[x - 1];
    if (grid[pointed] && grid[pointed] !== digit) [cells[0], pointed].forEach((c) => out.add(c));
    const at = cells.findIndex((c) => grid[c] === digit);
    if (at >= 0 && at !== x - 1) [cells[0], cells[at]].forEach((c) => out.add(c));
  }
  const circles = variant?.circles ?? [];
  const open = circles.filter((c) => !grid[c]).length;
  for (let d = 1; d <= 9; d++) {
    const have = circles.filter((c) => grid[c] === d);
    if (have.length > d || (have.length && have.length + open < d)) have.forEach((c) => out.add(c));
  }
  for (const { view, rank } of variant?.ranks ?? []) {
    const e = VIEWS[view];
    const v = rankStart(rank);
    if (grid[e[0]] && grid[e[0]] !== v) out.add(e[0]);
    if (grid[e[0]] !== v) continue;
    // The others starting with it, by where they first differ, both filled.
    const smaller = [];
    const larger = [];
    VIEWS.forEach((o, w) => {
      if (w === view || grid[o[0]] !== v) return;
      for (let j = 1; j < 9; j++) {
        const [a, b] = [grid[e[j]], grid[o[j]]];
        if (!a || !b) return;
        if (a !== b) return (b < a ? smaller : larger).push([o[0], o[j], e[j]]);
      }
      [...e, ...o].forEach((c) => out.add(c));
    });
    for (const [found, most] of [
      [smaller, rankBelow(rank)],
      [larger, 3 - rankBelow(rank)],
    ]) {
      if (found.length > most) [e[0], ...found.flat()].forEach((c) => out.add(c));
    }
  }
  for (const { line } of variant?.indexings ?? []) {
    for (const { cell, targets, digit } of INDEXERS[line]) {
      const x = grid[cell];
      if (!x) continue;
      const pointed = targets[x - 1];
      if (grid[pointed] && grid[pointed] !== digit) [cell, pointed].forEach((c) => out.add(c));
      const at = targets.findIndex((c) => grid[c] === digit);
      if (at >= 0 && at !== x - 1) [cell, targets[at]].forEach((c) => out.add(c));
    }
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
// "cages" (also for two cages of different kinds sharing a cell),
// "relliks", "lunchboxes", "looksays", "equalities", "equalsums",
// "samevalues", "connecteds", "distincts", "thermos", "arrows",
// "doubles", "pills", "whispers", "renbans", "palindromes",
// "zippers", "betweens", "lockouts", "entropics", "modulars", "sumlines",
// "regionsums", "indexes", "dots", "xvs",
// "signs", "quads",
// "circles", "sandwiches", "littles", "skyscrapers", "xsums", "hiddens",
// "rooms", "ranks", "indexings" or "regions" (and
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
  for (const [list, partProblem] of [
    ["relliks", rellikProblem],
    ["lunchboxes", lunchboxProblem],
    ["looksays", lookSayProblem],
    ["equalities", equalityProblem],
    ["equalsums", equalSumProblem],
    ["samevalues", sameValueProblem],
    ["connecteds", connectedProblem],
    ["distincts", distinctProblem],
  ]) {
    const problem = variant?.[list]?.length && partProblem(variant[list]);
    if (problem) return { ok: false, why: list, problem };
  }
  // One cell, one cage, whatever the kinds.
  const caged = CAGE_LISTS.flatMap(({ list }) => (variant?.[list] ?? []).flatMap((cage) => cage.cells));
  if (new Set(caged).size < caged.length) return { ok: false, why: "cages", problem: { why: "overlap" } };
  if (variant?.thermos?.length) {
    const problem = thermoProblem(variant.thermos);
    if (problem) return { ok: false, why: "thermos", problem };
  }
  if (variant?.arrows?.length) {
    const problem = arrowProblem(variant.arrows);
    if (problem) return { ok: false, why: "arrows", problem };
  }
  for (const [list, partProblem] of [
    ["doubles", doubleProblem],
    ["pills", pillProblem],
  ]) {
    const problem = variant?.[list]?.length && partProblem(variant[list]);
    if (problem) return { ok: false, why: list, problem };
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
    ["sumlines", sumLineProblem],
    ["regionsums", regionSumProblem],
    ["indexes", indexProblem],
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
  for (const [list, partProblem] of [
    ["signs", signProblem],
    ["quads", quadProblem],
  ]) {
    const problem = variant?.[list]?.length && partProblem(variant[list]);
    if (problem) return { ok: false, why: list, problem };
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
  for (const [list, clueProblem] of [
    ["hiddens", hiddenProblem],
    ["rooms", roomProblem],
    ["circles", circleProblem],
    ["ranks", rankProblem],
    ["indexings", indexingProblem],
  ]) {
    const problem = variant?.[list]?.length && clueProblem(variant[list]);
    if (problem) return { ok: false, why: list, problem };
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
  // A puzzle with cages of any kind, or with clues outside the grid, usually
  // has few clues or none, so blanks say little: what counts is how far
  // singles get with the cages and the sums.
  if ([...CAGE_LISTS.map((k) => k.list), "sandwiches", "littles", "skyscrapers", "xsums", "hiddens", "rooms", "ranks"].some((list) => variant?.[list]?.length)) return grid.every(Boolean) ? (blanks <= 60 ? "M" : "H") : "X";
  if (!grid.every(Boolean)) return blanks <= 50 ? "H" : "X";
  return blanks <= 44 ? "E" : blanks <= 50 ? "M" : blanks <= 56 ? "H" : "X";
}
