// Variant sudoku: the classic rules with more on top. Pure, with no DOM, and
// the API imports it too, to work out a made variant puzzle's answer.
//
// A variant is { cages, relliks, lunchboxes, looksays, equalities, equalsums,
// samevalues, connecteds, distincts, thermos, arrows, doubles, pills,
// whispers, renbans, palindromes, zippers, betweens, lockouts, entropics,
// modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads,
// circles, circlesets, sandwiches, littles, skyscrapers, xsums, hiddens,
// rooms, ranks, indexings, indexcells, regions, rules }:
//
//   cages    killer cages, [{ sum, cells }] with cells in reading order. A
//            cage's digits add up to its sum and never repeat within it. A
//            cell is in at most one cage, of any kind below; cells in none
//            are allowed.
//   relliks  Rellik cages, as killer cages: no set of one or more of a
//            cage's digits adds up to its sum. They may repeat where the
//            rules allow.
//   lunchboxes  lunchboxes, as killer cages, their cells side by side along
//            a row or down a column: the digits sitting between the smallest
//            digit and the largest add up to the sum, 0 when those two sit
//            side by side. They never repeat.
//   looksays Look and Say cages, [{ clue, cells }], clue a string of digit
//            pairs, a count 0 to 9 and a digit 1 to 9: the cage holds each
//            digit named exactly that many times, and any other digits as
//            the rules allow.
//   equalities  Equality cages, [{ cells }] of an even number of cells: as
//            many odd digits as even, and as many low (1 to 4) as high (6
//            to 9), so never a 5. They never repeat.
//   equalsums  Equal Sum cages, [{ cells }] in two or more pieces, each
//            joined edge to edge and one to nine cells, no two touching
//            along an edge (piecesOf below): every piece adds up to the same
//            total. Digits may repeat where the rules allow.
//   samevalues  Same Values cages, as Equal Sum cages with pieces all the
//            same size: every piece holds the same digits, a digit twice in
//            one twice in each.
//   connecteds  Connected Values cages, [{ clue, cells }], cells joined edge
//            to edge and clue one to eight different digits in rising
//            order: the cells holding any of them form one group joined
//            edge to edge, of one cell or more.
//   distincts  Count Distinct cages, [{ control, cells }], cells joined edge
//            to edge and control one of them: its digit is how many
//            different digits the other cells hold. They may repeat where
//            the rules allow.
//   thermos  thermometers, each a path of cells from the bulb, every step
//            to a cell touching the last, corners included. Digits rise
//            strictly from the bulb. Thermometers may share cells.
//   arrows   arrows, each a path like a thermometer's, from the circle. The
//            digits along the arrow, past the circle, add up to the
//            circle's digit, and may repeat where the rules allow. Arrows
//            may share cells, and circles.
//   doubles  double arrows, paths like a thermometer's of three cells or
//            more with a circle at each end: the digits between add up to
//            the two circles' digits together. They may share cells.
//   pills    pill arrows, [{ pill, arrow }]: pill two or three cells side
//            by side along a row or a column, in reading order, and arrow a
//            path like a thermometer's from a cell touching the pill. The
//            pill's digits, read in that order, are a number, and the
//            arrow's add up to it. They may share cells, and pills.
//   whispers German Whispers lines, paths like a thermometer's: digits next
//            to each other on one differ by at least 5, so no 5 is ever on
//            one; under Dutch Whispers, by at least 4 (whisperGap below).
//            They may share cells.
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
//   entropics  entropic lines, paths like a thermometer's of three cells or
//            more: every three cells in a row along one hold a low digit,
//            1 to 3, a middle one, 4 to 6, and a high one, 7 to 9. They may
//            share cells.
//   modulars modular lines, as entropic lines with the digits sorted by
//            what is left over dividing by 3: 1 4 7, 2 5 8 and 3 6 9.
//   sumlines sum lines, [{ sum, cells, loop? }], cells a path like a
//            thermometer's of up to LONG_LINE_MOST cells: the line cuts into
//            runs of cells one after another, each adding up to the sum, 1
//            to SUM_LINE_MAX. With `loop`, its last cell touches its first
//            and the line closes there, so a run may go on round past the
//            end; a loop has three to LOOP_LINE_MOST cells. Digits may repeat
//            where the rules allow. They may share cells.
//   regionsums  region sum lines, paths like a sum line's: each run of the
//            line within one box, or a Jigsaw's region, adds up to the same
//            total, a line that leaves a box and comes back making two runs
//            there. They may share cells.
//   indexes  value indexing lines, paths like a thermometer's of three to
//            INDEX_LINE_MOST cells: the first cell's digit, X, is also in
//            the cell the second cell's digit counts to past it, 1 the cell
//            just after. They may share cells.
//   dots    Kropki dots, [{ cells: [a, b], mark }] on the side two cells
//            share, a before b in reading order. A "white" dot's digits are
//            consecutive; a "black" dot's are one double the other.
//   xvs      XV marks, as dots: an "x" mark's digits add up to 10, a "v"
//            mark's to 5. Cells with no dot or mark between them may be
//            anything the other rules allow.
//   signs    Greater Than signs, as dots: a "gt" sign's first cell holds the
//            larger digit, an "lt" sign's the smaller.
//   quads    Quad circles, [{ cell, digits }] on the corner where four
//            cells meet: cell the top left of the four, in a row and column
//            before the last, and digits one to four digits the four cells
//            hold between them, a digit listed twice held twice.
//   circles  Counting Circles, a list of one to CIRCLES_MOST cells in
//            reading order: a digit in a circle is in exactly that many
//            circles, a 3 in three of them.
//   circlesets  more sets of Counting Circles, [[cells]], one to
//            CIRCLE_SETS_MOST lists like `circles`, each counted on its own:
//            a 3 in a set's circle is in three of that set's circles. No cell
//            is in two sets, `circles` counting as one.
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
//   hiddens  Hidden Skyscraper clues outside the grid, [{ view, height }]:
//            reading from that side, the first digit lower than one before
//            it, hidden behind it, is `height`, 1 to 8.
//   rooms    Numbered Room clues outside the grid, [{ view, digit }]: the
//            first digit from that side, X, puts `digit` in the X-th cell
//            from that side.
//   ranks    Full Rank clues outside the grid, [{ view, rank }]: every row
//            and column, read from each side, is a nine-digit number, and
//            of those 36 this view's is the rank-th smallest, 1 to 36, tied
//            with none (RANK_MOST below). Under Clued Rank Ties it may tie,
//            its rank one more than how many are smaller; under No Rank
//            Ties no two of the 36 tie, clued or not.
//   indexings  Row/Column Indexing marks outside the grid, [{ line }]: line
//            0 to 8 a row, its mark on the left, and 9 to 17 a column, its
//            mark above. Each cell of a marked column holds the column its
//            row keeps that column's number in, a 5 in column 1 putting that
//            row's 1 in column 5; each cell of a marked row, the row its
//            column keeps that row's number in (INDEXERS below).
//   indexcells  single Row/Column Indexing cells, [{ cell, line }]: the
//            cell does as it would in a marked `line`, its own row or its
//            own column, the rest of that line unmarked.
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
//            a side with no X or V there add up to neither 10 nor 5; Global
//            Entropy, every 2x2 square holds a low, a middle and a high
//            digit; Global Mod, every 2x2 square holds one each of 1 4 7,
//            2 5 8 and 3 6 9; Anti-taxicab, a digit X never has another X
//            exactly X steps away along rows and columns; Dutch Flatmates,
//            every 5 has a 1 in the cell above it or a 9 in the cell below;
//            and options on drawn parts: Dutch Whispers, No Rank Ties and
//            Clued Rank Ties, as whispers and ranks above say.
//
// Diagonals, windows and disjoint groups are extra houses, like rows,
// columns and boxes; the knight's and king's moves are extra pairs of cells
// that must differ. Killer cages are worked into the search itself, and the
// other kinds of cage each narrow their cells as lines do. Double arrows and
// pill arrows are sums that balance (scales below), and a region sum line's
// runs are cut by the boxes or regions (regionRuns below). A Jigsaw's
// regions are houses in the boxes' place, and
// disjoint groups still go by the 3x3 boxes. The rules about sides are
// sides barred from some marks' relations (barredSides below), the rules
// about 2x2 squares sort each square's digits into kinds as entropic and
// modular lines do (squareKinds below), and Anti-taxicab and Dutch
// Flatmates depend on which digit a cell holds, so each has its own
// narrowing (TAXICAB and flatmateBounds below). Counting Circles, Full Rank
// and Row/Column Indexing narrow as the other clues do (circleBounds,
// rankBounds and indexingBounds below), and No Rank Ties the views that
// could read the same (tieBounds below).

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
  { key: "globalentropy", bit: 256, letter: "QGE", name: "Global Entropy" },
  { key: "globalmod", bit: 512, letter: "QGM", name: "Global Mod" },
  { key: "antitaxicab", bit: 1024, letter: "QAT", name: "Anti-taxicab" },
  { key: "dutchflatmates", bit: 2048, letter: "QDF", name: "Dutch Flatmates" },
  // Options on a drawn part rather than rules of their own: Dutch Whispers
  // makes the whisper lines Dutch, and names them in German Whispers' place.
  { key: "dutchwhispers", bit: 4096, letter: "QDW", name: "Dutch Whispers", replaces: "German Whispers" },
  { key: "norankties", bit: 8192, letter: "QNT", name: "No Rank Ties" },
  { key: "cluedrankties", bit: 16384, letter: "QCT", name: "Clued Rank Ties" },
];
export const ALL_RULES = RULES.reduce((m, r) => m | r.bit, 0);
// Whether the rule `key` is among the bits in `rules`.
export const hasRule = (rules, key) => Boolean(rules & RULES.find((r) => r.key === key).bit);
const has = hasRule;

// Names with a rule that replaces a part's name, such as Dutch Whispers
// for German Whispers, in that name's place, once.
export function renamed(names, rules = 0) {
  let out = names.slice();
  for (const r of RULES) {
    if (!r.replaces || !(rules & r.bit) || !out.includes(r.replaces)) continue;
    out = out.filter((name) => name !== r.name).map((name) => (name === r.replaces ? r.name : name));
  }
  return out;
}

// The rules' names, for a label: "Killer, Thermo, Diagonal".
export function variantName({ cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, circles, circlesets, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, ranks, indexings, indexcells, regions, rules } = {}) {
  const names = RULES.filter((r) => rules & r.bit).map((r) => r.name);
  if (regions?.length) names.unshift("Jigsaw");
  if (indexings?.length || indexcells?.length) names.unshift("Row/Column Indexing");
  if (ranks?.length) names.unshift("Full Rank");
  if (rooms?.length) names.unshift("Numbered Room");
  if (hiddens?.length) names.unshift("Hidden Skyscraper");
  if (xsums?.length) names.unshift("X-Sums");
  if (skyscrapers?.length) names.unshift("Skyscrapers");
  if (littles?.length) names.unshift("Little Killer");
  if (sandwiches?.length) names.unshift("Sandwich");
  if (circles?.length || circlesets?.length) names.unshift("Counting Circles");
  if (quads?.length) names.unshift("Quad");
  if (signs?.length) names.unshift("Greater Than");
  if (xvs?.length) names.unshift("XV");
  if (dots?.length) names.unshift("Kropki");
  if (indexes?.length) names.unshift("Value Indexing");
  if (regionsums?.length) names.unshift("Region Sum Line");
  if (sumlines?.length) names.unshift("Sum Line");
  if (modulars?.length) names.unshift("Modular");
  if (entropics?.length) names.unshift("Entropic");
  if (lockouts?.length) names.unshift("Lockout");
  if (betweens?.length) names.unshift("Between");
  if (zippers?.length) names.unshift("Zipper");
  if (palindromes?.length) names.unshift("Palindrome");
  if (renbans?.length) names.unshift("Renban");
  if (whispers?.length) names.unshift("German Whispers");
  if (pills?.length) names.unshift("Pill Arrow");
  if (doubles?.length) names.unshift("Double Arrow");
  if (arrows?.length) names.unshift("Arrow");
  if (thermos?.length) names.unshift("Thermo");
  if (distincts?.length) names.unshift("Count Distinct");
  if (connecteds?.length) names.unshift("Connected Values");
  if (samevalues?.length) names.unshift("Same Values");
  if (equalsums?.length) names.unshift("Equal Sum");
  if (equalities?.length) names.unshift("Equality Cage");
  if (looksays?.length) names.unshift("Look and Say");
  if (lunchboxes?.length) names.unshift("Lunchbox");
  if (relliks?.length) names.unshift("Rellik Cage");
  if (cages?.length) names.unshift("Killer");
  return renamed(names, rules).join(", ");
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

// Whether cages of one kind are well formed: cells 0 to 80, none in two
// cages, each cage `least` to `most` cells (an even number, for `even`)
// joined edge to edge, or for `straight` side by side along a row or down a
// column in reading order, or for `pieces` in pieces it passes, and a clue
// `fits` takes. null if so, or what is wrong: { why, cage }, why "size",
// "cell", "overlap", "sum" or "clue" (as `clue` names it), "apart", "line"
// or what `pieces` says.
function groupProblem(cages, { least = 1, most = 9, even = false, straight = false, pieces = null, clue = "sum", fits }) {
  const seen = new Set();
  for (let i = 0; i < cages.length; i++) {
    const cage = cages[i] ?? {};
    const { cells } = cage;
    if (!Array.isArray(cells) || cells.length < least || cells.length > most || (even && cells.length % 2)) return { why: "size", cage: i };
    for (const c of cells) {
      if (!Number.isInteger(c) || c < 0 || c > 80) return { why: "cell", cage: i };
      if (seen.has(c)) return { why: "overlap", cage: i };
      seen.add(c);
    }
    if (fits && !fits(cage)) return { why: clue, cage: i };
    if (pieces) {
      const why = pieces(piecesOf(cells));
      if (why) return { why, cage: i };
    } else if (straight ? !inLine(cells) : !joined(cells)) return { why: straight ? "line" : "apart", cage: i };
  }
  return null;
}

// Whether killer cages are well formed: one to nine cells, and a sum nine
// different digits could make.
export const cageProblem = (cages) => groupProblem(cages, { fits: ({ sum, cells }) => Number.isInteger(sum) && COMBOS[cells.length][sum]?.length > 0 });
// Rellik cages: a sum some digit could reach.
export const rellikProblem = (relliks) => groupProblem(relliks, { fits: ({ sum }) => Number.isInteger(sum) && sum >= 1 && sum <= 45 });
// Lunchboxes: two cells at least, in a line, and a sum the cells between
// its smallest and largest digit could make.
export const lunchboxProblem = (lunchboxes) => groupProblem(lunchboxes, { least: 2, straight: true, fits: ({ sum, cells }) => lunchboxFits(cells.length, sum) });
// Look and Say cages: a clue of digit pairs sayCounts can read, its counts
// no more than the cells.
export const lookSayProblem = (looksays) =>
  groupProblem(looksays, {
    clue: "clue",
    fits: ({ clue, cells }) => {
      const want = sayCounts(clue);
      return Boolean(want) && want.reduce((t, n) => t + Math.max(n, 0), 0) <= cells.length;
    },
  });
// Equality cages: two, four, six or eight cells, as the eight digits other
// than 5 have room for.
export const equalityProblem = (equalities) => groupProblem(equalities, { least: 2, most: 8, even: true });
// Equal Sum cages: two pieces or more, "pieces" if not, each one to nine
// cells, "piece" if not.
const splitProblem = (ps) => (ps.length < 2 ? "pieces" : ps.some((p) => p.length > 9) ? "piece" : null);
export const equalSumProblem = (equalsums) => groupProblem(equalsums, { least: 2, most: 81, pieces: splitProblem });
// Same Values cages: as Equal Sum cages, with pieces all the same size,
// "uneven" if not.
export const sameValueProblem = (samevalues) =>
  groupProblem(samevalues, { least: 2, most: 81, pieces: (ps) => splitProblem(ps) ?? (ps.some((p) => p.length !== ps[0].length) ? "uneven" : null) });
// Connected Values cages: two cells or more, and one to eight different
// digits in rising order.
export const connectedProblem = (connecteds) =>
  groupProblem(connecteds, { least: 2, most: 81, clue: "clue", fits: ({ clue }) => typeof clue === "string" && /^[1-9]{1,8}$/.test(clue) && [...clue].every((d, i) => !i || d > clue[i - 1]) });
// Count Distinct cages: two cells or more, the control among them,
// "control" if not.
export const distinctProblem = (distincts) => groupProblem(distincts, { least: 2, most: 81, clue: "control", fits: ({ control, cells }) => cells.includes(control) });

// The digits a Connected Values clue names, as a mask.
export const clueMask = (clue) => [...clue].reduce((m, d) => m | (1 << Number(d)), 0);

// A Connected Values clue in words: "1s, 3s or 5s".
export function linkWords(clue) {
  const parts = [...clue].map((d) => `${d}s`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts.join("");
}

// The most a lunchbox's sum can be: the digits 2 to 8.
export const LUNCHBOX_MAX = 35;

// Whether some number of cells between a lunchbox's ends, none up to all
// but those two, could add up to `sum` with different digits 2 to 8.
function lunchboxFits(size, sum) {
  if (!Number.isInteger(sum) || sum < 0 || sum > LUNCHBOX_MAX) return false;
  if (sum === 0) return true;
  for (let k = 1; k <= size - 2; k++) if (COMBOS[k][sum].some((m) => !(m & ~INNER))) return true;
  return false;
}

// Cells, in reading order, side by side along one row or down one column.
function inLine(cells) {
  const step = cells[1] - cells[0];
  if (step !== 1 && step !== 9) return false;
  return cells.every((c, i) => !i || (c - cells[i - 1] === step && (step === 9 || ROW[c] === ROW[cells[0]])));
}

// A Look and Say clue as how many of each digit the cage holds: for d 1 to
// 9, the count, or -1 for a digit the clue does not name. null if it is not
// one to nine pairs of a count and a digit 1 to 9, each digit named once.
export function sayCounts(clue) {
  if (typeof clue !== "string" || !/^(\d\d){1,9}$/.test(clue)) return null;
  const want = new Array(10).fill(-1);
  for (let i = 0; i < clue.length; i += 2) {
    const d = Number(clue[i + 1]);
    if (!d || want[d] >= 0) return null;
    want[d] = Number(clue[i]);
  }
  return want;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
// A Look and Say clue in words: "two 3s and one 4".
export function sayWords(clue) {
  const parts = (clue.match(/\d\d/g) ?? []).map(([n, d]) => `${COUNT_WORDS[n]} ${d}${n === "1" ? "" : "s"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts.join("");
}

// A cage of a kind in pieces, as named among those of its kind: "" alone,
// or A, B and so on.
const pieceName = (i, n) => (n > 1 ? String.fromCharCode(65 + (i % 26)) : "");

// Every kind of cage, as the lists that hold them, in the order their rule
// buttons go: what each shows in its first cell's corner, what it is
// called for a screen reader, whether it is drawn solid, not dashed, and
// whether it is drawn a piece at a time. label and words take the cage,
// its place in its list and how many the list has.
export const CAGE_LISTS = [
  { list: "cages", label: ({ sum }) => String(sum), words: ({ sum, cells }) => `cage of ${cells.length} adding to ${sum}` },
  { list: "relliks", label: ({ sum }) => `≠${sum}`, words: ({ sum, cells }) => `Rellik cage of ${cells.length}, no digits adding to ${sum}` },
  {
    list: "lunchboxes",
    label: ({ sum }) => String(sum),
    words: ({ sum, cells }) => `lunchbox of ${cells.length}, ${sum} between its smallest and largest`,
    solid: true,
  },
  {
    list: "looksays",
    label: ({ clue }) => (clue.match(/\d\d/g) ?? []).map(([n, d]) => `${n}×${d}`).join(" "),
    words: ({ clue, cells }) => `Look and Say cage of ${cells.length}, ${sayWords(clue)}`,
  },
  { list: "equalities", label: () => "=", words: ({ cells }) => `Equality cage of ${cells.length}` },
  {
    list: "equalsums",
    label: (_, i, n) => `Σ${pieceName(i, n)}`,
    words: ({ cells }, i, n) => `Equal Sum cage${n > 1 ? ` ${pieceName(i, n)}` : ""}, ${piecesOf(cells).length} pieces adding up the same`,
    split: true,
  },
  {
    list: "samevalues",
    label: (_, i, n) => `≡${pieceName(i, n)}`,
    words: ({ cells }, i, n) => `Same Values cage${n > 1 ? ` ${pieceName(i, n)}` : ""}, ${piecesOf(cells).length} pieces holding the same digits`,
    split: true,
  },
  { list: "connecteds", label: ({ clue }) => `~${clue}`, words: ({ clue, cells }) => `Connected Values cage of ${cells.length}, its ${linkWords(clue)} joined up` },
  { list: "distincts", label: () => "#", words: ({ cells }) => `Count Distinct cage of ${cells.length}, the # cell counting the different digits in the rest` },
];

// Every cage of every kind in `v`, for drawing, a cage in pieces a piece at
// a time: [{ cells, head, label, words, solid }], head the cell its label
// goes in, a Count Distinct cage's control or else its first.
export const cagesOf = (v) =>
  CAGE_LISTS.flatMap(({ list, label, words, solid = false, split = false }) => {
    const all = v?.[list] ?? [];
    return all.flatMap((cage, i) =>
      (split ? piecesOf(cage.cells) : [cage.cells]).map((cells) => ({
        cells,
        head: cage.control ?? Math.min(...cells),
        label: label(cage, i, all.length),
        words: words(cage, i, all.length),
        solid,
      }))
    );
  });

// A cage's cells as the pieces they make joined edge to edge, each in
// reading order, in order of their first cell.
export function piecesOf(cells) {
  const set = new Set(cells);
  const done = new Set();
  const out = [];
  for (const start of [...cells].sort((a, b) => a - b)) {
    if (done.has(start)) continue;
    const piece = [start];
    done.add(start);
    for (let k = 0; k < piece.length; k++) {
      const c = piece[k];
      for (const n of [c - 9, c + 9, COL[c] > 0 ? c - 1 : -1, COL[c] < 8 ? c + 1 : -1]) {
        if (set.has(n) && !done.has(n)) {
          done.add(n);
          piece.push(n);
        }
      }
    }
    out.push(piece.sort((a, b) => a - b));
  }
  return out;
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
// each `least` (two, unless a kind says) to `most` (nine, likewise) cells on
// the board, each touching the one before, none twice. null if so, or what
// is wrong: { why, line }.
function lineProblem(lines, least = 2, most = 9) {
  // A seed has room for forty.
  if (lines.length > 40) return { why: "count", line: 40 };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!Array.isArray(t) || t.length < least || t.length > most) return { why: "length", line: i };
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
// A circle at each end, and a cell between at least.
export const doubleProblem = (lines) => lineProblem(lines, 3);
export const whisperProblem = lineProblem;
export const renbanProblem = lineProblem;
export const palindromeProblem = lineProblem;
export const zipperProblem = lineProblem;
export const betweenProblem = lineProblem;
export const lockoutProblem = lineProblem;
// A run of three is what their rule is about.
export const entropicProblem = (lines) => lineProblem(lines, 3);
export const modularProblem = (lines) => lineProblem(lines, 3);

// The most cells a sum line or a region sum line has: they wind through
// several boxes, so more than the other lines' nine.
export const LONG_LINE_MOST = 27;
// The largest sum a sum line takes, as the solver it comes from has it.
export const SUM_LINE_MAX = 30;
// The most cells a value indexing line has: its second cell counts at most
// nine cells on.
export const INDEX_LINE_MOST = 11;

// The most cells a sum line that closes in a loop has: a seed writes it
// with its first cell again at the end, in a long line's room.
export const LOOP_LINE_MOST = LONG_LINE_MOST - 1;

// Sum lines: each a line of two to LONG_LINE_MOST cells, and a sum 1 to
// SUM_LINE_MAX; a loop three to LOOP_LINE_MOST cells, its last touching its
// first. null if so, or what is wrong: { why, line }, why "sum" for the
// sum, "looplength" or "open" for a loop, or as lineProblem says.
export function sumLineProblem(lines) {
  const problem = lineProblem(lines.map((t) => t?.cells), 2, LONG_LINE_MOST);
  if (problem) return problem;
  const i = lines.findIndex(({ sum }) => !Number.isInteger(sum) || sum < 1 || sum > SUM_LINE_MAX);
  if (i >= 0) return { why: "sum", line: i };
  for (let j = 0; j < lines.length; j++) {
    const { cells, loop } = lines[j];
    if (!loop) continue;
    if (cells.length < 3 || cells.length > LOOP_LINE_MOST) return { why: "looplength", line: j };
    if (!touching(cells[0], cells.at(-1))) return { why: "open", line: j };
  }
  return null;
}
export const regionSumProblem = (lines) => lineProblem(lines, 2, LONG_LINE_MOST);
// A value, a count and one cell to count to, at least.
export const indexProblem = (lines) => lineProblem(lines, 3, INDEX_LINE_MOST);

// Region sum lines cut into their runs, each the cells one after another in
// one box, or with a Jigsaw's `regions` in one region: for each line, its
// runs in order.
export function regionRuns(lines = [], regions = null) {
  const of = regions ?? BOX;
  return lines.map((t) => {
    const runs = [];
    t.forEach((c, i) => (i && of[c] === of[t[i - 1]] ? runs.at(-1).push(c) : runs.push([c])));
    return runs;
  });
}

// How far apart a lockout line's diamonds are at least, as most puzzles
// have it.
export const LOCKOUT_GAP = 4;

// The most cells a pill arrow's arrow has. A three-digit pill is 111 at
// least, which is more than twelve 9s, so its arrow needs thirteen cells at
// least; this leaves room past that.
export const PILL_ARROW_MOST = 27;

// Whether pill arrows are well formed: forty at most, each a pill of two or
// three cells side by side along a row or a column, in reading order, and
// an arrow of one to PILL_ARROW_MOST cells, the first touching some cell of
// the pill and each after it the one before, none twice or in the pill.
// null if so, or what is wrong: { why, line }.
export function pillProblem(pills) {
  if (pills.length > 40) return { why: "count", line: 40 };
  const onBoard = (cells) => cells.every((c) => Number.isInteger(c) && c >= 0 && c <= 80);
  for (let i = 0; i < pills.length; i++) {
    const { pill, arrow } = pills[i] ?? {};
    if (!Array.isArray(pill) || pill.length < 2 || pill.length > 3 || !onBoard(pill)) return { why: "pill", line: i };
    const along = pill[1] - pill[0];
    if ((along !== 1 && along !== 9) || !pill.every((c, j) => !j || (c - pill[j - 1] === along && (along === 9 || ROW[c] === ROW[pill[0]])))) {
      return { why: "pill", line: i };
    }
    if (!Array.isArray(arrow) || !arrow.length || arrow.length > PILL_ARROW_MOST) return { why: "length", line: i };
    if (!onBoard(arrow)) return { why: "cell", line: i };
    const seen = new Set(pill);
    for (let j = 0; j < arrow.length; j++) {
      const c = arrow[j];
      if (seen.has(c)) return { why: "loop", line: i };
      seen.add(c);
      if (j ? !touching(arrow[j - 1], c) : !pill.some((p) => touching(p, c))) return { why: "apart", line: i };
    }
  }
  return null;
}

// Double arrows and pill arrows as sums that balance: [{ cells, weights }],
// each cell's digit times its weight adding up to 0 over the cells. A
// double arrow's circles weigh 1 and the cells between -1; a pill's digits
// weigh 100, 10 and 1 as a number's do, and its arrow's -1. The cells a
// weight is over 0 for make the total; the others add up to it.
export function scales(doubles = [], pills = []) {
  const out = [];
  for (const t of doubles) out.push({ cells: t.slice(), weights: t.map((_, i) => (i === 0 || i === t.length - 1 ? 1 : -1)) });
  for (const { pill, arrow } of pills) {
    out.push({ cells: [...pill, ...arrow], weights: [...pill.map((_, i) => 10 ** (pill.length - 1 - i)), ...arrow.map(() => -1)] });
  }
  return out;
}

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

// Squeezes each scale (scales above) as arrowBounds squeezes an arrow: the
// least and the most its weighted digits can add up to must take in 0, and
// each cell keeps the digits that leave the others some way to get there,
// at their most and at their least. Placed digits count as masks of one, and
// `free` is narrowed in place, as in thermoBounds; false if a scale cannot
// balance.
function scaleBounds(list, g, free) {
  for (const { cells, weights } of list) {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < cells.length; i++) {
      const m = g[cells[i]] ? 1 << g[cells[i]] : free[cells[i]];
      if (!m) return false;
      const w = weights[i];
      lo += w * (w > 0 ? LOW[m] : HIGH[m]);
      hi += w * (w > 0 ? HIGH[m] : LOW[m]);
    }
    if (lo > 0 || hi < 0) return false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (g[c]) continue;
      const w = weights[i];
      const m = free[c];
      // What this cell's weighted digit may be: the others' total, taken
      // from 0, at their most and at their least.
      const least = w * (w > 0 ? HIGH[m] : LOW[m]) - hi;
      const most = w * (w > 0 ? LOW[m] : HIGH[m]) - lo;
      const [from, to] = w > 0 ? [Math.ceil(least / w), Math.floor(most / w)] : [Math.ceil(most / w), Math.floor(least / w)];
      const n = m & between(from, to);
      if (!n) return false;
      free[c] = n;
    }
  }
  return true;
}

// How far apart digits next to each other on a whisper line are at least:
// 5 on a German Whispers line, 4 under Dutch Whispers.
export const whisperGap = (rules = 0) => (has(rules, "dutchwhispers") ? 4 : 5);

// FAR[gap][m]: the digits at least `gap` away from some digit in m, for a
// gap of 4 or 5. A 5 has nothing 5 away, and only 1 and 9 4 away.
const FAR = [4, 5].reduce((far, gap) => {
  far[gap] = new Int32Array(1024);
  for (let m = 2; m < 1024; m += 2) {
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) far[gap][m] |= between(1, d - gap) | between(d + gap, 9);
  }
  return far;
}, []);

// Narrows candidates along each whisper line, forwards and then backwards:
// every cell to the digits `gap` or more from some digit the cell before it
// can be. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if a line cannot be filled, or two placed
// digits next to each other are too close.
function whisperBounds(whispers, g, free, gap = 5) {
  const far = FAR[gap];
  for (const t of whispers) {
    for (const back of [false, true]) {
      let before = 0;
      for (let j = 0; j < t.length; j++) {
        const c = t[back ? t.length - 1 - j : j];
        let m = g[c] ? 1 << g[c] : free[c];
        if (j) m &= far[before];
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

// The three kinds of digit an entropic line and a modular line sort digits
// into, as masks: low, middle and high; and 1 4 7, 2 5 8 and 3 6 9.
export const ENTROPIC_KINDS = [between(1, 3), between(4, 6), between(7, 9)];
export const MODULAR_KINDS = [0, 1, 2].map((k) => [1, 2, 3].reduce((m, i) => m | (1 << (k + 1 + 3 * (i - 1))), 0));
// The six ways to give three places a kind each, all different.
const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// Every three cells in a row along such a line hold one digit of each kind,
// so the cells as far along as each other, counted in threes, hold one kind,
// and the three places' kinds all differ. Narrows each line to the ways to
// give its three places their kinds that every cell can go along with, and
// each cell to the digits of its place's kinds in those. Placed digits count
// as masks of one, and `free` is narrowed in place, as in thermoBounds; false
// if no way is left.
function kindBounds(lines, g, free, kinds) {
  for (const t of lines) {
    // For each place, the kinds every one of its cells can take.
    const can = [7, 7, 7];
    t.forEach((c, i) => {
      const m = g[c] ? 1 << g[c] : free[c];
      let fits = 0;
      for (let k = 0; k < 3; k++) if (m & kinds[k]) fits |= 1 << k;
      can[i % 3] &= fits;
    });
    const allow = [0, 0, 0];
    for (const order of ORDERS) {
      if (order.every((k, place) => can[place] & (1 << k))) order.forEach((k, place) => (allow[place] |= kinds[k]));
    }
    if (!allow[0]) return false;
    t.forEach((c, i) => {
      if (!g[c]) free[c] &= allow[i % 3];
    });
  }
  return true;
}
const entropicBounds = (entropics, g, free) => kindBounds(entropics, g, free, ENTROPIC_KINDS);
const modularBounds = (modulars, g, free) => kindBounds(modulars, g, free, MODULAR_KINDS);

// Scratch for sumLineBounds: at each gap between two cells of a line, the
// running totals of the run it is in, as bits 0 to sum - 1, that the cells
// before it can reach (ahead) and the cells after it can finish (behind);
// the digits each cell keeps, read from `from`; and for a loop, those it
// keeps from any start.
const ahead = new Int32Array(LONG_LINE_MOST + 1);
const behind = new Int32Array(LONG_LINE_MOST + 1);
const cutKeep = new Int32Array(LONG_LINE_MOST);
const loopKeep = new Int32Array(LONG_LINE_MOST);

// The ways a line's cells, read from cells[from] on and round to the one
// before it, can be cut into runs that each make `sum`, a run starting at
// cells[from]. Going along, each gap keeps the running totals some digits
// before it reach, a run starting again at 0 once it makes the sum; coming
// back, those some digits after it finish. The i-th cell read keeps the
// digits, in cutKeep[i], that take a total at the gap before it to one at
// the gap after that both ways allow. Placed digits count as masks of one;
// false if the line cannot be cut so.
function sumCuts(sum, cells, from, g, free) {
  const n = cells.length;
  const at = (i) => cells[(from + i) % n];
  // Totals under the sum; a sum of at most 30 keeps them in 32 bits.
  const under = (1 << sum) - 1;
  ahead[0] = 1;
  for (let i = 0; i < n; i++) {
    const m = g[at(i)] ? 1 << g[at(i)] : free[at(i)];
    let next = 0;
    for (let d = 1; d <= 9 && d <= sum; d++) {
      if (!(m & (1 << d))) continue;
      next |= (ahead[i] << d) & under;
      if ((ahead[i] >> (sum - d)) & 1) next |= 1;
    }
    if (!next) return false;
    ahead[i + 1] = next;
  }
  // The line ends as a run does, on the sum.
  if (!(ahead[n] & 1)) return false;
  behind[n] = 1;
  for (let i = n - 1; i >= 0; i--) {
    const m = g[at(i)] ? 1 << g[at(i)] : free[at(i)];
    let back = 0;
    let keep = 0;
    for (let d = 1; d <= 9 && d <= sum; d++) {
      if (!(m & (1 << d))) continue;
      const ends = behind[i + 1] & 1 ? 1 << (sum - d) : 0;
      back |= (behind[i + 1] >> d) | ends;
      if (((ahead[i] << d) & under & behind[i + 1]) || ahead[i] & ends) keep |= 1 << d;
    }
    if (!keep) return false;
    behind[i] = back;
    cutKeep[i] = keep;
  }
  return true;
}

// Narrows each sum line to the ways it can still be cut into runs that each
// make its sum (sumCuts above), from its first cell. Some run of a loop
// starts at one cell or another, so a loop is tried from each, and each
// cell keeps the digits some start leaves it. Placed digits count as masks
// of one, and `free` is narrowed in place, as in thermoBounds; false if the
// line cannot be cut so.
function sumLineBounds(sumlines, g, free) {
  for (const { sum, cells, loop } of sumlines) {
    const n = cells.length;
    if (!loop) {
      if (!sumCuts(sum, cells, 0, g, free)) return false;
      for (let i = 0; i < n; i++) if (!g[cells[i]]) free[cells[i]] = cutKeep[i];
      continue;
    }
    loopKeep.fill(0, 0, n);
    let cut = false;
    for (let from = 0; from < n; from++) {
      if (!sumCuts(sum, cells, from, g, free)) continue;
      cut = true;
      for (let i = 0; i < n; i++) loopKeep[(from + i) % n] |= cutKeep[i];
    }
    if (!cut) return false;
    for (let i = 0; i < n; i++) if (!g[cells[i]]) free[cells[i]] &= loopKeep[i];
  }
  return true;
}

// Whether a loop's digits, all placed, cut into runs of `sum` from some
// start: for steps.js, which has no masks to go on.
export function loopCuts(sum, cells, grid) {
  const masks = cells.map((c) => 1 << grid[c]);
  const g = new Array(81).fill(0);
  const free = new Array(81).fill(0);
  cells.forEach((c, i) => (free[c] = masks[i]));
  for (let from = 0; from < cells.length; from++) if (sumCuts(sum, cells, from, g, free)) return true;
  return false;
}

// Scratch for regionSumBounds: which totals every run so far can make, and
// which this run can.
const RUN_ALL = new Uint8Array(46);
const RUN_ONE = new Uint8Array(46);

// Calls `fits` with each total and set of digits a run of a region sum line
// could hold: as many different digits as it has cells, as its box has them,
// each cell able to take one of them and every one of them in reach of some
// cell. Placed digits count as masks of one.
function runSets(run, g, free, fits) {
  let room = 0;
  for (const c of run) room |= g[c] ? 1 << g[c] : free[c];
  for (let total = 0; total <= 45; total++) {
    for (const set of COMBOS[run.length][total]) {
      if (set & ~room || run.some((c) => !((g[c] ? 1 << g[c] : free[c]) & set))) continue;
      fits(total, set);
    }
  }
}

// Narrows each region sum line, cut into runs (regionRuns above), to the
// totals every run can make, and each run's empty cells to the digits of
// the sets that make one of those. A line in one run is free. Placed digits
// count as masks of one, and `free` is narrowed in place, as in
// thermoBounds; false if the runs share no total.
function regionSumBounds(lines, g, free) {
  for (const runs of lines) {
    if (runs.length < 2) continue;
    RUN_ALL.fill(1);
    for (const run of runs) {
      RUN_ONE.fill(0);
      runSets(run, g, free, (total) => (RUN_ONE[total] = 1));
      for (let total = 0; total <= 45; total++) RUN_ALL[total] &= RUN_ONE[total];
    }
    if (!RUN_ALL.includes(1)) return false;
    for (const run of runs) {
      let allow = 0;
      runSets(run, g, free, (total, set) => RUN_ALL[total] && (allow |= set));
      for (const c of run) if (!g[c] && !(free[c] &= allow)) return false;
    }
  }
  return true;
}

// Narrows each value indexing line. Its second cell counts K cells on, to a
// cell holding the first cell's digit, X: K may be any count, up to the
// cells there are, whose cell could share a digit with the first; X any
// digit one of those cells could hold. Once only one K is left, its cell
// holds one of those Xs. Placed digits count as masks of one, and `free` is
// narrowed in place, as in thermoBounds; false if no K is left.
function indexBounds(indexes, g, free) {
  const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
  for (const t of indexes) {
    const [v, k] = t;
    const xm = mask(v);
    const km = mask(k) & between(1, t.length - 2);
    let xs = 0;
    let ks = 0;
    for (let i = 1; i <= 9 && i <= t.length - 2; i++) {
      if (!(km & (1 << i))) continue;
      const shared = mask(t[i + 1]) & xm;
      if (!shared) continue;
      xs |= shared;
      ks |= 1 << i;
    }
    if (!ks) return false;
    if (!g[v]) free[v] = xs;
    if (!g[k]) free[k] = ks;
    const only = t[LOW[ks] + 1];
    if (POP[ks] === 1 && !g[only] && !(free[only] &= xs)) return false;
  }
  return true;
}

// Global Entropy and Global Mod: every 2x2 square holds a digit of each of
// the kinds an entropic or a modular line sorts digits into, so one kind
// twice and the other two once. Each square's four cells, in reading order.
export const SQUARES = [...Array(64).keys()].map((i) => {
  const c = cellAt(i >> 3, i & 7);
  return [c, c + 1, c + 9, c + 10];
});
const SQUARE_RULES = [
  ["globalentropy", ENTROPIC_KINDS],
  ["globalmod", MODULAR_KINDS],
];
// The kinds the switch rules sort every 2x2 square by, one list of three
// masks for each rule on; empty if neither is.
export const squareKinds = (rules = 0) => SQUARE_RULES.filter(([key]) => has(rules, key)).map(([, kinds]) => kinds);

// FITS.get(kinds)[m]: the kinds, as bits 0 to 2, that digits in mask m are.
const FITS = new Map(
  SQUARE_RULES.map(([, kinds]) => {
    const fits = new Uint8Array(1024);
    for (let m = 0; m < 1024; m++) for (let k = 0; k < 3; k++) if (m & kinds[k]) fits[m] |= 1 << k;
    return [kinds, fits];
  })
);
// SQUARE_FITS[key], key four cells' kinds as three bits each, the first
// cell's lowest: the kinds each can still be when the four hold all three
// between them, packed the same way; 0 if they cannot.
const SQUARE_FITS = new Uint16Array(4096);
for (let way = 0; way < 81; way++) {
  const ks = [way % 3, Math.floor(way / 3) % 3, Math.floor(way / 9) % 3, Math.floor(way / 27)];
  if (ks.reduce((m, k) => m | (1 << k), 0) !== 7) continue;
  const bits = ks.reduce((m, k, i) => m | (1 << (k + 3 * i)), 0);
  for (let key = 0; key < 4096; key++) if ((key & bits) === bits) SQUARE_FITS[key] |= bits;
}

// Narrows each cell of every 2x2 square to the kinds it can be while the
// square holds all three, for each list of kinds in `sorts`. Placed digits
// count as masks of one, and `free` is narrowed in place, as in
// thermoBounds; false if a square cannot hold all three.
function squareBounds(sorts, g, free) {
  for (const kinds of sorts) {
    const fits = FITS.get(kinds);
    for (const square of SQUARES) {
      let key = 0;
      for (let i = 0; i < 4; i++) {
        const c = square[i];
        key |= fits[g[c] ? 1 << g[c] : free[c]] << (3 * i);
      }
      const can = SQUARE_FITS[key];
      if (!can) return false;
      for (let i = 0; i < 4; i++) {
        const c = square[i];
        if (g[c]) continue;
        const k = (can >> (3 * i)) & 7;
        free[c] &= (k & 1 ? kinds[0] : 0) | (k & 2 ? kinds[1] : 0) | (k & 4 ? kinds[2] : 0);
      }
    }
  }
  return true;
}

/* ---- rules about which digit sits where ---- */

// Anti-taxicab: TAXICAB[c][d], for d 1 to 9, the cells d steps from c along
// rows and columns, turning as often as it likes: rows apart and columns
// apart add up to d. None of them holds d when c does.
export const TAXICAB = Array.from({ length: 81 }, (_, c) =>
  Array.from({ length: 10 }, (_, d) => (d ? [...Array(81).keys()].filter((o) => Math.abs(ROW[o] - ROW[c]) + Math.abs(COL[o] - COL[c]) === d) : []))
);

// Takes each placed digit d out of the cells d steps from it, under
// Anti-taxicab. `free` is narrowed in place, as in thermoBounds; false if
// two placed digits d are d steps apart.
function taxicabBounds(g, free) {
  for (let c = 0; c < 81; c++) {
    const d = g[c];
    if (!d) continue;
    for (const o of TAXICAB[c][d]) {
      if (g[o] === d) return false;
      if (!g[o]) free[o] &= ~(1 << d);
    }
  }
  return true;
}

// Dutch Flatmates: every 5 has a 1 in the cell above it or a 9 in the cell
// below. A cell with neither in reach cannot be 5, and a 5, placed or the
// only digit left, with just one of them in reach has that one. Placed
// digits count as masks of one, and `free` is narrowed in place, as in
// thermoBounds; false if a placed 5 has neither.
function flatmateBounds(g, free) {
  const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
  for (let c = 0; c < 81; c++) {
    if (!(mask(c) & (1 << 5))) continue;
    const up = c >= 9 && Boolean(mask(c - 9) & (1 << 1));
    const down = c < 72 && Boolean(mask(c + 9) & (1 << 9));
    if (!up && !down) {
      if (g[c]) return false;
      free[c] &= ~(1 << 5);
    } else if (mask(c) === 1 << 5 && up !== down) {
      const o = up ? c - 9 : c + 9;
      if (!g[o]) free[o] = up ? 1 << 1 : 1 << 9;
    }
  }
  return true;
}

/* ---- dots and marks between two cells ---- */

export const DOT_MARKS = ["white", "black"];
export const XV_MARKS = ["x", "v"];
export const SIGN_MARKS = ["gt", "lt"];

// Whether digits a and b may sit either side of a mark.
const KEEPS = {
  white: (a, b) => Math.abs(a - b) === 1,
  black: (a, b) => a === 2 * b || b === 2 * a,
  x: (a, b) => a + b === 10,
  v: (a, b) => a + b === 5,
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
};
export const markKeeps = (mark, a, b) => KEEPS[mark](a, b);

// ACROSS[mark][m]: the digits that may be the second of a mark's two cells
// when the first is some digit in m. A sign's cells are not alike, so the
// first cell's digits come from the other way round: REVERSED[mark].
const ACROSS = {};
const REVERSED = { gt: "lt", lt: "gt" };
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
export const signProblem = (signs) => edgeProblem(signs, SIGN_MARKS);

/* ---- quads ---- */

// The four cells round the corner below and right of `cell`.
export const quadCells = (cell) => [cell, cell + 1, cell + 9, cell + 10];

// Whether quads are well formed: each on a corner inside the grid, one to
// four digits 1 to 9, none more than twice (four cells in a square hold a
// digit twice at most), no corner twice. null if so, or what is wrong:
// { why, at }.
export function quadProblem(quads) {
  const seen = new Set();
  for (let i = 0; i < quads.length; i++) {
    const { cell, digits } = quads[i] ?? {};
    if (!Number.isInteger(cell) || cell < 0 || cell > 70 || COL[cell] > 7) return { why: "cell", at: i };
    if (!Array.isArray(digits) || !digits.length || digits.length > 4) return { why: "digits", at: i };
    if (!digits.every((d) => Number.isInteger(d) && d >= 1 && d <= 9)) return { why: "digits", at: i };
    if (digits.some((d) => digits.filter((e) => e === d).length > 2)) return { why: "thrice", at: i };
    if (seen.has(cell)) return { why: "twice", at: i };
    seen.add(cell);
  }
  return null;
}

// Narrows each quad's cells. A digit it lists with no more cells left that
// could take it than it still needs goes in all of them; and once the
// digits still needed fill every empty cell, those cells hold nothing else.
// Placed digits count as masks of one, and `free` is narrowed in place, as
// in thermoBounds; false if a digit has too few cells left, or the digits
// still needed outnumber the empty cells.
function quadBounds(quads, g, free) {
  for (const { cell, digits } of quads) {
    const cells = quadCells(cell);
    const empty = cells.filter((c) => !g[c]);
    let missing = 0;
    let wanted = 0;
    for (const d of new Set(digits)) {
      const left = digits.filter((e) => e === d).length - cells.filter((c) => g[c] === d).length;
      if (left <= 0) continue;
      const room = empty.filter((c) => free[c] & (1 << d));
      if (room.length < left) return false;
      if (room.length === left) for (const c of room) if (!(free[c] &= 1 << d)) return false;
      missing += left;
      wanted |= 1 << d;
    }
    if (missing > empty.length) return false;
    if (missing === empty.length) for (const c of empty) if (!(free[c] &= wanted)) return false;
  }
  return true;
}

/* ---- Counting Circles ---- */

// The most circles there can be: 1 to 9 all in them, each d times, is 45.
export const CIRCLES_MOST = 45;

// Whether Counting Circles' circles are well formed: one to CIRCLES_MOST
// cells on the board, none twice. null if so, or what is wrong: { why },
// why "count", "cell" or "twice".
export function circleProblem(circles) {
  if (!Array.isArray(circles) || !circles.length || circles.length > CIRCLES_MOST) return { why: "count" };
  const got = new Set();
  for (const c of circles) {
    if (!Number.isInteger(c) || c < 0 || c > 80) return { why: "cell" };
    if (got.has(c)) return { why: "twice" };
    got.add(c);
  }
  return null;
}

// The most sets of circles past the first (circlesets): nine sets in all.
export const CIRCLE_SETS_MOST = 8;

// Whether more sets of Counting Circles are well formed: one to
// CIRCLE_SETS_MOST sets, each as circleProblem wants, no cell in two. null
// if so, or what is wrong: { why }, why "sets", "twice" or as circleProblem
// says.
export function circleSetProblem(sets) {
  if (!Array.isArray(sets) || !sets.length || sets.length > CIRCLE_SETS_MOST) return { why: "sets" };
  const got = new Set();
  for (const set of sets) {
    const problem = circleProblem(set);
    if (problem) return problem;
    for (const c of set) {
      if (got.has(c)) return { why: "twice" };
      got.add(c);
    }
  }
  return null;
}

// Every set of circles a variant has: `circles`, then its circlesets.
export const circleSets = (circles = [], circlesets = []) => (circles.length ? [circles, ...circlesets] : circlesets);

// DIGIT_SETS[n]: every set of different digits adding up to n, as masks.
// n circles hold one of them, each digit d in d circles.
const DIGIT_SETS = Array.from({ length: CIRCLES_MOST + 1 }, (_, n) => COMBOS.flatMap((sets) => sets[n]));

// Scratch for circleBounds: for each digit, the circles holding it, and the
// empty ones that could.
const circleHave = new Int32Array(10);
const circleCan = new Int32Array(10);

// Narrows the circles to the sets of digits they could still hold (DIGIT_SETS
// above): each set holding every digit placed, no digit placed more than
// itself or with too few circles left to reach it, and every empty circle
// able to take one. A digit in all of those, needing every circle that
// could take it, goes in them; one with its count placed goes from the
// rest. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if no set is left.
function circleBounds(circles, g, free) {
  circleHave.fill(0);
  circleCan.fill(0);
  let placed = 0;
  for (const c of circles) {
    if (g[c]) {
      circleHave[g[c]]++;
      placed |= 1 << g[c];
    } else for (let d = 1; d <= 9; d++) if (free[c] & (1 << d)) circleCan[d]++;
  }
  let allow = 0;
  let must = ALL;
  for (const set of DIGIT_SETS[circles.length] ?? []) {
    if (placed & ~set) continue;
    let ok = true;
    for (let d = 1; d <= 9 && ok; d++) if (set & (1 << d) && (circleHave[d] > d || circleHave[d] + circleCan[d] < d)) ok = false;
    for (const c of circles) if (ok && !g[c] && !(free[c] & set)) ok = false;
    if (!ok) continue;
    allow |= set;
    must &= set;
  }
  if (!allow) return false;
  for (const c of circles) {
    if (g[c]) continue;
    let m = free[c] & allow;
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (circleHave[d] === d) m &= ~bit;
      else if (must & bit && m & bit && circleHave[d] + circleCan[d] === d) {
        m = bit;
        break;
      }
    }
    if (!(free[c] = m)) return false;
  }
  return true;
}

// Narrows cells a and b, either side of a side, to digits that may sit
// across it from one the other can be: `toA` and `toB` as ACROSS has them,
// toA for the first cell and toB for the second, the same table for a mark
// that is the same either way round. Placed digits count as masks of one,
// and `free` is narrowed in place, as in thermoBounds; false if the two
// cannot be filled, or their placed digits cannot sit across it.
function sideBounds(a, b, toA, toB, g, free) {
  const ma = (g[a] ? 1 << g[a] : free[a]) & toA[g[b] ? 1 << g[b] : free[b]];
  if (!ma) return false;
  const mb = (g[b] ? 1 << g[b] : free[b]) & toB[ma];
  if (!mb) return false;
  if (!g[a]) free[a] = ma;
  if (!g[b]) free[b] = mb;
  return true;
}

// The two cells of each dot or mark, by sideBounds.
function edgeBounds(edges, g, free) {
  for (const { cells, mark } of edges) if (!sideBounds(cells[0], cells[1], ACROSS[REVERSED[mark] ?? mark], ACROSS[mark], g, free)) return false;
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
  for (const { cells, across } of sides) if (!sideBounds(cells[0], cells[1], across, across, g, free)) return false;
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
// A 9 is never hidden.
export const hiddenProblem = (hiddens) => viewProblem(hiddens, "height", 1, 8);
export const roomProblem = (rooms) => viewProblem(rooms, "digit", 1, 9);

// The first digit of a line lower than one before it, hidden behind it, or 0
// if none is: as a Hidden Skyscraper clue there would name.
export function firstHidden(digits) {
  let top = 0;
  for (const d of digits) {
    if (d < top) return d;
    top = d;
  }
  return 0;
}

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

// Narrows each Hidden Skyscraper clue's view. For each place k from the
// clue the hidden digit could be in, the cells before it must rise, the last
// of them taller than it: squeezed as a thermometer is, from the clue on.
// Each place that can still be keeps the digits its squeeze leaves; every
// cell past it may be anything. Placed digits count as masks of one, and
// `free` is narrowed in place; false if no place is left.
function hiddenBounds(hiddens, g, free) {
  const allow = new Int32Array(9);
  const m = new Int32Array(9);
  for (const { view, height } of hiddens) {
    const cells = VIEWS[view];
    allow.fill(0);
    let fits = false;
    for (let k = 1; k < 9; k++) {
      const c = cells[k];
      if (!((g[c] ? 1 << g[c] : free[c]) & (1 << height))) continue;
      // The cells before it: rising, the height itself not among them.
      let ok = true;
      let lo = 0;
      for (let i = 0; i < k && ok; i++) {
        const x = cells[i];
        m[i] = (g[x] ? 1 << g[x] : free[x]) & ABOVE[lo] & ~(1 << height) & (i === k - 1 ? ABOVE[height] : ALL);
        if (!m[i]) ok = false;
        else lo = LOW[m[i]];
      }
      let hi = 10;
      for (let i = k - 1; i >= 0 && ok; i--) {
        m[i] &= BELOW[hi];
        if (!m[i]) ok = false;
        else hi = HIGH[m[i]];
      }
      if (!ok) continue;
      fits = true;
      for (let i = 0; i < k; i++) allow[i] |= m[i];
      allow[k] |= 1 << height;
      for (let i = k + 1; i < 9; i++) allow[i] = ALL;
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

// Narrows each Numbered Room clue's view. The clue's digit sits in one
// place, so the first digit, X, is one more than how far in that place is:
// X may be any digit whose place could hold the clue's (X = 1 only for a
// clue of 1, the first cell being its own place), and a place no X is left
// for cannot hold it. Placed digits count as masks of one, and `free` is
// narrowed in place; false if no X is left.
function roomBounds(rooms, g, free) {
  for (const { view, digit } of rooms) {
    const cells = VIEWS[view];
    const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
    let xs = 0;
    for (let x = 1; x <= 9; x++) {
      if (!(mask(cells[0]) & (1 << x))) continue;
      if (x === 1 ? digit === 1 : x !== digit && mask(cells[x - 1]) & (1 << digit)) xs |= 1 << x;
    }
    if (!xs) return false;
    if (!g[cells[0]]) free[cells[0]] = xs;
    for (let k = 1; k < 9; k++) {
      const c = cells[k];
      if (xs & (1 << (k + 1))) {
        if (xs === 1 << (k + 1) && !g[c] && !(free[c] &= 1 << digit)) return false;
      } else if (g[c] === digit) return false;
      else if (!g[c]) free[c] &= ~(1 << digit);
    }
  }
  return true;
}

/* ---- Full Rank ---- */

// Every view reads as a number, and a Full Rank clue ranks it among all 36.
// The views' first cells are the grid's edge rows and columns, each holding
// every digit once, so four views start with each digit: ranks 1 to 4 start
// with 1, 5 to 8 with 2, and so on. A clue fixes its view's first digit,
// and how many of the other three with it are smaller, the rest larger. As
// the solver it comes from has it by default, a clued view ties with none;
// its other two ways are rules here: Clued Rank Ties, where a clued view
// may tie and its rank counts only those smaller, and No Rank Ties, where
// no two views tie at all, clues or none (tieBounds below).
export const RANK_MOST = 36;

// Whether Full Rank clues are well formed: as clues on views are, a rank 1
// to RANK_MOST, and no rank twice, "same" if so. null if so, or what is
// wrong: { why, at }.
export function rankProblem(ranks) {
  const problem = viewProblem(ranks, "rank", 1, RANK_MOST);
  if (problem) return problem;
  const got = new Set();
  for (let i = 0; i < ranks.length; i++) {
    if (got.has(ranks[i].rank)) return { why: "same", at: i };
    got.add(ranks[i].rank);
  }
  return null;
}

// The digit a rank's view starts with, and how many of the other views
// starting with it are smaller.
export const rankStart = (rank) => (rank + 3) >> 2;
export const rankBelow = (rank) => (rank - 1) & 3;

// How view o's number compares with view e's, on the digits `mask` says
// their cells could hold, both starting with the same digit: -1 if o's is
// sure to be smaller, 1 larger, 0 if they are the same, 2 if it cannot yet
// be told. The first place along them not sure to hold the same digit
// decides it.
function rankOrder(e, o, mask) {
  for (let j = 1; j < 9; j++) {
    const a = mask(e[j]);
    const b = mask(o[j]);
    if (a === b && POP[a] === 1) continue;
    if (HIGH[b] < LOW[a]) return -1;
    if (LOW[b] > HIGH[a]) return 1;
    return 2;
  }
  return 0;
}

// Narrows view lo's number to below view hi's, both starting with the same
// digit: at the first place they are not sure to match, lo's cell keeps no
// digit over the most hi's could be, and hi's none under the least lo's
// could be; while that leaves them matching, on to the next place. Placed
// digits count as masks of one, and `free` is narrowed in place, as in
// thermoBounds; false if lo's cannot be below.
function rankUnder(lo, hi, g, free) {
  for (let j = 1; j < 9; j++) {
    const [x, y] = [lo[j], hi[j]];
    let a = g[x] ? 1 << g[x] : free[x];
    let b = g[y] ? 1 << g[y] : free[y];
    if (a === b && POP[a] === 1) continue;
    a &= BELOW[HIGH[b] + 1];
    if (!a) return false;
    b &= ABOVE[LOW[a] - 1];
    if (!b) return false;
    if (!g[x]) free[x] = a;
    if (!g[y]) free[y] = b;
    if (!(a === b && POP[a] === 1)) return true;
  }
  return false;
}

// Narrows each Full Rank clue's view. Its first cell holds its rank's
// digit. Each other view that could start with it is, by rankOrder, sure
// to be smaller, sure to be larger, or either, and sure to start with it
// or not yet; one sure to be the same cannot start with it. Then no more
// can be sure to be smaller than the clue says, nor fewer could be, and
// likewise larger. When as many could be smaller as the clue says, each of
// those starts with the digit and is smaller; when as many are sure to be,
// any other sure smaller one does not start with it, and any other sure to
// start with it is larger; and likewise the other way. With `tied`, under
// Clued Rank Ties, a clued view may tie: one the same is neither smaller
// nor larger, so the clue says exactly how many are smaller and at most how
// many larger, and one not smaller may be the same. Placed digits count as
// masks of one, and `free` is narrowed in place, as in thermoBounds; false
// if the clue cannot be kept.
const rankOthers = [];
function rankBounds(ranks, g, free, tied = false) {
  const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
  for (const { view, rank } of ranks) {
    const e = VIEWS[view];
    const bit = 1 << rankStart(rank);
    const below = rankBelow(rank);
    const above = 3 - below;
    if (!(mask(e[0]) & bit)) return false;
    if (!g[e[0]]) free[e[0]] = bit;
    let lessCan = 0;
    let lessSure = 0;
    let moreCan = 0;
    let moreSure = 0;
    rankOthers.length = 0;
    for (let w = 0; w < VIEWS.length; w++) {
      const o = VIEWS[w];
      const m = mask(o[0]);
      if (w === view || !(m & bit)) continue;
      const sure = m === bit;
      const order = rankOrder(e, o, mask);
      if (order === 0 && tied) continue;
      if (order === 0) {
        if (sure) return false;
        if (!g[o[0]]) free[o[0]] &= ~bit;
        continue;
      }
      if (order !== 1) {
        lessCan++;
        if (sure && order === -1) lessSure++;
      }
      if (order !== -1) {
        moreCan++;
        if (sure && order === 1) moreSure++;
      }
      rankOthers.push(o, sure, order);
    }
    if (lessSure > below || lessCan < below || moreSure > above || (!tied && moreCan < above)) return false;
    for (let i = 0; i < rankOthers.length; i += 3) {
      const [o, sure, order] = [rankOthers[i], rankOthers[i + 1], rankOthers[i + 2]];
      const less = order !== 1 && lessCan === below;
      // Tied, fewer larger are made up by ties, so none has to be.
      const more = !tied && order !== -1 && moreCan === above;
      if (less && more) return false;
      if (less || more) {
        if (!g[o[0]]) free[o[0]] = bit;
        if (order === 2 && !(less ? rankUnder(o, e, g, free) : rankUnder(e, o, g, free))) return false;
      } else if (!sure && ((order === -1 && lessSure === below) || (order === 1 && moreSure === above))) {
        if (!g[o[0]]) free[o[0]] &= ~bit;
      } else if (tied) continue;
      else if (sure && order === 2 && lessSure === below && !rankUnder(e, o, g, free)) return false;
      else if (sure && order === 2 && moreSure === above && !rankUnder(o, e, g, free)) return false;
    }
  }
  return true;
}

// The pairs of views that could ever read the same: in each place, the
// same cell, or two cells in no row or column together: only a row and a
// column crossing on a long diagonal. With 3x3 boxes not even those, as
// each pair puts two cells of a box in one place, so only a Jigsaw's
// regions leave a tie to rule out.
export const TIE_PAIRS = [];
for (let v = 0; v < 36; v++) {
  for (let w = v + 1; w < 36; w++) {
    const [a, b] = [VIEWS[v], VIEWS[w]];
    if (a.every((c, j) => c === b[j] || (ROW[c] !== ROW[b[j]] && COL[c] !== COL[b[j]]))) TIE_PAIRS.push([a, b]);
  }
}

// Under No Rank Ties: no two views read the same. For each pair that could,
// once every place but one is sure to match, that place's cells differ.
// Placed digits count as masks of one, and `free` is narrowed in place, as
// in thermoBounds; false if a pair is sure to match.
function tieBounds(g, free) {
  const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
  for (const [a, b] of TIE_PAIRS) {
    let open = -1;
    for (let j = 0; j < 9; j++) {
      if (a[j] === b[j]) continue;
      const [x, y] = [mask(a[j]), mask(b[j])];
      if (x === y && POP[x] === 1) continue;
      // Sure to differ here, or at more than one place yet: no tie to stop.
      if (!(x & y) || open >= 0) {
        open = -2;
        break;
      }
      open = j;
    }
    if (open === -1) return false;
    if (open < 0) continue;
    for (const [c, o] of [
      [a[open], b[open]],
      [b[open], a[open]],
    ]) {
      if (g[c] || POP[mask(o)] !== 1) continue;
      if (!(free[c] &= ~mask(o))) return false;
    }
  }
  return true;
}

/* ---- Row/Column Indexing ---- */

// INDEXERS[line], for each line an Indexing mark can go by: its cells as
// [{ cell, targets, digit }]. The cell's digit, X, puts `digit` in the X-th
// of `targets`. A marked row's cells point down their columns, at that
// row's number; a marked column's point along their rows, at that
// column's.
export const INDEXERS = [...Array(18).keys()].map((line) => {
  const i = line % 9;
  return [...Array(9).keys()].map((j) =>
    line < 9 ? { cell: cellAt(i, j), targets: SANDWICH_LINES[9 + j], digit: i + 1 } : { cell: cellAt(j, i), targets: SANDWICH_LINES[j], digit: i + 1 }
  );
});

// Whether Indexing marks are well formed: a line each, no line twice. null
// if so, or what is wrong: { why, at }.
export function indexingProblem(indexings) {
  const got = new Set();
  for (let i = 0; i < indexings.length; i++) {
    const { line } = indexings[i] ?? {};
    if (!Number.isInteger(line) || line < 0 || line > 17) return { why: "line", at: i };
    if (got.has(line)) return { why: "twice", at: i };
    got.add(line);
  }
  return null;
}

// The most single indexing cells: every cell, both ways.
export const INDEX_CELLS_MOST = 162;

// Whether single indexing cells are well formed: a cell each, and a line
// that is its row or its column, no cell twice the same way. null if so, or
// what is wrong: { why, at }, why "cell", "line" or "twice".
export function indexCellProblem(indexcells) {
  if (indexcells.length > INDEX_CELLS_MOST) return { why: "twice", at: INDEX_CELLS_MOST };
  const got = new Set();
  for (let i = 0; i < indexcells.length; i++) {
    const { cell, line } = indexcells[i] ?? {};
    if (!Number.isInteger(cell) || cell < 0 || cell > 80) return { why: "cell", at: i };
    if (line !== ROW[cell] && line !== 9 + COL[cell]) return { why: "line", at: i };
    if (got.has(cell * 18 + line)) return { why: "twice", at: i };
    got.add(cell * 18 + line);
  }
  return null;
}

// Every indexing cell, of a marked row or column or on its own, as
// INDEXERS has them: [{ cell, targets, digit }].
export const indexers = (indexings = [], indexcells = []) => [
  ...indexings.flatMap(({ line }) => INDEXERS[line]),
  ...indexcells.map(({ cell, line }) => INDEXERS[line].find((x) => x.cell === cell)),
];

// Narrows each indexing cell, from indexers above. Its targets hold `digit`
// once, so the cell's digit is one more than how far along that is: X may
// be any digit whose target could hold it, and a target no X is left for
// cannot. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if no X is left.
function indexingBounds(cells, g, free) {
  const mask = (c) => (g[c] ? 1 << g[c] : free[c]);
  for (const { cell, targets, digit } of cells) {
    const bit = 1 << digit;
    const xm = mask(cell);
    let xs = 0;
    for (let k = 0; k < 9; k++) if (xm & (2 << k) && mask(targets[k]) & bit) xs |= 2 << k;
    if (!xs) return false;
    if (!g[cell]) free[cell] = xs;
    for (let k = 0; k < 9; k++) {
      const t = targets[k];
      if (xs & (2 << k)) {
        if (xs === 2 << k && !g[t] && !(free[t] &= bit)) return false;
      } else if (g[t] === digit) return false;
      else if (!g[t] && !(free[t] &= ~bit)) return false;
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

/* ---- Rellik cages, lunchboxes, Look and Say and Equality cages ---- */

// Whether a cage's placed digits are all different, taking them out of its
// empty cells if so. `free` is narrowed in place, as in thermoBounds.
function distinctBounds(cells, g, free) {
  let placed = 0;
  for (const c of cells) {
    if (!g[c]) continue;
    const bit = 1 << g[c];
    if (placed & bit) return false;
    placed |= bit;
  }
  for (const c of cells) if (!g[c] && !(free[c] &= ~placed)) return false;
  return true;
}

// The totals some set of a Rellik cage's placed digits adds up to, 0 for
// none of them, up to its sum.
const REACH = new Uint8Array(46);

// Takes out of each Rellik cage's empty cells every digit that would make
// its sum with some set of the digits placed, itself included; false if
// some set of them makes it already. Placed digits count as masks of one,
// and `free` is narrowed in place, as in thermoBounds.
function rellikBounds(relliks, g, free) {
  for (const { sum, cells } of relliks) {
    REACH.fill(0, 0, sum + 1);
    REACH[0] = 1;
    for (const c of cells) {
      const d = g[c];
      if (!d) continue;
      for (let t = sum; t >= d; t--) if (REACH[t - d]) REACH[t] = 1;
      if (REACH[sum]) return false;
    }
    let banned = 0;
    for (let d = 1; d <= 9 && d <= sum; d++) if (REACH[sum - d]) banned |= 1 << d;
    for (const c of cells) if (!g[c] && !(free[c] &= ~banned)) return false;
  }
  return true;
}

// Scratch for lunchboxBounds, a mask for each of up to nine cells.
const lunchMasks = new Int32Array(9);
const lunchAllow = new Int32Array(9);

// Narrows each lunchbox to the ways it could still go, as sandwichBounds
// narrows a sandwich: for each two of its cells its smallest and its
// largest digit could sit in, and each two digits they could be, far enough
// apart to leave room for the rest, whether every other cell can take a
// digit between the two, those between the two cells adding up to its sum,
// with different digits. Placed digits count as masks of one, and `free` is
// narrowed in place, as in thermoBounds; false if no way is left.
function lunchboxBounds(lunchboxes, g, free) {
  const m = lunchMasks;
  const allow = lunchAllow;
  for (const { sum, cells } of lunchboxes) {
    const n = cells.length;
    if (!distinctBounds(cells, g, free)) return false;
    let placed = 0;
    for (let x = 0; x < n; x++) {
      const c = cells[x];
      m[x] = g[c] ? 1 << g[c] : free[c];
      if (g[c]) placed |= m[x];
    }
    allow.fill(0);
    let fits = false;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        for (let lo = 1; lo + n - 1 <= 9; lo++) {
          if (!(m[i] & (1 << lo))) continue;
          for (let hi = lo + n - 1; hi <= 9; hi++) {
            if (!(m[j] & (1 << hi))) continue;
            const range = between(lo + 1, hi - 1);
            // The digits the cells between the two still need, how many
            // of those cells are empty and what they could take; and how
            // many cells outside are empty.
            let rest = sum;
            let left = 0;
            let room = 0;
            let outside = 0;
            let ok = true;
            for (let x = 0; x < n && ok; x++) {
              if (x === i || x === j) continue;
              const inside = x > a && x < b;
              const d = g[cells[x]];
              if (d) {
                if (!(range & (1 << d))) ok = false;
                else if (inside) rest -= d;
              } else if (!(m[x] & range)) ok = false;
              else if (inside) {
                left++;
                room |= m[x];
              } else outside++;
            }
            if (!ok || rest < 0) continue;
            // The digits left for the empty cells, and the sets of them the
            // cells between could hold, leaving enough for those outside.
            const spare = range & ~placed;
            let inner = 0;
            if (!left) {
              if (rest || POP[spare] < outside) continue;
            } else {
              for (const set of COMBOS[left][rest] ?? []) if (!(set & ~spare) && !(set & ~room) && POP[spare & ~set] >= outside) inner |= set;
              if (!inner) continue;
            }
            fits = true;
            allow[i] |= 1 << lo;
            allow[j] |= 1 << hi;
            for (let x = 0; x < n; x++) if (x !== i && x !== j) allow[x] |= x > a && x < b ? inner | (placed & range) : range;
          }
        }
      }
    }
    if (!fits) return false;
    for (let x = 0; x < n; x++) {
      const c = cells[x];
      if (g[c]) {
        if (!(allow[x] & (1 << g[c]))) return false;
      } else if (!(free[c] &= allow[x])) return false;
    }
  }
  return true;
}

// Look and Say cages with their clues read: [{ cells, want }], want as
// sayCounts gives it.
export const sayCages = (looksays = []) => looksays.map(({ clue, cells }) => ({ cells, want: sayCounts(clue) }));

// For each digit a Look and Say cage names: no more placed than its count,
// and enough empty cells that can take it for the rest. Once the count is
// placed, the empty cells lose it; once it needs every empty cell that can
// take it, those cells hold it. And the digits still owed fit in the empty
// cells. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if the clue cannot be kept.
function sayBounds(says, g, free) {
  for (const { cells, want } of says) {
    let empty = 0;
    for (const c of cells) if (!g[c]) empty++;
    let owed = 0;
    for (let d = 1; d <= 9; d++) {
      if (want[d] < 0) continue;
      const bit = 1 << d;
      let have = 0;
      let can = 0;
      for (const c of cells) {
        if (g[c] === d) have++;
        else if (!g[c] && free[c] & bit) can++;
      }
      if (have > want[d] || have + can < want[d]) return false;
      owed += want[d] - have;
      for (const c of cells) {
        if (g[c]) continue;
        if (have === want[d]) free[c] &= ~bit;
        else if (have + can === want[d] && free[c] & bit) free[c] = bit;
      }
    }
    if (owed > empty) return false;
    for (const c of cells) if (!g[c] && !free[c]) return false;
  }
  return true;
}

// The four halves an Equality cage's digits are even across: low and high,
// odd and even. None holds 5.
const EQUAL_HALVES = [between(1, 4), between(6, 9), (1 << 1) | (1 << 3) | (1 << 7) | (1 << 9), (1 << 2) | (1 << 4) | (1 << 6) | (1 << 8)];

// Narrows each Equality cage: different digits, no 5, and each of the four
// halves holding half its cells. Once a half has its share placed, the
// empty cells lose it; once it needs every empty cell that can take one of
// its digits, those cells keep only its digits. Placed digits count as
// masks of one, and `free` is narrowed in place, as in thermoBounds; false
// if the cage cannot be even.
function equalityBounds(equalities, g, free) {
  for (const { cells } of equalities) {
    if (!distinctBounds(cells, g, free)) return false;
    const half = cells.length / 2;
    for (const c of cells) {
      if (g[c] === 5) return false;
      if (!g[c] && !(free[c] &= ~(1 << 5))) return false;
    }
    for (const digits of EQUAL_HALVES) {
      let have = 0;
      let can = 0;
      for (const c of cells) {
        if (g[c]) have += (digits >> g[c]) & 1;
        else if (free[c] & digits) can++;
      }
      if (have > half || have + can < half) return false;
      for (const c of cells) {
        if (g[c]) continue;
        if (have === half) free[c] &= ~digits;
        else if (have + can === half && free[c] & digits) free[c] &= digits;
        if (!free[c]) return false;
      }
    }
  }
  return true;
}

/* ---- Equal Sum, Same Values, Connected Values and Count Distinct cages ---- */

// The most a piece of an Equal Sum cage can add up to: nine 9s.
const PIECE_TOP = 81;
// Scratch for equalSumBounds: at each gap between two cells of a piece,
// whether the cells before it can add up to each total (sumAhead), and
// whether from each total there the cells after it can reach one every
// piece can make (sumBehind); and those totals (sumCommon).
const sumAhead = Array.from({ length: 10 }, () => new Uint8Array(PIECE_TOP + 1));
const sumBehind = Array.from({ length: 10 }, () => new Uint8Array(PIECE_TOP + 1));
const sumCommon = new Uint8Array(PIECE_TOP + 1);

// Fills sumAhead for a piece. Placed digits count as masks of one.
function piecesAhead(piece, g, free) {
  sumAhead[0].fill(0);
  sumAhead[0][0] = 1;
  for (let i = 0; i < piece.length; i++) {
    const m = g[piece[i]] ? 1 << g[piece[i]] : free[piece[i]];
    const from = sumAhead[i];
    const to = sumAhead[i + 1];
    to.fill(0);
    for (let t = 0; t <= 9 * i; t++) {
      if (!from[t]) continue;
      for (let d = 1; d <= 9; d++) if (m & (1 << d)) to[t + d] = 1;
    }
  }
}

// Narrows each Equal Sum cage, as piecesOf splits it, to the totals every
// piece can make, and each cell to the digits that take its piece to one of
// them, going along the piece and coming back as sumLineBounds does. Digits
// may repeat. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if the pieces share no total.
function equalSumBounds(groups, g, free) {
  for (const pieces of groups) {
    sumCommon.fill(1);
    for (const piece of pieces) {
      piecesAhead(piece, g, free);
      const end = sumAhead[piece.length];
      for (let t = 0; t <= PIECE_TOP; t++) sumCommon[t] &= end[t];
    }
    if (!sumCommon.includes(1)) return false;
    for (const piece of pieces) {
      const n = piece.length;
      piecesAhead(piece, g, free);
      sumBehind[n].set(sumCommon);
      for (let i = n - 1; i >= 0; i--) {
        const c = piece[i];
        const m = g[c] ? 1 << g[c] : free[c];
        const before = sumAhead[i];
        const after = sumBehind[i + 1];
        const back = sumBehind[i];
        back.fill(0);
        let keep = 0;
        for (let d = 1; d <= 9; d++) {
          if (!(m & (1 << d))) continue;
          for (let t = 0; t + d <= PIECE_TOP; t++) {
            if (!after[t + d]) continue;
            back[t] = 1;
            if (before[t]) keep |= 1 << d;
          }
        }
        if (!keep) return false;
        if (!g[c]) free[c] = keep;
      }
    }
  }
  return true;
}

// Scratch for sameValueBounds: each piece's count of a digit placed, and
// its empty cells that could take it.
const sameHave = new Int32Array(81);
const sameCan = new Int32Array(81);

// Narrows each Same Values cage, as piecesOf splits it. A digit goes only
// where every piece has a cell that could take it. Then for each digit:
// every piece holds it as often as the one with the most placed, so no
// piece can fall short of those; a piece already at the fewest any could
// hold takes no more, and one that needs every cell that could take it gets
// it there. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if the pieces cannot match.
function sameValueBounds(groups, g, free) {
  for (const pieces of groups) {
    let common = ALL;
    for (const piece of pieces) {
      let room = 0;
      for (const c of piece) room |= g[c] ? 1 << g[c] : free[c];
      common &= room;
    }
    for (const piece of pieces) {
      for (const c of piece) {
        if (g[c] ? !(common & (1 << g[c])) : !(free[c] &= common)) return false;
      }
    }
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      let most = 0;
      let least = 9;
      for (let p = 0; p < pieces.length; p++) {
        let have = 0;
        let can = 0;
        for (const c of pieces[p]) {
          if (g[c] === d) have++;
          else if (!g[c] && free[c] & bit) can++;
        }
        sameHave[p] = have;
        sameCan[p] = can;
        most = Math.max(most, have);
        least = Math.min(least, have + can);
      }
      if (most > least) return false;
      if (!least) continue;
      for (let p = 0; p < pieces.length; p++) {
        const full = sameHave[p] === least;
        const short = sameHave[p] < most && sameHave[p] + sameCan[p] === most;
        if (!full && !short) continue;
        for (const c of pieces[p]) {
          if (g[c] || !(free[c] & bit)) continue;
          free[c] = full ? free[c] & ~bit : bit;
          if (!free[c]) return false;
        }
      }
    }
  }
  return true;
}

// Connected Values cages with their clues read: [{ cells, want }], want the
// clue's digits as a mask.
export const linkCages = (connecteds = []) => connecteds.map(({ clue, cells }) => ({ cells, want: clueMask(clue) }));

// Scratch for connectedBounds: which cells could hold a digit of the clue,
// by the pass that found them (so none needs clearing), and which part of
// those, joined edge to edge, each is in.
const linkPass = new Float64Array(81);
const linkPart = new Int32Array(81);
const linkTodo = new Int32Array(81);
let linkPasses = 0;

// Narrows each Connected Values cage. The cells that could hold one of the
// clue's digits split into parts joined edge to edge; one must be there,
// and every cell sure to hold one must be in the same part. Once one is,
// the cells of the other parts lose the clue's digits. Placed digits count
// as masks of one, and `free` is narrowed in place, as in thermoBounds;
// false if the clue's cells cannot join up.
function connectedBounds(links, g, free) {
  for (const { cells, want } of links) {
    const pass = ++linkPasses;
    for (const c of cells) {
      if (!((g[c] ? 1 << g[c] : free[c]) & want)) continue;
      linkPass[c] = pass;
      linkPart[c] = 0;
    }
    let parts = 0;
    for (const start of cells) {
      if (linkPass[start] !== pass || linkPart[start]) continue;
      linkPart[start] = ++parts;
      linkTodo[0] = start;
      for (let k = 0, n = 1; k < n; k++) {
        const c = linkTodo[k];
        for (const o of [c - 9, c + 9, COL[c] > 0 ? c - 1 : -1, COL[c] < 8 ? c + 1 : -1]) {
          if (o < 0 || o > 80 || linkPass[o] !== pass || linkPart[o]) continue;
          linkPart[o] = parts;
          linkTodo[n++] = o;
        }
      }
    }
    if (!parts) return false;
    let home = 0;
    for (const c of cells) {
      if (linkPass[c] !== pass || (g[c] ? 0 : free[c] & ~want)) continue;
      if (home && linkPart[c] !== home) return false;
      home = linkPart[c];
    }
    if (!home) continue;
    for (const c of cells) if (linkPass[c] === pass && linkPart[c] !== home && !g[c] && !(free[c] &= ~want)) return false;
  }
  return true;
}

// Scratch for countDistinctBounds: the counted cells' masks, which cell
// each digit is matched to, and the digits tried on this search.
const distinctMasks = new Int32Array(81);
const distinctOwner = new Int32Array(10);
let distinctTried = 0;

// Whether counted cell i can be matched to a digit of its own, moving those
// matched before along if need be.
function distinctMatch(i) {
  for (let m = distinctMasks[i]; m; m &= m - 1) {
    const bit = m & -m;
    if (distinctTried & bit) continue;
    distinctTried |= bit;
    const d = 31 - Math.clz32(bit);
    if (distinctOwner[d] < 0 || distinctMatch(distinctOwner[d])) {
      distinctOwner[d] = i;
      return true;
    }
  }
  return false;
}

// Narrows each Count Distinct cage's control to the counts its other cells
// could still make: no more than the most different digits they can hold
// at once, a matching of cells to digits, and no fewer than the different
// digits placed, one more if an empty cell can take none of those. Once the
// most the control allows is placed, the empty cells keep to digits already
// there. Placed digits count as masks of one, and `free` is narrowed in
// place, as in thermoBounds; false if no count is left.
function countDistinctBounds(distincts, g, free) {
  for (const { control, cells } of distincts) {
    let n = 0;
    let placed = 0;
    for (const c of cells) {
      if (c === control) continue;
      distinctMasks[n++] = g[c] ? 1 << g[c] : free[c];
      if (g[c]) placed |= 1 << g[c];
    }
    let fresh = 0;
    for (const c of cells) if (c !== control && !g[c] && !(free[c] & placed)) fresh = 1;
    distinctOwner.fill(-1);
    let most = 0;
    for (let i = 0; i < n && most < 9; i++) {
      distinctTried = 0;
      if (distinctMatch(i)) most++;
    }
    const counts = between(POP[placed] + fresh, most) & (g[control] ? 1 << g[control] : free[control]);
    if (!counts) return false;
    if (!g[control]) free[control] = counts;
    if (POP[placed] === HIGH[counts]) for (const c of cells) if (c !== control && !g[c] && !(free[c] &= placed)) return false;
  }
  return true;
}

/* ---- candidates and solving ---- */

const norm = (v) => ({
  cages: v?.cages ?? [],
  relliks: v?.relliks ?? [],
  lunchboxes: v?.lunchboxes ?? [],
  looksays: v?.looksays ?? [],
  equalities: v?.equalities ?? [],
  equalsums: v?.equalsums ?? [],
  samevalues: v?.samevalues ?? [],
  connecteds: v?.connecteds ?? [],
  distincts: v?.distincts ?? [],
  thermos: v?.thermos ?? [],
  arrows: v?.arrows ?? [],
  doubles: v?.doubles ?? [],
  pills: v?.pills ?? [],
  whispers: v?.whispers ?? [],
  renbans: v?.renbans ?? [],
  palindromes: v?.palindromes ?? [],
  zippers: v?.zippers ?? [],
  betweens: v?.betweens ?? [],
  lockouts: v?.lockouts ?? [],
  entropics: v?.entropics ?? [],
  modulars: v?.modulars ?? [],
  sumlines: v?.sumlines ?? [],
  regionsums: v?.regionsums ?? [],
  indexes: v?.indexes ?? [],
  dots: v?.dots ?? [],
  xvs: v?.xvs ?? [],
  signs: v?.signs ?? [],
  quads: v?.quads ?? [],
  sandwiches: v?.sandwiches ?? [],
  littles: v?.littles ?? [],
  skyscrapers: v?.skyscrapers ?? [],
  xsums: v?.xsums ?? [],
  hiddens: v?.hiddens ?? [],
  rooms: v?.rooms ?? [],
  circles: v?.circles ?? [],
  circlesets: v?.circlesets ?? [],
  ranks: v?.ranks ?? [],
  indexings: v?.indexings ?? [],
  indexcells: v?.indexcells ?? [],
  regions: v?.regions?.length ? v.regions : null,
  rules: v?.rules ?? 0,
});

// What can go in each empty cell, by every cell it must differ from, its
// cage of whatever kind, its thermometers, arrows and other lines, its dots
// and marks, its 2x2 squares under Global Entropy or Global Mod, the digits
// around it under Anti-taxicab and Dutch Flatmates, the Counting Circles,
// the clues outside, and under No Rank Ties the views it could tie;
// 0 for a filled cell. A killer cage allows digits not already
// in it that some way of filling the rest of it can use.
export function variantCandidates(grid, variant) {
  const { cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, circles, circlesets, ranks, indexings, indexcells, regions, rules } = norm(variant);
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
  rellikBounds(relliks, grid, out);
  lunchboxBounds(lunchboxes, grid, out);
  sayBounds(sayCages(looksays), grid, out);
  equalityBounds(equalities, grid, out);
  equalSumBounds(equalsums.map(({ cells }) => piecesOf(cells)), grid, out);
  sameValueBounds(samevalues.map(({ cells }) => piecesOf(cells)), grid, out);
  connectedBounds(linkCages(connecteds), grid, out);
  countDistinctBounds(distincts, grid, out);
  thermoBounds(thermos, grid, out);
  arrowBounds(arrows, grid, out);
  scaleBounds(scales(doubles, pills), grid, out);
  whisperBounds(whispers, grid, out, whisperGap(rules));
  renbanBounds(renbans, grid, out);
  palindromeBounds(palindromes, grid, out);
  zipperBounds(zippers, grid, out);
  betweenBounds(betweens, grid, out);
  lockoutBounds(lockouts, grid, out);
  entropicBounds(entropics, grid, out);
  modularBounds(modulars, grid, out);
  sumLineBounds(sumlines, grid, out);
  regionSumBounds(regionRuns(regionsums, regions), grid, out);
  indexBounds(indexes, grid, out);
  edgeBounds(dots, grid, out);
  edgeBounds(xvs, grid, out);
  edgeBounds(signs, grid, out);
  quadBounds(quads, grid, out);
  barredBounds(barredSides(rules, dots, xvs), grid, out);
  squareBounds(squareKinds(rules), grid, out);
  if (has(rules, "antitaxicab")) taxicabBounds(grid, out);
  if (has(rules, "dutchflatmates")) flatmateBounds(grid, out);
  sandwichBounds(sandwiches, grid, out);
  littleBounds(littles, grid, out);
  skyscraperBounds(skyscrapers, grid, out);
  xsumBounds(xsums, grid, out);
  hiddenBounds(hiddens, grid, out);
  roomBounds(rooms, grid, out);
  for (const set of circleSets(circles, circlesets)) circleBounds(set, grid, out);
  rankBounds(ranks, grid, out, has(rules, "cluedrankties"));
  if (has(rules, "norankties")) tieBounds(grid, out);
  indexingBounds(indexers(indexings, indexcells), grid, out);
  return out;
}

// Depth first search. At each step every empty cell's candidates are worked
// out from its houses, the cells it must differ from, its cages of the
// other kinds, its thermometers,
// arrows and other lines, its dots and marks, its 2x2 squares, the digits
// around it under Anti-taxicab and Dutch Flatmates, the clues outside, and
// its killer cage, where a
// cage allows only the digit sets that make its sum and that its empty cells
// could still hold. Then a digit with one place left in a house, or one a
// killer cage cannot do without and only one of its cells can take, goes there;
// otherwise the search branches on the cell with the fewest candidates. A
// digit with no place left, or a cell with no candidate, ends the branch.
// `found` is called on each solution and returns true to stop.
//
// It gives up after BUDGET steps and says so, returning false: a layout
// with too much freedom can take minutes to settle. The count is the same
// everywhere, so the page and the server always agree on a puzzle.
export const BUDGET = 400000;

function search(grid, variant, found) {
  const { cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, circles, circlesets, ranks, indexings, indexcells, regions, rules } = norm(variant);
  const { houses, housesOf, pairs } = layout(rules, regions);
  const gap = whisperGap(rules);
  const sets = circleSets(circles, circlesets);
  const tied = has(rules, "cluedrankties");
  const untied = has(rules, "norankties");
  const pointers = indexers(indexings, indexcells);
  const says = sayCages(looksays);
  const sumGroups = equalsums.map(({ cells }) => piecesOf(cells));
  const sameGroups = samevalues.map(({ cells }) => piecesOf(cells));
  const links = linkCages(connecteds);
  const balances = scales(doubles, pills);
  const runs = regionRuns(regionsums, regions);
  const barred = barredSides(rules, dots, xvs);
  const sorts = squareKinds(rules);
  const taxicab = has(rules, "antitaxicab");
  const flatmates = has(rules, "dutchflatmates");
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
    if (relliks.length && !rellikBounds(relliks, g, free)) return null;
    if (lunchboxes.length && !lunchboxBounds(lunchboxes, g, free)) return null;
    if (says.length && !sayBounds(says, g, free)) return null;
    if (equalities.length && !equalityBounds(equalities, g, free)) return null;
    if (sumGroups.length && !equalSumBounds(sumGroups, g, free)) return null;
    if (sameGroups.length && !sameValueBounds(sameGroups, g, free)) return null;
    if (links.length && !connectedBounds(links, g, free)) return null;
    if (distincts.length && !countDistinctBounds(distincts, g, free)) return null;
    if (thermos.length && !thermoBounds(thermos, g, free)) return null;
    if (arrows.length && !arrowBounds(arrows, g, free)) return null;
    if (balances.length && !scaleBounds(balances, g, free)) return null;
    if (whispers.length && !whisperBounds(whispers, g, free, gap)) return null;
    if (renbans.length && !renbanBounds(renbans, g, free)) return null;
    if (palindromes.length && !palindromeBounds(palindromes, g, free)) return null;
    if (zippers.length && !zipperBounds(zippers, g, free)) return null;
    if (betweens.length && !betweenBounds(betweens, g, free)) return null;
    if (lockouts.length && !lockoutBounds(lockouts, g, free)) return null;
    if (entropics.length && !entropicBounds(entropics, g, free)) return null;
    if (modulars.length && !modularBounds(modulars, g, free)) return null;
    if (sumlines.length && !sumLineBounds(sumlines, g, free)) return null;
    if (runs.length && !regionSumBounds(runs, g, free)) return null;
    if (indexes.length && !indexBounds(indexes, g, free)) return null;
    if (dots.length && !edgeBounds(dots, g, free)) return null;
    if (xvs.length && !edgeBounds(xvs, g, free)) return null;
    if (signs.length && !edgeBounds(signs, g, free)) return null;
    if (quads.length && !quadBounds(quads, g, free)) return null;
    if (barred.length && !barredBounds(barred, g, free)) return null;
    if (sorts.length && !squareBounds(sorts, g, free)) return null;
    if (taxicab && !taxicabBounds(g, free)) return null;
    if (flatmates && !flatmateBounds(g, free)) return null;
    if (sandwiches.length && !sandwichBounds(sandwiches, g, free)) return null;
    if (littles.length && !littleBounds(littles, g, free)) return null;
    if (skyscrapers.length && !skyscraperBounds(skyscrapers, g, free)) return null;
    if (xsums.length && !xsumBounds(xsums, g, free)) return null;
    if (hiddens.length && !hiddenBounds(hiddens, g, free)) return null;
    if (rooms.length && !roomBounds(rooms, g, free)) return null;
    for (const set of sets) if (!circleBounds(set, g, free)) return null;
    if (ranks.length && !rankBounds(ranks, g, free, tied)) return null;
    if (untied && !tieBounds(g, free)) return null;
    if (pointers.length && !indexingBounds(pointers, g, free)) return null;
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
