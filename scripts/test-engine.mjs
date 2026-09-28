#!/usr/bin/env node
// The pure game modules the page and the API share: the same seed always
// makes the same puzzle, every puzzle has one solution, the log replays and
// undoes as it should, replay links round-trip, and scores add up. Also the
// solver's steps: pasted grids read right, and every hint is the answer's.
//
// Run: node scripts/test-engine.mjs

import assert from "node:assert/strict";
import { LEVEL_IDS } from "../main-site/js/levels.js";
import { newSeed, parseSeed, puzzleFor, madeSeed, seedVariantName } from "../main-site/js/seed.js";
import { countSolutions, PEERS } from "../main-site/js/sudoku.js";
import { play, packLog, unpackLog, packReplay, unpackReplay, fromWire, toWire, logText } from "../main-site/js/record.js";
import { parseGrid, puzzleText, clashes, candidates, nextStep, bitCount, checkClues, rateLevel } from "../main-site/js/steps.js";
import {
  variantSolutions,
  variantSolve,
  variantCandidates,
  variantName,
  cageProblem,
  thermoProblem,
  arrowProblem,
  whisperProblem,
  renbanProblem,
  touching,
  layout,
  RULES,
} from "../main-site/js/variant.js";

const killerSolutions = (grid, cages, limit) => variantSolutions(grid, { cages }, limit);
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
  const cand = variantCandidates(empty, { cages });
  for (let c = 0; c < 81; c++) assert.ok(cand[c] & (1 << solution[c]));
  const pair = cages.find((k) => k.cells.length === 2 && k.sum === 3);
  if (pair) assert.equal(cand[pair.cells[0]], (1 << 1) | (1 << 2));

  // Hints with the cages are always the answer's digit.
  const grid = empty.slice();
  for (let step = nextStep(grid, null, { cages }); step; step = nextStep(grid, null, { cages })) {
    assert.equal(step.d, solution[step.c]);
    grid[step.c] = step.d;
  }

  assert.equal(checkClues(empty, { cages }).ok, true);
  const clash = empty.slice();
  const cage = cages.find((k) => k.cells.length > 1);
  clash[cage.cells[0]] = 9;
  clash[cage.cells[1]] = 9;
  assert.equal(checkClues(clash, { cages }).why, "clash", "a digit twice in a cage");
  assert.equal(checkClues(empty, { cages: cages.slice(0, 3) }).why, "many", "too few cages");

  const seed = madeSeed(rateLevel(empty, { cages }), empty, { cages });
  assert.match(seed.text, /^K-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.cages, seed.cages);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(madeSeed("M", empty, { cages: cages.slice(0, 3) }).text), null, "too few cages is no seed");
});

const rule = (key) => RULES.find((r) => r.key === key).bit;

// Whether a full grid keeps every rule in `rules`.
function keepsRules(grid, rules) {
  const { houses, pairs } = layout(rules);
  for (const { cells } of houses) if (new Set(cells.map((c) => grid[c])).size !== 9) return false;
  return pairs.every((others, c) => others.every((o) => grid[o] !== grid[c]));
}

// A puzzle under `rules` with one answer: an answer that keeps them, and
// its clues taken out one at a time, in a seeded order, while the answer
// stays the only one.
function rulesPuzzle(rules) {
  const solution = variantSolve(new Array(81).fill(0), { rules });
  const puzzle = solution.slice();
  let x = 11;
  const order = [...Array(81).keys()].sort(() => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32) - 0.5);
  for (const c of order) {
    const d = puzzle[c];
    puzzle[c] = 0;
    if (variantSolutions(puzzle, { rules }, 2)?.length !== 1) puzzle[c] = d;
  }
  return { puzzle, solution };
}

test("the switch rules make the right houses and pairs", () => {
  assert.equal(layout(0).houses.length, 27);
  assert.equal(layout(rule("diagonal")).houses.length, 29);
  assert.equal(layout(rule("windoku")).houses.length, 31);
  const knight = layout(rule("antiknight")).pairs;
  assert.equal(knight[40].length, 8, "the centre has eight knight's moves");
  assert.deepEqual(knight[2], [13, 21], "only moves out of its box are new");
  // A king's diagonal step inside the same box is already a peer.
  assert.deepEqual(layout(rule("antiking")).pairs[2], [12]);
  assert.equal(layout(rule("diagonal")).peers[40].length, 20 + 12, "the centre is on both diagonals, four cells of them in its box");
});

test("rules puzzles solve, check, hint and carry their rules in seeds", () => {
  for (const [key, letter] of [["diagonal", "D"], ["antiknight", "N"], ["antiking", "G"], ["windoku", "W"]]) {
    const rules = rule(key);
    const { puzzle, solution } = rulesPuzzle(rules);
    assert.ok(keepsRules(solution, rules), `${key}: the answer keeps the rule`);
    assert.equal(checkClues(puzzle, { rules }).ok, true);
    // Classic rules alone leave it open: the rule is doing work.
    assert.notEqual(countSolutions(puzzle, 2), 1, `${key}: needs the rule`);
    const grid = puzzle.slice();
    for (let step = nextStep(grid, null, { rules }); step; step = nextStep(grid, null, { rules })) {
      assert.equal(step.d, solution[step.c], `${key}: hint at ${step.c}`);
      grid[step.c] = step.d;
    }
    const seed = madeSeed(rateLevel(puzzle, { rules }), puzzle, { rules });
    assert.ok(seed.text.startsWith(`${letter}-`), seed.text);
    const back = parseSeed(seed.text.toLowerCase());
    assert.equal(back.text, seed.text);
    assert.equal(back.rules, rules);
    assert.deepEqual(puzzleFor(back).solution, solution);
  }
  // A clash only the rule sees.
  const clash = new Array(81).fill(0);
  clash[0] = 5;
  clash[80] = 5;
  assert.equal(clashes(clash).size, 0);
  assert.equal(clashes(clash, { rules: rule("diagonal") }).size, 2);
  // Letters come out in one order, whatever order they go in.
  const both = rule("diagonal") | rule("windoku");
  const { puzzle } = rulesPuzzle(both);
  const seed = madeSeed("H", puzzle, { rules: both });
  assert.ok(seed.text.startsWith("DW-H-"));
  assert.equal(parseSeed(seed.text.replace("DW-", "WD-")).text, seed.text);
  // Killer seeds from before the switch rules read as they did.
  assert.equal(parseSeed("K" + seed.text.slice(2)), null, "a killer seed needs cages");
});

// A thermo puzzle: rising paths laid through a solved grid, then clues taken
// out, in a seeded order, while the answer stays the only one.
function thermoPuzzle() {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  let x = 5;
  const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const thermos = [];
  const used = new Set();
  while (thermos.length < 8) {
    let c = Math.floor(rand() * 81);
    if (used.has(c)) continue;
    const path = [c];
    while (path.length < 5) {
      const next = [...Array(81).keys()].filter((o) => touching(c, o) && solution[o] > solution[c] && !path.includes(o) && !used.has(o));
      if (!next.length) break;
      c = next[Math.floor(rand() * next.length)];
      path.push(c);
    }
    if (path.length < 3) continue;
    path.forEach((p) => used.add(p));
    thermos.push(path);
  }
  const puzzle = solution.slice();
  for (const c of [...Array(81).keys()].sort(() => rand() - 0.5)) {
    const d = puzzle[c];
    puzzle[c] = 0;
    if (variantSolutions(puzzle, { thermos }, 2)?.length !== 1) puzzle[c] = d;
  }
  return { puzzle, solution, thermos };
}

test("thermometers are checked, solved and carried in seeds", () => {
  assert.equal(thermoProblem([[0, 1, 2]]), null);
  assert.equal(thermoProblem([[0, 10, 20]]), null, "corner to corner steps are fine");
  assert.equal(thermoProblem([[0]]).why, "length");
  assert.equal(thermoProblem([[0, 2]]).why, "apart");
  assert.equal(thermoProblem([[0, 1, 0]]).why, "loop");

  const { puzzle, solution, thermos } = thermoPuzzle();
  for (const t of thermos) for (let i = 1; i < t.length; i++) assert.ok(solution[t[i]] > solution[t[i - 1]]);
  assert.equal(checkClues(puzzle, { thermos }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the thermometers");

  // Candidates keep the answer and rise: a bulb can never hold a 9.
  const cand = variantCandidates(puzzle, { thermos });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]));
  for (const t of thermos) if (!puzzle[t[0]]) assert.equal(cand[t[0]] & (1 << 9), 0);

  const grid = puzzle.slice();
  for (let step = nextStep(grid, null, { thermos }); step; step = nextStep(grid, null, { thermos })) {
    assert.equal(step.d, solution[step.c]);
    grid[step.c] = step.d;
  }

  // Falling along a thermometer clashes; so does rising too slowly.
  const t = thermos[0];
  const fall = new Array(81).fill(0);
  fall[t[0]] = 5;
  fall[t[1]] = 4;
  assert.deepEqual([...clashes(fall, { thermos })].sort((a, b) => a - b), [t[0], t[1]].sort((a, b) => a - b));
  const slow = new Array(81).fill(0);
  slow[t[0]] = 4;
  slow[t[2]] = 5;
  assert.equal(clashes(slow, { thermos }).size, 2, "two steps need two more");

  const seed = madeSeed(rateLevel(puzzle, { thermos }), puzzle, { thermos });
  assert.match(seed.text, /^T-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.thermos, thermos);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(madeSeed("M", puzzle, { thermos: thermos.slice(1, 2) }).text), null, "one thermometer is not enough");

  // With cages and a rule too, the letters go K, T, then the rules.
  const { cages } = killerPuzzle();
  const both = madeSeed("H", new Array(81).fill(0), { cages, thermos: [[0, 1]], rules: 1 });
  assert.match(both.text, /^KTD-H-/);
});

// An arrow puzzle: arrows laid through a solved grid, each walked from a
// circle until its digits add up to the circle's, then clues taken out, in a
// seeded order, while the answer stays the only one.
function arrowPuzzle() {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  let x = 7;
  const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const arrows = [];
  const used = new Set();
  while (arrows.length < 8) {
    const circle = Math.floor(rand() * 81);
    if (used.has(circle) || solution[circle] < 3) continue;
    const arrow = [circle];
    let total = 0;
    while (total < solution[circle]) {
      const last = arrow.at(-1);
      const next = [...Array(81).keys()].filter(
        (o) => touching(last, o) && !arrow.includes(o) && !used.has(o) && total + solution[o] <= solution[circle]
      );
      if (!next.length) break;
      const o = next[Math.floor(rand() * next.length)];
      arrow.push(o);
      total += solution[o];
    }
    if (total !== solution[circle] || arrow.length < 3) continue;
    arrow.forEach((c) => used.add(c));
    arrows.push(arrow);
  }
  const puzzle = solution.slice();
  for (const c of [...Array(81).keys()].sort(() => rand() - 0.5)) {
    const d = puzzle[c];
    puzzle[c] = 0;
    if (variantSolutions(puzzle, { arrows }, 2)?.length !== 1) puzzle[c] = d;
  }
  return { puzzle, solution, arrows };
}

test("arrows are checked, solved and carried in seeds", () => {
  assert.equal(arrowProblem([[0, 1, 2]]), null);
  assert.equal(arrowProblem([[0, 10]]), null, "corner to corner steps are fine");
  assert.equal(arrowProblem([[0]]).why, "length");
  assert.equal(arrowProblem([[0, 2]]).why, "apart");

  const { puzzle, solution, arrows } = arrowPuzzle();
  for (const [circle, ...cells] of arrows) assert.equal(cells.reduce((t, c) => t + solution[c], 0), solution[circle]);
  assert.equal(checkClues(puzzle, { arrows }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the arrows");

  // Candidates keep the answer, and a circle is at least as big as its
  // arrow is long: a circle with two cells after it can never be a 1.
  const cand = variantCandidates(puzzle, { arrows });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]));
  for (const a of arrows) if (!puzzle[a[0]]) assert.equal(cand[a[0]] & ((1 << (a.length - 1)) - 1), 0);

  const grid = puzzle.slice();
  for (let step = nextStep(grid, null, { arrows }); step; step = nextStep(grid, null, { arrows })) {
    assert.equal(step.d, solution[step.c]);
    grid[step.c] = step.d;
  }

  // Past the circle clashes, as does a full arrow that falls short of it.
  const [circle, a1, a2] = arrows[0];
  const over = new Array(81).fill(0);
  over[circle] = 3;
  over[a1] = 4;
  assert.deepEqual([...clashes(over, { arrows })].sort((p, q) => p - q), [circle, a1].sort((p, q) => p - q));
  const short = new Array(81).fill(0);
  const two = [[circle, a1, a2]];
  short[circle] = 9;
  short[a1] = 1;
  short[a2] = 2;
  assert.equal(clashes(short, { arrows: two }).size, 3);
  short[a2] = 0;
  assert.equal(clashes(short, { arrows: two }).size, 0, "not yet full");
  assert.equal(clashes(new Array(81).fill(0).map((_, c) => (c === a1 ? 9 : c === a2 ? 2 : 0)), { arrows: two }).size, 2, "past 9 with no circle");

  const seed = madeSeed(rateLevel(puzzle, { arrows }), puzzle, { arrows });
  assert.match(seed.text, /^A-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.arrows, arrows);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(madeSeed("M", puzzle, { arrows: arrows.slice(1, 2) }).text), null, "one arrow is not enough");

  // The thermo puzzle's answer is the same grid, so its thermometers fit
  // too; together they read back apart. The letters go K, T, A, the rules.
  const { thermos } = thermoPuzzle();
  const mixed = parseSeed(madeSeed("H", puzzle, { thermos, arrows }).text);
  assert.match(mixed.text, /^TA-H-/);
  assert.deepEqual([mixed.thermos, mixed.arrows], [thermos, arrows]);
  assert.match(madeSeed("H", new Array(81).fill(0), { cages: killerPuzzle().cages, thermos, arrows, rules: 1 }).text, /^KTAD-H-/);
});

// Lines laid through a solved grid, each walked from a random cell while
// `fits` takes the line so far and the next cell, then clues taken out, in
// a seeded order, while the answer stays the only one. As many as `count`
// lines of `min` to `max` cells.
function linePuzzle(key, x, fits, { count = 8, min = 3, max = 6 } = {}) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const lines = [];
  const used = new Set();
  for (let tries = 0; lines.length < count && tries < 5000; tries++) {
    const start = Math.floor(rand() * 81);
    if (used.has(start)) continue;
    const line = [start];
    while (line.length < max) {
      const next = [...Array(81).keys()].filter((o) => touching(line.at(-1), o) && !line.includes(o) && !used.has(o) && fits(line, o, solution));
      if (!next.length) break;
      line.push(next[Math.floor(rand() * next.length)]);
    }
    if (line.length < min) continue;
    line.forEach((c) => used.add(c));
    lines.push(line);
  }
  const puzzle = solution.slice();
  for (const c of [...Array(81).keys()].sort(() => rand() - 0.5)) {
    const d = puzzle[c];
    puzzle[c] = 0;
    if (variantSolutions(puzzle, { [key]: lines }, 2)?.length !== 1) puzzle[c] = d;
  }
  return { puzzle, solution, [key]: lines };
}

const whisperPuzzle = () => linePuzzle("whispers", 11, (line, o, sol) => Math.abs(sol[o] - sol[line.at(-1)]) >= 5);
// The line's digits with the next cell's still a run: all different, and
// spread no wider than there are of them.
const renbanPuzzle = () =>
  linePuzzle("renbans", 13, (line, o, sol) => {
    const digits = [...line, o].map((c) => sol[c]);
    return new Set(digits).size === digits.length && Math.max(...digits) - Math.min(...digits) === digits.length - 1;
  });

// Solves by steps alone, checking each against the answer.
function stepsAgree(puzzle, solution, variant) {
  const grid = puzzle.slice();
  for (let step = nextStep(grid, null, variant); step; step = nextStep(grid, null, variant)) {
    assert.equal(step.d, solution[step.c]);
    grid[step.c] = step.d;
  }
}

test("German Whispers lines are checked, solved and carried in seeds", () => {
  assert.equal(whisperProblem([[0, 10, 20]]), null);
  assert.equal(whisperProblem([[0]]).why, "length");
  assert.equal(whisperProblem([[0, 2]]).why, "apart");

  const { puzzle, solution, whispers } = whisperPuzzle();
  assert.equal(whispers.length, 8);
  for (const t of whispers) for (let i = 1; i < t.length; i++) assert.ok(Math.abs(solution[t[i]] - solution[t[i - 1]]) >= 5);
  assert.equal(checkClues(puzzle, { whispers }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the lines");

  // Candidates keep the answer, and a line never takes a 5.
  const cand = variantCandidates(puzzle, { whispers });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]));
  for (const t of whispers) for (const c of t) assert.equal(cand[c] & (1 << 5), 0);
  // Next to a 4, only a 9 is far enough.
  const four = new Array(81).fill(0);
  four[0] = 4;
  assert.equal(variantCandidates(four, { whispers: [[0, 1]] })[1], 1 << 9);
  stepsAgree(puzzle, solution, { whispers });

  // Neighbours too close clash.
  const [a, b] = whispers[0];
  const close = new Array(81).fill(0);
  close[a] = 2;
  close[b] = 6;
  assert.deepEqual([...clashes(close, { whispers })].sort((p, q) => p - q), [a, b].sort((p, q) => p - q));
  close[b] = 7;
  assert.equal(clashes(close, { whispers }).size, 0);

  const seed = madeSeed(rateLevel(puzzle, { whispers }), puzzle, { whispers });
  assert.match(seed.text, /^S-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.whispers, whispers);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(madeSeed("M", puzzle, { whispers: whispers.slice(1, 2) }).text), null, "one line is not enough");
});

test("renban lines are checked, solved and carried in seeds", () => {
  assert.equal(renbanProblem([[0, 1, 2]]), null);
  assert.equal(renbanProblem([[0, 1, 0]]).why, "loop");

  const { puzzle, solution, renbans } = renbanPuzzle();
  assert.equal(renbans.length, 8);
  for (const t of renbans) {
    const digits = t.map((c) => solution[c]);
    assert.equal(new Set(digits).size, t.length);
    assert.equal(Math.max(...digits) - Math.min(...digits), t.length - 1);
  }
  assert.equal(checkClues(puzzle, { renbans }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the lines");

  const cand = variantCandidates(puzzle, { renbans });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]));
  // A line of three through a 5 holds 3 to 7; one of nine, everything.
  const five = new Array(81).fill(0);
  five[1] = 5;
  const run = variantCandidates(five, { renbans: [[0, 1, 2]] });
  assert.equal(run[0], 0b11111000 & ~(1 << 5));
  assert.equal(run[2], run[0]);
  // A line of four with a 2 and a 5 on it is 2 3 4 5.
  const ends = new Array(81).fill(0);
  ends[0] = 2;
  ends[3] = 5;
  assert.equal(variantCandidates(ends, { renbans: [[0, 1, 2, 3]] })[1], (1 << 3) | (1 << 4));
  stepsAgree(puzzle, solution, { renbans });

  // A repeat clashes, as do digits spread wider than the line is long.
  const t = [0, 10, 20];
  const wide = new Array(81).fill(0);
  wide[0] = 1;
  wide[20] = 4;
  assert.deepEqual([...clashes(wide, { renbans: [t] })].sort((p, q) => p - q), [0, 20]);
  wide[20] = 3;
  assert.equal(clashes(wide, { renbans: [t] }).size, 0);
  // Row 3, column 3 and row 4, column 4 share no house, so only the line
  // stops a repeat there.
  const apart = [20, 30];
  const twice = new Array(81).fill(0);
  twice[20] = 1;
  twice[30] = 1;
  assert.equal(clashes(twice).size, 0);
  assert.deepEqual([...clashes(twice, { renbans: [apart] })], [20, 30]);
  assert.equal(variantSolutions(twice, { renbans: [apart] }, 1)?.length, 0, "a repeat has no answer");

  const seed = madeSeed(rateLevel(puzzle, { renbans }), puzzle, { renbans });
  assert.match(seed.text, /^R-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.renbans, renbans);
  assert.deepEqual(puzzleFor(back).solution, solution);

  // All the same grid, so every kind of line fits it at once; together they
  // read back apart. The letters go K, T, A, S, R, then the rules.
  const { thermos } = thermoPuzzle();
  const { arrows } = arrowPuzzle();
  const { whispers } = whisperPuzzle();
  const mixed = parseSeed(madeSeed("H", puzzle, { thermos, arrows, whispers, renbans }).text);
  assert.match(mixed.text, /^TASR-H-/);
  assert.deepEqual([mixed.thermos, mixed.arrows, mixed.whispers, mixed.renbans], [thermos, arrows, whispers, renbans]);
  assert.match(madeSeed("H", new Array(81).fill(0), { cages: killerPuzzle().cages, whispers, renbans, rules: 1 }).text, /^KSRD-H-/);
  assert.equal(seedVariantName("KSRD-H-BBBB"), "Killer, German Whispers, Renban, Diagonal");
  assert.equal(variantName({ whispers, renbans }), "German Whispers, Renban");
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
