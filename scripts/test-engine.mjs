#!/usr/bin/env node
// The pure game modules the page and the API share: the same seed always
// makes the same puzzle, every puzzle has one solution, the log replays and
// undoes as it should, replay links round-trip, and scores add up. Also the
// solver's steps: pasted grids read right, and every hint is the answer's.
//
// Run: node scripts/test-engine.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULE_HELP, rulesOf } from "../main-site/js/rule-help.js";
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
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  LOCKOUT_GAP,
  dotProblem,
  xvProblem,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  regionProblem,
  sortRegions,
  seen,
  VIEWS,
  diagonalFrom,
  SANDWICH_LINES,
  markKeeps,
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

// A seeded source of numbers from 0 to 1.
const seeded = (x) => () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32;

// Lines laid through a solved grid, each walked from a random cell while
// `fits` takes the line so far and the next cell. As many as `count` lines
// of `min` to `max` cells, none sharing a cell with another in `used`.
function layLines(solution, rand, fits, { count = 8, min = 3, max = 6, used = new Set() } = {}) {
  const lines = [];
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
  return lines;
}

// Clues taken out of a solved grid, in a seeded order, while the answer
// stays the only one under `variant`. With `untilHard`, it stops at the
// first the checker gives up on, which can take it a second or two.
function thinOut(solution, variant, rand, { untilHard = false } = {}) {
  const puzzle = solution.slice();
  for (const c of [...Array(81).keys()].sort(() => rand() - 0.5)) {
    const d = puzzle[c];
    puzzle[c] = 0;
    const found = variantSolutions(puzzle, variant, 2);
    if (found?.length !== 1) puzzle[c] = d;
    if (!found && untilHard) break;
  }
  return puzzle;
}

const fitsWhisper = (line, o, sol) => Math.abs(sol[o] - sol[line.at(-1)]) >= 5;
// The line's digits with the next cell's still a run: all different, and
// spread no wider than there are of them.
const fitsRenban = (line, o, sol) => {
  const digits = [...line, o].map((c) => sol[c]);
  return new Set(digits).size === digits.length && Math.max(...digits) - Math.min(...digits) === digits.length - 1;
};

// A puzzle of one kind of line, on the thermo and arrow puzzles' grid.
function linePuzzle(key, x, fits) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const lines = layLines(solution, rand, fits);
  return { puzzle: thinOut(solution, { [key]: lines }, rand), solution, [key]: lines };
}

// A palindrome of `length` cells: past its middle, each next cell holds the
// digit of the one as far in from the other end.
const fitsPalindrome = (length) => (line, o, sol) => line.length < length / 2 || sol[o] === sol[line[length - 1 - line.length]];

const whisperPuzzle = () => linePuzzle("whispers", 11, fitsWhisper);
const renbanPuzzle = () => linePuzzle("renbans", 13, fitsRenban);

// Palindromes of five cells, then of three, on the same grid.
function palindromePuzzle() {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(19);
  const used = new Set();
  const palindromes = [
    ...layLines(solution, rand, fitsPalindrome(5), { count: 4, min: 5, max: 5, used }),
    ...layLines(solution, rand, fitsPalindrome(3), { count: 4, min: 3, max: 3, used }),
  ];
  return { puzzle: thinOut(solution, { palindromes }, rand), solution, palindromes };
}

// A zipper of `length` cells: past its middle, each next cell and the one
// as far in from the other end make the line's total, the middle cell's
// digit on a line of odd length, and on one of even length whatever the
// two cells either side of its middle make.
const fitsZipper = (length) => (line, o, sol) => {
  const k = line.length;
  if (k <= (length - 1) / 2 || k === length / 2) return true;
  const total = length % 2 ? sol[line[(length - 1) / 2]] : sol[line[length / 2 - 1]] + sol[line[length / 2]];
  return sol[o] + sol[line[length - 1 - k]] === total;
};

// A between line of `length` cells: the cells after the first circle all
// on one side of it, and the last cell, the other circle, past all of them.
const fitsBetween = (length) => (line, o, sol) => {
  if (!line.length) return true;
  const x = sol[line[0]];
  if (line.length < length - 1) {
    const inner = [...line.slice(1), o].map((c) => sol[c]);
    return inner.every((d) => d > x) || inner.every((d) => d < x);
  }
  const [lo, hi] = [Math.min(x, sol[o]), Math.max(x, sol[o])];
  return line.slice(1).every((c) => sol[c] > lo && sol[c] < hi);
};

// A lockout line of `length` cells: anything along it, then a last cell, the
// other diamond, far enough from the first and with every cell between
// outside the two.
const fitsLockout = (length) => (line, o, sol) => {
  if (line.length < length - 1) return true;
  const [lo, hi] = [Math.min(sol[line[0]], sol[o]), Math.max(sol[line[0]], sol[o])];
  return hi - lo >= LOCKOUT_GAP && line.slice(1).every((c) => sol[c] < lo || sol[c] > hi);
};

// Lines of one kind, four of each length in `lengths`, on the thermo and
// arrow puzzles' grid, and the puzzle they make.
function linesOfLengths(key, x, fits, lengths) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const used = new Set();
  const lines = lengths.flatMap((n) => layLines(solution, rand, fits(n), { count: 4, min: n, max: n, used }));
  return { puzzle: thinOut(solution, { [key]: lines }, rand), solution, [key]: lines };
}

const zipperPuzzle = () => linesOfLengths("zippers", 29, fitsZipper, [5, 4]);
const betweenPuzzle = () => linesOfLengths("betweens", 31, fitsBetween, [4, 3]);
const lockoutPuzzle = () => linesOfLengths("lockouts", 37, fitsLockout, [4, 3]);

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

test("palindrome lines are checked, solved and carried in seeds", () => {
  assert.equal(palindromeProblem([[20, 30, 40]]), null);
  assert.equal(palindromeProblem([[0, 1, 0]]).why, "loop");

  const { puzzle, solution, palindromes } = palindromePuzzle();
  assert.equal(palindromes.length, 8);
  assert.ok(palindromes.some((t) => t.length === 5));
  for (const t of palindromes) assert.deepEqual(t.map((c) => solution[c]), t.map((c) => solution[c]).reverse());
  assert.equal(checkClues(puzzle, { palindromes }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the lines");

  const cand = variantCandidates(puzzle, { palindromes });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]));
  // Row 3, column 3 and row 5, column 5 share no house: a 4 at one end puts
  // a 4 at the other, and leaves the middle free.
  const t = [20, 30, 40];
  const four = new Array(81).fill(0);
  four[20] = 4;
  const ends = variantCandidates(four, { palindromes: [t] });
  assert.equal(ends[40], 1 << 4);
  assert.equal(ends[30], 0b1111111110);
  stepsAgree(puzzle, solution, { palindromes });

  // Ends that differ clash; ends in one box can never match.
  four[40] = 5;
  assert.deepEqual([...clashes(four, { palindromes: [t] })].sort((p, q) => p - q), [20, 40]);
  four[40] = 4;
  assert.equal(clashes(four, { palindromes: [t] }).size, 0);
  assert.equal(variantSolutions(new Array(81).fill(0), { palindromes: [[0, 10, 20]] }, 1)?.length, 0, "ends in one box have no answer");

  const seed = madeSeed(rateLevel(puzzle, { palindromes }), puzzle, { palindromes });
  assert.match(seed.text, /^O-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.palindromes, palindromes);
  assert.deepEqual(puzzleFor(back).solution, solution);

  // With the other lines on the same grid; the letters go K, T, A, S, R, O,
  // then the rest.
  const { renbans } = renbanPuzzle();
  const mixed = parseSeed(madeSeed("H", puzzle, { renbans, palindromes }).text);
  assert.match(mixed.text, /^RO-H-/);
  assert.deepEqual([mixed.renbans, mixed.palindromes], [renbans, palindromes]);
  assert.equal(seedVariantName("KROPD-H-BBBB"), "Killer, Renban, Palindrome, Kropki, Diagonal");
  assert.equal(variantName({ renbans, palindromes }), "Renban, Palindrome");
});

// A line kind's puzzle is checked and solved, and its seed reads back, with
// `letter` at its front.
function linesRoundTrip(key, letter, { puzzle, solution, [key]: lines }) {
  assert.equal(lines.length, 8, `${key}: all laid`);
  assert.equal(clashes(solution, { [key]: lines }).size, 0, `${key}: the answer keeps them`);
  assert.equal(checkClues(puzzle, { [key]: lines }).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, `${key}: needs the lines`);
  const cand = variantCandidates(puzzle, { [key]: lines });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${key}: candidates at ${c}`);
  stepsAgree(puzzle, solution, { [key]: lines });

  const seed = madeSeed(rateLevel(puzzle, { [key]: lines }), puzzle, { [key]: lines });
  assert.match(seed.text, new RegExp(`^${letter}-[EMHX]-`));
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back[key], lines);
  assert.deepEqual(puzzleFor(back).solution, solution);
}

// Cells of `grid` set to digits: { cell: digit }.
const placed = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
const sorted = (set) => [...set].sort((p, q) => p - q);
const ALL_DIGITS = 0b1111111110;
const digitsMask = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);

test("zipper lines are checked, solved and carried in seeds", () => {
  assert.equal(zipperProblem([[20, 30, 40]]), null);
  assert.equal(zipperProblem([[0, 2]]).why, "apart");

  const made = zipperPuzzle();
  for (const t of made.zippers) {
    const totals = [];
    for (let i = 0, j = t.length - 1; i < j; i++, j--) totals.push(made.solution[t[i]] + made.solution[t[j]]);
    if (t.length % 2) totals.push(made.solution[t[(t.length - 1) / 2]]);
    assert.equal(new Set(totals).size, 1, `one total along ${t}`);
  }
  assert.ok(made.zippers.some((t) => t.length === 4));
  linesRoundTrip("zippers", "Z", made);

  // Row 3, column 3 and row 5, column 5 share no house, so the ends could
  // both be 1: the middle is 2 or more, and neither end is 9.
  const t = [20, 30, 40];
  const open = variantCandidates(placed({}), { zippers: [t] });
  assert.equal(open[30], ALL_DIGITS & ~digitsMask(1));
  assert.equal(open[20], ALL_DIGITS & ~digitsMask(9));
  // A 2 at one end and a 5 in the middle leave only a 3 at the other.
  assert.equal(variantCandidates(placed({ 20: 2, 30: 5 }), { zippers: [t] })[40], digitsMask(3));

  // A pair off the middle's total clashes, with the middle; with no middle,
  // pairs that disagree do.
  assert.deepEqual(sorted(clashes(placed({ 20: 2, 30: 5, 40: 4 }), { zippers: [t] })), [20, 30, 40]);
  assert.equal(clashes(placed({ 20: 2, 40: 3 }), { zippers: [t] }).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 20: 6, 40: 7 }), { zippers: [t] })), [20, 40], "past 9 with a middle cell");
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 2: 3, 3: 5 }), { zippers: [[0, 1, 2, 3]] })), [0, 1, 2, 3]);
  assert.equal(clashes(placed({ 0: 1, 1: 2, 2: 4, 3: 5 }), { zippers: [[0, 1, 2, 3]] }).size, 0);
  assert.equal(variantSolutions(placed({ 1: 1 }), { zippers: [[0, 1, 2]] }, 1)?.length, 0, "a middle of 1 has no answer");

  assert.equal(seedVariantName("KOZCFPD-H-BBBB"), "Killer, Palindrome, Zipper, Between, Lockout, Kropki, Diagonal");
  assert.equal(variantName({ palindromes: [[1]], zippers: made.zippers }), "Palindrome, Zipper");
});

test("between lines are checked, solved and carried in seeds", () => {
  assert.equal(betweenProblem([[20, 30, 40]]), null);
  assert.equal(betweenProblem([[0]]).why, "length");

  const made = betweenPuzzle();
  for (const t of made.betweens) {
    const [lo, hi] = [t[0], t.at(-1)].map((c) => made.solution[c]).sort((p, q) => p - q);
    for (const c of t.slice(1, -1)) assert.ok(made.solution[c] > lo && made.solution[c] < hi, `between along ${t}`);
  }
  assert.ok(made.betweens.some((t) => t.length === 4));
  linesRoundTrip("betweens", "C", made);

  // A cell between two circles is never 1 or 9; circles 2 and 6 leave 3, 4
  // and 5.
  const t = [20, 30, 40];
  assert.equal(variantCandidates(placed({}), { betweens: [t] })[30], ALL_DIGITS & ~digitsMask(1, 9));
  assert.equal(variantCandidates(placed({ 20: 2, 40: 6 }), { betweens: [t] })[30], digitsMask(3, 4, 5));
  // With one circle a 1, the other is 3 or more.
  assert.equal(variantCandidates(placed({ 20: 1 }), { betweens: [t] })[40], ALL_DIGITS & ~digitsMask(1, 2));

  // A digit outside the circles clashes, with them; so does one the same as
  // a circle's, and circles with no room between.
  assert.deepEqual(sorted(clashes(placed({ 20: 2, 30: 7, 40: 6 }), { betweens: [t] })), [20, 30, 40]);
  assert.equal(clashes(placed({ 20: 2, 30: 4, 40: 6 }), { betweens: [t] }).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 20: 2, 30: 2 }), { betweens: [t] })), [20, 30]);
  assert.deepEqual(sorted(clashes(placed({ 20: 4, 40: 5 }), { betweens: [t] })), [20, 40]);
  assert.equal(clashes(placed({ 0: 4, 1: 5 }), { betweens: [[0, 1]] }).size, 0, "two circles alone can be anything");
});

test("lockout lines are checked, solved and carried in seeds", () => {
  assert.equal(lockoutProblem([[20, 30, 40]]), null);
  assert.equal(lockoutProblem([[0, 10, 0]]).why, "loop");

  const made = lockoutPuzzle();
  for (const t of made.lockouts) {
    const [lo, hi] = [t[0], t.at(-1)].map((c) => made.solution[c]).sort((p, q) => p - q);
    assert.ok(hi - lo >= LOCKOUT_GAP);
    for (const c of t.slice(1, -1)) assert.ok(made.solution[c] < lo || made.solution[c] > hi, `lockout along ${t}`);
  }
  assert.ok(made.lockouts.some((t) => t.length === 4));
  linesRoundTrip("lockouts", "F", made);

  // A 3 in one diamond puts 7, 8 or 9 in the other, and leaves the line 1, 2,
  // 8 and 9; diamonds 3 and 7, the same.
  const t = [20, 30, 40];
  const three = variantCandidates(placed({ 20: 3 }), { lockouts: [t] });
  assert.equal(three[40], digitsMask(7, 8, 9));
  assert.equal(three[30], digitsMask(1, 2, 8, 9));
  assert.equal(variantCandidates(placed({ 20: 3, 40: 7 }), { lockouts: [t] })[30], digitsMask(1, 2, 8, 9));
  assert.equal(variantCandidates(placed({ 0: 1 }), { lockouts: [[0, 1]] })[1], digitsMask(5, 6, 7, 8, 9));

  // Diamonds too close clash, as do a digit between them and one the same as
  // a diamond's.
  assert.deepEqual(sorted(clashes(placed({ 20: 3, 40: 5 }), { lockouts: [t] })), [20, 40]);
  assert.deepEqual(sorted(clashes(placed({ 20: 3, 30: 5, 40: 7 }), { lockouts: [t] })), [20, 30, 40]);
  assert.equal(clashes(placed({ 20: 3, 30: 9, 40: 7 }), { lockouts: [t] }).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 20: 3, 30: 3 }), { lockouts: [t] })), [20, 30]);

  // With the other new lines on one grid; the letters go O, Z, C, F.
  const { zippers } = zipperPuzzle();
  const { betweens } = betweenPuzzle();
  const all = { zippers, betweens, lockouts: made.lockouts };
  const seed = madeSeed("H", made.solution.map((d, c) => (c % 2 ? d : 0)), all);
  assert.match(seed.text, /^ZCF-H-/);
  const back = parseSeed(seed.text);
  assert.ok(back, "the three together read back");
  assert.deepEqual([back.zippers, back.betweens, back.lockouts], [zippers, betweens, made.lockouts]);
  assert.equal(variantName(all), "Zipper, Between, Lockout");
});

// Every side two cells share, the first cell first: each cell's right-hand
// neighbour, then the one below, in reading order.
const SIDES = [...Array(81).keys()].flatMap((c) => [...(c % 9 < 8 ? [[c, c + 1]] : []), ...(c < 72 ? [[c, c + 9]] : [])]);

// Dots or XV marks on sides of a solved grid, each the first of `marks`
// the grid keeps there, with chance `p`, skipping sides in `taken`.
function layEdges(solution, rand, marks, p, taken = new Set()) {
  const out = [];
  for (const [a, b] of SIDES) {
    if (taken.has(a * 81 + b)) continue;
    const mark = marks.find((m) => markKeeps(m, solution[a], solution[b]));
    if (!mark || rand() >= p) continue;
    out.push({ cells: [a, b], mark });
    taken.add(a * 81 + b);
  }
  return out;
}

// Checks one kind of side marks: well formed, a puzzle made with some of
// them needs them, candidates and steps keep the answer, a broken mark
// clashes, and seeds carry them both ways a seed can: as a list, and as
// every side's mark.
function sideMarksAgree({ key, letter, marks, problem, x }) {
  assert.equal(problem([{ cells: [0, 1], mark: marks[0] }, { cells: [0, 9], mark: marks[1] }]), null);
  assert.equal(problem([{ cells: [0, 2], mark: marks[0] }]).why, "apart");
  assert.equal(problem([{ cells: [8, 9], mark: marks[0] }]).why, "apart", "the end of a row is not beside the next");
  assert.equal(problem([{ cells: [0, 10], mark: marks[0] }]).why, "apart", "corners do not count");
  assert.equal(problem([{ cells: [1, 0], mark: marks[0] }]).why, "apart", "the first cell goes first");
  assert.equal(problem([{ cells: [0, 1], mark: "nope" }]).why, "mark");
  assert.equal(problem([{ cells: [0, 1], mark: marks[0] }, { cells: [0, 1], mark: marks[1] }]).why, "twice");

  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const found = layEdges(solution, rand, marks, 0.7);
  const variant = { [key]: found };
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, `${key}: needs the marks`);
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${key}: candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  assert.equal(clashes(solution, variant).size, 0);

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, new RegExp(`^${letter}-[EMHX]-`));
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back[key], found);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // Every side the grid keeps a mark on reads back too.
  const all = layEdges(solution, seeded(1), marks, 1);
  assert.deepEqual(parseSeed(madeSeed("H", solution, { [key]: all }).text)[key], all);
  return { puzzle, solution, found, all };
}

test("Kropki dots are checked, solved and carried in seeds", () => {
  const { found, all } = sideMarksAgree({ key: "dots", letter: "P", marks: ["white", "black"], problem: dotProblem, x: 19 });
  assert.ok(found.some((d) => d.mark === "white") && found.some((d) => d.mark === "black"));
  // From 28 dots, every side's mark is shorter than a list of them, so the
  // seed shrinks there, and grows no longer than it was with more.
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const length = (n) => madeSeed("H", solution, { dots: all.slice(0, n) }).body.length;
  assert.ok(all.length > 40, `${all.length} sides`);
  assert.ok(length(3) < length(20));
  assert.ok(length(28) < length(27));
  assert.ok(length(all.length) <= length(27));
  // Beside a 9 over a white dot, only an 8; over a black dot, a 3 takes a 6
  // alone, as half of it is no digit; a 5 or a 7 has nothing.
  const at = (d) => new Array(81).fill(0).map((_, c) => (c === 0 ? d : 0));
  const white = [{ cells: [0, 1], mark: "white" }];
  const black = [{ cells: [0, 1], mark: "black" }];
  assert.equal(variantCandidates(at(9), { dots: white })[1], 1 << 8);
  assert.equal(variantCandidates(at(3), { dots: black })[1], 1 << 6);
  assert.equal(variantCandidates(at(4), { dots: black })[1], (1 << 2) | (1 << 8));
  assert.equal(variantSolutions(at(7), { dots: black }, 1)?.length, 0, "no digit is double or half of 7");
  const broken = at(2);
  broken[1] = 4;
  assert.deepEqual([...clashes(broken, { dots: white })], [0, 1]);
  assert.equal(clashes(broken, { dots: black }).size, 0);
});

test("XV marks are checked, solved and carried in seeds", () => {
  sideMarksAgree({ key: "xvs", letter: "V", marks: ["x", "v"], problem: xvProblem, x: 23 });
  const at = (d) => new Array(81).fill(0).map((_, c) => (c === 0 ? d : 0));
  assert.equal(variantCandidates(at(3), { xvs: [{ cells: [0, 9], mark: "x" }] })[9], 1 << 7);
  assert.equal(variantCandidates(at(0), { xvs: [{ cells: [0, 9], mark: "v" }] })[9], (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4));
  assert.equal(variantSolutions(at(5), { xvs: [{ cells: [0, 1], mark: "x" }] }, 1)?.length, 0, "5 and 5 cannot share a row");
  const broken = at(6);
  broken[1] = 3;
  assert.deepEqual([...clashes(broken, { xvs: [{ cells: [0, 1], mark: "x" }] })], [0, 1]);
  // With every kind of line too, the letters go K, T, A, S, R, P, V, then the rules.
  assert.equal(seedVariantName("KTASRPVD-H-BBBB"), "Killer, Thermo, Arrow, German Whispers, Renban, Kropki, XV, Diagonal");
});

// A solved grid's Sandwich clue for a line: the digits between its 1 and
// its 9, added up.
function sandwichOf(solution, line) {
  const digits = SANDWICH_LINES[line].map((c) => solution[c]);
  const [i, j] = [digits.indexOf(1), digits.indexOf(9)].sort((a, b) => a - b);
  return { line, sum: digits.slice(i + 1, j).reduce((t, d) => t + d, 0) };
}

// Every Little Killer clue a board has room for: a whole diagonal of two
// cells or more from each spot round the edge, each way into the board.
const LITTLE_SPOTS = [];
for (let r = -1; r <= 9; r++) {
  for (let c = -1; c <= 9; c++) {
    if (r >= 0 && r < 9 && c >= 0 && c < 9) continue;
    for (const [dr, dc] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const cells = diagonalFrom(r + dr, c + dc, dr, dc);
      if (cells.length >= 2) LITTLE_SPOTS.push(cells);
    }
  }
}
const littleOf = (solution, cells) => ({ cells, sum: cells.reduce((t, c) => t + solution[c], 0) });

// Some of a solved grid's Sandwich clues, each line with chance `p`.
const laySandwiches = (solution, rand, p) => [...Array(18).keys()].filter(() => rand() < p).map((line) => sandwichOf(solution, line));
// Some of its Little Killer clues, at most one from each spot.
// The margin spot a clue sits in, as "r,c", -1 and 9 being just outside.
const littleSpot = (cells) => `${Math.floor(cells[0] / 9) * 2 - Math.floor(cells[1] / 9)},${(cells[0] % 9) * 2 - (cells[1] % 9)}`;
const viewSpot = (view) => {
  const i = view % 9;
  return [`${i},-1`, `-1,${i}`, `${i},9`, `9,${i}`][Math.floor(view / 9)];
};

// Some of its Little Killer clues, at most one from each spot, skipping
// spots in `taken`.
function layLittles(solution, rand, p, taken = new Set()) {
  return LITTLE_SPOTS.filter((cells) => {
    const spot = littleSpot(cells);
    if (taken.has(spot) || rand() >= p) return false;
    taken.add(spot);
    return true;
  }).map((cells) => littleOf(solution, cells));
}

// A solved grid's Skyscraper and X-Sum clues for a view.
const skyscraperOf = (solution, view) => ({ view, count: seen(VIEWS[view].map((c) => solution[c])) });
function xsumOf(solution, view) {
  const digits = VIEWS[view].map((c) => solution[c]);
  return { view, sum: digits.slice(0, digits[0]).reduce((t, d) => t + d, 0) };
}
// Some of them, each of `views` with chance `p`, skipping spots in `taken`.
function layViews(solution, rand, of, p, views = [...VIEWS.keys()], taken = new Set()) {
  return views
    .filter((view) => {
      if (taken.has(viewSpot(view)) || rand() >= p) return false;
      taken.add(viewSpot(view));
      return true;
    })
    .map((view) => of(solution, view));
}

// Checks clues of one kind on views: a puzzle made with some of them needs
// them, candidates and steps keep the answer, and the seed carries them.
function viewCluesAgree(key, letter, of, x) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const clues = layViews(solution, rand, of, 0.5);
  const variant = { [key]: clues };
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, rand, { untilHard: true });
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, `${key}: needs the clues`);
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${key}: candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, new RegExp(`^${letter}-[EMHX]-`));
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back[key], clues);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // Every view's clue reads back too, the other way the seed can hold them.
  const all = VIEWS.map((_, view) => of(solution, view));
  assert.deepEqual(parseSeed(madeSeed("H", solution, { [key]: all }).text)[key], all);
  return { puzzle, solution };
}

test("Skyscraper clues are checked, solved and carried in seeds", () => {
  assert.equal(skyscraperProblem([{ view: 0, count: 1 }, { view: 35, count: 9 }]), null);
  assert.equal(skyscraperProblem([{ view: 36, count: 3 }]).why, "view");
  assert.equal(skyscraperProblem([{ view: 3, count: 0 }]).why, "count");
  assert.equal(skyscraperProblem([{ view: 3, count: 2 }, { view: 3, count: 4 }]).why, "twice");
  assert.equal(seen([2, 1, 5, 3, 9, 4]), 3);

  const empty = new Array(81).fill(0);
  // 1 is the 9 first; 9 is 1 to 9 in order, each at most its place.
  assert.equal(variantCandidates(empty, { skyscrapers: [{ view: 0, count: 1 }] })[0], 1 << 9);
  const nine = variantCandidates(empty, { skyscrapers: [{ view: 18, count: 9 }] });
  assert.equal(nine[8], 1 << 1, "from the right, the first is the rightmost");
  assert.equal(nine[7], (1 << 1) | (1 << 2));
  assert.equal(variantCandidates(empty, { skyscrapers: [{ view: 9, count: 3 }] })[0] & ((1 << 8) | (1 << 9)), 0, "3 seen: the first is at most 7");
  // 3 and 5 seen, one short of 3: the next is the 9, or no taller than 5.
  const row = empty.slice();
  row[0] = 3;
  row[1] = 5;
  assert.equal(variantCandidates(row, { skyscrapers: [{ view: 0, count: 3 }] })[2] & ((1 << 6) | (1 << 7) | (1 << 8)), 0);
  row[2] = 9;
  assert.deepEqual([...clashes(row, { skyscrapers: [{ view: 0, count: 2 }] })], [0, 1, 2]);
  assert.equal(clashes(row, { skyscrapers: [{ view: 0, count: 3 }] }).size, 0);
  assert.deepEqual([...clashes(row, { skyscrapers: [{ view: 0, count: 4 }] })], [0, 1, 2], "the 9 is in, and only 3 are seen");

  viewCluesAgree("skyscrapers", "Y", skyscraperOf, 37);
});

test("X-Sum clues are checked, solved and carried in seeds", () => {
  assert.equal(xsumProblem([{ view: 0, sum: 1 }, { view: 35, sum: 45 }]), null);
  assert.equal(xsumProblem([{ view: 3, sum: 46 }]).why, "sum");

  const empty = new Array(81).fill(0);
  assert.equal(variantCandidates(empty, { xsums: [{ view: 0, sum: 1 }] })[0], 1 << 1);
  assert.equal(variantCandidates(empty, { xsums: [{ view: 0, sum: 45 }] })[0], 1 << 9);
  // 3 is a 2 and then a 1: a 1 alone would make 1, and a 3 first at least 6.
  const three = variantCandidates(empty, { xsums: [{ view: 9, sum: 3 }] });
  assert.equal(three[0], 1 << 2);
  assert.equal(three[9], 1 << 1);
  const row = empty.slice();
  row[8] = 3;
  row[7] = 4;
  row[6] = 5;
  assert.deepEqual([...clashes(row, { xsums: [{ view: 18, sum: 10 }] })].sort((a, b) => a - b), [6, 7, 8]);
  assert.equal(clashes(row, { xsums: [{ view: 18, sum: 12 }] }).size, 0);
  row[6] = 0;
  assert.equal(clashes(row, { xsums: [{ view: 18, sum: 10 }] }).size, 0, "not yet full");

  viewCluesAgree("xsums", "U", xsumOf, 41);
  assert.equal(seedVariantName("BLYUD-H-BBBB"), "Sandwich, Little Killer, Skyscrapers, X-Sums, Diagonal");
});

test("Sandwich clues are checked, solved and carried in seeds", () => {
  assert.equal(sandwichProblem([{ line: 0, sum: 0 }, { line: 17, sum: 35 }]), null);
  assert.equal(sandwichProblem([{ line: 18, sum: 5 }]).why, "line");
  assert.equal(sandwichProblem([{ line: 3, sum: 36 }]).why, "sum");
  assert.equal(sandwichProblem([{ line: 3, sum: 5 }, { line: 3, sum: 6 }]).why, "twice");

  // 35 is every digit from 2 to 8, so the 1 and the 9 are at the ends.
  const empty = new Array(81).fill(0);
  const wide = variantCandidates(empty, { sandwiches: [{ line: 0, sum: 35 }] });
  assert.equal(wide[0], (1 << 1) | (1 << 9));
  assert.equal(wide[8], (1 << 1) | (1 << 9));
  assert.equal(wide[4] & ((1 << 1) | (1 << 9)), 0);
  // 0 puts them side by side: with the 9 in the middle, the 1 is beside it.
  const nine = empty.slice();
  nine[4] = 9;
  const tight = variantCandidates(nine, { sandwiches: [{ line: 0, sum: 0 }] });
  for (let c = 0; c < 9; c++) assert.equal(Boolean(tight[c] & (1 << 1)), c === 3 || c === 5, `1 at ${c}`);

  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(29);
  const sandwiches = laySandwiches(solution, rand, 0.7);
  const variant = { sandwiches };
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the sums");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  // No digits at all is not "empty" when there are sums to go on.
  assert.notEqual(checkClues(empty, { sandwiches: [...Array(18).keys()].map((line) => sandwichOf(solution, line)) }).why, "empty");

  // A filling past its sum clashes, 1 and 9 with it; so does one that falls
  // short once full.
  const row = empty.slice();
  row[0] = 1;
  row[1] = 2;
  row[2] = 3;
  row[3] = 9;
  assert.deepEqual([...clashes(row, { sandwiches: [{ line: 0, sum: 4 }] })].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.equal(clashes(row, { sandwiches: [{ line: 0, sum: 5 }] }).size, 0);
  assert.equal(clashes(row, { sandwiches: [{ line: 0, sum: 6 }] }).size, 4);

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^B-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.sandwiches, sandwiches);
  assert.deepEqual(puzzleFor(back).solution, solution);
});

test("Little Killer clues are checked, solved and carried in seeds", () => {
  assert.equal(littleProblem([{ cells: diagonalFrom(0, 1, 1, 1), sum: 40 }]), null);
  assert.equal(littleProblem([{ cells: diagonalFrom(8, 0, -1, 1), sum: 45 }]), null, "from the bottom edge, up and right");
  assert.equal(littleProblem([{ cells: [8], sum: 5 }]).why, "cell");
  assert.equal(littleProblem([{ cells: [10, 20, 30], sum: 10 }]).why, "diagonal", "not from an edge");
  assert.equal(littleProblem([{ cells: [1, 11, 21], sum: 10 }]).why, "diagonal", "stops short of the far edge");
  assert.equal(littleProblem([{ cells: [7, 17], sum: 19 }]).why, "sum");
  assert.equal(LITTLE_SPOTS.length, 4 * 8 * 2 - 4 + 4 - 4, "two ways from each side spot but the ends, one from each corner");

  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(31);
  const littles = layLittles(solution, rand, 0.4);
  const variant = { littles };
  assert.ok(littles.length >= 8, `${littles.length} clues`);
  assert.equal(clashes(solution, variant).size, 0);
  // Near its last clues a Little Killer puzzle can outrun the checker's
  // budget, so it is thinned only as far as the checker settles.
  const puzzle = thinOut(solution, variant, rand, { untilHard: true });
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the sums");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  // Two cells adding to 17 are an 8 and a 9.
  const pair = variantCandidates(new Array(81).fill(0), { littles: [{ cells: [7, 17], sum: 17 }] });
  assert.equal(pair[7], (1 << 8) | (1 << 9));

  const over = new Array(81).fill(0);
  over[7] = 9;
  over[17] = 9;
  assert.deepEqual([...clashes(over, { littles: [{ cells: [7, 17], sum: 17 }] })], [7, 17]);

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^L-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  // The seed keeps them in one order: by first cell, then which way.
  const order = (list) => list.slice().sort((a, b) => a.cells[0] - b.cells[0] || b.cells[1] - a.cells[1]);
  assert.deepEqual(back.littles, order(littles));
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(seedVariantName("KTASRPVBLD-H-BBBB"), "Killer, Thermo, Arrow, German Whispers, Renban, Kropki, XV, Sandwich, Little Killer, Diagonal");
});

// Jigsaw regions: the boxes, with cells swapped between neighbouring
// regions `swaps` times, each swap kept only if both regions stay joined.
function jigsawRegions(rand, swaps) {
  const regions = [...Array(81).keys()].map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3));
  const beside = (c) => [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1].filter((o) => o >= 0 && o < 81);
  for (let done = 0, tries = 0; done < swaps && tries < swaps * 50; tries++) {
    const a = Math.floor(rand() * 81);
    const across = beside(a).filter((o) => regions[o] !== regions[a]);
    if (!across.length) continue;
    const other = regions[across[Math.floor(rand() * across.length)]];
    const back = [...Array(81).keys()].filter((b) => regions[b] === other && beside(b).some((o) => regions[o] === regions[a] && o !== a));
    if (!back.length) continue;
    const b = back[Math.floor(rand() * back.length)];
    const next = regions.slice();
    [next[a], next[b]] = [regions[b], regions[a]];
    if (regionProblem(next)) continue;
    regions.splice(0, 81, ...next);
    done++;
  }
  return sortRegions(regions);
}

test("Jigsaw regions are checked, solved and carried in seeds", () => {
  const boxes = sortRegions([...Array(81).keys()].map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3)));
  assert.equal(regionProblem(boxes), null);
  assert.equal(regionProblem(boxes.slice(0, 80)).why, "cell");
  const big = boxes.slice();
  big[3] = 0;
  assert.deepEqual(regionProblem(big), { why: "size", region: 0, size: 10 });
  // Two cells of box 0 swapped for two of box 1 that do not touch it.
  const split = boxes.slice();
  split[20] = 1;
  split[5] = 0;
  assert.equal(regionProblem(split).why, "apart");
  assert.deepEqual(sortRegions([5, 5, 2, 7, 2]), [0, 0, 1, 2, 1]);

  // Not every way of cutting the grid has a grid to fit it, and the checker
  // can spend its whole budget finding that out, so these regions are ones
  // known to have one.
  const regions = jigsawRegions(seeded(2), 60);
  const rand = seeded(43);
  assert.equal(regionProblem(regions), null);
  assert.notDeepEqual(regions, boxes, "moved off the boxes");
  const { houses } = layout(0, regions);
  assert.deepEqual(houses.slice(18).map((h) => h.kind), new Array(9).fill("region"));

  const solution = variantSolve(new Array(81).fill(0), { regions });
  assert.ok(solution, "a grid fits the regions");
  for (const h of houses) assert.equal(new Set(h.cells.map((c) => solution[c])).size, 9, `${h.kind} ${h.index}`);
  const variant = { regions };
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the regions");
  stepsAgree(puzzle, solution, variant);
  // A repeat in a region clashes; one in a box that is no region does not.
  const moved = regions.findIndex((r, c) => r !== boxes[c]);
  const mate = regions.findIndex((r, c) => r === regions[moved] && c !== moved && Math.floor(c / 9) !== Math.floor(moved / 9) && c % 9 !== moved % 9);
  const twice = new Array(81).fill(0);
  twice[moved] = 4;
  twice[mate] = 4;
  assert.deepEqual([...clashes(twice, variant)].sort((a, b) => a - b), [moved, mate].sort((a, b) => a - b));
  const boxMate = boxes.findIndex((b, c) => b === boxes[moved] && regions[c] !== regions[moved] && Math.floor(c / 9) !== Math.floor(moved / 9) && c % 9 !== moved % 9);
  const boxed = new Array(81).fill(0);
  boxed[moved] = 4;
  boxed[boxMate] = 4;
  assert.equal(clashes(boxed, variant).size, 0, "boxes are no house in a Jigsaw");
  assert.equal(clashes(boxed).size, 2);
  // A digit clears its note from its region's cells, not its box's, when
  // the game hands play() the region peers.
  const blank = new Array(81).fill(0);
  const notesOf = (peers, other) =>
    play(blank, solution, [
      { k: "n", c: other, d: 4, t: 0, b: 0 },
      { k: "p", c: moved, d: 4, t: 1, b: 0 },
    ], { peers }).notes[other];
  const regionPeers = layout(0, regions).peers;
  assert.equal(notesOf(regionPeers, mate), 0, "cleared in the region");
  assert.equal(notesOf(regionPeers, boxMate), 1 << 4, "kept in the box");
  assert.equal(notesOf(undefined, boxMate), 0, "classic play clears the box");

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^J-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.regions, regions);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // Regions numbered any other way make the same seed.
  assert.equal(madeSeed("H", puzzle, { regions: regions.map((r) => 8 - r) }).text, madeSeed("H", puzzle, variant).text);
  assert.equal(seedVariantName("KJD-H-BBBB"), "Killer, Jigsaw, Diagonal");

  // With drawn parts too: cages, lines, marks and clues outside, on the
  // Jigsaw's own grid.
  const cages = layCages(solution, rand, 5);
  const used = new Set();
  const lines = { count: 3, max: 5, used };
  const thermos = layLines(solution, rand, (line, o, sol) => sol[o] > sol[line.at(-1)], lines);
  const whispers = layLines(solution, rand, fitsWhisper, lines);
  const dots = layEdges(solution, rand, ["white", "black"], 0.15);
  const taken = new Set();
  const sandwiches = laySandwiches(solution, rand, 0.2).filter((w) => !taken.has(viewSpot(w.line)) && taken.add(viewSpot(w.line)));
  const skyscrapers = layViews(solution, rand, skyscraperOf, 0.2, [...VIEWS.keys()].slice(18), taken);
  const all = { regions, cages, thermos, whispers, dots, sandwiches, skyscrapers };
  assert.equal(clashes(solution, all).size, 0);
  const sparse = thinOut(solution, all, rand);
  assert.equal(checkClues(sparse, all).ok, true);
  stepsAgree(sparse, solution, all);
  const mixed = parseSeed(madeSeed("H", sparse, all).text);
  assert.match(mixed.text, /^KTSPBYJ-H-/);
  for (const list of Object.keys(all)) assert.deepEqual(mixed[list], all[list], list);
});

// Cages laid through a solved grid: `count` of them, two to four cells
// joined edge to edge with no digit twice, none sharing a cell.
function layCages(solution, rand, count) {
  const cages = [];
  const used = new Set();
  while (cages.length < count) {
    const cells = [Math.floor(rand() * 81)];
    if (used.has(cells[0])) continue;
    const want = 2 + Math.floor(rand() * 3);
    while (cells.length < want) {
      const next = cells
        .flatMap((c) => [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1])
        .filter((n) => n >= 0 && n < 81 && !used.has(n) && !cells.includes(n) && !cells.some((o) => solution[o] === solution[n]));
      if (!next.length) break;
      cells.push(next[Math.floor(rand() * next.length)]);
    }
    if (cells.length < 2) continue;
    cells.forEach((c) => used.add(c));
    cages.push({ sum: cells.reduce((t, c) => t + solution[c], 0), cells: cells.sort((a, b) => a - b) });
  }
  return cages.sort((a, b) => a.cells[0] - b.cells[0]);
}

// Rules that go together. Relabelling digits keeps every rule, so a first
// row of 1 to 9 stands for every grid: with it, a search that finds none
// has shown there is none.
const firstRow = () => [1, 2, 3, 4, 5, 6, 7, 8, 9, ...new Array(72).fill(0)];

// The widest mixes of switch rules that have a grid, and a grid for each.
// Diagonal with anti-knight runs past the solver's budget from an empty
// grid, so its grid is written out, found by a search with no budget.
const WIDEST = [
  { keys: ["diagonal", "antiking", "windoku"] },
  { keys: ["diagonal", "antiknight"], grid: "123456789967812453845793216352968174671345892498127635286579341534681927719234568" },
  { keys: ["antiknight", "windoku"] },
  { keys: ["antiknight", "antiking"] },
].map(({ keys, grid }) => {
  const rules = keys.reduce((m, k) => m | rule(k), 0);
  return { keys, rules, grid: grid ? [...grid].map(Number) : variantSolve(firstRow(), { rules }) };
});

test("anti-knight rules out some mixes of switch rules altogether", () => {
  const rules = (...keys) => keys.reduce((m, k) => m | rule(k), 0);
  for (const keys of [
    ["antiknight", "antiking", "diagonal"],
    ["antiknight", "antiking", "windoku"],
    ["antiknight", "diagonal", "windoku"],
  ]) {
    assert.deepEqual(variantSolutions(firstRow(), { rules: rules(...keys) }, 1), [], `${keys.join(", ")} has no grid`);
  }
  for (const { keys, rules, grid } of WIDEST) assert.ok(grid && keepsRules(grid, rules), `${keys.join(", ")} has a grid`);
});

// Every drawn part at once, on a grid that keeps the switch rules, made,
// checked, solved by steps and carried in a seed, as the maker, the solver
// and a made game do.
test("every drawn part at once, with each widest mix of switch rules", () => {
  for (const { keys, rules, grid: solution } of WIDEST) {
    const rand = seeded(17);
    const cages = layCages(solution, rand, 6);
    // Each kind of line away from the others, so every one shows.
    const used = new Set();
    const lines = { count: 3, max: 5, used };
    const thermos = layLines(solution, rand, (line, o, sol) => sol[o] > sol[line.at(-1)], lines);
    const arrows = layLines(solution, rand, (line, o, sol) => line.slice(1).reduce((t, c) => t + sol[c], sol[o]) <= sol[line[0]], lines).filter(
      ([circle, ...cells]) => cells.reduce((t, c) => t + solution[c], 0) === solution[circle]
    );
    const whispers = layLines(solution, rand, fitsWhisper, lines);
    const renbans = layLines(solution, rand, fitsRenban, lines);
    // Their own numbers, so the parts laid after come out as before.
    const palindromes = layLines(solution, seeded(23), fitsPalindrome(3), { ...lines, max: 3 });
    // Two each, in what room the others leave.
    const zippers = layLines(solution, seeded(29), fitsZipper(3), { ...lines, count: 2, max: 3 });
    const betweens = layLines(solution, seeded(31), fitsBetween(3), { ...lines, count: 2, max: 3 });
    const lockouts = layLines(solution, seeded(37), fitsLockout(3), { ...lines, count: 2, max: 3 });
    // A few dots and marks, never two on one side.
    const sides = new Set();
    const dots = layEdges(solution, rand, ["white", "black"], 0.15, sides);
    const xvs = layEdges(solution, rand, ["x", "v"], 0.3, sides);
    // Clues outside the grid, never two in one spot: sandwiches left and
    // above, skyscrapers and X-sums right and below.
    const sandwiches = laySandwiches(solution, rand, 0.25);
    const taken = new Set(sandwiches.map((w) => viewSpot(w.line)));
    const skyscrapers = layViews(solution, rand, skyscraperOf, 0.25, [...VIEWS.keys()].slice(18), taken);
    const xsums = layViews(solution, rand, xsumOf, 0.4, [...VIEWS.keys()].slice(18), taken);
    const littles = layLittles(solution, rand, 0.1, taken);
    const variant = { cages, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, dots, xvs, sandwiches, littles, skyscrapers, xsums, rules };
    const name = keys.join(", ");
    const lists = ["thermos", "arrows", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "dots", "xvs", "sandwiches", "littles", "skyscrapers", "xsums"];
    for (const list of lists) assert.ok(variant[list].length, `${name}: some ${list}`);
    assert.equal(clashes(solution, variant).size, 0, `${name}: the answer keeps every rule`);

    const puzzle = thinOut(solution, variant, rand);
    const check = checkClues(puzzle, variant);
    assert.equal(check.ok, true, `${name}: ${check.why}`);
    assert.deepEqual(check.solution, solution);
    const cand = variantCandidates(puzzle, variant);
    for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${name}: candidates at ${c}`);
    stepsAgree(puzzle, solution, variant);

    const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
    const letters = "KTASROZCFPVBLYU" + RULES.filter((r) => rules & r.bit).map((r) => r.letter).join("");
    assert.ok(seed.text.startsWith(`${letters}-`), seed.text);
    const back = parseSeed(seed.text.toLowerCase());
    assert.ok(back, `${name}: the seed reads back`);
    assert.equal(back.text, seed.text);
    for (const list of ["cages", "thermos", "arrows", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "dots", "xvs", "sandwiches", "littles", "skyscrapers", "xsums", "rules"]) {
      assert.deepEqual(back[list], variant[list], `${name}: ${list}`);
    }
    assert.deepEqual(puzzleFor(back).solution, solution);
  }
});

// Every rule on the site says what it means and how to put it on: each rule
// button has an entry in rule-help.js, in the buttons' order, and every
// variant variantName can name has one too, so a new variant cannot go in
// without it.
test("every variant rule has its explanation", () => {
  const html = readFileSync(new URL("../main-site/index.html", import.meta.url), "utf8");
  const buttons = [...html.matchAll(/data-rule="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, Object.keys(RULE_HELP), "rule buttons and rule-help.js, in the same order");
  for (const [key, h] of Object.entries(RULE_HELP)) {
    for (const field of ["name", "rule", "draw"]) assert.ok(h[field]?.trim(), `${key}: ${field}`);
    const alone = h.list ? { [h.list]: [1] } : { rules: RULES.find((r) => r.key === key)?.bit };
    assert.equal(variantName(alone), h.name, `${key}: named as variantName names it`);
    assert.deepEqual(rulesOf(alone), [key], `${key}: found in a variant`);
  }
  // Everything variantName knows, from each part and every switch at once.
  const every = { rules: RULES.reduce((m, r) => m | r.bit, 0) };
  for (const list of ["cages", "regions", "thermos", "arrows", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "dots", "xvs", "sandwiches", "littles", "skyscrapers", "xsums"]) every[list] = [1];
  const named = variantName(every).split(", ").sort();
  assert.deepEqual(Object.values(RULE_HELP).map((h) => h.name).sort(), named, "every variant has an explanation");
  assert.deepEqual(rulesOf(null), []);
  assert.deepEqual(rulesOf({ cages: [1], rules: 1 }), ["killer", "diagonal"]);
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
