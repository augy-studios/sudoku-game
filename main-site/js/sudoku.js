// The sudoku engine: a fast solver and a seeded puzzle generator. Pure, with
// no DOM, and the API imports it too, so the browser and the server always
// build the same puzzle from the same seed.
//
// A grid is an array of 81 numbers in reading order, 0 for an empty cell.
// Integer arithmetic only: the same seed must give the same puzzle in every
// browser and on the server.

export const ROW = [];
export const COL = [];
export const BOX = [];
// The 20 cells sharing a row, column or box with each cell.
export const PEERS = [];

for (let c = 0; c < 81; c++) {
  ROW[c] = Math.floor(c / 9);
  COL[c] = c % 9;
  BOX[c] = Math.floor(ROW[c] / 3) * 3 + Math.floor(COL[c] / 3);
}
for (let c = 0; c < 81; c++) {
  PEERS[c] = [];
  for (let o = 0; o < 81; o++) {
    if (o !== c && (ROW[o] === ROW[c] || COL[o] === COL[c] || BOX[o] === BOX[c])) PEERS[c].push(o);
  }
}

// Digits as bits 1 to 9.
const ALL = 0b1111111110;
const POP = new Uint8Array(1024);
for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);

// Row, column and box masks for a grid, or null if a digit repeats.
function masks(grid) {
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  for (let c = 0; c < 81; c++) {
    const d = grid[c];
    if (!d) continue;
    const bit = 1 << d;
    if ((rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]]) & bit) return null;
    rows[ROW[c]] |= bit;
    cols[COL[c]] |= bit;
    boxes[BOX[c]] |= bit;
  }
  return { rows, cols, boxes };
}

// Depth first search, always on the empty cell with the fewest candidates.
// `order` picks the order digits are tried in; `found` is called on each
// solution and returns true to stop.
function search(grid, order, found) {
  const m = masks(grid);
  if (!m) return;
  const { rows, cols, boxes } = m;
  const g = grid.slice();

  const step = () => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const free = ALL & ~(rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]]);
      const n = POP[free];
      if (n === 0) return false;
      if (n < bestCount) {
        best = c;
        bestMask = free;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best < 0) return found(g);

    const r = ROW[best];
    const col = COL[best];
    const b = BOX[best];
    for (const d of order()) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      g[best] = d;
      rows[r] |= bit;
      cols[col] |= bit;
      boxes[b] |= bit;
      if (step()) return true;
      rows[r] &= ~bit;
      cols[col] &= ~bit;
      boxes[b] &= ~bit;
      g[best] = 0;
    }
    return false;
  };
  step();
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// How many solutions the grid has, counting no further than `limit`.
export function countSolutions(grid, limit = 2) {
  let count = 0;
  search(grid, () => DIGITS, () => ++count >= limit);
  return count;
}

// The grid's first solution, or null if it has none.
export function solve(grid) {
  let out = null;
  search(grid, () => DIGITS, (g) => {
    out = g.slice();
    return true;
  });
  return out;
}

// A shuffled copy. `rand` returns unsigned 32 bit integers.
function shuffled(items, rand) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A full, valid grid, picked by `rand`.
function randomSolution(rand) {
  let out = null;
  search(new Array(81).fill(0), () => shuffled(DIGITS, rand), (g) => {
    out = g.slice();
    return true;
  });
  return out;
}

// A puzzle with exactly one solution. Clues are taken out in an order drawn
// from `rand`, each only if the puzzle keeps a single solution, until
// `blanks` are gone or none more can go.
export function generate(rand, blanks) {
  const solution = randomSolution(rand);
  const puzzle = solution.slice();
  let removed = 0;
  for (const c of shuffled([...Array(81).keys()], rand)) {
    if (removed >= blanks) break;
    const keep = puzzle[c];
    puzzle[c] = 0;
    if (countSolutions(puzzle, 2) === 1) removed++;
    else puzzle[c] = keep;
  }
  return { puzzle, solution };
}
