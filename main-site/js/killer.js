// Killer sudoku: the classic rules, plus cages. A cage is a group of cells
// with a sum; its digits add up to the sum and never repeat within it. Pure,
// with no DOM, and the API imports it too, to work out a made killer
// puzzle's answer.
//
// A cage is { sum, cells }, cells in reading order. A cell is in at most one
// cage, and cells in no cage are allowed.

import { ROW, COL, BOX, PEERS } from "./sudoku.js";

const ALL = 0b1111111110;
const POP = new Uint8Array(1024);
for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);

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

// What can go in each empty cell, by its row, column, box and cage; 0 for a
// filled cell. A cage allows digits not already in it that some way of
// filling the rest of it can use.
export function killerCandidates(grid, cages) {
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
    for (const o of PEERS[c]) m &= ~(1 << grid[o]);
    if (of[c] >= 0) m &= allow[of[c]];
    out[c] = m;
  }
  return out;
}

// The 27 houses: rows, columns and boxes, each nine cells.
const HOUSES = [];
for (const of of [ROW, COL, BOX]) {
  for (let i = 0; i < 9; i++) HOUSES.push([...Array(81).keys()].filter((c) => of[c] === i));
}

// Depth first search. At each step every empty cell's candidates are worked
// out from its row, column, box and cage, where a cage allows only the digit
// sets that make its sum and that its empty cells could still hold. Then a
// digit with one place left in a house, or one a cage cannot do without and
// only one of its cells can take, goes there; otherwise the search branches
// on the cell with the fewest candidates. A digit with no place left, or a
// cell with no candidate, ends the branch. `found` is called on each
// solution and returns true to stop.
//
// It gives up after BUDGET steps and says so, returning false: a cage
// layout with too much freedom can take minutes to settle. The count is the
// same everywhere, so the page and the server always agree on a puzzle.
export const BUDGET = 400000;

function search(grid, cages, found) {
  let steps = 0;
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
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
    if ((rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]] | (k >= 0 ? used[k] : 0)) & bit) return true;
    rows[ROW[c]] |= bit;
    cols[COL[c]] |= bit;
    boxes[BOX[c]] |= bit;
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
    for (let c = 0; c < 81; c++) free[c] = g[c] ? 0 : ALL & ~(rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]]);
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
    for (const house of HOUSES) {
      let once = 0;
      let twice = 0;
      let placed = 0;
      for (const c of house) {
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
        for (const c of house) if (!g[c] && free[c] & bit) return { cell: c, mask: bit };
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
    const r = ROW[cell];
    const col = COL[cell];
    const b = BOX[cell];
    const k = of[cell];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      if (!(mask & bit)) continue;
      g[cell] = d;
      rows[r] |= bit;
      cols[col] |= bit;
      boxes[b] |= bit;
      if (k >= 0) {
        used[k] |= bit;
        rest[k] -= d;
        left[k]--;
      }
      if (step(depth + 1)) return true;
      rows[r] &= ~bit;
      cols[col] &= ~bit;
      boxes[b] &= ~bit;
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
export function killerSolutions(grid, cages, limit = 2) {
  const out = [];
  const settled = search(grid, cages, (g) => {
    out.push(g.slice());
    return out.length >= limit;
  });
  return settled || out.length >= limit ? out : null;
}

export function killerSolve(grid, cages) {
  return killerSolutions(grid, cages, 1)?.[0] ?? null;
}
