#!/usr/bin/env node
// The pure game modules the page and the API share: the same seed always
// makes the same puzzle, every puzzle has one solution, the log replays and
// undoes as it should, replay links round-trip, and scores add up. Also the
// solver's steps: pasted grids read right, and every hint is the answer's.
//
// Run: node scripts/test-engine.mjs

import assert from "node:assert/strict";
import { LEVEL_IDS } from "../main-site/js/levels.js";
import { newSeed, parseSeed, puzzleFor, madeSeed } from "../main-site/js/seed.js";
import { countSolutions, PEERS } from "../main-site/js/sudoku.js";
import { play, packLog, unpackLog, packReplay, unpackReplay, fromWire, toWire, logText } from "../main-site/js/record.js";
import { parseGrid, puzzleText, clashes, candidates, nextStep, bitCount, checkClues, rateLevel } from "../main-site/js/steps.js";
import { killerSolutions, killerCandidates, cageProblem } from "../main-site/js/killer.js";
import { tally, liveScore, finalScore, timeBonus, turnBonus, CELL, MISTAKE, HINT, FINISH } from "../main-site/js/score.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Changing these means every seed already shared, and every game already on
// the leaderboard, now stands for a different puzzle. Only on purpose.
const PINNED = {
  "H-BXK4-M9TR": "500400009040050300187039005000082050000060000300004610004600000702800006003001700",
  "E-2345-6789": "180625370200004060000308140800059030905167080060800901659000008407906020000571090",
};

test("pinned seeds make the same puzzles", () => {
  for (const [text, grid] of Object.entries(PINNED)) assert.equal(puzzleFor(parseSeed(text)).puzzle.join(""), grid);
});

test("every level makes valid puzzles with one solution", () => {
  for (const level of LEVEL_IDS) {
    for (let i = 0; i < 50; i++) {
      const seed = newSeed(level);
      const { puzzle, solution } = puzzleFor(seed);
      assert.equal(countSolutions(puzzle, 3), 1, seed.text);
      puzzle.forEach((d, c) => d && assert.equal(d, solution[c]));
      for (let c = 0; c < 81; c++) for (const o of PEERS[c]) assert.notEqual(solution[c], solution[o]);
    }
  }
});

test("seeds parse forgivingly", () => {
  assert.equal(parseSeed(" h bxk4 m9tr ").text, "H-BXK4-M9TR");
  assert.equal(parseSeed("BXK4M9TR", "X").text, "X-BXK4-M9TR");
  assert.equal(parseSeed("BXK4M9TR"), null);
  assert.equal(parseSeed("Q-BXK4-M9TR"), null);
  assert.equal(parseSeed("H-BXK4-M9T0"), null);
});

const seed = parseSeed("E-2345-6789");
const { puzzle, solution } = puzzleFor(seed);
const blanks = puzzle.map((d, c) => (d ? -1 : c)).filter((c) => c >= 0);
const a = (k, c = 0, d = 0, t = 0, b = 0) => ({ k, c, d, t, b });
const wrongDigit = (c) => (solution[c] % 9) + 1;

test("a wrong digit, undone, still counts as a mistake", () => {
  const c = blanks[0];
  const log = [a("p", c, wrongDigit(c), 1000), a("u", 0, 0, 2000), a("p", c, solution[c], 3000)];
  const r = play(puzzle, solution, log);
  assert.equal(r.error, null);
  assert.equal(r.values[c], solution[c]);
  assert.equal(r.steps[1].undid, 0);
  const t = tally(r, log);
  assert.equal(t.mistakes, 1);
  assert.equal(t.placed, 1);
  assert.equal(t.points, CELL - MISTAKE);
});

test("a correct digit undone and placed again earns once", () => {
  const c = blanks[0];
  const log = [a("p", c, solution[c], 1000), a("u", 0, 0, 2000), a("p", c, solution[c], 3000)];
  const t = tally(play(puzzle, solution, log), log);
  assert.equal(t.placed, 1);
  assert.equal(t.points, CELL);
});

test("placing clears the digit from peers' notes, and undo puts it back", () => {
  const c = blanks[0];
  const d = solution[c];
  const peer = PEERS[c].find((o) => !puzzle[o]);
  const log = [a("n", peer, d, 100), a("p", c, d, 200)];
  let r = play(puzzle, solution, log);
  assert.equal(r.notes[peer] & (1 << d), 0);
  r = play(puzzle, solution, [...log, a("u", 0, 0, 300)]);
  assert.notEqual(r.notes[peer] & (1 << d), 0);
});

test("impossible actions are refused", () => {
  const given = puzzle.findIndex((d) => d);
  assert.equal(play(puzzle, solution, [a("p", given, 1)]).error.reason, "given");
  assert.equal(play(puzzle, solution, [a("u")]).error.reason, "nothing_to_undo");
  assert.equal(play(puzzle, solution, [a("e", blanks[0])]).error.reason, "empty");
  const c = blanks[0];
  assert.equal(play(puzzle, solution, [a("p", c, solution[c]), a("h", c)]).error.reason, "no_hint");
});

test("co-op undo takes back the player's own last action", () => {
  const [c0, c1] = blanks;
  const log = [a("p", c0, solution[c0], 1, 0), a("p", c1, solution[c1], 2, 1), a("u", 0, 0, 3, 0)];
  const r = play(puzzle, solution, log);
  assert.equal(r.values[c0], 0);
  assert.equal(r.values[c1], solution[c1]);
});

const solveLog = (gap = 2000) => blanks.map((c, i) => a("p", c, solution[c], (i + 1) * gap));

test("a full solve completes, and nothing plays after it", () => {
  const log = solveLog();
  const r = play(puzzle, solution, log);
  assert.equal(r.complete, true);
  assert.equal(play(puzzle, solution, [...log, a("u", 0, 0, 999999)]).error.reason, "after_end");
});

test("Solve ends the game unfinished", () => {
  const r = play(puzzle, solution, [a("s")]);
  assert.equal(r.solved, true);
  assert.equal(r.complete, false);
});

test("replay links and wire logs round-trip", () => {
  const log = [a("n", blanks[1], 4, 10), ...solveLog()];
  const back = unpackLog(packLog(log), puzzle, solution);
  assert.deepEqual(back.map(({ k, c, d, b }) => [k, c, d, b]), log.map(({ k, c, d, b }) => [k, c, d, b]));
  assert.deepEqual(fromWire(toWire(log)), log);
  assert.equal(unpackLog("AAA", puzzle, solution), null);
  assert.equal(fromWire([["p", 1, 2, 5], ["p", 3, 4, 4]]), null, "times running backwards");
  assert.equal(fromWire([["p", 1, 2, 5, 1]]), null, "player 1 in a one player log");
  assert.match(logText(log), /^n\d+\.4\.10 p/);
});

test("short replay links round-trip, at under 60% of the length", () => {
  const strip = (log) => log.map(({ k, c, d, b }) => [k, c, d, b]);
  const wrong = (solution[blanks[2]] % 9) + 1;
  const log = [a("n", blanks[1], 4, 10), a("p", blanks[2], wrong, 20), a("e", blanks[2], 0, 30), a("h", blanks[3], 0, 40), a("u", 0, 0, 50), ...solveLog()];
  const packed = packReplay(log, solution);
  assert.deepEqual(strip(unpackReplay(packed, puzzle, solution)), strip(log));
  assert.ok(packed.length < packLog(log).length * 0.6, `${packed.length} against ${packLog(log).length}`);
  const coop = [a("n", blanks[1], 4, 10, 1), ...solveLog()].map((x, i) => ({ ...x, b: i % 2 }));
  assert.deepEqual(strip(unpackReplay(packReplay(coop, solution, 2), puzzle, solution, 2)), strip(coop), "co-op keeps its players");
  assert.deepEqual(unpackReplay(packReplay([], solution), puzzle, solution), [], "an empty game");
  assert.equal(unpackReplay("!!", puzzle, solution), null);
  assert.equal(unpackReplay(packed.slice(0, -3), puzzle, solution), null, "a cut link");
});

test("scores scale with level, pace and time", () => {
  assert.equal(turnBonus(1000), 50);
  assert.equal(turnBonus(30000), 0);
  assert.equal(turnBonus(16500), 25);

  const fast = solveLog(2000);
  const slow = solveLog(40000);
  const fastT = tally(play(puzzle, solution, fast), fast, { speed: true });
  const slowT = tally(play(puzzle, solution, slow), slow, { speed: true });
  assert.equal(fastT.points, blanks.length * 150);
  assert.equal(slowT.points, blanks.length * 100);
  assert.equal(tally(play(puzzle, solution, fast), fast).points, blanks.length * CELL, "no pace bonus on a chosen seed");

  assert.equal(liveScore("E", { points: 1000 }), 600);
  assert.equal(liveScore("X", { points: 1000 }), 2200);
  assert.equal(liveScore("E", { points: -50 }), 0);
  assert.equal(finalScore("M", { points: 0 }, 0), FINISH);
  assert.equal(finalScore("M", { points: 0 }, 50), FINISH * 1.5);
  assert.equal(timeBonus("M", 0, true), 50);
  assert.equal(timeBonus("M", 25 * 60000, true), 0);
  assert.equal(timeBonus("M", 0, false), 0);

  const hinted = [a("h", blanks[0], 0, 1000)];
  assert.equal(tally(play(puzzle, solution, hinted), hinted).points, -HINT);
  assert.equal(tally(play(puzzle, solution, hinted), hinted, { freeHints: 1 }).points, 0, "a free hint costs nothing");
  assert.equal(tally(play(puzzle, solution, hinted), hinted, { freeHints: null }).points, 0, "null makes every hint free");
  const twice = [...hinted, a("h", blanks[1], 0, 2000)];
  const t = tally(play(puzzle, solution, twice), twice, { freeHints: 1 });
  assert.equal(t.points, -HINT, "only the hint past the free one costs");
  assert.equal(t.paidHints, 1);
  assert.equal(t.hints, 2);
});

test("the solver reads pasted grids", () => {
  const text = PINNED["H-BXK4-M9TR"];
  assert.deepEqual(parseGrid(text), [...text].map(Number));
  const dotted = text.replace(/0/g, ".").replace(/(.{9})/g, "$1\n").replace(/(.{3})(?=.)/g, "$1 | ");
  assert.deepEqual(parseGrid(dotted), [...text].map(Number), "dots, spaces, bars and line breaks");
  assert.equal(parseGrid(text.slice(1)), null, "80 cells");
  assert.equal(parseGrid(""), null);
  const grid = parseGrid(text);
  assert.equal(puzzleText(grid), text.replace(/0/g, "."), "a copied puzzle uses . for blanks");
  assert.deepEqual(parseGrid(puzzleText(grid)), grid, "and pastes back the same");
});

test("made puzzles' seeds carry the puzzle", () => {
  for (const level of LEVEL_IDS) {
    for (let i = 0; i < 10; i++) {
      const { puzzle, solution } = puzzleFor(newSeed(level));
      const seed = madeSeed(rateLevel(puzzle), puzzle);
      assert.ok(seed.body.length > 8, "never mistaken for a generated seed");
      const back = parseSeed(seed.text.toLowerCase().replace(/-/g, " "));
      assert.equal(back.text, seed.text);
      assert.equal(back.made, true);
      assert.deepEqual(puzzleFor(back).puzzle, puzzle);
      assert.deepEqual(puzzleFor(back).solution, solution);
    }
  }
  assert.equal(parseSeed("H-BXK4-M9TR").made, undefined, "generated seeds are as they were");
  const { puzzle } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const loose = puzzle.slice();
  loose[loose.findIndex(Boolean)] = 0;
  assert.equal(parseSeed(madeSeed("M", loose).text), null, "a puzzle with two answers is no seed");
  assert.equal(parseSeed("M-BBBB-BBBB-BBBB"), null, "nor is an empty grid");
});

test("clues are checked for exactly one answer", () => {
  const { puzzle } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  assert.equal(checkClues(puzzle).ok, true);
  assert.equal(checkClues(new Array(81).fill(0)).why, "empty");
  const clash = puzzle.slice();
  const i = clash.findIndex((d) => !d);
  clash[i] = clash[PEERS[i].find((o) => clash[o])];
  assert.equal(checkClues(clash).why, "clash");
  const few = new Array(81).fill(0);
  few[0] = 1;
  assert.deepEqual(checkClues(few), { ok: false, why: "few", n: 1 });
  const loose = puzzle.slice();
  loose[loose.findIndex(Boolean)] = 0;
  const many = checkClues(loose);
  assert.equal(many.why, "many");
  assert.equal(loose[many.c], 0, "the cell pointed at is empty");
  assert.notEqual(many.digits[0], many.digits[1]);
});

// A killer puzzle with no clues: a solved grid cut into cages of up to
// four cells, drawn from a seeded generator until one has one answer.
function killerPuzzle() {
  const { solution } = puzzleFor(parseSeed("M-KLMN-PQRS"));
  let x = 7;
  const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  for (;;) {
    const free = new Set(solution.keys());
    const cages = [];
    while (free.size) {
      const cells = [[...free][Math.floor(rand() * free.size)]];
      free.delete(cells[0]);
      const want = 1 + Math.floor(rand() * 4);
      while (cells.length < want) {
        const next = cells
          .flatMap((c) => [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1])
          .filter((n) => free.has(n) && !cells.some((o) => solution[o] === solution[n]));
        if (!next.length) break;
        const n = next[Math.floor(rand() * next.length)];
        cells.push(n);
        free.delete(n);
      }
      cages.push({ sum: cells.reduce((t, c) => t + solution[c], 0), cells: cells.sort((a, b) => a - b) });
    }
    if (killerSolutions(new Array(81).fill(0), cages, 2)?.length === 1) return { solution, cages };
  }
}

test("killer cages are checked, solved and carried in seeds", () => {
  const { solution, cages } = killerPuzzle();
  const empty = new Array(81).fill(0);
  assert.equal(cageProblem(cages), null);
  assert.deepEqual(killerSolutions(empty, cages, 2), [solution]);
  assert.equal(cageProblem([{ sum: 3, cells: [0, 2] }]).why, "apart");
  assert.equal(cageProblem([{ sum: 30, cells: [0, 1] }]).why, "sum");
  assert.equal(cageProblem([{ sum: 3, cells: [0, 1] }, { sum: 4, cells: [1, 2] }]).why, "overlap");

  // Candidates never lose the answer's digit, and a cage's sum narrows them.
  const cand = killerCandidates(empty, cages);
  for (let c = 0; c < 81; c++) assert.ok(cand[c] & (1 << solution[c]));
  const pair = cages.find((k) => k.cells.length === 2 && k.sum === 3);
  if (pair) assert.equal(cand[pair.cells[0]], (1 << 1) | (1 << 2));

  // Hints with the cages are always the answer's digit.
  const grid = empty.slice();
  for (let step = nextStep(grid, null, cages); step; step = nextStep(grid, null, cages)) {
    assert.equal(step.d, solution[step.c]);
    grid[step.c] = step.d;
  }

  assert.equal(checkClues(empty, cages).ok, true);
  const clash = empty.slice();
  const cage = cages.find((k) => k.cells.length > 1);
  clash[cage.cells[0]] = 9;
  clash[cage.cells[1]] = 9;
  assert.equal(checkClues(clash, cages).why, "clash", "a digit twice in a cage");
  assert.equal(checkClues(empty, cages.slice(0, 3)).why, "many", "too few cages");

  const seed = madeSeed(rateLevel(empty, cages), empty, cages);
  assert.match(seed.text, /^K-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.cages, seed.cages);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(madeSeed("M", empty, cages.slice(0, 3)).text), null, "too few cages is no seed");
});

test("the solver finds clashes and candidates", () => {
  const grid = new Array(81).fill(0);
  grid[0] = 5;
  grid[8] = 5; // same row
  grid[80] = 3;
  assert.deepEqual([...clashes(grid)].sort((x, y) => x - y), [0, 8]);
  grid[8] = 0;
  assert.equal(clashes(grid).size, 0);
  const cand = candidates(grid);
  assert.equal(cand[0], 0, "a filled cell has none");
  assert.equal(cand[1] & (1 << 5), 0, "5 is in its row");
  assert.equal(bitCount(cand[1]), 8);
  assert.equal(bitCount(cand[40]), 9);
});

// Takes steps until none is left, checking each against the answer.
function stepThrough(puzzle, solution) {
  const grid = puzzle.slice();
  for (;;) {
    const step = nextStep(grid, grid.findIndex((d) => !d));
    if (!step) return grid;
    assert.equal(grid[step.c], 0);
    assert.equal(step.d, solution[step.c], `${step.kind} at ${step.c}`);
    grid[step.c] = step.d;
  }
}

test("every solver step is the answer's digit", () => {
  for (const level of LEVEL_IDS) {
    for (let i = 0; i < 25; i++) {
      const { puzzle, solution } = puzzleFor(newSeed(level));
      stepThrough(puzzle, solution);
    }
  }
  const pinned = puzzleFor(parseSeed("E-2345-6789"));
  assert.deepEqual(stepThrough(pinned.puzzle, pinned.solution), pinned.solution, "an Easy puzzle falls to singles");
});

console.log(`engine ok: ${passed} tests.`);
