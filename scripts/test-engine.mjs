#!/usr/bin/env node
// The pure game modules the page and the API share: the same seed always
// makes the same puzzle, every puzzle has one solution, the log replays and
// undoes as it should, replay links round-trip, and scores add up. Also the
// solver's steps: pasted grids read right, and every hint is the answer's.
//
// Run: node scripts/test-engine.mjs

import assert from "node:assert/strict";
import { LEVEL_IDS } from "../main-site/js/levels.js";
import { newSeed, parseSeed, puzzleFor } from "../main-site/js/seed.js";
import { countSolutions, PEERS } from "../main-site/js/sudoku.js";
import { play, packLog, unpackLog, fromWire, toWire, logText } from "../main-site/js/record.js";
import { parseGrid, puzzleText, clashes, candidates, nextStep, bitCount } from "../main-site/js/steps.js";
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
