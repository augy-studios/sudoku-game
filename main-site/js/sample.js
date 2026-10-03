// The Create screen's Show sample: a made-up puzzle with an example of each
// part the rules switched on would draw, to show what such a puzzle looks
// like before drawing one. Pure, with no DOM.
//
// It starts from a full grid that keeps the rules on, then takes each part
// from that grid, so every sum, count and mark is true of it: a cage adds up
// its own digits, a thermometer's digits rise. Each part is checked against
// the grid by the engine before it goes in, and kept apart from the others
// where there is room, so each can be seen on its own.
//
// samplePuzzle({ on, rules }): on, the switch keys of the parts on, as the
// Solver and Create screens name them (killer, thermo, kropki, sandwich,
// jigsaw and so on); rules, the switch rules' bits (RULES in variant.js).
// Gives { grid, clues, parts, regions, shading, kept, loose, missing }: the
// full grid, the clues shown from it, the parts as a variant's lists, the
// regions to draw (a Jigsaw's, or Chaos Construction's as the grid cuts
// them), the Yin-Yang shading, the switch rules the grid keeps, whether it
// had to leave some out because they cannot all hold at once, and the keys
// of parts no example was found for.

import { ROW, COL, BOX, randomSolution } from "./sudoku.js";
import {
  variantSolutions,
  RULES,
  hasRule,
  VALUE,
  ZERO,
  zeroClash,
  touching,
  beside,
  piecesOf,
  diagonalFrom,
  VIEWS,
  chaosArms,
  waysFrom,
  quadCells,
  regionProblem,
  shadingKeeps,
  whisperGap,
  DUTCH_GAP,
  LOCKOUT_GAP,
  SHADED,
  UNSHADED,
  firstHidden,
  seen,
  cageProblem,
  rellikProblem,
  lunchboxProblem,
  lookSayProblem,
  equalityProblem,
  equalSumProblem,
  sameValueProblem,
  connectedProblem,
  distinctProblem,
  pillProblem,
  sumLineProblem,
  littleProblem,
  rankProblem,
} from "./variant.js";

const bit = (key) => RULES.find((r) => r.key === key).bit;
const cellAt = (r, c) => r * 9 + c;
const sum = (cells, grid) => cells.reduce((t, c) => t + VALUE[grid[c]], 0);

// Cells in an order that hops round the board, so parts taken one after
// another land apart.
const ORDER = [...Array(81).keys()].map((i) => (i * 37 + 40) % 81);

// The clues shown: a classic pattern, the same half turned round.
const HALF = [2, 6, 9, 13, 17, 21, 23, 29, 33, 37, 39];
const SHOWN = [...HALF, 40, ...HALF.map((c) => 80 - c)];

// A Jigsaw's regions for the sample: the boxes, each trading a cell or two
// with the one beside it.
const JIGSAW = Array.from(BOX);
for (const [a, b] of [
  [20, 27],
  [22, 30],
  [26, 33],
  [46, 54],
  [50, 58],
  [52, 62],
]) {
  [JIGSAW[a], JIGSAW[b]] = [JIGSAW[b], JIGSAW[a]];
}

// Yin-Yang's shading for the sample: a comb from the left edge, its teeth
// every other row, against one from the right. Each shade joins up, and no
// 2x2 square is all one shade.
const COMB = Array.from({ length: 81 }, (_, c) => (COL[c] === 0 || (COL[c] < 8 && ROW[c] % 2 === 0) ? SHADED : UNSHADED));

// Switch rules that only say how drawn parts behave, so they never decide
// the grid on their own.
const OPTIONS = bit("dutchwhispers") | bit("cluedrankties");
const CHAOS = bit("chaos");
const STRICT = { kropki: bit("strictkropki"), xv: bit("strictxv") };
// The parts Doppelgänger's 0 means nothing to, by their switch keys.
const ZERO_PARTS = { entropic: "entropics", fullrank: "ranks", rowcolindex: "indexings", chaosarrow: "chaosarrows", chaoscount: "chaoscounts" };

// A small seeded source of unsigned 32 bit integers, for randomSolution.
function source(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// A full grid keeping `base`, a variant with no parts but its rules,
// regions and indexing marks: one of a few classic grids if it keeps them,
// for variety, or else the engine's own. null if none can.
function gridFor(base) {
  for (let seed = 1; seed <= 4; seed++) {
    const grid = randomSolution(source(seed));
    const got = variantSolutions(grid, base, 1);
    if (got?.length) return got[0];
  }
  return variantSolutions(new Array(81).fill(0), base, 1)?.[0] ?? null;
}

// Paths of `len` cells, each touching the one before, from starts in ORDER,
// as `ok` passes them; ok sees each path in full. At most `most` of them
// are looked at, so a part with no example cannot take long.
function* paths(len, free, most = 20000) {
  let looked = 0;
  const path = [];
  function* walk() {
    if (path.length === len) {
      looked++;
      yield path.slice();
      return;
    }
    const last = path.at(-1);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = ROW[last] + dr;
        const c = COL[last] + dc;
        if ((!dr && !dc) || r < 0 || r > 8 || c < 0 || c > 8) continue;
        const next = cellAt(r, c);
        if (path.includes(next) || !free(next)) continue;
        path.push(next);
        yield* walk();
        path.pop();
        if (looked >= most) return;
      }
    }
  }
  for (const start of ORDER) {
    if (!free(start)) continue;
    path.push(start);
    yield* walk();
    path.pop();
    if (looked >= most) return;
  }
}

// Cells in a straight line along a row (step 1) or down a column (step 9),
// from starts in ORDER.
function* straights(len, free) {
  for (const start of ORDER) {
    for (const step of [1, 9]) {
      const cells = [...Array(len).keys()].map((i) => start + i * step);
      if (step === 1 && COL[start] + len > 9) continue;
      if (step === 9 && ROW[start] + len > 9) continue;
      if (cells.every(free)) yield cells;
    }
  }
}

// Pairs of cells sharing a side, as the marks on sides take them, first in
// reading order.
function* sides(free) {
  for (const a of ORDER) {
    for (const b of [a + 1, a + 9]) if (b < 81 && beside(a, b) && free(a) && free(b)) yield [a, b];
  }
}

const isRun = (ds) => new Set(ds).size === ds.length && Math.max(...ds) - Math.min(...ds) === ds.length - 1;
const kind3 = (v, of) => new Set(v.map(of)).size === 3;

export function samplePuzzle({ on = [], rules = 0 } = {}) {
  const keys = new Set(on);
  const jigsaw = keys.has("jigsaw") && !(rules & CHAOS);
  // With a strict rule's marks on, every mark it calls for is drawn, so the
  // grid is found without it; with the marks off, it keeps the grid clear of
  // them.
  let gridRules = rules & ~OPTIONS;
  for (const [kind, strict] of Object.entries(STRICT)) if (keys.has(kind)) gridRules &= ~strict;
  const indexings = keys.has("rowcolindex") ? [{ line: 9 }] : [];
  const regionsOn = jigsaw ? JIGSAW : null;
  const wanted = gridRules;
  // Doppelgänger's 0 means nothing to some rules and parts, so with any of
  // those on the grid leaves it out, as a made puzzle could not have both.
  const zeroParts = Object.entries(ZERO_PARTS).filter(([key]) => keys.has(key));
  if (zeroClash({ rules: gridRules, ...Object.fromEntries(zeroParts.map(([, list]) => [list, [0]])) })) gridRules &= ~bit("doppelganger");

  // The rules the grid keeps, dropping more of them each time none can.
  const empty = new Array(81).fill(0);
  let grid = null;
  let used = 0;
  for (const r of new Set([gridRules, gridRules & ~bit("doppelganger"), gridRules & CHAOS, 0])) {
    // Under Chaos Construction the search can take seconds to give up on
    // rules that cannot all hold; with the boxes it gives up at once. Rules
    // that cannot hold with the boxes are taken as not holding without.
    const base = { rules: r, regions: regionsOn, indexings };
    if (r & CHAOS && r !== CHAOS && variantSolutions(empty, { ...base, rules: r & ~CHAOS }, 1)?.length === 0) continue;
    grid = gridFor(base);
    used = r;
    if (grid) break;
  }
  if (!grid) {
    grid = gridFor({ rules: 0 });
    used = 0;
  }
  const loose = used !== wanted;
  const zero = hasRule(used, "doppelganger");
  // The regions each part goes by: a Jigsaw's, Chaos Construction's as this
  // grid cuts them, or the boxes.
  const chaosRegions = grid.regions ?? null;
  const regions = regionsOn ?? chaosRegions ?? Array.from(BOX);
  const digits = grid.slice();

  // A part is checked against the grid with its rules, the regions as plain
  // regions, Chaos Construction's included, so no cut has to be searched for.
  const checkRules = (used & ~CHAOS) | (rules & OPTIONS);
  const holds = (extra) => variantSolutions(digits, { rules: checkRules, regions: regionsOn ?? chaosRegions, ...extra }, 1)?.length === 1;

  const taken = new Set(); // cells a part already uses
  const caged = new Set(); // cells in a cage, of any kind
  const sidesTaken = new Set();
  const spots = new Set();
  const parts = {};
  const missing = [];
  const add = (list, part) => (parts[list] ??= []).push(part);

  // Tries `find` with the cells others use left alone, then, if that finds
  // nothing, sharing cells with them, but never another cage's for a cage.
  const tryFree = (find) => find((c) => !taken.has(c)) || find((c) => !caged.has(c));
  function place(key, find) {
    const got = tryFree(find);
    if (!got) missing.push(key);
    return got;
  }
  const mark = (cells, cage = false) => {
    for (const c of cells) {
      taken.add(c);
      if (cage) caged.add(c);
    }
  };

  // The first of `gen` that `make` turns into a part the grid keeps.
  const first = (gen, make) => {
    for (const cells of gen) {
      const out = make(cells);
      if (out && holds(out.check)) return out;
    }
    return null;
  };

  /* ---- cages ---- */

  // A cage in a straight line, `len` cells or one fewer, so its digits are
  // all different.
  const cage = (key, list, len, make, problem) =>
    place(key, (free) => {
      for (const n of [len, len - 1]) {
        if (n < 1) continue;
        const got = first(straights(n, free), (cells) => {
          const part = make(cells);
          if (!part || problem([part], used)) return null;
          return { part, check: { [list]: [part] } };
        });
        if (got) return got;
      }
      return null;
    });

  const cageKinds = [
    ["killer", "cages", 3, (cells) => ({ sum: sum(cells, digits), cells }), cageProblem],
    [
      "rellik",
      "relliks",
      3,
      (cells) => {
        const totals = new Set([0]);
        for (const c of cells) for (const t of [...totals]) totals.add(t + VALUE[digits[c]]);
        let n = 1;
        while (totals.has(n)) n++;
        return n <= 45 ? { sum: n, cells } : null;
      },
      rellikProblem,
    ],
    [
      "lunchbox",
      "lunchboxes",
      5,
      (cells) => {
        const vs = cells.map((c) => VALUE[digits[c]]);
        const lo = vs.indexOf(Math.min(...vs));
        const hi = vs.indexOf(Math.max(...vs));
        const inside = vs.slice(Math.min(lo, hi) + 1, Math.max(lo, hi));
        return inside.length ? { sum: inside.reduce((t, v) => t + v, 0), cells } : null;
      },
      lunchboxProblem,
    ],
    [
      "looksay",
      "looksays",
      3,
      (cells) => {
        const held = cells.map((c) => digits[c]).filter((d) => d !== ZERO);
        const none = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !held.includes(d));
        return held.length ? { clue: `1${held[0]}0${none}`, cells } : null;
      },
      lookSayProblem,
    ],
    [
      "equality",
      "equalities",
      2,
      (cells) => {
        const vs = cells.map((c) => digits[c]);
        if (vs.some((d) => d === 5 || d === ZERO)) return null;
        const odd = vs.filter((d) => d % 2).length;
        const low = vs.filter((d) => d < 5).length;
        return odd * 2 === vs.length && low * 2 === vs.length ? { cells } : null;
      },
      equalityProblem,
    ],
    [
      "connected",
      "connecteds",
      3,
      // Its group the first two cells, and its size said, as it may be.
      (cells) => {
        const clue = [...new Set(cells.slice(0, 2).map((c) => digits[c]))].filter((d) => d !== ZERO).sort().join("");
        return clue.length === 2 ? { clue, cells, size: 2 } : null;
      },
      connectedProblem,
    ],
  ];
  for (const [key, list, len, make, problem] of cageKinds) {
    if (!keys.has(key)) continue;
    const got = cage(key, list, len, make, problem);
    if (got) {
      add(list, got.part);
      mark(got.part.cells, true);
    }
  }

  // Equal Sum: a cell alone, and two side by side near it adding up the same.
  // Same Values: two pairs side by side, near each other, holding the same
  // two digits.
  if (keys.has("equalsum")) {
    const got = place("equalsum", (free) => {
      for (const a of ORDER) {
        if (!free(a)) continue;
        for (const [p, q] of sides(free)) {
          if (p === a || q === a || Math.max(Math.abs(ROW[p] - ROW[a]), Math.abs(COL[p] - COL[a])) > 2) continue;
          if (VALUE[digits[p]] + VALUE[digits[q]] !== VALUE[digits[a]]) continue;
          const cells = [a, p, q].sort((x, y) => x - y);
          if (piecesOf(cells).length !== 2) continue;
          const part = { cells };
          if (!equalSumProblem([part]) && holds({ equalsums: [part] })) return { part };
        }
      }
      return null;
    });
    if (got) {
      add("equalsums", got.part);
      mark(got.part.cells, true);
    }
  }
  if (keys.has("samevalue")) {
    const got = place("samevalue", (free) => {
      const pairs = [...sides(free)];
      for (const one of pairs) {
        const want = one.map((c) => digits[c]).sort().join();
        for (const two of pairs) {
          if (two.some((c) => one.includes(c)) || two.map((c) => digits[c]).sort().join() !== want) continue;
          if (Math.abs(ROW[one[0]] - ROW[two[0]]) > 3 || Math.abs(COL[one[0]] - COL[two[0]]) > 3) continue;
          const cells = [...one, ...two].sort((x, y) => x - y);
          if (piecesOf(cells).length !== 2) continue;
          const part = { cells };
          if (!sameValueProblem([part]) && holds({ samevalues: [part] })) return { part };
        }
      }
      return null;
    });
    if (got) {
      add("samevalues", got.part);
      mark(got.part.cells, true);
    }
  }
  // Count Distinct: the # cell, then as many cells along its row or column
  // as its digit, all different.
  if (keys.has("countdistinct")) {
    const got = place("countdistinct", (free) => {
      for (const n of [2, 3, 1]) {
        const part = first(straights(n + 1, free), (cells) => {
          if (VALUE[digits[cells[0]]] !== n) return null;
          const p = { control: cells[0], cells };
          return distinctProblem([p]) ? null : { part: p, check: { distincts: [p] } };
        });
        if (part) return part;
      }
      return null;
    });
    if (got) {
      add("distincts", got.part);
      mark(got.part.cells, true);
    }
  }

  /* ---- lines ---- */

  const v = (c) => VALUE[digits[c]];
  const gap = whisperGap(rules);
  const LINE_KINDS = [
    ["thermo", "thermos", [4, 3], (p) => p.every((c, i) => !i || v(c) > v(p[i - 1]))],
    ["arrow", "arrows", [3, 4], (p) => sum(p.slice(1), digits) === v(p[0])],
    ["doublearrow", "doubles", [4, 3], (p) => sum(p.slice(1, -1), digits) === v(p[0]) + v(p.at(-1))],
    ["whisper", "whispers", [4, 3], (p) => p.every((c, i) => !i || Math.abs(v(c) - v(p[i - 1])) >= gap)],
    // A Dutch line closer than a German one could be somewhere, to show it.
    ["dutch", "dutches", [4, 3], (p) => p.every((c, i) => !i || Math.abs(v(c) - v(p[i - 1])) >= DUTCH_GAP) && p.some((c, i) => i && Math.abs(v(c) - v(p[i - 1])) < 5)],
    ["renban", "renbans", [4, 3], (p) => isRun(p.map(v))],
    ["palindrome", "palindromes", [3, 5], (p) => p.every((c, i) => digits[c] === digits[p.at(-1 - i)])],
    [
      "zipper",
      "zippers",
      [3, 4],
      (p) => {
        const total = p.length % 2 ? v(p[(p.length - 1) / 2]) : v(p[0]) + v(p.at(-1));
        for (let i = 0; i < Math.floor(p.length / 2); i++) if (v(p[i]) + v(p.at(-1 - i)) !== total) return false;
        return true;
      },
    ],
    [
      "between",
      "betweens",
      [4, 3],
      (p) => {
        const [lo, hi] = [v(p[0]), v(p.at(-1))].sort((x, y) => x - y);
        return p.slice(1, -1).every((c) => v(c) > lo && v(c) < hi);
      },
    ],
    [
      "lockout",
      "lockouts",
      [4, 3],
      (p) => {
        const [lo, hi] = [v(p[0]), v(p.at(-1))].sort((x, y) => x - y);
        return hi - lo >= LOCKOUT_GAP && p.slice(1, -1).every((c) => v(c) < lo || v(c) > hi);
      },
    ],
    ["entropic", "entropics", [4, 3], (p) => p.every((_, i) => i < 2 || kind3(p.slice(i - 2, i + 1).map(v), (x) => Math.ceil(x / 3)))],
    ["modular", "modulars", [4, 3], (p) => p.every((_, i) => i < 2 || kind3(p.slice(i - 2, i + 1).map(v), (x) => x % 3))],
    [
      "regionsum",
      "regionsums",
      [3, 4],
      (p) => {
        const runs = [];
        p.forEach((c, i) => (i && regions[c] === regions[p[i - 1]] ? (runs[runs.length - 1] += v(c)) : runs.push(v(c))));
        return runs.length > 1 && runs.every((t) => t === runs[0]);
      },
    ],
    [
      "valueindex",
      "indexes",
      [4, 3, 5],
      (p) => {
        const k = v(p[1]);
        return k >= 1 && 1 + k < p.length && digits[p[1 + k]] === digits[p[0]];
      },
    ],
  ];
  for (const [key, list, lens, ok] of LINE_KINDS) {
    if (!keys.has(key)) continue;
    const got = place(key, (free) => {
      for (const len of lens) {
        const line = first(paths(len, free), (p) => (ok(p) ? { line: p, check: { [list]: [p] } } : null));
        if (line) return line;
      }
      return null;
    });
    if (got) {
      add(list, got.line);
      mark(got.line);
    }
  }

  // A sum line: two runs or three adding up the same.
  if (keys.has("sumline")) {
    const got = place("sumline", (free) => {
      for (const len of [4, 3, 5]) {
        const line = first(paths(len, free), (p) => {
          for (let cut = 1; cut < p.length; cut++) {
            const total = sum(p.slice(0, cut), digits);
            let run = 0;
            let ok = total > 0;
            for (const c of p) {
              run += v(c);
              if (run === total) run = 0;
              else if (run > total) ok = false;
            }
            if (!ok || run) continue;
            const part = { sum: total, cells: p };
            if (!sumLineProblem([part])) return { line: part, check: { sumlines: [part] } };
          }
          return null;
        });
        if (line) return line;
      }
      return null;
    });
    if (got) {
      add("sumlines", got.line);
      mark(got.line.cells);
    }
  }

  // A pill arrow: a pill of two along a row, then an arrow from beside it
  // adding up to the pill's number.
  if (keys.has("pillarrow")) {
    const got = place("pillarrow", (free) => {
      for (const len of [4, 5]) {
        const line = first(paths(len, free, 60000), (p) => {
          const [a, b] = p;
          if (b !== a + 1 || ROW[a] !== ROW[b]) return null;
          const number = v(a) * 10 + v(b);
          const arrow = p.slice(2);
          if (sum(arrow, digits) !== number) return null;
          const part = { pill: [a, b], arrow };
          return pillProblem([part]) ? null : { line: part, check: { pills: [part] } };
        });
        if (line) return line;
      }
      return null;
    });
    if (got) {
      add("pills", got.line);
      mark([...got.line.pill, ...got.line.arrow]);
    }
  }

  /* ---- marks on sides and corners ---- */

  // The marks a side between digits a and b could hold, by rule.
  const MARKS = {
    kropki: {
      list: "dots",
      of: (a, b) => (Math.abs(v(a) - v(b)) === 1 ? "white" : v(a) === 2 * v(b) || v(b) === 2 * v(a) ? "black" : null),
      want: ["white", "black"],
    },
    xv: { list: "xvs", of: (a, b) => (v(a) + v(b) === 10 ? "x" : v(a) + v(b) === 5 ? "v" : null), want: ["x", "v"] },
    greater: { list: "signs", of: (a, b) => (v(a) > v(b) ? "gt" : "lt"), want: ["gt", "lt"] },
  };
  for (const [key, M] of Object.entries(MARKS)) {
    if (!keys.has(key)) continue;
    // Under a strict rule every side its marks fit is marked, as such a
    // puzzle is.
    if (STRICT[key] && rules & STRICT[key]) {
      const all = [];
      for (let a = 0; a < 81; a++) {
        for (const b of [a + 1, a + 9]) {
          if (b > 80 || !beside(a, b) || sidesTaken.has(`${a},${b}`)) continue;
          const m = M.of(a, b);
          if (m) all.push({ cells: [a, b], mark: m });
        }
      }
      if (all.length && holds({ [M.list]: all })) {
        for (const e of all) sidesTaken.add(e.cells.join());
        parts[M.list] = all;
      } else missing.push(key);
      continue;
    }
    // One of each mark it has, where the grid has a side for it.
    for (const want of M.want) {
      const got = tryFree((free) => {
        for (const [a, b] of sides(free)) {
          if (sidesTaken.has(`${a},${b}`) || M.of(a, b) !== want) continue;
          const e = { cells: [a, b], mark: want };
          if (holds({ [M.list]: [e] })) return e;
        }
        return null;
      });
      if (!got) continue;
      add(M.list, got);
      sidesTaken.add(got.cells.join());
      mark(got.cells);
    }
    if (!parts[M.list]) missing.push(key);
  }

  // A quad: two of the four digits round a corner.
  if (keys.has("quad")) {
    const got = place("quad", (free) => {
      for (const cell of ORDER) {
        if (ROW[cell] > 7 || COL[cell] > 7) continue;
        const four = quadCells(cell);
        if (!four.every(free)) continue;
        const ds = four.map((c) => digits[c]).filter((d) => d !== ZERO);
        if (ds.length < 2) continue;
        const q = { cell, digits: ds.slice(0, 2).sort() };
        if (holds({ quads: [q] })) return { q, four };
      }
      return null;
    });
    if (got) {
      add("quads", got.q);
      mark(got.four);
    }
  }

  /* ---- marks in cells ---- */

  // Counting Circles: a 1, two 2s and three 3s, each in a circle.
  if (keys.has("counting")) {
    const got = place("counting", (free) => {
      const circles = [];
      for (const d of [1, 2, 3]) {
        const cells = ORDER.filter((c) => free(c) && digits[c] === d).slice(0, d);
        if (cells.length < d) return null;
        circles.push(...cells);
      }
      circles.sort((a, b) => a - b);
      return holds({ circles }) ? circles : null;
    });
    if (got) {
      parts.circles = got;
      mark(got);
    }
  }

  // Chaos Arrows and Counts, by the regions this grid is cut into.
  if (keys.has("chaosarrow") && rules & CHAOS && chaosRegions) {
    const got = place("chaosarrow", (free) => {
      const found = [];
      for (const cell of ORDER) {
        if (!free(cell) || found.length === 2) continue;
        for (let ways = 15; ways >= 1; ways--) {
          if (ways & ~waysFrom(cell)) continue;
          let count = 1;
          for (const arm of chaosArms(cell, ways)) {
            for (const c of arm) {
              if (chaosRegions[c] !== chaosRegions[cell]) break;
              count++;
            }
          }
          if (count === v(cell)) {
            found.push({ cell, ways });
            break;
          }
        }
      }
      return found.length ? found.sort((a, b) => a.cell - b.cell) : null;
    });
    if (got) {
      parts.chaosarrows = got;
      mark(got.map((a) => a.cell));
    }
  } else if (keys.has("chaosarrow")) missing.push("chaosarrow");
  if (keys.has("chaoscount") && rules & CHAOS && chaosRegions) {
    const got = place("chaoscount", (free) => {
      const found = [];
      for (const cell of ORDER) {
        if (!free(cell) || found.length === 2) continue;
        const near = [...Array(81).keys()].filter((o) => o === cell || (touching(cell, o) && chaosRegions[o] === chaosRegions[cell]));
        if (near.length === v(cell)) found.push(cell);
      }
      return found.length ? found.sort((a, b) => a - b) : null;
    });
    if (got) {
      parts.chaoscounts = got;
      mark(got);
    }
  } else if (keys.has("chaoscount")) missing.push("chaoscount");

  // Yin-Yang: a few circles of each shade on the comb.
  let shading = null;
  if (keys.has("yinyang") && shadingKeeps(COMB)) {
    const shades = [];
    for (const shade of [SHADED, UNSHADED]) {
      shades.push(
        ...ORDER.filter((c) => COMB[c] === shade && !taken.has(c))
          .slice(0, 3)
          .map((cell) => ({ cell, shade }))
      );
    }
    parts.shades = shades.sort((a, b) => a.cell - b.cell);
    mark(shades.map((x) => x.cell));
    shading = COMB.slice();
  }

  /* ---- clues outside the grid ---- */

  // Views in an order that goes round the four sides, each kind starting
  // further on so they spread out.
  const viewOrder = (k) => [...Array(36).keys()].map((i) => (i * 13 + k * 7) % 36);
  const spotOfView = (view) => {
    const i = view % 9;
    return [`${i},-1`, `-1,${i}`, `${i},9`, `9,${i}`][Math.floor(view / 9)];
  };
  const digitsOf = (view) => VIEWS[view].map(v);
  const VIEW_KINDS = [
    ["skyscraper", "skyscrapers", "count", (view) => seen(digitsOf(view))],
    [
      "xsum",
      "xsums",
      "sum",
      (view) => {
        const ds = digitsOf(view);
        return ds[0] ? ds.slice(0, ds[0]).reduce((t, d) => t + d, 0) : null;
      },
    ],
    ["hiddensky", "hiddens", "height", (view) => firstHidden(digitsOf(view)) || null],
    [
      "room",
      "rooms",
      "digit",
      (view) => {
        const ds = digitsOf(view);
        return ds[0] ? ds[ds[0] - 1] || null : null;
      },
    ],
    [
      "fullrank",
      "ranks",
      "rank",
      (view) => {
        const read = (w) => digitsOf(w).join("");
        const mine = read(view);
        const all = [...Array(36).keys()].map(read);
        if (!hasRule(rules, "cluedrankties") && all.filter((x) => x === mine).length > 1) return null;
        return all.filter((x) => x < mine).length + 1;
      },
    ],
  ];
  // The first view in `order` whose spot is free and whose clue, from
  // `clueOf`, the grid keeps, put in `list`.
  const outside = (key, list, order, clueOf) => {
    for (const view of order) {
      if (spots.has(spotOfView(view))) continue;
      const clue = clueOf(view);
      if (!clue || !holds({ [list]: [clue] })) continue;
      parts[list] = [clue];
      spots.add(spotOfView(view));
      return;
    }
    missing.push(key);
  };
  VIEW_KINDS.forEach(([key, list, field, value], k) => {
    if (!keys.has(key)) return;
    outside(key, list, viewOrder(k + 1), (view) => {
      const n = value(view);
      const clue = n == null ? null : { view, [field]: n };
      return clue && (key !== "fullrank" || !rankProblem([clue])) ? clue : null;
    });
  });

  // A Sandwich sum goes left of a row or above a column: views 0 to 17.
  if (keys.has("sandwich")) {
    outside("sandwich", "sandwiches", viewOrder(6).filter((line) => line < 18), (line) => {
      const ds = digitsOf(line);
      const [i, j] = [ds.indexOf(1), ds.indexOf(9)].sort((a, b) => a - b);
      if (i < 0 || j < 0) return null;
      const total = ds.slice(i + 1, j).reduce((t, d) => t + d, 0);
      return total <= 35 ? { line, sum: total } : null;
    });
  }

  if (keys.has("little")) {
    let done = false;
    // From a spot on an edge, down a diagonal of three to six cells.
    for (const [r, c] of [
      [-1, 2],
      [9, 6],
      [3, 9],
      [5, -1],
      [-1, 5],
      [9, 3],
    ]) {
      if (done || spots.has(`${r},${c}`)) continue;
      for (const [dr, dc] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const cells = diagonalFrom(r + dr, c + dc, dr, dc);
        if (cells.length < 3 || cells.length > 6) continue;
        const clue = { cells, sum: sum(cells, digits) };
        if (!littleProblem([clue], rules) && holds({ littles: [clue] })) {
          parts.littles = [clue];
          spots.add(`${r},${c}`);
          done = true;
          break;
        }
      }
    }
    if (!done) missing.push("little");
  }

  if (keys.has("rowcolindex")) parts.indexings = indexings.slice();

  // The clues shown, and any part's list left empty.
  const clues = new Array(81).fill(0);
  for (const c of SHOWN) clues[c] = digits[c];
  return {
    grid: digits,
    clues,
    parts,
    regions: jigsaw ? JIGSAW.slice() : rules & CHAOS ? chaosRegions : null,
    shading,
    kept: used,
    loose,
    missing,
  };
}

// The Jigsaw sample's regions are sound, for the tests.
export const sampleRegionsOk = () => !regionProblem(JIGSAW);
