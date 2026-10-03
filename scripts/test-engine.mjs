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
import { newSeed, parseSeed, puzzleFor, madeSeed, seedVariantName, parseCode, codeText, needsCode, bodyFromBytes, CODE_LENGTH, killerSeed, randomSource, KILLER_BLANKS } from "../main-site/js/seed.js";
import { countSolutions, PEERS, BOX } from "../main-site/js/sudoku.js";
import { DAILY_FIRST, isDate, addDays, addMonths, monthWeeks, monthName, dayName, streaks } from "../main-site/js/calendar.js";
import { play, packLog, unpackLog, packReplay, unpackReplay, fromWire, toWire, logText } from "../main-site/js/record.js";
import { parseGrid, puzzleText, clashes, candidates, nextStep, bitCount, checkClues, rateLevel } from "../main-site/js/steps.js";
import {
  variantSolutions,
  variantSolve,
  variantCandidates,
  variantName,
  cageProblem,
  rellikProblem,
  lunchboxProblem,
  lookSayProblem,
  equalityProblem,
  equalSumProblem,
  sameValueProblem,
  connectedProblem,
  distinctProblem,
  piecesOf,
  linkWords,
  sayCounts,
  sayWords,
  cagesOf,
  thermoProblem,
  arrowProblem,
  doubleProblem,
  pillProblem,
  PILL_ARROW_MOST,
  whisperProblem,
  renbanProblem,
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  entropicProblem,
  modularProblem,
  sumLineProblem,
  regionSumProblem,
  indexProblem,
  regionRuns,
  loopCuts,
  whisperGap,
  LONG_LINE_MOST,
  LOOP_LINE_MOST,
  SUM_LINE_MAX,
  INDEX_LINE_MOST,
  ENTROPIC_KINDS,
  MODULAR_KINDS,
  LOCKOUT_GAP,
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
  CIRCLES_MOST,
  circleSetProblem,
  CIRCLE_SETS_MOST,
  rankProblem,
  RANK_MOST,
  rankStart,
  rankBelow,
  TIE_PAIRS,
  indexingProblem,
  indexCellProblem,
  indexers,
  INDEXERS,
  firstHidden,
  regionProblem,
  sortRegions,
  seen,
  VIEWS,
  diagonalFrom,
  SANDWICH_LINES,
  markKeeps,
  barredSides,
  squareKinds,
  SQUARES,
  TAXICAB,
  touching,
  layout,
  RULES,
  chaosArrowProblem,
  chaosCountProblem,
  chaosArms,
  chaosAround,
  notePeers,
  shadeProblem,
  shadings,
  shadingKeeps,
  SHADED,
  UNSHADED,
  ZERO,
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

// Short codes stand for long made seeds, and are never taken for a seed of
// either kind, nor either kind for one.
test("short codes read forgivingly and are never taken for seeds", () => {
  assert.deepEqual(parseCode(" h-b7k4q-m9trz "), { level: "H", code: "B7K4QM9TRZ", text: "H-B7K4Q-M9TRZ" });
  assert.equal(codeText("X", "B7K4QM9TRZ"), "X-B7K4Q-M9TRZ");
  assert.equal(parseSeed("H-B7K4Q-M9TRZ"), null, "not a seed");
  for (const bad of ["Q-B7K4Q-M9TRZ", "H-B7K4Q-M9TR", "H-B7K4Q-M9TRZZ", "H-B7K4Q-M9TR0", "H-B7K4Q-M9TRA", "", null]) assert.equal(parseCode(bad), null, String(bad));
  assert.equal(parseCode("H-BXK4-M9TR"), null, "a generated seed is not a code");
  const made = madeSeed("H", puzzleFor(parseSeed("E-2345-6789")).puzzle);
  assert.ok(needsCode(made.text), `a made seed of ${made.text.length} characters has a code`);
  assert.ok(!needsCode("H-BXK4-M9TR"), "a generated one never does");
  assert.equal(parseCode(made.text), null);
  // Ten characters from random bytes, from the seed alphabet.
  const code = bodyFromBytes(new Uint8Array(32).map((_, i) => i * 7), CODE_LENGTH);
  assert.equal(code.length, CODE_LENGTH);
  assert.ok(parseCode(`M${code}`));
  assert.equal(bodyFromBytes(new Uint8Array(4), CODE_LENGTH), null, "too few bytes");
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

// Whether a full grid keeps every rule in `rules`, with no dots or marks.
function keepsRules(grid, rules) {
  const { houses, pairs } = layout(rules);
  for (const { cells } of houses) if (new Set(cells.map((c) => grid[c])).size !== 9) return false;
  if (barredSides(rules).some(({ cells: [a, b], marks }) => marks.some((m) => markKeeps(m, grid[a], grid[b])))) return false;
  for (const kinds of squareKinds(rules)) {
    if (SQUARES.some((square) => new Set(square.map((c) => kinds.findIndex((m) => m & (1 << grid[c])))).size !== 3)) return false;
  }
  // Worked out here from rows and columns, not from TAXICAB, to check it.
  const steps = (a, b) => Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs((a % 9) - (b % 9));
  if (rules & rule("antitaxicab") && grid.some((d, c) => grid.some((e, o) => e === d && steps(c, o) === d))) return false;
  if (rules & rule("dutchflatmates") && grid.some((d, c) => d === 5 && grid[c - 9] !== 1 && grid[c + 9] !== 9)) return false;
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
  const groups = layout(rule("disjoint")).houses.filter((h) => h.kind === "group");
  assert.equal(groups.length, 9);
  assert.deepEqual(groups[0].cells, [0, 3, 6, 27, 30, 33, 54, 57, 60], "every box's top left cell");
  assert.deepEqual(groups[4].cells, [10, 13, 16, 37, 40, 43, 64, 67, 70], "every box's centre");
  // Groups go by the boxes even when a Jigsaw's regions take the boxes' place.
  assert.deepEqual(layout(rule("disjoint"), [...Array(81).keys()].map((c) => c % 9)).houses.at(-1).cells, [20, 23, 26, 47, 50, 53, 74, 77, 80]);
  // The rules about sides are no houses and no pairs, but barred sides.
  assert.equal(layout(rule("anticonsecutive")).houses.length, 27);
  assert.equal(barredSides(rule("anticonsecutive")).length, 144);
  assert.equal(barredSides(0).length, 0);
  const knight = layout(rule("antiknight")).pairs;
  assert.equal(knight[40].length, 8, "the centre has eight knight's moves");
  assert.deepEqual(knight[2], [13, 21], "only moves out of its box are new");
  // A king's diagonal step inside the same box is already a peer.
  assert.deepEqual(layout(rule("antiking")).pairs[2], [12]);
  assert.equal(layout(rule("diagonal")).peers[40].length, 20 + 12, "the centre is on both diagonals, four cells of them in its box");
});

test("rules puzzles solve, check, hint and carry their rules in seeds", () => {
  for (const [key, letter] of [
    ["diagonal", "D"],
    ["antiknight", "N"],
    ["antiking", "G"],
    ["windoku", "W"],
    ["disjoint", "QDG"],
    ["anticonsecutive", "QAC"],
    ["strictkropki", "QSK"],
    ["strictxv", "QSX"],
    ["globalentropy", "QGE"],
    ["globalmod", "QGM"],
    ["antitaxicab", "QAT"],
    ["dutchflatmates", "QDF"],
  ]) {
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

// An entropic or a modular line: each next cell of a kind, as `kinds` sorts
// digits, other than the two before it.
const fitsKinds = (kinds) => () => (line, o, sol) => {
  const kind = (c) => kinds.findIndex((m) => m & (1 << sol[c]));
  return line.slice(-2).every((c) => kind(c) !== kind(o));
};

const zipperPuzzle = () => linesOfLengths("zippers", 29, fitsZipper, [5, 4]);
const betweenPuzzle = () => linesOfLengths("betweens", 31, fitsBetween, [4, 3]);
const lockoutPuzzle = () => linesOfLengths("lockouts", 37, fitsLockout, [4, 3]);
const entropicPuzzle = () => linesOfLengths("entropics", 43, fitsKinds(ENTROPIC_KINDS), [5, 3]);
const modularPuzzle = () => linesOfLengths("modulars", 47, fitsKinds(MODULAR_KINDS), [5, 3]);

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

// Dutch Whispers: the same lines, neighbours 4 apart at least.
const fitsDutch = (line, o, sol) => Math.abs(sol[o] - sol[line.at(-1)]) >= 4;

test("Dutch Whispers lines are checked, solved and carried in seeds", () => {
  const dutch = rule("dutchwhispers");
  assert.equal(whisperGap(0), 5);
  assert.equal(whisperGap(dutch), 4);

  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(211);
  const whispers = layLines(solution, rand, fitsDutch);
  assert.equal(whispers.length, 8);
  const variant = { whispers, rules: dutch };
  assert.equal(clashes(solution, variant).size, 0);
  assert.ok(clashes(solution, { whispers }).size, "some neighbours only 4 apart, which German Whispers refuses");
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the lines");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^SQDW-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.equal(back.rules, dutch);
  assert.deepEqual(back.whispers, whispers);
  assert.deepEqual(puzzleFor(back).solution, solution);

  // A 5 may go on a Dutch line, beside a 1 or a 9 only; beside a 4, an 8 or
  // a 9 may.
  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  const line = (digits) => variantCandidates(at(digits), { whispers: [[0, 1]], rules: dutch })[1];
  assert.equal(line({ 0: 5 }), bits(1, 9));
  assert.equal(line({ 0: 4 }), bits(8, 9));
  // 1 and 5 side by side clash on a German line, not a Dutch one; 2 and 5
  // on either.
  assert.equal(clashes(at({ 0: 1, 1: 5 }), { whispers: [[0, 1]], rules: dutch }).size, 0);
  assert.equal(clashes(at({ 0: 1, 1: 5 }), { whispers: [[0, 1]] }).size, 2);
  assert.equal(clashes(at({ 0: 2, 1: 5 }), { whispers: [[0, 1]], rules: dutch }).size, 2);
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

// A double arrow of `length` cells: the cells after the first circle adding
// up to less than it and a 9 could, then the last cell, the other circle,
// making up the difference.
const fitsDouble = (length) => (line, o, sol) => {
  const inner = line.slice(1).reduce((t, c) => t + sol[c], 0);
  if (line.length < length - 1) return inner + sol[o] < sol[line[0]] + 9;
  return sol[line[0]] + sol[o] === inner;
};
const doublePuzzle = () => linesOfLengths("doubles", 61, fitsDouble, [4, 3]);

test("double arrows are checked, solved and carried in seeds", () => {
  assert.equal(doubleProblem([[20, 30, 40]]), null);
  assert.equal(doubleProblem([[0, 1]]).why, "length", "a cell between the circles at least");

  const made = doublePuzzle();
  for (const t of made.doubles) {
    const inner = t.slice(1, -1).reduce((s, c) => s + made.solution[c], 0);
    assert.equal(inner, made.solution[t[0]] + made.solution[t.at(-1)], `the circles' total along ${t}`);
  }
  assert.ok(made.doubles.some((t) => t.length === 4));
  linesRoundTrip("doubles", "QDA", made);

  // Two circles make 2 at least, so the one cell between is never 1, and
  // neither circle is 9; circles 2 and 3 leave it 5.
  const t = [20, 30, 40];
  const open = variantCandidates(placed({}), { doubles: [t] });
  assert.equal(open[30], ALL_DIGITS & ~digitsMask(1));
  assert.equal(open[20], ALL_DIGITS & ~digitsMask(9));
  assert.equal(variantCandidates(placed({ 20: 2, 30: 5 }), { doubles: [t] })[40], digitsMask(3));

  // Full and off the circles' total clashes, and so does a full line short
  // of the least the circles could make.
  assert.deepEqual(sorted(clashes(placed({ 20: 2, 30: 9, 40: 3 }), { doubles: [t] })), [20, 30, 40]);
  assert.equal(clashes(placed({ 20: 2, 30: 5, 40: 3 }), { doubles: [t] }).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 20: 5, 30: 3 }), { doubles: [t] })), [20, 30]);
  assert.equal(clashes(placed({ 20: 5, 30: 7 }), { doubles: [t] }).size, 0, "the other circle could be 2");
});

// Pill arrows laid through a solved grid: a pill of `size` cells, then an
// arrow walked from beside it until its digits add up to the pill's number,
// of `most` cells at most, none sharing a cell with another in `used`.
function layPills(solution, rand, { count = 8, size = 2, most = 12, used = new Set() } = {}) {
  const pills = [];
  for (let tries = 0; pills.length < count && tries < 5000; tries++) {
    const first = Math.floor(rand() * 81);
    const along = rand() < 0.5 ? 1 : 9;
    const pill = Array.from({ length: size }, (_, j) => first + j * along);
    if (pill.at(-1) > 80 || (along === 1 && first % 9 > 9 - size) || pill.some((c) => used.has(c))) continue;
    const value = pill.reduce((n, c) => n * 10 + solution[c], 0);
    const arrow = [];
    let total = 0;
    while (total < value && arrow.length < most) {
      const next = [...Array(81).keys()].filter(
        (o) =>
          (arrow.length ? touching(arrow.at(-1), o) : pill.some((p) => touching(p, o))) &&
          !pill.includes(o) &&
          !arrow.includes(o) &&
          !used.has(o) &&
          total + solution[o] <= value
      );
      if (!next.length) break;
      const o = next[Math.floor(rand() * next.length)];
      arrow.push(o);
      total += solution[o];
    }
    if (total !== value) continue;
    [...pill, ...arrow].forEach((c) => used.add(c));
    pills.push({ pill, arrow });
  }
  return pills;
}

function pillPuzzle() {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(67);
  const pills = layPills(solution, rand);
  return { puzzle: thinOut(solution, { pills }, rand), solution, pills };
}

test("pill arrows are checked, solved and carried in seeds", () => {
  assert.equal(pillProblem([{ pill: [0, 1], arrow: [10, 20] }]), null);
  assert.equal(pillProblem([{ pill: [0, 9, 18], arrow: [19] }]), null, "down a column, the arrow from beside any pill cell");
  assert.equal(pillProblem([{ pill: [1, 0], arrow: [10] }]).why, "pill", "in reading order");
  assert.equal(pillProblem([{ pill: [8, 9], arrow: [17] }]).why, "pill", "not round onto the next row");
  assert.equal(pillProblem([{ pill: [0, 2], arrow: [10] }]).why, "pill", "side by side");
  assert.equal(pillProblem([{ pill: [0, 1], arrow: [] }]).why, "length");
  assert.equal(pillProblem([{ pill: [0, 1], arrow: [10, 1] }]).why, "loop");
  assert.equal(pillProblem([{ pill: [0, 1], arrow: [30] }]).why, "apart");

  const made = pillPuzzle();
  for (const { pill, arrow } of made.pills) {
    const total = arrow.reduce((s, c) => s + made.solution[c], 0);
    assert.equal(total, made.solution[pill[0]] * 10 + made.solution[pill[1]], `the pill's number along ${arrow}`);
  }
  assert.ok(made.pills.some(({ pill }) => pill[1] - pill[0] === 9), "down a column too");
  linesRoundTrip("pills", "QPA", made);

  // An arrow of two cells adds up to 18 at most, so its pill is 11 to 18:
  // a 1 first, never a 9 second, and each arrow cell 2 or more.
  const two = { pills: [{ pill: [0, 1], arrow: [9, 10] }] };
  const cand = variantCandidates(placed({}), two);
  assert.equal(cand[0], digitsMask(1));
  assert.equal(cand[1], ALL_DIGITS & ~digitsMask(9));
  assert.equal(cand[9], ALL_DIGITS & ~digitsMask(1));
  // A three-digit pill with thirteen cells of arrow, 117 at most, starts 1 1.
  const long = [9, 10, 11, 12, 13, 14, 15, 16, 17, 26, 25, 24, 23];
  const three = variantCandidates(placed({}), { pills: [{ pill: [0, 1, 2], arrow: long }] });
  assert.deepEqual([three[0], three[1]], [digitsMask(1), digitsMask(1)]);

  // A full arrow off the pill's number clashes, with the pill; a full arrow
  // short of the least an unfinished pill could be does too.
  const p = { pills: [{ pill: [0, 1], arrow: [11, 12] }] };
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 11: 9, 12: 8 }), p)), [0, 1, 11, 12]);
  assert.equal(clashes(placed({ 0: 1, 1: 3, 11: 6, 12: 7 }), p).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 11: 4, 12: 5 }), p)), [0, 11, 12]);
  assert.equal(clashes(placed({ 0: 2, 11: 9 }), p).size, 0, "not yet full");

  // Seeds carry a pill of three too, here with every clue given.
  const threes = layPills(made.solution, seeded(89), { count: 1, size: 3, most: PILL_ARROW_MOST });
  assert.equal(threes.length, 1, "a pill of three laid");
  assert.ok(threes[0].arrow.length >= 13);
  const full = parseSeed(madeSeed("H", made.solution, { pills: [...threes, ...made.pills] }).text);
  assert.deepEqual(full?.pills, [...threes, ...made.pills]);

  // With arrows and double arrows on the same grid: A, then QDA, then QPA.
  const { arrows } = arrowPuzzle();
  const { doubles } = doublePuzzle();
  const all = { arrows, doubles, pills: made.pills };
  const mixed = parseSeed(madeSeed("H", made.solution.map((d, c) => (c % 2 ? d : 0)), all).text);
  assert.ok(mixed, "the three together read back");
  assert.match(mixed.text, /^AQDAQPA-H-/);
  assert.deepEqual([mixed.arrows, mixed.doubles, mixed.pills], [arrows, doubles, made.pills]);
  assert.equal(variantName(all), "Arrow, Double Arrow, Pill Arrow");
  assert.equal(seedVariantName("KAQDAQPASD-H-BBBB"), "Killer, Arrow, Double Arrow, Pill Arrow, German Whispers, Diagonal");
});

// A path of 27 cells, snaking along the top three rows.
const SNAKE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 16, 15, 14, 13, 12, 11, 10, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26];

// Sum lines laid through a solved grid: walked from a random cell while the
// run so far stays within `sum`, then cut back to the end of its last full
// run, `min` to `max` cells.
function laySumLines(solution, rand, sum, { count = 8, min = 4, max = 8, used = new Set() } = {}) {
  const out = [];
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const start = Math.floor(rand() * 81);
    if (used.has(start) || solution[start] > sum) continue;
    const line = [start];
    let run = solution[start] % sum;
    let end = run ? 0 : 1;
    while (line.length < max) {
      const next = [...Array(81).keys()].filter((o) => touching(line.at(-1), o) && !line.includes(o) && !used.has(o) && run + solution[o] <= sum);
      if (!next.length) break;
      const o = next[Math.floor(rand() * next.length)];
      line.push(o);
      run = (run + solution[o]) % sum;
      if (!run) end = line.length;
    }
    const cells = line.slice(0, end);
    if (cells.length < min) continue;
    cells.forEach((c) => used.add(c));
    out.push({ sum, cells });
  }
  return out;
}

// Region sum lines laid through a solved grid: walked from a random cell,
// leaving a box only once the run in it makes the first run's total, then
// cut back to the end of its last full run, two runs and `min` to `max`
// cells.
function layRegionSums(solution, rand, { count = 8, min = 3, max = 8, used = new Set() } = {}) {
  const out = [];
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const start = Math.floor(rand() * 81);
    if (used.has(start)) continue;
    const line = [start];
    let target = 0;
    let run = solution[start];
    let end = 0;
    while (line.length < max) {
      const last = line.at(-1);
      const next = [...Array(81).keys()].filter((o) => {
        if (!touching(last, o) || line.includes(o) || used.has(o)) return false;
        return BOX[o] === BOX[last] ? !target || run + solution[o] <= target : !target || run === target;
      });
      if (!next.length) break;
      const o = next[Math.floor(rand() * next.length)];
      if (BOX[o] === BOX[last]) run += solution[o];
      else {
        target ||= run;
        run = solution[o];
      }
      line.push(o);
      if (run === target) end = line.length;
    }
    const cells = line.slice(0, end);
    if (cells.length < min) continue;
    cells.forEach((c) => used.add(c));
    out.push(cells);
  }
  return out;
}

// Value indexing lines laid through a solved grid: a random cell, one
// touching it whose digit K counts on, and a walk to a cell K past that one
// holding the first cell's digit.
function layIndexes(solution, rand, { count = 8, used = new Set() } = {}) {
  const out = [];
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const start = Math.floor(rand() * 81);
    if (used.has(start)) continue;
    const line = [start];
    // Once the count is known, the cells the line needs.
    let length = 0;
    while (!length || line.length < length) {
      const last = line.length === length - 1;
      const next = [...Array(81).keys()].filter((o) => touching(line.at(-1), o) && !line.includes(o) && !used.has(o) && (!last || solution[o] === solution[start]));
      if (!next.length) break;
      line.push(next[Math.floor(rand() * next.length)]);
      if (line.length === 2) length = solution[line[1]] + 2;
    }
    if (line.length !== length) continue;
    line.forEach((c) => used.add(c));
    out.push(line);
  }
  return out;
}

// A puzzle of one of these kinds on the thermo and arrow puzzles' grid.
function laidPuzzle(key, x, lay) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const lines = lay(solution, rand);
  return { puzzle: thinOut(solution, { [key]: lines }, rand), solution, [key]: lines };
}
const sumLinePuzzle = () => laidPuzzle("sumlines", 191, (solution, rand) => laySumLines(solution, rand, 10));
const regionSumPuzzle = () => laidPuzzle("regionsums", 193, (solution, rand) => layRegionSums(solution, rand));
const indexPuzzle = () => laidPuzzle("indexes", 197, (solution, rand) => layIndexes(solution, rand));

test("sum lines are checked, solved and carried in seeds", () => {
  assert.equal(sumLineProblem([{ sum: 10, cells: [20, 30, 40] }]), null);
  assert.equal(sumLineProblem([{ sum: 10, cells: SNAKE }]), null, `${LONG_LINE_MOST} cells`);
  assert.equal(sumLineProblem([{ sum: 10, cells: [...SNAKE, 35] }]).why, "length");
  assert.equal(sumLineProblem([{ sum: 10, cells: [0] }]).why, "length");
  assert.equal(sumLineProblem([{ sum: 10, cells: [0, 2] }]).why, "apart");
  assert.equal(sumLineProblem([{ sum: 0, cells: [0, 1] }]).why, "sum");
  assert.equal(sumLineProblem([{ sum: SUM_LINE_MAX + 1, cells: [0, 1] }]).why, "sum");
  assert.equal(sumLineProblem([{ sum: SUM_LINE_MAX, cells: [0, 1] }]), null);

  const made = sumLinePuzzle();
  for (const { sum, cells } of made.sumlines) {
    let run = 0;
    for (const c of cells) run = (run + made.solution[c]) % sum;
    assert.equal(run, 0, `runs of ${sum} along ${cells}`);
  }
  assert.ok(made.sumlines.some(({ cells }) => cells.length > 4), "some of more than one run");
  linesRoundTrip("sumlines", "QSL", made);

  // Row 3, column 3 and row 4, column 4 share no house. Cut into runs of 3,
  // two cells are 1 2 either way round, or 3 and 3.
  const two = (sum) => ({ sumlines: [{ sum, cells: [20, 30] }] });
  assert.equal(variantCandidates(placed({}), two(3))[20], digitsMask(1, 2, 3));
  assert.equal(variantCandidates(placed({ 20: 1 }), two(3))[30], digitsMask(2));
  assert.equal(variantCandidates(placed({ 20: 3 }), two(3))[30], digitsMask(3));
  // Two cells can make 18 only as one run of 9 and 9, which the line allows.
  assert.equal(variantCandidates(placed({}), two(18))[20], digitsMask(9));
  assert.equal(variantSolutions(placed({ 20: 2 }), two(12), 1)?.length, 0, "a 2 leaves 10 for one run of 12, and is no run of its own");

  // A run past the sum clashes, read from either end, and so does a full
  // line's last run short of it.
  const t = { sumlines: [{ sum: 10, cells: [20, 30, 40] }] };
  assert.deepEqual(sorted(clashes(placed({ 20: 6, 30: 5 }), t)), [20, 30]);
  assert.deepEqual(sorted(clashes(placed({ 40: 9, 30: 3 }), t)), [30, 40]);
  assert.ok(clashes(placed({ 20: 6, 30: 4, 40: 2 }), t).has(40));
  assert.equal(clashes(placed({ 20: 6, 30: 4 }), t).size, 0, "not yet full");
  assert.equal(clashes(placed({ 20: 6, 30: 4, 40: 1 }), { sumlines: [{ sum: 10, cells: [20, 30] }] }).size, 0);

  // A line longer than nine cells, and a sum over 9, go through a seed.
  let run = 0;
  let end = 0;
  const sum = made.solution[0] + made.solution[1] + made.solution[2];
  SNAKE.forEach((c, i) => {
    run += made.solution[c];
    if (run === sum) [run, end] = [0, i + 1];
    else if (run > sum) run = sum * 100;
  });
  const snake = { sum, cells: SNAKE.slice(0, end) };
  const full = parseSeed(madeSeed("H", made.solution, { sumlines: [snake] }).text);
  assert.deepEqual(full?.sumlines, [snake]);
});

// The eight cells round a cell, in order round it.
const ringOf = (centre) => [-10, -9, -8, 1, 10, 9, 8, -1].map((d) => centre + d);
// A loop of LOOP_LINE_MOST cells through the top three rows: along row 1,
// zigzagging back through rows 2 and 3, and up to beside its first cell.
const LONG_LOOP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 26, 25, 16, 15, 24, 23, 14, 13, 22, 21, 12, 11, 20, 19, 18, 9];

test("sum lines closed in a loop are checked, solved and carried in seeds", () => {
  const loop = (sum, cells) => ({ sum, cells, loop: true });
  assert.equal(sumLineProblem([loop(3, [0, 1, 10])]), null);
  assert.equal(sumLineProblem([loop(10, LONG_LOOP)]), null, `${LOOP_LINE_MOST} cells`);
  assert.equal(LONG_LOOP.length, LOOP_LINE_MOST);
  assert.equal(sumLineProblem([loop(10, SNAKE)]).why, "looplength", "a seed has no room for a loop of a long line's most");
  assert.equal(sumLineProblem([loop(3, [0, 1])]).why, "looplength");
  assert.equal(sumLineProblem([loop(3, [0, 1, 2])]).why, "open", "its last cell must touch its first");

  // Runs of 3 from a 1: along a line the 1 starts a run, so a 2 comes next;
  // round a loop the run may start at the cell before, so a 3 may.
  const three = [0, 1, 10];
  assert.equal(variantCandidates(placed({ 0: 1 }), { sumlines: [{ sum: 3, cells: three }] })[1], digitsMask(2));
  assert.equal(variantCandidates(placed({ 0: 1 }), { sumlines: [loop(3, three)] })[1], digitsMask(2, 3));
  assert.ok(loopCuts(3, three, placed({ 0: 1, 1: 3, 10: 2 })));
  assert.ok(!loopCuts(4, three, placed({ 0: 1, 1: 3, 10: 2 })));
  // A full loop that cuts no way clashes, all of it; part filled, it waits.
  assert.equal(clashes(placed({ 0: 1, 1: 3, 10: 2 }), { sumlines: [loop(3, three)] }).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 3, 10: 2 }), { sumlines: [loop(4, three)] })), [0, 1, 10]);
  assert.equal(clashes(placed({ 0: 1, 1: 3 }), { sumlines: [loop(4, three)] }).size, 0);

  // Rings round cells, none sharing a cell, each with a sum it cuts into,
  // one it cuts into only as a loop where there is one.
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const sumlines = [];
  let loopOnly = 0;
  const ringed = new Set();
  for (let centre = 10; centre < 71; centre++) {
    if (centre % 9 === 0 || centre % 9 === 8) continue;
    const cells = ringOf(centre);
    if (cells.some((c) => ringed.has(c))) continue;
    const sums = [...Array(22).keys()].map((s) => s + 9).filter((s) => loopCuts(s, cells, solution));
    const only = sums.find((s) => variantSolutions(solution, { sumlines: [{ sum: s, cells }] }, 1)?.length === 0);
    if (!sums.length) continue;
    if (only) loopOnly++;
    sumlines.push(loop(only ?? sums[0], cells));
    cells.forEach((c) => ringed.add(c));
  }
  assert.ok(sumlines.length >= 4 && loopOnly >= 2, `${sumlines.length} rings, ${loopOnly} only as loops`);
  const variant = { sumlines };
  assert.equal(clashes(solution, variant).size, 0);
  const rand = seeded(199);
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the loops");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QSL-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.sumlines, sumlines);
  assert.deepEqual(puzzleFor(back).solution, solution);

  // The longest loop goes through a seed too, with a line that is none, on
  // a grid it fits: its three boxes but one cell make 135 less that cell's
  // digit, 126 in runs of 18 with a 9 left out.
  const grid = variantSolve(new Array(81).fill(0), { sumlines: [loop(18, LONG_LOOP)] });
  assert.ok(grid && loopCuts(18, LONG_LOOP, grid), "a grid fits the long loop");
  const both = [loop(18, LONG_LOOP), { sum: grid[60] + grid[70], cells: [60, 70] }];
  const kept = parseSeed(madeSeed("H", grid, { sumlines: both }).text);
  assert.deepEqual(kept?.sumlines, both);
});

test("region sum lines are checked, solved and carried in seeds", () => {
  assert.equal(regionSumProblem([[0, 1, 2, 3]]), null);
  assert.equal(regionSumProblem([SNAKE]), null, `${LONG_LINE_MOST} cells`);
  assert.equal(regionSumProblem([[...SNAKE, 35]]).why, "length");
  assert.equal(regionSumProblem([[0, 10, 0]]).why, "loop");

  // Cut where the line changes box, a box it comes back to cut again; with
  // a Jigsaw's regions, where it changes region.
  assert.deepEqual(regionRuns([[0, 1, 2, 3, 12, 11]]), [[[0, 1, 2], [3, 12], [11]]]);
  assert.deepEqual(regionRuns([[2, 3, 2 + 9]]), [[[2], [3], [11]]]);
  const cut = Array.from(BOX);
  cut[3] = 0;
  assert.deepEqual(regionRuns([[0, 1, 2, 3]], cut), [[[0, 1, 2, 3]]]);

  const made = regionSumPuzzle();
  for (const runs of regionRuns(made.regionsums)) {
    assert.ok(runs.length >= 2, "two runs at least");
    assert.equal(new Set(runs.map((run) => run.reduce((s, c) => s + made.solution[c], 0))).size, 1, `one total along ${runs}`);
  }
  linesRoundTrip("regionsums", "QRS", made);

  // Three cells in the top left box and one beside it in the next: three
  // different digits make 6 at least, so the one cell is 6 to 9, and the
  // three from 1 to 6. A line within one box, or one region, is free.
  const t = { regionsums: [[0, 1, 2, 3]] };
  const cand = variantCandidates(placed({}), t);
  assert.equal(cand[0], digitsMask(1, 2, 3, 4, 5, 6));
  assert.equal(cand[3], digitsMask(6, 7, 8, 9));
  assert.equal(variantCandidates(placed({ 3: 6 }), t)[0], digitsMask(1, 2, 3));
  assert.equal(variantCandidates(placed({}), { regionsums: [[0, 1, 2]] })[0], ALL_DIGITS);
  assert.equal(variantCandidates(placed({}), { ...t, regions: cut })[3], ALL_DIGITS);

  // Full runs that differ clash; so does a run already past the total the
  // full ones agree on, counting 1 for each empty cell.
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 2: 3, 3: 7 }), t)), [0, 1, 2, 3]);
  assert.equal(clashes(placed({ 0: 1, 1: 2, 2: 3, 3: 6 }), t).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 0: 4, 1: 2, 3: 6 }), t)), [0, 1]);
  assert.equal(clashes(placed({ 0: 3, 1: 2, 3: 6 }), t).size, 0, "the last cell could be 1");

  // A line longer than nine cells goes through a seed.
  const long = layRegionSums(made.solution, seeded(199), { count: 1, min: 10, max: 16 });
  assert.equal(long.length, 1, "a long line laid");
  const full = parseSeed(madeSeed("H", made.solution, { regionsums: long }).text);
  assert.deepEqual(full?.regionsums, long);
});

test("value indexing lines are checked, solved and carried in seeds", () => {
  assert.equal(indexProblem([[20, 30, 40]]), null);
  assert.equal(indexProblem([[20, 30]]).why, "length", "a cell to count to at least");
  assert.equal(indexProblem([SNAKE.slice(0, INDEX_LINE_MOST)]), null);
  assert.equal(indexProblem([SNAKE.slice(0, INDEX_LINE_MOST + 1)]).why, "length");

  const made = indexPuzzle();
  for (const t of made.indexes) assert.equal(made.solution[t[made.solution[t[1]] + 1]], made.solution[t[0]], `the dot's digit counted to along ${t}`);
  linesRoundTrip("indexes", "QVX", made);

  // Two cells past the count: it is 1 or 2. Counting 2 puts the dot's digit
  // in the last cell.
  const t = { indexes: [[20, 30, 40, 50]] };
  assert.equal(variantCandidates(placed({}), t)[30], digitsMask(1, 2));
  assert.equal(variantCandidates(placed({ 20: 7, 30: 2 }), t)[50], digitsMask(7));
  assert.equal(variantCandidates(placed({ 20: 7, 40: 3 }), t)[30], digitsMask(2), "not 1, with a 3 there");
  assert.equal(variantSolutions(placed({}), { indexes: [[0, 1, 2]] }, 1)?.length, 0, "one row cannot hold the digit twice");

  // A count past the line's end clashes, and so does the digit it points at
  // when it is not the dot's.
  assert.deepEqual(sorted(clashes(placed({ 30: 3 }), t)), [30]);
  assert.deepEqual(sorted(clashes(placed({ 20: 7, 30: 1, 40: 3 }), t)), [20, 30, 40]);
  assert.equal(clashes(placed({ 20: 7, 30: 1, 40: 7 }), t).size, 0);

  // With the other two, on one grid: QSL, then QRS, then QVX.
  const { sumlines } = sumLinePuzzle();
  const { regionsums } = regionSumPuzzle();
  const all = { sumlines, regionsums, indexes: made.indexes };
  const mixed = parseSeed(madeSeed("H", made.solution.map((d, c) => (c % 2 ? d : 0)), all).text);
  assert.ok(mixed, "the three together read back");
  assert.match(mixed.text, /^QSLQRSQVX-H-/);
  assert.deepEqual([mixed.sumlines, mixed.regionsums, mixed.indexes], [sumlines, regionsums, made.indexes]);
  assert.equal(variantName(all), "Sum Line, Region Sum Line, Value Indexing");
  assert.equal(seedVariantName("KQMOQSLQRSQVXPD-H-BBBB"), "Killer, Modular, Sum Line, Region Sum Line, Value Indexing, Kropki, Diagonal");
});

// Groups of cells laid through a solved grid: as many as `count`, each
// grown edge to edge from a random cell to one of `sizes` cells, or for
// `straight` along a row or down a column, none sharing a cell with another
// in `used`, kept when `make` turns its cells into a cage, null to skip.
function layGroups(solution, rand, make, { count = 8, sizes = [2, 3, 4], straight = false, used = new Set() } = {}) {
  const out = [];
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const first = Math.floor(rand() * 81);
    const want = sizes[Math.floor(rand() * sizes.length)];
    let cells;
    if (straight) {
      const step = rand() < 0.5 ? 1 : 9;
      cells = Array.from({ length: want }, (_, i) => first + i * step);
      if (cells.at(-1) > 80 || (step === 1 && (first % 9) + want > 9)) continue;
    } else {
      cells = [first];
      while (cells.length < want) {
        const next = cells.flatMap((c) => [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1]).filter((n) => n >= 0 && n < 81 && !cells.includes(n));
        if (!next.length) break;
        cells.push(next[Math.floor(rand() * next.length)]);
      }
      if (cells.length < want) continue;
    }
    if (cells.some((c) => used.has(c))) continue;
    const cage = make(cells.sort((a, b) => a - b), solution, rand);
    if (!cage) continue;
    cells.forEach((c) => used.add(c));
    out.push(cage);
  }
  return out.sort((a, b) => a.cells[0] - b.cells[0]);
}

// A Rellik cage's clue: a total no set of its digits makes, from those up
// to all of them together.
function rellikOf(cells, solution, rand) {
  const digits = cells.map((c) => solution[c]);
  const made = new Set([0]);
  for (const d of digits) for (const t of [...made]) made.add(t + d);
  const open = [...Array(digits.reduce((t, d) => t + d, 0)).keys()].filter((t) => t && !made.has(t));
  return open.length ? { sum: open[Math.floor(rand() * open.length)], cells } : null;
}

// A lunchbox's sum, from its digits, if they are all different.
function lunchboxOf(cells, solution) {
  const digits = cells.map((c) => solution[c]);
  if (new Set(digits).size < digits.length) return null;
  const [i, j] = [digits.indexOf(Math.min(...digits)), digits.indexOf(Math.max(...digits))].sort((p, q) => p - q);
  return { sum: digits.slice(i + 1, j).reduce((t, d) => t + d, 0), cells };
}

// A Look and Say clue: the count of one or two of the cage's digits, and
// now and then a digit it has none of.
function lookSayOf(cells, solution, rand) {
  const digits = cells.map((c) => solution[c]);
  const named = [...new Set(digits)].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2));
  let clue = named.map((d) => `${digits.filter((e) => e === d).length}${d}`).join("");
  const none = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !digits.includes(d) && rand() < 0.3);
  if (none) clue += `0${none}`;
  return { clue, cells };
}

// An Equality cage, if its digits are even across low and high, odd and
// even, all different.
function equalityOf(cells, solution) {
  const digits = cells.map((c) => solution[c]);
  const half = digits.length / 2;
  const count = (f) => digits.filter(f).length;
  const even = new Set(digits).size === digits.length && count((d) => d < 5) === half && count((d) => d > 5) === half && count((d) => d % 2) === half;
  return even ? { cells } : null;
}

// A puzzle of one kind of cage, on the thermo and arrow puzzles' grid.
function cagesPuzzle(key, x, make, options) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const cages = layGroups(solution, rand, make, options);
  return { puzzle: thinOut(solution, { [key]: cages }, rand), solution, [key]: cages };
}

// A cage kind's puzzle is checked and solved, and its seed reads back, with
// `letter` at its front.
function cagesRoundTrip(key, letter, made) {
  const { puzzle, solution, [key]: cages } = made;
  assert.ok(cages.length >= 6, `${key}: laid ${cages.length}`);
  assert.equal(clashes(solution, { [key]: cages }).size, 0, `${key}: the answer keeps them`);
  const check = checkClues(puzzle, { [key]: cages });
  assert.equal(check.ok, true, `${key}: ${check.why}`);
  assert.deepEqual(check.solution, solution);
  assert.notEqual(countSolutions(puzzle, 2), 1, `${key}: needs the cages`);
  const cand = variantCandidates(puzzle, { [key]: cages });
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${key}: candidates at ${c}`);
  stepsAgree(puzzle, solution, { [key]: cages });

  const seed = madeSeed(rateLevel(puzzle, { [key]: cages }), puzzle, { [key]: cages });
  assert.match(seed.text, new RegExp(`^${letter}-[EMHX]-`));
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back?.text, seed.text);
  assert.deepEqual(back[key], cages);
  assert.deepEqual(puzzleFor(back).solution, solution);
}

const rellikPuzzle = () => cagesPuzzle("relliks", 101, rellikOf);
const lunchboxPuzzle = () => cagesPuzzle("lunchboxes", 103, lunchboxOf, { sizes: [3, 4, 5], straight: true });
const lookSayPuzzle = () => cagesPuzzle("looksays", 107, lookSayOf, { sizes: [2, 3, 4, 5] });
const equalityPuzzle = () => cagesPuzzle("equalities", 109, equalityOf, { sizes: [2, 4], count: 10 });

test("Rellik cages are checked, solved and carried in seeds", () => {
  assert.equal(rellikProblem([{ sum: 10, cells: [0, 1] }]), null);
  assert.equal(rellikProblem([{ sum: 0, cells: [0, 1] }]).why, "sum");
  assert.equal(rellikProblem([{ sum: 46, cells: [0, 1] }]).why, "sum");
  assert.equal(rellikProblem([{ sum: 5, cells: [0, 2] }]).why, "apart");
  assert.equal(rellikProblem([{ sum: 5, cells: [0, 1] }, { sum: 6, cells: [1, 10] }]).why, "overlap");

  cagesRoundTrip("relliks", "QRC", rellikPuzzle());

  // A clue of 3 rules out 3 anywhere in the cage, and a placed 1 rules out
  // 2 as well; a placed 2 and 4 rule out 1 alongside them for a clue of 7.
  const k = { relliks: [{ sum: 3, cells: [0, 1, 2] }] };
  assert.equal(variantCandidates(placed({}), k)[1] & digitsMask(3), 0);
  assert.equal(variantCandidates(placed({ 0: 1 }), k)[1], ALL_DIGITS & ~digitsMask(1, 2, 3));
  assert.equal(variantCandidates(placed({ 0: 2, 1: 4 }), { relliks: [{ sum: 7, cells: [0, 1, 2] }] })[2] & digitsMask(1, 5), 0);
  // Digits may repeat, but never make the clue together.
  assert.equal(variantSolutions(placed({ 0: 1, 1: 2 }), k, 1).length, 0);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 2: 7 }), k)), [0, 1]);
  assert.equal(clashes(placed({ 2: 4, 12: 4 }), { relliks: [{ sum: 3, cells: [2, 11, 12] }] }).size, 0, "a repeat is no clash in itself");
});

test("lunchboxes are checked, solved and carried in seeds", () => {
  assert.equal(lunchboxProblem([{ sum: 7, cells: [0, 1, 2, 3] }]), null);
  assert.equal(lunchboxProblem([{ sum: 0, cells: [9, 18] }]), null, "down a column, two side by side between nothing");
  assert.equal(lunchboxProblem([{ sum: 1, cells: [9, 18] }]).why, "sum");
  assert.equal(lunchboxProblem([{ sum: 1, cells: [0, 1, 2] }]).why, "sum", "one digit between, 2 to 8");
  assert.equal(lunchboxProblem([{ sum: 0, cells: [0] }]).why, "size");
  assert.equal(lunchboxProblem([{ sum: 3, cells: [0, 1, 10] }]).why, "line");
  assert.equal(lunchboxProblem([{ sum: 3, cells: [7, 8, 9] }]).why, "line", "not round onto the next row");

  cagesRoundTrip("lunchboxes", "QLB", lunchboxPuzzle());

  // Nine cells between 1 and 9: the 1 and 9 at the ends, the seven between
  // adding to 35. With a sum of 0, they sit side by side.
  const row = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const whole = variantCandidates(placed({}), { lunchboxes: [{ sum: 35, cells: row }] });
  assert.equal(whole[0], digitsMask(1, 9));
  assert.equal(whole[4], ALL_DIGITS & ~digitsMask(1, 9));
  const twin = variantCandidates(placed({ 0: 1 }), { lunchboxes: [{ sum: 0, cells: row }] });
  assert.equal(twin[1], digitsMask(9), "the 9 right beside the 1");
  // Full and off the sum clashes, all of it; a repeat clashes at once.
  const box = { lunchboxes: [{ sum: 5, cells: [0, 1, 2, 3] }] };
  assert.equal(clashes(placed({ 0: 1, 1: 2, 2: 3, 3: 9 }), box).size, 0);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 3, 2: 4, 3: 9 }), box)), [0, 1, 2, 3]);
  assert.deepEqual(sorted(clashes(placed({ 0: 4, 2: 4 }), box)), [0, 2]);
});

test("Look and Say cages are checked, solved and carried in seeds", () => {
  assert.deepEqual(sayCounts("2314"), [-1, -1, -1, 2, 1, -1, -1, -1, -1, -1]);
  assert.equal(sayCounts("0305")[3], 0, "a count of 0");
  for (const bad of ["", "2", "20", "2323", "123", 23]) assert.equal(sayCounts(bad), null, String(bad));
  assert.equal(sayWords("2314"), "two 3s and one 4");
  assert.equal(sayWords("0512"), "no 5s and one 2");
  assert.equal(lookSayProblem([{ clue: "23", cells: [0, 1] }]), null);
  assert.equal(lookSayProblem([{ clue: "3314", cells: [0, 1, 2] }]).why, "clue", "more counted than cells");
  assert.equal(lookSayProblem([{ clue: "20", cells: [0, 1] }]).why, "clue");

  const made = lookSayPuzzle();
  cagesRoundTrip("looksays", "QLS", made);
  assert.ok(made.looksays.some(({ clue }) => /^(\d\d)*0\d/.test(clue)), "a count of 0 among them");

  // Cells 2 and 12 share no house, so they can hold two 3s; 11 shares one
  // with each. With a 3 in 2, the other has to go in 12.
  const cells = [2, 11, 12];
  const say = { looksays: [{ clue: "23", cells }] };
  assert.equal(variantCandidates(placed({ 2: 3 }), say)[12], digitsMask(3));
  assert.equal(variantCandidates(placed({}), { looksays: [{ clue: "05", cells }] })[11] & digitsMask(5), 0, "a count of 0 rules it out");
  // A 3 too many clashes; so does a full cage short of the count.
  assert.deepEqual(sorted(clashes(placed({ 2: 3, 12: 3 }), { looksays: [{ clue: "13", cells }] })), [2, 12]);
  assert.deepEqual(sorted(clashes(placed({ 2: 3, 11: 5, 12: 6 }), say)), cells);
  assert.equal(clashes(placed({ 2: 3, 11: 5 }), say).size, 0, "the last cell could be a 3");
});

test("Equality cages are checked, solved and carried in seeds", () => {
  assert.equal(equalityProblem([{ cells: [0, 1] }]), null);
  assert.equal(equalityProblem([{ cells: [0, 1, 2] }]).why, "size", "an even number of cells");
  assert.equal(equalityProblem([{ cells: [0] }]).why, "size");
  assert.equal(equalityProblem([{ cells: [0, 2] }]).why, "apart");

  cagesRoundTrip("equalities", "QEC", equalityPuzzle());

  // Two cells: one low and odd with one high and even, or the other way
  // round. A placed 1 leaves 6 or 8.
  const eq = { equalities: [{ cells: [0, 1] }] };
  assert.equal(variantCandidates(placed({}), eq)[0], ALL_DIGITS & ~digitsMask(5));
  assert.equal(variantCandidates(placed({ 0: 1 }), eq)[1], digitsMask(6, 8));
  assert.equal(variantCandidates(placed({ 0: 7 }), eq)[1], digitsMask(2, 4));
  assert.deepEqual(sorted(clashes(placed({ 0: 5 }), eq)), [0]);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 3 }), eq)), [0, 1]);
  assert.equal(clashes(placed({ 0: 1, 1: 8 }), eq).size, 0);
});

const beside = (c) => [c - 9, c + 9, c % 9 ? c - 1 : -1, c % 9 < 8 ? c + 1 : -1].filter((n) => n >= 0 && n < 81);

// Cages in two pieces laid through a solved grid: as many as `count`, each
// piece grown edge to edge from a random cell to one of `sizes` cells (the
// second as big as the first, for `same`), never touching the first along
// an edge, kept when `fits` takes the two pieces' digits. None shares a
// cell with another in `used`.
function layPieces(solution, rand, fits, { count = 6, sizes = [1, 2, 3], same = false, used = new Set() } = {}) {
  const grow = (want, avoid) => {
    const cells = [Math.floor(rand() * 81)];
    if (avoid.has(cells[0])) return null;
    while (cells.length < want) {
      const next = cells.flatMap(beside).filter((n) => !cells.includes(n) && !avoid.has(n));
      if (!next.length) return null;
      cells.push(next[Math.floor(rand() * next.length)]);
    }
    return cells.sort((p, q) => p - q);
  };
  const size = () => sizes[Math.floor(rand() * sizes.length)];
  const out = [];
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const a = grow(size(), used);
    if (!a) continue;
    const near = new Set([...used, ...a, ...a.flatMap(beside)]);
    for (let again = 0; again < 300; again++) {
      const b = grow(same ? a.length : size(), near);
      if (!b || !fits(a.map((c) => solution[c]), b.map((c) => solution[c]))) continue;
      const cells = [...a, ...b].sort((p, q) => p - q);
      cells.forEach((c) => used.add(c));
      out.push({ cells });
      break;
    }
  }
  return out.sort((p, q) => p.cells[0] - q.cells[0]);
}

const total = (digits) => digits.reduce((t, d) => t + d, 0);
const fitsEqualSum = (a, b) => total(a) === total(b);
const fitsSameValues = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();

// A Connected Values clue: some of the cage's digits whose cells join up,
// and now and then a digit it has none of.
function connectedOf(cells, solution, rand) {
  const digits = [...new Set(cells.map((c) => solution[c]))];
  for (let tries = 0; tries < 10; tries++) {
    const pick = digits.filter(() => rand() < 0.5);
    if (!pick.length) continue;
    if (piecesOf(cells.filter((c) => pick.includes(solution[c]))).length > 1) continue;
    const none = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !digits.includes(d) && rand() < 0.2);
    if (none) pick.push(none);
    if (pick.length > 8) continue;
    return { clue: pick.sort((p, q) => p - q).join(""), cells };
  }
  return null;
}

// A Count Distinct cage: a control whose digit counts the different digits
// in the cage's other cells, if one of its cells has that.
function distinctOf(cells, solution, rand) {
  const fits = cells.filter((k) => new Set(cells.filter((c) => c !== k).map((c) => solution[c])).size === solution[k]);
  return fits.length ? { control: fits[Math.floor(rand() * fits.length)], cells } : null;
}

// A puzzle of one kind of cage in pieces, on the same grid as cagesPuzzle.
function piecesPuzzle(key, x, fits, options) {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(x);
  const cages = layPieces(solution, rand, fits, options);
  return { puzzle: thinOut(solution, { [key]: cages }, rand), solution, [key]: cages };
}

test("Equal Sum cages are checked, solved and carried in seeds", () => {
  assert.deepEqual(piecesOf([0, 1, 13, 30, 39]), [[0, 1], [13], [30, 39]]);
  assert.equal(equalSumProblem([{ cells: [0, 13] }]), null);
  assert.equal(equalSumProblem([{ cells: [0, 1] }]).why, "pieces", "one piece is no Equal Sum cage");
  assert.equal(equalSumProblem([{ cells: [0] }]).why, "size");
  assert.equal(equalSumProblem([{ cells: [...Array(10).keys(), 30] }]).why, "piece", "a piece of ten cells");
  assert.equal(equalSumProblem([{ cells: [0, 13] }, { cells: [13, 40] }]).why, "overlap");

  const made = piecesPuzzle("equalsums", 191, fitsEqualSum);
  cagesRoundTrip("equalsums", "QES", made);
  assert.ok(made.equalsums.some(({ cells }) => new Set(piecesOf(cells).map((p) => p.length)).size > 1), "pieces of different sizes among them");

  // One cell against two: a 1 and a 2 make the other cell a 3. Digits may
  // repeat: two single cells in no house together hold the same digit.
  const sum = { equalsums: [{ cells: [0, 1, 30] }] };
  assert.equal(variantCandidates(placed({ 0: 1, 1: 2 }), sum)[30], digitsMask(3));
  assert.equal(variantCandidates(placed({ 0: 4 }), { equalsums: [{ cells: [0, 13] }] })[13], digitsMask(4));
  // Two cells making 2 is 1 and 1, which their row forbids.
  assert.equal(variantCandidates(placed({ 30: 2 }), sum)[0], digitsMask(1));
  assert.equal(variantSolutions(placed({ 30: 2 }), sum, 1).length, 0);
  // Full pieces off each other clash, and so does one past the total.
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 30: 4 }), sum)), [0, 1, 30]);
  assert.deepEqual(sorted(clashes(placed({ 0: 4, 30: 4 }), sum)), [0], "4 and at least 1 more is past 4");
  assert.equal(clashes(placed({ 0: 1, 30: 4 }), sum).size, 0);
});

test("Same Values cages are checked, solved and carried in seeds", () => {
  assert.equal(sameValueProblem([{ cells: [0, 1, 30, 31] }]), null);
  assert.equal(sameValueProblem([{ cells: [0, 1, 30] }]).why, "uneven");
  assert.equal(sameValueProblem([{ cells: [0, 1] }]).why, "pieces");

  cagesRoundTrip("samevalues", "QSV", piecesPuzzle("samevalues", 193, fitsSameValues, { sizes: [1, 2, 3], same: true }));

  // Two pieces of two: a 1 and a 2 in one leave the other only those.
  const same = { samevalues: [{ cells: [0, 1, 30, 31] }] };
  assert.equal(variantCandidates(placed({ 0: 1, 1: 2 }), same)[30], digitsMask(1, 2));
  assert.equal(variantCandidates(placed({ 0: 1, 1: 2, 30: 1 }), same)[31], digitsMask(2));
  // A 1 the other piece has no room for clashes.
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 30: 3, 31: 4 }), same)), [0]);
  assert.equal(clashes(placed({ 0: 1, 30: 3 }), same).size, 0);
});

test("Connected Values cages are checked, solved and carried in seeds", () => {
  assert.equal(connectedProblem([{ clue: "135", cells: [0, 1] }]), null);
  for (const clue of ["", "531", "113", "123456789", "0", 1]) assert.equal(connectedProblem([{ clue, cells: [0, 1] }]).why, "clue", String(clue));
  assert.equal(connectedProblem([{ clue: "1", cells: [0] }]).why, "size");
  assert.equal(connectedProblem([{ clue: "1", cells: [0, 2] }]).why, "apart");
  assert.equal(linkWords("135"), "1s, 3s or 5s");

  cagesRoundTrip("connecteds", "QCV", cagesPuzzle("connecteds", 197, connectedOf, { sizes: [3, 4, 5] }));

  // With a 1 in the first cell and a 5 in the middle, the last is cut off
  // and cannot take a 2.
  const link = { connecteds: [{ clue: "12", cells: [0, 1, 2] }] };
  assert.equal(variantCandidates(placed({ 0: 1, 1: 5 }), link)[2] & digitsMask(2), 0);
  assert.ok(variantCandidates(placed({ 0: 1 }), link)[2] & digitsMask(2), "joined up through the middle");
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 5, 2: 2 }), link)), [0, 2]);
  // Full with none of the clue's digits: one is always there.
  assert.deepEqual(sorted(clashes(placed({ 0: 3, 1: 4, 2: 5 }), link)), [0, 1, 2]);
  assert.equal(variantSolutions(placed({ 0: 3, 1: 4 }), { connecteds: [{ clue: "12", cells: [0, 1] }] }, 1).length, 0);
});

test("Count Distinct cages are checked, solved and carried in seeds", () => {
  assert.equal(distinctProblem([{ control: 3, cells: [2, 3, 12] }]), null);
  assert.equal(distinctProblem([{ control: 4, cells: [2, 3, 12] }]).why, "control");
  assert.equal(distinctProblem([{ control: 3, cells: [3] }]).why, "size");

  const made = cagesPuzzle("distincts", 199, distinctOf, { sizes: [3, 4, 5] });
  cagesRoundTrip("distincts", "QCD", made);
  assert.ok(made.distincts.some(({ control, cells }) => control !== cells[0]), "a control other than the first cell");
  assert.deepEqual(cagesOf({ distincts: [{ control: 12, cells: [2, 3, 12] }] })[0].head, 12, "the # in the control");

  // Cells 2 and 12 share no house, so they may repeat. Two different
  // digits placed count 2.
  const count = { distincts: [{ control: 3, cells: [2, 3, 12] }] };
  assert.equal(variantCandidates(placed({}), count)[3], digitsMask(1, 2));
  assert.equal(variantCandidates(placed({ 2: 5, 3: 1 }), count)[12], digitsMask(5), "a count of 1: the same digit again");
  assert.equal(variantCandidates(placed({ 0: 3, 1: 4 }), { distincts: [{ control: 10, cells: [0, 1, 10] }] })[10], digitsMask(2));
  assert.deepEqual(sorted(clashes(placed({ 3: 1, 2: 5, 12: 6 }), count)), [2, 3, 12]);
  assert.deepEqual(sorted(clashes(placed({ 3: 3, 2: 5 }), count)), [2, 3], "one cell left cannot make three");
  assert.equal(clashes(placed({ 3: 2, 2: 5 }), count).size, 0);
});

test("cages of every kind go together, one cage to a cell", () => {
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const used = new Set();
  const lay = (x, make, options) => layGroups(solution, seeded(x), make, { count: 3, used, ...options });
  const cages = lay(113, (cells, sol) => (new Set(cells.map((c) => sol[c])).size === cells.length ? { sum: cells.reduce((t, c) => t + sol[c], 0), cells } : null));
  const relliks = lay(127, rellikOf);
  const lunchboxes = lay(131, lunchboxOf, { sizes: [3, 4], straight: true });
  const looksays = lay(137, lookSayOf);
  const equalities = lay(139, equalityOf, { sizes: [2, 4] });
  const equalsums = layPieces(solution, seeded(211), fitsEqualSum, { count: 2, used });
  const samevalues = layPieces(solution, seeded(223), fitsSameValues, { count: 2, same: true, used });
  const connecteds = lay(227, connectedOf, { sizes: [3, 4] });
  const distincts = lay(229, distinctOf, { sizes: [3, 4] });
  const variant = { cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts };
  for (const [list, found] of Object.entries(variant)) assert.ok(found.length, `some ${list}`);
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, seeded(149));
  assert.equal(checkClues(puzzle, variant).ok, true);
  stepsAgree(puzzle, solution, variant);

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^KQRCQLBQLSQECQESQSVQCVQCD-[EMHX]-/);
  const back = parseSeed(seed.text);
  for (const list of Object.keys(variant)) assert.deepEqual(back[list], variant[list], list);
  const names = "Killer, Rellik Cage, Lunchbox, Look and Say, Equality Cage, Equal Sum, Same Values, Connected Values, Count Distinct";
  assert.equal(variantName(variant), names);
  assert.equal(seedVariantName(seed.text), names);
  // A cage in pieces is drawn a piece at a time.
  assert.equal(cagesOf(variant).length, [cages, relliks, lunchboxes, looksays, equalities, connecteds, distincts].flat().length + (equalsums.length + samevalues.length) * 2);
  assert.deepEqual(
    cagesOf({
      relliks: [{ sum: 7, cells: [0] }],
      looksays: [{ clue: "2314", cells: [1] }],
      equalities: [{ cells: [2, 3] }],
      equalsums: [{ cells: [4, 6] }],
      samevalues: [{ cells: [18, 20] }, { cells: [27, 29] }],
      connecteds: [{ clue: "135", cells: [36, 37] }],
      distincts: [{ control: 46, cells: [45, 46] }],
    }).map((k) => k.label),
    ["≠7", "2×3 1×4", "=", "Σ", "Σ", "≡A", "≡A", "≡B", "≡B", "~135", "#"]
  );

  // Two kinds on one cell is no puzzle, though each kind alone is fine.
  const shared = { cages: [{ sum: 3, cells: [0, 1] }], equalities: [{ cells: [1, 2] }] };
  assert.deepEqual(checkClues(solution.map((d, c) => (c < 3 ? 0 : d)), shared).problem, { why: "overlap" });
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

test("Greater Than signs are checked, solved and carried in seeds", () => {
  sideMarksAgree({ key: "signs", letter: "QGT", marks: ["gt", "lt"], problem: signProblem, x: 29 });
  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  // A sign's first cell is the larger under "gt" and the smaller under
  // "lt", whichever of the two is placed.
  const gt = { signs: [{ cells: [0, 1], mark: "gt" }] };
  const lt = { signs: [{ cells: [0, 9], mark: "lt" }] };
  assert.equal(variantCandidates(at({ 0: 5 }), gt)[1], 0b11110);
  assert.equal(variantCandidates(at({ 1: 5 }), gt)[0], 0b1111000000);
  assert.equal(variantCandidates(at({ 0: 5 }), lt)[9], 0b1111000000);
  assert.equal(variantCandidates(at({ 9: 5 }), lt)[0], 0b11110);
  assert.equal(variantCandidates(at({}), gt)[0] & (1 << 1), 0, "the larger is never 1");
  assert.deepEqual([...clashes(at({ 0: 3, 1: 7 }), gt)].sort((p, q) => p - q), [0, 1]);
  assert.equal(clashes(at({ 0: 7, 1: 3 }), gt).size, 0);
  assert.equal(seedVariantName("PVQGTQQDB-H-BBBB"), "Kropki, XV, Greater Than, Quad, Sandwich");
});

// Quads laid on a solved grid: `count` corners, none twice, each listing two
// to four of its four cells' digits.
function layQuads(solution, rand, count) {
  const out = [];
  while (out.length < count) {
    const cell = Math.floor(rand() * 71);
    if (cell % 9 > 7 || out.some((q) => q.cell === cell)) continue;
    const digits = quadCells(cell)
      .map((c) => solution[c])
      .sort(() => rand() - 0.5)
      .slice(0, 2 + Math.floor(rand() * 3))
      .sort((a, b) => a - b);
    out.push({ cell, digits });
  }
  return out.sort((a, b) => a.cell - b.cell);
}

test("quads are checked, solved and carried in seeds", () => {
  assert.equal(quadProblem([{ cell: 0, digits: [1, 2] }, { cell: 70, digits: [9, 9, 1, 1] }]), null);
  assert.equal(quadProblem([{ cell: 8, digits: [1] }]).why, "cell", "no corner right of the last column");
  assert.equal(quadProblem([{ cell: 72, digits: [1] }]).why, "cell", "nor below the last row");
  assert.equal(quadProblem([{ cell: 0, digits: [] }]).why, "digits");
  assert.equal(quadProblem([{ cell: 0, digits: [1, 2, 3, 4, 5] }]).why, "digits");
  assert.equal(quadProblem([{ cell: 0, digits: [0] }]).why, "digits");
  assert.equal(quadProblem([{ cell: 0, digits: [3, 3, 3] }]).why, "thrice");
  assert.equal(quadProblem([{ cell: 0, digits: [1] }, { cell: 0, digits: [2] }]).why, "twice");

  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const quads = layQuads(solution, seeded(61), 12);
  const variant = { quads };
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, seeded(67));
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the quads");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QQD-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.quads, quads);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // Digits in any order come out sorted, so a seed is the same whatever
  // order they were typed in.
  const shuffled = quads.map((q) => ({ cell: q.cell, digits: q.digits.slice().reverse() }));
  assert.equal(madeSeed(seed.level, puzzle, { quads: shuffled }).text, seed.text);

  // The last empty cell takes the digit left; a digit twice goes in twice,
  // across the corner from each other; too few cells left clashes.
  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  assert.equal(variantCandidates(at({ 0: 1, 1: 2, 9: 3 }), { quads: [{ cell: 0, digits: [1, 2, 3, 4] }] })[10], 1 << 4);
  assert.equal(variantCandidates(at({ 2: 9 }), { quads: [{ cell: 2, digits: [9, 9] }] })[12], 1 << 9);
  assert.equal(variantSolutions(at({}), { quads: [{ cell: 0, digits: [9, 9] }] }, 1)?.length, 0, "one box never holds two 9s");
  assert.deepEqual([...clashes(at({ 0: 5, 1: 6, 9: 7 }), { quads: [{ cell: 0, digits: [1, 2] }] })].sort((p, q) => p - q), [0, 1, 9]);
  assert.equal(clashes(at({ 0: 5, 1: 6 }), { quads: [{ cell: 0, digits: [1, 2] }] }).size, 0);
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
const hiddenOf = (solution, view) => ({ view, height: firstHidden(VIEWS[view].map((c) => solution[c])) });
function roomOf(solution, view) {
  const digits = VIEWS[view].map((c) => solution[c]);
  return { view, digit: digits[digits[0] - 1] };
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

test("Hidden Skyscraper clues are checked, solved and carried in seeds", () => {
  assert.equal(hiddenProblem([{ view: 0, height: 1 }, { view: 35, height: 8 }]), null);
  assert.equal(hiddenProblem([{ view: 3, height: 9 }]).why, "height", "a 9 is never hidden");
  assert.equal(hiddenProblem([{ view: 3, height: 0 }]).why, "height");
  assert.equal(hiddenProblem([{ view: 3, height: 2 }, { view: 3, height: 4 }]).why, "twice");
  assert.equal(firstHidden([1, 2, 5, 3, 9]), 3);
  assert.equal(firstHidden([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0);
  viewCluesAgree("hiddens", "QHS", hiddenOf, 71);

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  // An 8 hidden from the left: the first cell is not the 8, the second not
  // a 1, as it rises from the first or is the 8. After 3 and 6, a 5 is
  // hidden or the view rises past 6.
  const eight = variantCandidates(at({}), { hiddens: [{ view: 0, height: 8 }] });
  assert.equal(eight[0], 0b1111111110 & ~bits(8));
  assert.equal(eight[1], 0b1111111110 & ~bits(1));
  assert.equal(variantCandidates(at({ 0: 3, 1: 6 }), { hiddens: [{ view: 0, height: 5 }] })[2], bits(5, 7, 8, 9));
  // From the right: row 1's last cell first.
  assert.equal(variantCandidates(at({ 8: 9 }), { hiddens: [{ view: 18, height: 4 }] })[7], bits(4));
  // Another height hidden first clashes, as does the height seen.
  const five = { hiddens: [{ view: 0, height: 5 }] };
  assert.deepEqual([...clashes(at({ 0: 3, 1: 6, 2: 4 }), five)].sort((p, q) => p - q), [0, 1, 2]);
  assert.deepEqual([...clashes(at({ 0: 3, 1: 5 }), five)].sort((p, q) => p - q), [0, 1]);
  assert.equal(clashes(at({ 0: 3, 1: 6, 2: 5 }), five).size, 0);
});

test("Numbered Room clues are checked, solved and carried in seeds", () => {
  assert.equal(roomProblem([{ view: 0, digit: 1 }, { view: 35, digit: 9 }]), null);
  assert.equal(roomProblem([{ view: 3, digit: 10 }]).why, "digit");
  assert.equal(roomProblem([{ view: 36, digit: 3 }]).why, "view");
  viewCluesAgree("rooms", "QNR", roomOf, 73);

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  // A 7: the first digit is neither 1, which would point at itself, nor 7,
  // which would be the 7 in the wrong place; a first 4 puts the 7 fourth.
  assert.equal(variantCandidates(at({}), { rooms: [{ view: 0, digit: 7 }] })[0], 0b1111111110 & ~bits(1, 7));
  assert.equal(variantCandidates(at({ 0: 4 }), { rooms: [{ view: 0, digit: 7 }] })[3], bits(7));
  assert.equal(variantCandidates(at({ 0: 4 }), { rooms: [{ view: 0, digit: 7 }] })[5] & bits(7), 0);
  // A 1 may be anywhere, the first cell too, as a 1 there points at
  // itself; a first 3 puts it third, down a column from the top.
  assert.equal(variantCandidates(at({}), { rooms: [{ view: 9, digit: 1 }] })[0], 0b1111111110);
  assert.equal(variantCandidates(at({ 0: 3 }), { rooms: [{ view: 9, digit: 1 }] })[18], bits(1));
  // Something else where it points clashes, as does the clue's digit
  // somewhere else.
  const seven = { rooms: [{ view: 0, digit: 7 }] };
  assert.deepEqual([...clashes(at({ 0: 4, 3: 6 }), seven)].sort((p, q) => p - q), [0, 3]);
  assert.deepEqual([...clashes(at({ 0: 4, 2: 7 }), seven)].sort((p, q) => p - q), [0, 2]);
  assert.equal(clashes(at({ 0: 4, 3: 7 }), seven).size, 0);
  assert.equal(seedVariantName("YUQHSQNRJD-H-BBBB"), "Skyscrapers, X-Sums, Hidden Skyscraper, Numbered Room, Jigsaw, Diagonal");
});

// A solved grid's Full Rank clue for a view: where its number comes among
// all 36, smallest first. The test grid's 36 numbers are all different.
function rankOf(solution, view) {
  const number = (v) => VIEWS[v].map((c) => solution[c]).join("");
  return { view, rank: VIEWS.filter((_, w) => number(w) < number(view)).length + 1 };
}

test("Full Rank clues are checked, solved and carried in seeds", () => {
  assert.equal(rankProblem([{ view: 0, rank: 1 }, { view: 35, rank: RANK_MOST }]), null);
  assert.equal(rankProblem([{ view: 3, rank: 37 }]).why, "rank");
  assert.equal(rankProblem([{ view: 3, rank: 0 }]).why, "rank");
  assert.equal(rankProblem([{ view: 36, rank: 3 }]).why, "view");
  assert.equal(rankProblem([{ view: 3, rank: 2 }, { view: 3, rank: 4 }]).why, "twice");
  assert.equal(rankProblem([{ view: 3, rank: 2 }, { view: 4, rank: 2 }]).why, "same", "a clued view ties with none");
  // Ranks 1 to 4 start with 1, 5 to 8 with 2; how many of its four are below.
  assert.deepEqual([1, 4, 5, 8, 36].map(rankStart), [1, 1, 2, 2, 9]);
  assert.deepEqual([1, 4, 5, 8, 36].map(rankBelow), [0, 3, 0, 3, 3]);
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  assert.equal(new Set(VIEWS.map((cells) => cells.map((c) => solution[c]).join(""))).size, 36);
  viewCluesAgree("ranks", "QFR", rankOf, 191);

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  // A clue fixes its view's first digit.
  assert.equal(variantCandidates(at({}), { ranks: [{ view: 0, rank: 1 }] })[0], bits(1));
  assert.equal(variantCandidates(at({}), { ranks: [{ view: 27, rank: 36 }] })[72], bits(9));
  // Row 1 from the left ranked 1st and column 1 from the top 2nd share their
  // first cell, so the row's second digit is below the column's.
  const both = variantCandidates(at({ 1: 7 }), { ranks: [{ view: 0, rank: 1 }, { view: 9, rank: 2 }] });
  assert.equal(both[9] & bits(2, 3, 4, 5, 6), 0);
  // The wrong first digit clashes, as does column 1 below row 1 when row 1
  // is ranked lowest.
  assert.deepEqual([...clashes(at({ 0: 3 }), { ranks: [{ view: 0, rank: 5 }] })], [0]);
  assert.deepEqual(sorted(clashes(at({ 0: 1, 1: 5, 9: 2 }), { ranks: [{ view: 0, rank: 1 }] })), [0, 1, 9]);
  assert.equal(clashes(at({ 0: 1, 1: 2, 9: 5 }), { ranks: [{ view: 0, rank: 1 }] }).size, 0);
  assert.equal(seedVariantName("QNRQFRQRX-H-BBBB"), "Numbered Room, Full Rank, Row/Column Indexing");
});

// Full Rank's ties. Within 3x3 boxes no two views can tie, so these use
// the columns as a Jigsaw's regions, and a grid where each row reads as
// the column of its number: row 1 from the left is column 1 from the top.
test("No Rank Ties and Clued Rank Ties decide which views may tie", () => {
  const regions = [...Array(81).keys()].map((c) => c % 9);
  assert.equal(regionProblem(regions), null);
  const grid = [...Array(81).keys()].map((c) => ((Math.floor(c / 9) + (c % 9)) % 9) + 1);
  const read = (cells) => cells.map((c) => grid[c]).join("");
  assert.equal(read(VIEWS[0]), read(VIEWS[9]));
  // Only rows and columns crossing on a long diagonal could tie, and with
  // 3x3 boxes, each pair has two cells of a box in one place.
  assert.equal(TIE_PAIRS.length, 36);
  for (const [a, b] of TIE_PAIRS) assert.ok(a.some((c, j) => c !== b[j] && BOX[c] === BOX[b[j]]));

  const none = rule("norankties");
  const tied = rule("cluedrankties");
  assert.equal(clashes(grid, { regions }).size, 0);
  assert.ok(clashes(grid, { regions, rules: none }).size, "ties clash under No Rank Ties");
  // Row 1's last cell: the 9 it has room for ties it with column 1.
  const open = grid.slice();
  open[8] = 0;
  assert.equal(variantSolutions(open, { regions }, 2)?.length, 1);
  assert.deepEqual(variantSolutions(open, { regions, rules: none }, 2), []);

  // Row 1 from the left ranked 1st ties column 1 from the top: by default a
  // clued view never ties, under Clued Rank Ties it may.
  const first = { regions, ranks: [{ view: 0, rank: 1 }] };
  assert.ok(clashes(grid, first).size);
  assert.equal(clashes(grid, { ...first, rules: tied }).size, 0);
  assert.deepEqual(variantSolutions(open, first, 2), []);
  assert.equal(variantSolutions(open, { ...first, rules: tied }, 2)?.length, 1);
  // Tied, the rank still counts those smaller: 2nd needs one below.
  assert.ok(clashes(grid, { regions, ranks: [{ view: 0, rank: 2 }], rules: tied }).size);
  // No Rank Ties with a clue on top is still no ties.
  assert.ok(clashes(grid, { ...first, rules: none | tied }).size);

  assert.equal(seedVariantName("QFRQNT-H-BBBB"), "Full Rank, No Rank Ties");
  assert.equal(seedVariantName("QFRQCT-H-BBBB"), "Full Rank, Clued Rank Ties");
  const seed = madeSeed("H", grid, { regions, ranks: [{ view: 0, rank: 1 }], rules: tied });
  assert.match(seed.text, /^QFRJQCT-H-/);
  assert.equal(parseSeed(seed.text)?.rules, tied);
});

test("Row/Column Indexing marks are checked, solved and carried in seeds", () => {
  assert.equal(indexingProblem([{ line: 0 }, { line: 17 }]), null);
  assert.equal(indexingProblem([{ line: 18 }]).why, "line");
  assert.equal(indexingProblem([{ line: 3 }, { line: 3 }]).why, "twice");
  // Column 1's first cell points along row 1 at its 1; row 1's, down column 1.
  assert.deepEqual(INDEXERS[9][0], { cell: 0, targets: [0, 1, 2, 3, 4, 5, 6, 7, 8], digit: 1 });
  assert.deepEqual(INDEXERS[0][0], { cell: 0, targets: [0, 9, 18, 27, 36, 45, 54, 63, 72], digit: 1 });
  assert.equal(INDEXERS[13][2].cell, 22);

  // Columns 1, 5 and 9, as a 1-5-9 puzzle has them, and rows 2 and 7.
  const empty = new Array(81).fill(0);
  for (const lines of [[9, 13, 17], [1, 6]]) {
    const indexings = lines.map((line) => ({ line }));
    const variant = { indexings };
    const solution = variantSolve(empty, variant);
    for (const line of lines) for (const { cell, targets, digit } of INDEXERS[line]) assert.equal(solution[targets[solution[cell] - 1]], digit);
    assert.equal(clashes(solution, variant).size, 0);
    const puzzle = thinOut(solution, variant, seeded(193));
    assert.equal(checkClues(puzzle, variant).ok, true);
    assert.notEqual(countSolutions(puzzle, 2), 1, "needs the marks");
    const cand = variantCandidates(puzzle, variant);
    for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
    stepsAgree(puzzle, solution, variant);
    const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
    assert.match(seed.text, /^QRX-[EMHX]-/);
    const back = parseSeed(seed.text.toLowerCase());
    assert.equal(back.text, seed.text);
    assert.deepEqual(back.indexings, indexings);
    assert.deepEqual(puzzleFor(back).solution, solution);
  }

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  const first = { indexings: [{ line: 9 }] };
  // A 5 in column 1 puts row 1's 1 in column 5; a 1 in column 4 puts a 4 in
  // column 1. Down a marked row, the same.
  assert.equal(variantCandidates(at({ 0: 5 }), first)[4], bits(1));
  assert.equal(variantCandidates(at({ 3: 1 }), first)[0], bits(4));
  assert.equal(variantCandidates(at({ 27: 1 }), { indexings: [{ line: 0 }] })[0], bits(4));
  // Something else where it points clashes, as does the 1 somewhere else.
  assert.deepEqual(sorted(clashes(at({ 0: 5, 4: 7 }), first)), [0, 4]);
  assert.deepEqual(sorted(clashes(at({ 0: 5, 2: 1 }), first)), [0, 2]);
  assert.equal(clashes(at({ 0: 5, 4: 1 }), first).size, 0);
});

test("single Row/Column Indexing cells are checked, solved and carried in seeds", () => {
  assert.equal(indexCellProblem([{ cell: 0, line: 0 }, { cell: 0, line: 9 }, { cell: 80, line: 17 }]), null);
  assert.equal(indexCellProblem([{ cell: 81, line: 0 }]).why, "cell");
  assert.equal(indexCellProblem([{ cell: 0, line: 1 }]).why, "line", "its own row or column");
  assert.equal(indexCellProblem([{ cell: 3, line: 12 }, { cell: 3, line: 12 }]).why, "twice");
  // A cell does as it would in its marked row or column.
  assert.deepEqual(indexers([], [{ cell: 22, line: 13 }]), [INDEXERS[13][2]]);
  assert.equal(indexers([{ line: 9 }], [{ cell: 0, line: 0 }]).length, 10);

  // Cells of a solved grid that keep the rule one way or the other.
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const keeps = (line, cell) => {
    const { targets, digit } = INDEXERS[line].find((x) => x.cell === cell);
    return solution[targets[solution[cell] - 1]] === digit;
  };
  const indexcells = [...Array(81).keys()]
    .flatMap((cell) => [9 + (cell % 9), Math.floor(cell / 9)].filter((line) => keeps(line, cell)).map((line) => ({ cell, line })))
    .filter((_, i) => i % 2 === 0);
  assert.ok(indexcells.length >= 4, `${indexcells.length} cells`);
  const variant = { indexcells };
  assert.equal(clashes(solution, variant).size, 0);
  const rand = seeded(209);
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the cells");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QCX-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.indexcells, indexcells);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // With marked lines too, QRX then QCX.
  const both = { indexings: [{ line: 9 }], indexcells: [{ cell: 40, line: 4 }] };
  assert.match(madeSeed("H", puzzle, both).text, /^QRXQCX-/);

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  // Row 1, column 1 going by its column: a 5 there puts row 1's 1 in column
  // 5; row 2, column 1 is no indexing cell, so its 5 says nothing.
  const one = { indexcells: [{ cell: 0, line: 9 }] };
  assert.equal(variantCandidates(at({ 0: 5 }), one)[4], bits(1));
  assert.notEqual(variantCandidates(at({ 9: 5 }), one)[13], bits(1));
  assert.deepEqual(sorted(clashes(at({ 0: 5, 4: 7 }), one)), [0, 4]);
  assert.equal(clashes(at({ 9: 5, 13: 7 }), one).size, 0);
});

test("Counting Circles are checked, solved and carried in seeds", () => {
  assert.equal(circleProblem([0, 80]), null);
  assert.equal(circleProblem([]).why, "count");
  assert.equal(circleProblem([...Array(CIRCLES_MOST + 1).keys()]).why, "count");
  assert.equal(circleProblem([81]).why, "cell");
  assert.equal(circleProblem([3, 3]).why, "twice");

  // Circles on a solved grid: each of some digits in as many circles as it
  // says.
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(197);
  const holding = (d) => [...Array(81).keys()].filter((c) => solution[c] === d).sort(() => rand() - 0.5);
  const circles = [1, 3, 4, 6].flatMap((d) => holding(d).slice(0, d)).sort((a, b) => a - b);
  const variant = { circles };
  assert.equal(clashes(solution, variant).size, 0);
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the circles");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QCC-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.circles, circles);
  assert.deepEqual(puzzleFor(back).solution, solution);
  // Every digit in circles, 45 of them, goes in the seed cell by cell.
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((d) => [...Array(81).keys()].filter((c) => solution[c] === d).slice(0, d)).sort((a, b) => a - b);
  assert.equal(all.length, CIRCLES_MOST);
  assert.deepEqual(parseSeed(madeSeed("H", solution, { circles: all }).text).circles, all);

  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  // Three circles hold three 3s, or a 1 and two 2s.
  const three = { circles: [0, 13, 26] };
  assert.equal(variantCandidates(at({}), three)[13], bits(1, 2, 3));
  assert.equal(variantCandidates(at({ 0: 3 }), three)[13], bits(3));
  assert.equal(variantCandidates(at({ 0: 1 }), three)[26], bits(2));
  assert.equal(variantCandidates(at({}), { circles: [0, 13] })[0], bits(2));
  // A digit in more circles than itself clashes, as does one short with too
  // few circles left.
  assert.deepEqual(sorted(clashes(at({ 0: 1, 13: 1 }), three)), [0, 13]);
  assert.deepEqual(sorted(clashes(at({ 0: 4 }), { circles: [0, 13] })), [0]);
  assert.equal(clashes(at({ 0: 3 }), three).size, 0);
  assert.equal(seedVariantName("QQDQCC-H-BBBB"), "Quad, Counting Circles");
});

test("sets of Counting Circles are counted apart, solved and carried in seeds", () => {
  assert.equal(circleSetProblem([[0], [1, 2]]), null);
  assert.equal(circleSetProblem([]).why, "sets");
  assert.equal(circleSetProblem(Array.from({ length: CIRCLE_SETS_MOST + 1 }, (_, i) => [i])).why, "sets");
  assert.equal(circleSetProblem([[0], []]).why, "count");
  assert.equal(circleSetProblem([[0, 1], [1]]).why, "twice");
  assert.equal(checkClues(new Array(81).fill(0), { circles: [0], circlesets: [[0]] }).why, "circles", "a cell in two sets");

  // Two sets that each count right, and together would not: a 1 in each.
  const { solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const rand = seeded(203);
  const holding = (d) => [...Array(81).keys()].filter((c) => solution[c] === d).sort(() => rand() - 0.5);
  const [ones, threes, fours] = [holding(1), holding(3), holding(4)];
  const circles = [ones[0], ...threes.slice(0, 3)].sort((a, b) => a - b);
  const circlesets = [[ones[1], ...fours.slice(0, 4)].sort((a, b) => a - b)];
  const variant = { circles, circlesets };
  assert.equal(clashes(solution, variant).size, 0);
  assert.ok(clashes(solution, { circles: [...circles, ...circlesets[0]] }).size, "counted together, the 1s clash");
  const puzzle = thinOut(solution, variant, rand);
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(countSolutions(puzzle, 2), 1, "needs the circles");
  const cand = variantCandidates(puzzle, variant);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QCCQCS-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual([back.circles, back.circlesets], [circles, circlesets]);
  assert.deepEqual(puzzleFor(back).solution, solution);
  assert.equal(parseSeed(seed.text.replace("QCCQCS-", "QCS-")), null, "more sets only with the first");

  // A set of two holds two 2s, and a set of one a 1, counted apart; together
  // the three hold three 3s or a 1 and two 2s.
  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const bits = (...ds) => ds.reduce((m, d) => m | (1 << d), 0);
  assert.equal(variantCandidates(at({}), { circles: [0, 13], circlesets: [[26]] })[26], bits(1));
  assert.equal(variantCandidates(at({}), { circles: [0, 13, 26] })[26], bits(1, 2, 3));
  assert.deepEqual(sorted(clashes(at({ 26: 2 }), { circles: [0, 13], circlesets: [[26]] })), [26]);
});

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

// Chaos Construction: regions found while solving. One puzzle with Chaos
// Arrows alone and no givens, "Chaos construction" from the Interactive
// Sudoku Solver's examples; and one on a Jigsaw's grid, its regions to be
// found from arrows, counts and givens.
const CHAOS_ARROWS = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  [39, 5], [9, 2], [10, 10], [13, 10], [18, 2], [36, 2], [67, 10], [70, 10], [72, 2], [77, 10],
  [14, 15], [20, 15], [48, 15], [51, 15], [68, 15],
]
  .map(([cell, ways]) => ({ cell, ways }))
  .sort((a, b) => a.cell - b.cell);
const CHAOS_ANSWER = "624135789139726854245879361961384572357418296872641935713592648486957123598263417";
const CHAOS_JIGSAW = {
  regions: "000000021453303021453333221453322221455566121445666111445566667488887777888887777",
  solution: "364891527189374265542168739625719843213987456937456182876523914498235671751642398",
  puzzle: "004001000180300065002160709620700800003007000900000182800000910000030001001642308",
  chaosarrows: [[1, 2], [28, 14], [31, 9], [35, 4], [37, 12], [38, 11], [46, 13], [49, 15], [51, 12], [54, 7], [59, 6], [61, 7], [66, 5], [78, 9]].map(([cell, ways]) => ({ cell, ways })),
  chaoscounts: [35, 48, 70, 73, 75, 76],
};
const digitsOf = (text) => [...text].map(Number);

// Whether a grid and its regions keep every rule of Chaos Construction:
// nine regions of nine joined cells, each holding 1 to 9, in sortRegions'
// order, and each arrow and count saying its digit.
function keepsChaos(grid, regions, { chaosarrows = [], chaoscounts = [] }) {
  if (regionProblem(regions) || sortRegions(regions).join() !== regions.join()) return false;
  for (let r = 0; r < 9; r++) if (new Set(grid.filter((_, c) => regions[c] === r)).size !== 9) return false;
  for (const { cell, ways } of chaosarrows) {
    let run = 1;
    for (const arm of chaosArms(cell, ways)) for (let i = 0; i < arm.length && regions[arm[i]] === regions[cell]; i++) run++;
    if (run !== grid[cell]) return false;
  }
  return chaoscounts.every((cell) => 1 + chaosAround(cell).filter((o) => regions[o] === regions[cell]).length === grid[cell]);
}

test("Chaos Construction cuts its regions while solving, checked and carried in seeds", () => {
  const CHAOS = rule("chaos");
  // No boxes: rows and columns alone, whatever regions come with it.
  const { houses } = layout(CHAOS);
  assert.deepEqual([...new Set(houses.map((h) => h.kind))], ["row", "column"]);
  assert.equal(layout(CHAOS, sortRegions(digitsOf(CHAOS_JIGSAW.regions))).houses.length, 18);
  assert.deepEqual(notePeers(CHAOS, digitsOf(CHAOS_JIGSAW.regions)), layout(CHAOS).peers);
  assert.equal(notePeers(0), undefined);
  assert.deepEqual(notePeers(0, digitsOf(CHAOS_JIGSAW.regions)), layout(0, digitsOf(CHAOS_JIGSAW.regions)).peers);

  assert.equal(chaosArrowProblem(CHAOS_ARROWS), null);
  assert.equal(chaosArrowProblem([{ cell: 0, ways: 1 }]).why, "ways", "nothing above the top row");
  assert.equal(chaosArrowProblem([{ cell: 40, ways: 0 }]).why, "ways");
  assert.equal(chaosArrowProblem([{ cell: 40, ways: 3 }, { cell: 40, ways: 4 }]).why, "twice");
  assert.equal(chaosArrowProblem([{ cell: 81, ways: 1 }]).why, "cell");
  assert.equal(chaosCountProblem([]).why, "cell");
  assert.equal(chaosCountProblem([3, 3]).why, "twice");
  assert.equal(chaosCountProblem([0, 80]), null);

  // Rows and columns always cut a full grid into regions, so with nothing
  // to say which way, its regions have more than one answer.
  const full = digitsOf(CHAOS_ANSWER);
  const loose = checkClues(full, { rules: CHAOS });
  assert.equal(loose.why, "cuts");
  assert.ok(loose.c >= 0 && loose.c < 81);

  // Arrows alone, and no givens.
  const arrowed = { rules: CHAOS, chaosarrows: CHAOS_ARROWS };
  const check = checkClues(new Array(81).fill(0), arrowed);
  assert.equal(check.ok, true, check.why);
  // The digits; the regions come with them, as solution.regions.
  assert.deepEqual([...check.solution], full);
  assert.ok(keepsChaos(check.solution, check.solution.regions, arrowed), "the regions found keep every rule");
  assert.equal(clashes(full, arrowed).size, 0);
  const seed = madeSeed(rateLevel(new Array(81).fill(0), arrowed), new Array(81).fill(0), arrowed);
  assert.match(seed.text, /^QCAQCH-[EMHX]-/);
  assert.equal(seedVariantName(seed.text), "Chaos Arrow, Chaos Construction");
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.deepEqual(back.chaosarrows, CHAOS_ARROWS);
  assert.deepEqual([...puzzleFor(back).solution], full);
  assert.deepEqual(puzzleFor(back).solution.regions, check.solution.regions);

  // A Jigsaw's grid, its regions found from arrows, counts and givens.
  const regions = sortRegions(digitsOf(CHAOS_JIGSAW.regions));
  const solution = digitsOf(CHAOS_JIGSAW.solution);
  const puzzle = digitsOf(CHAOS_JIGSAW.puzzle);
  const counted = { rules: CHAOS, chaosarrows: CHAOS_JIGSAW.chaosarrows, chaoscounts: CHAOS_JIGSAW.chaoscounts };
  assert.ok(keepsChaos(solution, regions, counted), "the clues are the Jigsaw's");
  const found = checkClues(puzzle, counted);
  assert.equal(found.ok, true, found.why);
  assert.deepEqual([...found.solution], solution);
  assert.deepEqual(found.solution.regions, regions);
  const cand = candidates(puzzle, counted);
  for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `candidates at ${c}`);
  stepsAgree(puzzle, solution, counted);
  const counts = madeSeed("H", puzzle, counted);
  assert.match(counts.text, /^QCAQCOQCH-H-/);
  const read = parseSeed(counts.text);
  assert.deepEqual(read.chaoscounts, CHAOS_JIGSAW.chaoscounts);
  assert.deepEqual(puzzleFor(read).solution.regions, regions);
  assert.equal(variantName(counted), "Chaos Arrow, Chaos Count, Chaos Construction");

  // A count's digit is never 1, nor more than it has cells to count; an
  // arrow's never more than its arms and itself.
  const one = new Array(81).fill(0);
  one[35] = 1;
  assert.deepEqual([...clashes(one, counted)], [35]);
  const far = new Array(81).fill(0);
  far[1] = 9;
  assert.deepEqual([...clashes(far, counted)], [1], "an arrow from row 1, column 2 pointing right counts 8 at most");
  // Arrows and counts need Chaos Construction, and it never comes with
  // drawn regions.
  assert.equal(checkClues(new Array(81).fill(0), { chaosarrows: CHAOS_ARROWS }).why, "chaosrule");
  assert.equal(parseSeed(madeSeed("H", full, { chaosarrows: CHAOS_ARROWS }).text), null);
  assert.equal(parseSeed(madeSeed("H", solution, { regions, rules: CHAOS }).text), null);
});

// Yin-Yang: a shading over a classic puzzle, and the circles that leave it
// one way to go.
const YY_SHADING = [..."111111111121221212121121212122121212112121212122222212111121112122121212112222222"].map(Number);
const YY_CIRCLES = "8:1 11:1 14:1 16:1 23:1 25:1 30:1 32:1 37:1 42:2 48:2 50:2 58:2 67:2 69:2 73:1 74:2"
  .split(" ")
  .map((pair) => pair.split(":").map(Number))
  .map(([cell, shade]) => ({ cell, shade }));

test("Yin-Yang shadings are found, checked, played and carried in seeds", () => {
  assert.equal(shadeProblem(YY_CIRCLES), null);
  assert.equal(shadeProblem([]).why, "cell");
  assert.equal(shadeProblem([{ cell: 3, shade: 3 }]).why, "shade");
  assert.equal(shadeProblem([{ cell: 3, shade: SHADED }, { cell: 3, shade: UNSHADED }]).why, "twice");
  assert.ok(shadingKeeps(YY_SHADING, YY_CIRCLES));
  // Each rule broken once: a 2x2 all one shade, two shades crossing at a
  // square's corners, and a shade cut in two.
  const block = YY_SHADING.slice();
  block[0] = block[1] = block[9] = block[10] = SHADED;
  assert.equal(shadingKeeps(block), false);
  const crossing = YY_SHADING.slice();
  [crossing[10], crossing[11], crossing[19], crossing[20]] = [SHADED, UNSHADED, UNSHADED, SHADED];
  assert.equal(shadingKeeps(crossing), false);
  assert.equal(shadingKeeps(YY_SHADING.map((s, c) => (c === 80 ? SHADED : s))), false, "a shaded cell cut off");
  assert.equal(shadingKeeps(YY_SHADING, [{ cell: 0, shade: UNSHADED }]), false, "a circle the shading does not keep");

  // The circles leave one shading; one fewer leaves more.
  assert.deepEqual(shadings(YY_CIRCLES, 2), [YY_SHADING]);
  assert.equal(shadings(YY_CIRCLES.slice(1), 2).length, 2);
  assert.equal(shadings([], 2).length, 2, "with no circles, shades swap at least");

  // On a classic puzzle: its digits, and the shading with them.
  const { puzzle, solution } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const variant = { shades: YY_CIRCLES };
  const check = checkClues(puzzle, variant);
  assert.equal(check.ok, true, check.why);
  assert.deepEqual([...check.solution], solution);
  assert.deepEqual(check.solution.shading, YY_SHADING);
  const loose = checkClues(puzzle, { shades: YY_CIRCLES.slice(1) });
  assert.equal(loose.why, "shading");
  assert.ok(loose.c >= 0);
  assert.equal(variantName(variant), "Yin-Yang");
  stepsAgree(puzzle, solution, variant);

  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^QYY-[EMHX]-/);
  const back = parseSeed(seed.text);
  assert.deepEqual(back.shades, YY_CIRCLES);
  const made = puzzleFor(back);
  assert.deepEqual(made.solution.shading, YY_SHADING);
  assert.deepEqual(made.puzzle.shades, YY_SHADING.map((_, c) => YY_CIRCLES.find((x) => x.cell === c)?.shade ?? 0));
  // Every cell's shade as a list, when that is shorter.
  const many = YY_SHADING.map((shade, cell) => ({ cell, shade }));
  assert.deepEqual(parseSeed(madeSeed("H", puzzle, { shades: many }).text).shades, many);

  // Played: digits alone do not finish it; the shaded cells must be right,
  // unshaded marks or none. A circle given stays as it is.
  let t = 0;
  const fill = [];
  for (let c = 0; c < 81; c++) if (!made.puzzle[c]) fill.push({ k: "p", c, d: made.solution[c], t: (t += 900), b: 0 });
  let result = play(made.puzzle, made.solution, fill);
  assert.equal(result.error, null);
  assert.equal(result.complete, false, "the shading is still to do");
  const shade = [];
  for (let c = 0; c < 81; c++) if (YY_SHADING[c] === SHADED && !made.puzzle.shades[c]) shade.push({ k: "y", c, d: SHADED, t: (t += 300), b: 0 });
  // One cell marked unshaded, which changes nothing.
  const open = YY_SHADING.findIndex((s, c) => s === UNSHADED && !made.puzzle.shades[c]);
  const log = [...fill, { k: "y", c: open, d: UNSHADED, t: 0, b: 0 }, ...shade];
  log.forEach((a, i) => (a.t = (i + 1) * 700));
  result = play(made.puzzle, made.solution, log);
  assert.equal(result.error, null);
  assert.equal(result.complete, true);
  assert.equal(result.shading[open], UNSHADED);
  assert.equal(play(made.puzzle, made.solution, [{ k: "y", c: YY_CIRCLES[0].cell, d: UNSHADED, t: 1, b: 0 }]).error.reason, "given");
  assert.equal(play(made.puzzle, made.solution, [{ k: "y", c: open, d: 0, t: 1, b: 0 }]).error.reason, "bad_shade", "no change");
  assert.equal(play(puzzle, solution, [{ k: "y", c: 0, d: SHADED, t: 1, b: 0 }]).error.reason, "bad_kind", "no shading to do");
  // Undo takes a shade back; a hint shades a cell, its digit given or not.
  const one = shade[0];
  assert.equal(play(made.puzzle, made.solution, [one, { k: "u", c: 0, d: 0, t: 2, b: 0 }]).shading[one.c], 0);
  const givenDigit = YY_SHADING.findIndex((s, c) => s === SHADED && made.puzzle[c] && !made.puzzle.shades[c]);
  const hinted = play(made.puzzle, made.solution, [{ k: "h", c: givenDigit, d: 0, t: 1, b: 0 }]);
  assert.equal(hinted.error, null);
  assert.equal(hinted.shading[givenDigit], SHADED);
  assert.equal(play(made.puzzle, made.solution, [{ k: "h", c: givenDigit, d: 0, t: 1, b: 0 }, { k: "h", c: givenDigit, d: 0, t: 2, b: 0 }]).error.reason, "given");
  // Solve shades the answer's shaded cells, and marks no more: the
  // unshaded circles stay as given.
  const solved = play(made.puzzle, made.solution, [shade[0], { k: "s", c: 0, d: 0, t: 2, b: 0 }]);
  assert.deepEqual(solved.shading, YY_SHADING.map((s, c) => (s === SHADED ? SHADED : made.puzzle.shades[c])));
  assert.equal(solved.solved, true);
  // Wire logs, both replay links and frames carry the shading.
  assert.deepEqual(fromWire(toWire(log)), log);
  const packed = packReplay(log, made.solution);
  assert.deepEqual(unpackReplay(packed, made.puzzle, made.solution).map(({ k, c, d }) => [k, c, d]), log.map(({ k, c, d }) => [k, c, d]));
  assert.deepEqual(unpackLog(packLog(log), made.puzzle, made.solution).map(({ k, c, d }) => [k, c, d]), log.map(({ k, c, d }) => [k, c, d]));
  const frames = play(made.puzzle, made.solution, log, { frames: true }).frames;
  assert.deepEqual(frames.at(-1).shading, result.shading);
  assert.deepEqual(frames[0].shading, made.puzzle.shades);
});

// Doppelgänger: digits 0 to 9, the 0 written 10 in a grid, as ZERO.
const DP_ANSWER = [..."123456780456370129790128345261983504589012637307645918648239071932704856075861492"].map((d) => Number(d) || ZERO);
const DP_PUZZLE = [0, 0, 0, 0, 0, 0, 7, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 7, 0, 0, 7, 6, 4, 5, 9, 1, 8, 0, 4, 0, 2, 0, 9, 10, 0, 1, 9, 3, 0, 7, 0, 0, 0, 5, 0, 0, 0, 5, 0, 6, 0, 4, 0, 2];

// Whether a full grid keeps Doppelgänger's rules, worked out apart from the
// engine: each row, column and box nine different digits with a 0 among
// them, no two of a kind missing the same digit, and at each 0 its three
// missing digits all different.
function keepsDoppel(grid, rules = 0) {
  const { houses } = layout(rules);
  const missing = houses.slice(0, 27).map(({ cells }) => [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !cells.some((c) => grid[c] === d)));
  for (const { cells } of houses.slice(0, 27)) if (new Set(cells.map((c) => grid[c])).size !== 9 || !cells.some((c) => grid[c] === ZERO)) return false;
  for (const from of [0, 9, 18]) if (new Set(missing.slice(from, from + 9)).size !== 9) return false;
  for (let c = 0; c < 81; c++) {
    if (grid[c] !== ZERO) continue;
    const mine = [0, 9, 18].map((from) => missing[houses.slice(from, from + 9).findIndex((h) => h.cells.includes(c)) + from]);
    if (new Set(mine).size !== 3) return false;
  }
  return houses.slice(27).every(({ cells }) => new Set(cells.map((c) => grid[c])).size === cells.length);
}

test("Doppelgänger's 0 is solved, checked, played and carried in seeds", () => {
  const DP = rule("doppelganger");
  const variant = { rules: DP };
  assert.ok(keepsDoppel(DP_ANSWER));
  assert.ok(keepsDoppel(variantSolve(new Array(81).fill(0), variant)), "a grid from nothing");
  const check = checkClues(DP_PUZZLE, variant);
  assert.equal(check.ok, true, check.why);
  assert.deepEqual(check.solution, DP_ANSWER);
  const cand = candidates(DP_PUZZLE, variant);
  for (let c = 0; c < 81; c++) if (!DP_PUZZLE[c]) assert.ok(cand[c] & (1 << DP_ANSWER[c]), `candidates at ${c}`);
  stepsAgree(DP_PUZZLE, DP_ANSWER, variant);
  assert.equal(puzzleText(DP_ANSWER).slice(0, 9), "123456780");
  assert.equal(variantName(variant), "Doppelgänger");

  // Two 0s in a row clash; so do two full rows missing the same digit, and
  // a 0 whose row and column miss the same.
  assert.deepEqual(sorted(clashes(placed({ 0: ZERO, 5: ZERO }), variant)), [0, 5]);
  const twice = DP_ANSWER.slice();
  // Rows 1 and 2 miss 9 and 8: row 2's 9 made an 8 has it miss 9 too.
  twice[17] = 8;
  assert.ok(clashes(twice, variant).has(0), "row 1 and row 2 both miss 9");
  assert.equal(clashes(DP_ANSWER, variant).size, 0);

  // Seeds: QDP, the givens in base 10.
  const seed = madeSeed(rateLevel(DP_PUZZLE, variant), DP_PUZZLE, variant);
  assert.match(seed.text, /^QDP-[EMHX]-/);
  const back = parseSeed(seed.text);
  assert.deepEqual(back.grid, DP_PUZZLE);
  assert.deepEqual([...puzzleFor(back).solution], DP_ANSWER);
  // Rules a 0 means nothing to are refused, and so are their seeds.
  for (const [extra, name] of [
    [{ rules: DP | rule("chaos") }, "Chaos Construction"],
    [{ rules: DP | rule("antitaxicab") }, "Anti-taxicab"],
    [{ rules: DP, entropics: [[0, 1, 2]] }, "Entropic"],
    [{ rules: DP, ranks: [{ view: 0, rank: 1 }] }, "Full Rank"],
    [{ rules: DP, indexings: [{ line: 0 }] }, "Row/Column Indexing"],
  ]) {
    const refused = checkClues(DP_PUZZLE, extra);
    assert.equal(refused.why, "zero");
    assert.equal(refused.rule, name);
    assert.equal(parseSeed(madeSeed("H", DP_PUZZLE, extra).text), null, name);
  }

  // Played: a 0 is digit 10, in a log, a wire log and both replay links;
  // a classic game has no digit 10.
  const { puzzle, solution } = puzzleFor(back);
  const log = [];
  for (let c = 0; c < 81; c++) if (!puzzle[c]) log.push({ k: "p", c, d: solution[c], t: (log.length + 1) * 900, b: 0 });
  log.splice(2, 0, { k: "n", c: log[3].c, d: ZERO, t: log[1].t + 1, b: 0 });
  const result = play(puzzle, solution, log);
  assert.equal(result.error, null);
  assert.equal(result.complete, true);
  assert.deepEqual(fromWire(toWire(log)), log);
  const digits = (l) => l.map(({ k, c, d }) => [k, c, d]);
  assert.deepEqual(digits(unpackReplay(packReplay(log, solution), puzzle, solution)), digits(log));
  assert.deepEqual(digits(unpackLog(packLog(log), puzzle, solution)), digits(log));
  const classic = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const first = classic.puzzle.indexOf(0);
  assert.equal(play(classic.puzzle, classic.solution, [{ k: "p", c: first, d: ZERO, t: 1, b: 0 }]).error.reason, "bad_digit");
});

// Every rule that can take a 0, laid through a Doppelgänger grid read as
// values, 0 being 0: the puzzle they make has that grid for its answer.
test("Doppelgänger's 0 goes with every rule that can take it", () => {
  const DP = rule("doppelganger");
  for (const extra of [0, rule("diagonal"), rule("antiking"), rule("anticonsecutive")]) {
    const rules = DP | extra;
    // A first row to start from, or under Anti-consecutive none, which
    // finds a grid sooner.
    const top = extra === rule("anticonsecutive") ? [] : [1, 2, 3, 4, 5, 6, 7, 8, ZERO];
    const solution = extra ? variantSolve([...top, ...new Array(81 - top.length).fill(0)], { rules }) : DP_ANSWER;
    assert.ok(solution && keepsDoppel(solution, rules), `a grid under ${rules}`);
    const values = solution.map((d) => d % 10);
    const rand = seeded(19);
    const has0 = (cells) => cells.some((c) => values[c] === 0);
    const cages = layCages(values, rand, 5);
    const used = new Set();
    const lines = { count: 2, max: 5, used };
    const thermos = layLines(values, rand, (line, o, sol) => sol[o] > sol[line.at(-1)], lines);
    const arrows = layLines(values, rand, (line, o, sol) => line.slice(1).reduce((t, c) => t + sol[c], sol[o]) <= sol[line[0]], lines).filter(
      ([circle, ...cells]) => cells.reduce((t, c) => t + values[c], 0) === values[circle]
    );
    const whispers = layLines(values, rand, fitsWhisper, lines);
    const renbans = layLines(values, rand, fitsRenban, lines);
    const palindromes = layLines(values, seeded(23), fitsPalindrome(3), { ...lines, max: 3 });
    const zippers = layLines(values, seeded(29), fitsZipper(3), { ...lines, max: 3 });
    const betweens = layLines(values, seeded(31), fitsBetween(3), { ...lines, max: 3 });
    const lockouts = layLines(values, seeded(37), fitsLockout(3), { ...lines, max: 3 });
    const crossing = { count: 2, max: 3, used: new Set() };
    // Modular lines go by each digit's bit, 0's with 3, 6 and 9.
    const modulars = layLines(solution, seeded(47), fitsKinds(MODULAR_KINDS)(), crossing);
    const doubles = layLines(values, seeded(79), fitsDouble(3), { ...crossing, min: 3 });
    const pills = layPills(values, seeded(83), { count: 2, used: crossing.used });
    const sumlines = laySumLines(values, seeded(173), 10, { count: 2, min: 2, max: 5, used: crossing.used });
    const regionsums = layRegionSums(values, seeded(179), { count: 2, max: 6, used: crossing.used });
    const indexes = layIndexes(values, seeded(181), { count: 2, used: crossing.used }).filter((t) => values[t[1]]);
    const sides = new Set();
    const dots = layEdges(values, rand, ["white", "black"], 0.15, sides);
    const xvs = layEdges(values, rand, ["x", "v"], 0.3, sides);
    const signs = layEdges(values, seeded(53), ["gt", "lt"], 0.1, sides);
    const quads = layQuads(values, seeded(59), 4).filter(({ digits }) => !digits.includes(0));
    // Clues outside: a sandwich only where its line has a 1 and a 9, an
    // X-Sum or a Numbered Room never led by a 0.
    const sandwiches = laySandwiches(values, rand, 0.3).filter(({ line }) => [1, 9].every((d) => SANDWICH_LINES[line].some((c) => values[c] === d)));
    const taken = new Set(sandwiches.map((w) => viewSpot(w.line)));
    const skyscrapers = layViews(values, rand, skyscraperOf, 0.25, [...VIEWS.keys()].slice(18), taken);
    const xsums = layViews(values, rand, xsumOf, 0.4, [...VIEWS.keys()].slice(18), taken).filter(({ view }) => values[VIEWS[view][0]]);
    const littles = layLittles(values, rand, 0.1, taken);
    const hiddens = layViews(values, seeded(71), hiddenOf, 0.3, [...VIEWS.keys()], taken).filter((clue) => clue.height);
    const rooms = layViews(values, seeded(73), (sol, view) => (sol[VIEWS[view][0]] ? roomOf(sol, view) : { view, digit: 0 }), 0.3, [...VIEWS.keys()], taken).filter(({ digit }) => digit);
    const caged = { count: 2, used: new Set(cages.flatMap((k) => k.cells)) };
    const relliks = layGroups(values, seeded(151), rellikOf, caged);
    const lunchboxes = layGroups(values, seeded(157), lunchboxOf, { ...caged, sizes: [3, 4], straight: true });
    const looksays = layGroups(values, seeded(163), lookSayOf, caged).filter(({ clue }) => !/^(\d\d)*\d0/.test(clue));
    const equalities = layGroups(values, seeded(167), equalityOf, { ...caged, sizes: [2, 4] }).filter(({ cells }) => !has0(cells));
    const distincts = layGroups(values, seeded(229), distinctOf, { ...caged, sizes: [2, 3] });
    const connecteds = layGroups(values, seeded(227), connectedOf, { ...caged, sizes: [2, 3] }).filter(({ clue }) => !clue.includes("0"));
    const equalsums = layPieces(values, seeded(211), fitsEqualSum, caged);
    const samevalues = layPieces(values, seeded(223), fitsSameValues, { ...caged, same: true });
    const variant = { cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, rules };
    const name = `Doppelgänger with ${RULES.filter((r) => extra & r.bit).map((r) => r.name).join("") || "nothing else"}`;
    // Each kind laid somewhere, a 0 in some; with a rule more, as many as
    // its grid had room for.
    if (!extra) for (const [list, laid] of Object.entries(variant)) if (list !== "rules") assert.ok(laid.length, `${name}: some ${list}`);
    assert.ok([cages, thermos, arrows, sumlines, dots].some((laid) => laid.some((x) => has0(x.cells ?? x))), `${name}: a 0 in some`);
    assert.deepEqual([...clashes(solution, variant)], [], `${name}: the answer keeps every rule`);

    const puzzle = thinOut(solution, variant, rand);
    const check = checkClues(puzzle, variant);
    assert.equal(check.ok, true, `${name}: ${check.why}`);
    assert.deepEqual([...check.solution], solution);
    const cand = variantCandidates(puzzle, variant);
    for (let c = 0; c < 81; c++) if (!puzzle[c]) assert.ok(cand[c] & (1 << solution[c]), `${name}: candidates at ${c}`);
    stepsAgree(puzzle, solution, variant);
    const back = parseSeed(madeSeed("H", puzzle, variant).text);
    assert.ok(back, `${name}: the seed reads back`);
    assert.deepEqual(back.grid, puzzle);
  }
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


// Anti-consecutive, Strict Kropki and Strict XV: rules about the sides
// cells share, and the Q letters they are named by in a seed.
test("the rules about sides clash, narrow and read back from seeds", () => {
  const at = (digits) => new Array(81).fill(0).map((_, c) => digits[c] ?? 0);
  const sorted = (set) => [...set].sort((p, q) => p - q);
  const anti = { rules: rule("anticonsecutive") };
  // Side by side, and one above the other; at a corner is fine.
  assert.deepEqual(sorted(clashes(at({ 0: 4, 1: 5 }), anti)), [0, 1]);
  assert.deepEqual(sorted(clashes(at({ 0: 4, 9: 3 }), anti)), [0, 9]);
  assert.equal(clashes(at({ 0: 4, 10: 5 }), anti).size, 0);
  assert.equal(clashes(at({ 0: 4, 1: 5 })).size, 0, "not without the rule");
  const cand = variantCandidates(at({ 40: 5 }), anti);
  for (const c of [31, 39, 41, 49]) assert.equal(cand[c] & ((1 << 4) | (1 << 6)), 0, `no 4 or 6 beside the 5, at ${c}`);
  assert.ok(cand[30] & (1 << 4), "a corner away can be 4");

  // Strict Kropki: a white dot's side may be consecutive, and every other
  // side neither consecutive nor a double.
  const strict = { rules: rule("strictkropki"), dots: [{ cells: [0, 1], mark: "white" }] };
  assert.equal(clashes(at({ 0: 4, 1: 5 }), strict).size, 0);
  assert.deepEqual(sorted(clashes(at({ 0: 4, 9: 8 }), strict)), [0, 9], "a double with no dot");
  assert.deepEqual(sorted(clashes(at({ 1: 5, 2: 6 }), strict)), [1, 2], "consecutive with no dot");
  assert.equal(variantCandidates(at({ 1: 2 }), strict)[10] & ((1 << 1) | (1 << 3) | (1 << 4)), 0, "below a 2: no 1, 3 or 4");
  // Anti-consecutive on top bars even the dotted side, so the two cannot go
  // together there.
  assert.deepEqual(sorted(clashes(at({ 0: 4, 1: 5 }), { ...strict, rules: strict.rules | anti.rules })), [0, 1]);

  // Strict XV: sides with no mark never add up to 10 or 5.
  const xv = { rules: rule("strictxv"), xvs: [{ cells: [0, 1], mark: "x" }] };
  assert.equal(clashes(at({ 0: 3, 1: 7 }), xv).size, 0);
  assert.deepEqual(sorted(clashes(at({ 0: 3, 9: 7 }), xv)), [0, 9]);
  assert.deepEqual(sorted(clashes(at({ 1: 1, 2: 4 }), xv)), [1, 2]);

  // A Strict Kropki puzzle with every dot its grid has, as such a puzzle
  // gives them: its seed has P for the dots, then QSK.
  const { solution: grid } = puzzleFor(parseSeed("H-BXK4-M9TR"));
  const dots = layEdges(grid, () => 0, ["white", "black"], 1);
  const variant = { dots, rules: rule("strictkropki") };
  assert.equal(clashes(grid, variant).size, 0);
  const puzzle = thinOut(grid, variant, seeded(41));
  assert.equal(checkClues(puzzle, variant).ok, true);
  assert.notEqual(variantSolutions(puzzle, { dots }, 2)?.length, 1, "needs the rule, not just the dots");
  stepsAgree(puzzle, grid, variant);
  const seed = madeSeed(rateLevel(puzzle, variant), puzzle, variant);
  assert.match(seed.text, /^PQSK-[EMHX]-/);
  const back = parseSeed(seed.text.toLowerCase());
  assert.equal(back.text, seed.text);
  assert.equal(back.rules, variant.rules);
  assert.deepEqual(back.dots, dots);

  // Q letters: read as three, in RULES order whatever order they come in,
  // never as the single letters inside them; X inside QSX is no level.
  const every = RULES.reduce((m, r) => m | r.bit, 0);
  assert.equal(seedVariantName("KQDGQACQSKQSX-H-BBBB"), "Killer, Disjoint Groups, Anti-consecutive, Strict Kropki, Strict XV");
  assert.equal(seedVariantName("QSK-H-BBBB"), "Strict Kropki", "no Killer from the K in QSK");
  assert.equal(seedVariantName("pqsk-h-bbbb"), "Kropki, Strict Kropki");
  assert.equal(variantName({ rules: every }), RULES.map((r) => r.name).join(", "));
  const anyOrder = seed.text.replace("PQSK-", "QSKP-");
  assert.equal(parseSeed(anyOrder)?.text, seed.text);
  assert.equal(parseSeed(seed.text.replace("PQSK-", "PQSKQSK-")), null, "a letter twice is no seed");
  assert.equal(parseSeed(seed.text.replace("PQSK-", "PQS-")), null, "Q needs its two");
});

// Global Entropy and Global Mod: every 2x2 square sorted into the kinds
// entropic and modular lines use, one kind twice and the others once.
test("the rules about 2x2 squares clash, narrow and read back from seeds", () => {
  const entropy = { rules: rule("globalentropy") };
  const mod = { rules: rule("globalmod") };
  assert.equal(SQUARES.length, 64);
  assert.deepEqual(SQUARES[63], [70, 71, 79, 80]);
  assert.equal(layout(entropy.rules).houses.length, 27, "no houses of their own");
  assert.deepEqual(squareKinds(0), []);

  // Three low digits in a square clash, and so do two low and two middle;
  // two low and a middle leave the fourth cell high.
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 2, 9: 3 }), entropy)), [0, 1, 9]);
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 4, 9: 2, 10: 5 }), entropy)), [0, 1, 9, 10]);
  assert.equal(clashes(placed({ 0: 1, 1: 2, 9: 3 })).size, 0, "not without the rule");
  assert.equal(clashes(placed({ 0: 1, 1: 2, 9: 4 }), entropy).size, 0);
  assert.equal(variantCandidates(placed({ 0: 1, 1: 2, 9: 4 }), entropy)[10], ENTROPIC_KINDS[2]);
  // A 1 above a 2 is in two squares, one either side: neither has room for
  // another low digit, but a column further on does.
  const cand = variantCandidates(placed({ 1: 1, 10: 2 }), entropy);
  for (const c of [0, 2, 9, 11]) assert.equal(cand[c] & ENTROPIC_KINDS[0], 0, `no low digit at ${c}`);
  assert.ok(cand[3] & ENTROPIC_KINDS[0]);

  // Global Mod sorts by 1 4 7, 2 5 8 and 3 6 9 instead.
  assert.deepEqual(sorted(clashes(placed({ 0: 1, 1: 4, 9: 7 }), mod)), [0, 1, 9]);
  assert.equal(clashes(placed({ 0: 1, 1: 2, 9: 3 }), mod).size, 0);
  // Its kind's digits 1 to 9: Doppelgänger's 0 is of that kind too.
  assert.equal(variantCandidates(placed({ 0: 1, 1: 2, 9: 4 }), mod)[10], MODULAR_KINDS[2] & 0b1111111110);

  // Both at once have a grid: each digit is one of each rule's kinds.
  const both = entropy.rules | mod.rules;
  const grid = variantSolve(new Array(81).fill(0), { rules: both });
  assert.ok(grid && keepsRules(grid, both), "both have a grid");

  // Their letters: QGE, then QGM, after the other switch rules.
  assert.equal(seedVariantName("QGEQGM-H-BBBB"), "Global Entropy, Global Mod");
  assert.equal(seedVariantName("QENQSXQGE-H-BBBB"), "Entropic, Strict XV, Global Entropy");
  assert.equal(variantName({ entropics: [1], rules: entropy.rules }), "Entropic, Global Entropy");
});

// Anti-taxicab and Dutch Flatmates: rules about which digit sits where, so
// neither is a house or a pair of cells that always differ.
test("Anti-taxicab and Dutch Flatmates clash, narrow and read back from seeds", () => {
  const taxi = { rules: rule("antitaxicab") };
  const flat = { rules: rule("dutchflatmates") };
  assert.equal(layout(taxi.rules | flat.rules).houses.length, 27);
  assert.deepEqual(layout(taxi.rules | flat.rules).pairs[40], []);
  assert.deepEqual(TAXICAB[40][1], [31, 39, 41, 49]);
  assert.deepEqual(TAXICAB[0][2], [2, 10, 18]);
  assert.equal(TAXICAB[40][9].length, 0, "nothing is nine steps from the centre");
  assert.equal(TAXICAB[0][9].length, 8);

  // A 4 in the centre and a 4 at row 3, column 3 are four steps apart, and
  // in no row, column or box together; a 4 three steps away is fine.
  assert.deepEqual(sorted(clashes(placed({ 40: 4, 20: 4 }), taxi)), [20, 40]);
  assert.equal(clashes(placed({ 40: 4, 20: 4 })).size, 0, "not without the rule");
  assert.equal(clashes(placed({ 40: 4, 21: 4 }), taxi).size, 0);
  const cand = variantCandidates(placed({ 40: 4 }), taxi);
  for (const c of [20, 24, 56, 60, 4, 76]) assert.equal(cand[c] & (1 << 4), 0, `no 4 at ${c}`);
  assert.ok(cand[21] & (1 << 4));

  // A 5 with a 1 above or a 9 below is fine; with neither, it clashes with
  // what is there. A 5 on the top row needs its 9, on the bottom row its 1.
  assert.equal(clashes(placed({ 9: 5, 0: 1, 18: 4 }), flat).size, 0);
  assert.equal(clashes(placed({ 9: 5, 0: 3, 18: 9 }), flat).size, 0);
  assert.equal(clashes(placed({ 9: 5, 0: 3 }), flat).size, 0, "the cell below is still open");
  assert.deepEqual(sorted(clashes(placed({ 9: 5, 0: 3, 18: 4 }), flat)), [0, 9, 18]);
  assert.deepEqual(sorted(clashes(placed({ 0: 5, 9: 3 }), flat)), [0, 9]);
  assert.equal(clashes(placed({ 0: 5, 9: 3 })).size, 0, "not without the rule");
  assert.equal(variantCandidates(placed({ 0: 5 }), flat)[9], 1 << 9);
  assert.equal(variantCandidates(placed({ 80: 5 }), flat)[71], 1 << 1);
  // With a 1 in row 1 and a 9 in column 2, row 2, column 2 cannot be 5; the
  // cell beside it still can, from below.
  const flatCand = variantCandidates(placed({ 0: 1, 37: 9 }), flat);
  assert.equal(flatCand[10] & (1 << 5), 0);
  assert.ok(flatCand[11] & (1 << 5));
  assert.ok(variantCandidates(placed({ 0: 1, 37: 9 }))[10] & (1 << 5), "not without the rule");

  // Both at once have a grid. From an empty grid it runs past the solver's
  // budget, so the grid is written out, found by a search with no budget.
  // Neither rule keeps when digits are relabelled, so no first row of 1 to
  // 9 here: under Anti-taxicab that row has no grid at all.
  const both = taxi.rules | flat.rules;
  const grid = [..."193678245847325619526419873934261758618753492752894361479182536381546927265937184"].map(Number);
  assert.ok(keepsRules(grid, both), "both have a grid");
  assert.equal(clashes(grid, { rules: both }).size, 0);
  assert.deepEqual(variantSolutions(firstRow(), taxi, 1), []);

  // Their letters: QAT, then QDF, after the other switch rules.
  assert.equal(seedVariantName("QATQDF-H-BBBB"), "Anti-taxicab, Dutch Flatmates");
  assert.equal(seedVariantName("DQGMQDF-H-BBBB"), "Diagonal, Global Mod, Dutch Flatmates");
  assert.equal(variantName({ rules: flat.rules | rule("antiknight") }), "Anti-knight, Dutch Flatmates");
});

// Entropic and modular lines alike, `kinds` sorting digits for each.
function kindLinesTest(key, letter, kinds, made, { threes, twoAt, apart }) {
  const kind = (d) => kinds.findIndex((m) => m & (1 << d));
  for (const t of made[key]) {
    for (let i = 2; i < t.length; i++) assert.equal(new Set(t.slice(i - 2, i + 1).map((c) => kind(made.solution[c]))).size, 3, `three kinds along ${t}`);
  }
  assert.ok(made[key].some((t) => t.length === 5));
  linesRoundTrip(key, letter, made);

  // Row 1's first cells: after `threes`' first two, the third takes the
  // kind they leave; and the fourth, the first's kind. Their digits 1 to
  // 9, as a kind may hold Doppelgänger's 0 too.
  const t = [0, 1, 2, 3];
  const [a, b] = threes;
  const cand = variantCandidates(placed({ 0: a, 1: b }), { [key]: [t] });
  const nines = 0b1111111110;
  assert.equal(cand[2], kinds.find((m) => !(m & ((1 << a) | (1 << b)))) & nines);
  assert.equal(cand[3], kinds[kind(a)] & ~(1 << a) & ~(1 << b) & nines);
  // A line of two cells is none.
  assert.equal((key === "entropics" ? entropicProblem : modularProblem)([[0, 1]]).why, "length");

  // Two of one kind next to each other clash, and so do different kinds
  // three apart.
  assert.deepEqual(sorted(clashes(placed({ 0: twoAt[0], 1: twoAt[1] }), { [key]: [t] })), [0, 1]);
  assert.deepEqual(sorted(clashes(placed({ 0: apart[0], 3: apart[1] }), { [key]: [t] })), [0, 3]);
  assert.equal(clashes(placed({ 0: a, 1: b }), { [key]: [t] }).size, 0);
}

test("entropic lines are checked, solved and carried in seeds", () => {
  kindLinesTest("entropics", "QEN", ENTROPIC_KINDS, entropicPuzzle(), { threes: [2, 5], twoAt: [2, 3], apart: [2, 8] });
});

test("modular lines are checked, solved and carried in seeds", () => {
  kindLinesTest("modulars", "QMO", MODULAR_KINDS, modularPuzzle(), { threes: [1, 5], twoAt: [1, 4], apart: [1, 5] });
  // With entropic lines on the same grid: QEN, then QMO, as PARTS has them,
  // and a Q part's letters before a single part letter's.
  const { entropics, solution } = entropicPuzzle();
  const { modulars } = modularPuzzle();
  const both = { entropics, modulars };
  const seed = madeSeed("H", solution.map((d, c) => (c % 2 ? d : 0)), both);
  assert.match(seed.text, /^QENQMO-H-/);
  const back = parseSeed(seed.text);
  assert.ok(back, "they read back together");
  assert.deepEqual([back.entropics, back.modulars], [entropics, modulars]);
  assert.equal(seedVariantName("KFQENQMOPD-H-BBBB"), "Killer, Lockout, Entropic, Modular, Kropki, Diagonal");
});

// Every drawn part at once, on a grid that keeps the switch rules, made,
// checked, solved by steps and carried in a seed, as the maker, the solver
// and a made game do.
// Killer puzzles as the daily killer is made: the same from the same
// numbers, cages over every cell with no digit twice and the right sums, one
// answer, and fewer clues the harder the level.
test("killer puzzles are made from a random source", () => {
  const clues = {};
  for (const level of LEVEL_IDS) {
    const seed = killerSeed(randomSource(4242), level);
    assert.equal(killerSeed(randomSource(4242), level).text, seed.text, `${level}: the same each time`);
    assert.match(seed.text, new RegExp(`^K-${level}-`));
    const { solution } = puzzleFor(seed);
    assert.deepEqual(sorted(new Set(seed.cages.flatMap((k) => k.cells))), [...Array(81).keys()], `${level}: every cell caged once`);
    for (const { sum, cells } of seed.cages) {
      assert.ok(cells.length <= 4);
      assert.equal(new Set(cells.map((c) => solution[c])).size, cells.length);
      assert.equal(cells.reduce((t, c) => t + solution[c], 0), sum);
    }
    assert.equal(variantSolutions(seed.grid, { cages: seed.cages }, 2)?.length, 1, `${level}: one answer`);
    clues[level] = seed.grid.filter(Boolean).length;
    assert.ok(clues[level] >= 81 - KILLER_BLANKS[level], `${level}: ${clues[level]} clues`);
    assert.equal(parseSeed(seed.text)?.text, seed.text);
  }
  assert.ok(clues.E > clues.M && clues.M > clues.H && clues.H >= clues.X, JSON.stringify(clues));
  assert.notEqual(killerSeed(randomSource(4243), "H").text, killerSeed(randomSource(4242), "H").text);
});

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
    // By now the others leave no room, so these two cross them, as lines
    // may: away from each other only.
    const crossing = { count: 2, max: 3, used: new Set() };
    const entropics = layLines(solution, seeded(43), fitsKinds(ENTROPIC_KINDS)(), crossing);
    const modulars = layLines(solution, seeded(47), fitsKinds(MODULAR_KINDS)(), crossing);
    const doubles = layLines(solution, seeded(79), fitsDouble(3), { ...crossing, min: 3 });
    const pills = layPills(solution, seeded(83), { count: 2, used: crossing.used });
    const sumlines = laySumLines(solution, seeded(173), 10, { count: 2, min: 2, max: 5, used: crossing.used });
    const regionsums = layRegionSums(solution, seeded(179), { count: 2, max: 6, used: crossing.used });
    const indexes = layIndexes(solution, seeded(181), { count: 2, used: crossing.used });
    // A few dots and marks, never two on one side.
    const sides = new Set();
    const dots = layEdges(solution, rand, ["white", "black"], 0.15, sides);
    const xvs = layEdges(solution, rand, ["x", "v"], 0.3, sides);
    // Their own numbers, so the parts laid after come out as before.
    const signs = layEdges(solution, seeded(53), ["gt", "lt"], 0.1, sides);
    const quads = layQuads(solution, seeded(59), 3);
    // Clues outside the grid, never two in one spot: sandwiches left and
    // above, skyscrapers and X-sums right and below.
    const sandwiches = laySandwiches(solution, rand, 0.25);
    const taken = new Set(sandwiches.map((w) => viewSpot(w.line)));
    const skyscrapers = layViews(solution, rand, skyscraperOf, 0.25, [...VIEWS.keys()].slice(18), taken);
    const xsums = layViews(solution, rand, xsumOf, 0.4, [...VIEWS.keys()].slice(18), taken);
    const littles = layLittles(solution, rand, 0.1, taken);
    // Their own numbers, so the parts laid before come out as they did.
    const hiddens = layViews(solution, seeded(71), hiddenOf, 0.3, [...VIEWS.keys()], taken).filter((clue) => clue.height);
    const rooms = layViews(solution, seeded(73), roomOf, 0.3, [...VIEWS.keys()], taken);
    // The other kinds of cage, two each, clear of the killer cages.
    const caged = { count: 2, used: new Set(cages.flatMap((k) => k.cells)) };
    const relliks = layGroups(solution, seeded(151), rellikOf, caged);
    const lunchboxes = layGroups(solution, seeded(157), lunchboxOf, { ...caged, sizes: [3, 4], straight: true });
    const looksays = layGroups(solution, seeded(163), lookSayOf, caged);
    const equalities = layGroups(solution, seeded(167), equalityOf, { ...caged, sizes: [2, 4] });
    // Little room is left by now: the hardest to fit first, and the kinds in
    // pieces last, whose pieces can be single cells.
    const distincts = layGroups(solution, seeded(229), distinctOf, { ...caged, sizes: [2, 3] });
    const connecteds = layGroups(solution, seeded(227), connectedOf, { ...caged, sizes: [2, 3] });
    const equalsums = layPieces(solution, seeded(211), fitsEqualSum, caged);
    const samevalues = layPieces(solution, seeded(223), fitsSameValues, { ...caged, same: true });
    const variant = { cages, relliks, lunchboxes, looksays, equalities, equalsums, samevalues, connecteds, distincts, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, rules };
    const name = keys.join(", ");
    const lists = ["relliks", "lunchboxes", "looksays", "equalities", "equalsums", "samevalues", "connecteds", "distincts", "thermos", "arrows", "doubles", "pills", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "entropics", "modulars", "sumlines", "regionsums", "indexes", "dots", "xvs", "signs", "quads", "sandwiches", "littles", "skyscrapers", "xsums", "hiddens", "rooms"];
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
    const letters = "KQRCQLBQLSQECQESQSVQCVQCDTAQDAQPASROZCFQENQMOQSLQRSQVXPVQGTQQDBLYUQHSQNR" + RULES.filter((r) => rules & r.bit).map((r) => r.letter).join("");
    assert.ok(seed.text.startsWith(`${letters}-`), seed.text);
    const back = parseSeed(seed.text.toLowerCase());
    assert.ok(back, `${name}: the seed reads back`);
    assert.equal(back.text, seed.text);
    for (const list of ["cages", "relliks", "lunchboxes", "looksays", "equalities", "equalsums", "samevalues", "connecteds", "distincts", "thermos", "arrows", "doubles", "pills", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "entropics", "modulars", "sumlines", "regionsums", "indexes", "dots", "xvs", "signs", "quads", "sandwiches", "littles", "skyscrapers", "xsums", "hiddens", "rooms", "rules"]) {
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
  // Everything variantName knows, from each part and every switch at once;
  // Dutch Whispers names the whisper lines in German Whispers' place, so
  // every switch alone too.
  const all = RULES.reduce((m, r) => m | r.bit, 0);
  const every = { rules: all & ~rule("dutchwhispers") };
  for (const list of ["cages", "relliks", "lunchboxes", "looksays", "equalities", "equalsums", "samevalues", "connecteds", "distincts", "regions", "thermos", "arrows", "doubles", "pills", "whispers", "renbans", "palindromes", "zippers", "betweens", "lockouts", "entropics", "modulars", "sumlines", "regionsums", "indexes", "dots", "xvs", "signs", "quads", "circles", "circlesets", "chaosarrows", "chaoscounts", "shades", "sandwiches", "littles", "skyscrapers", "xsums", "hiddens", "rooms", "ranks", "indexings", "indexcells"]) every[list] = [1];
  const named = [...new Set([...variantName(every).split(", "), ...variantName({ rules: all }).split(", ")])].sort();
  assert.deepEqual(Object.values(RULE_HELP).map((h) => h.name).sort(), named, "every variant has an explanation");
  assert.deepEqual(rulesOf(null), []);
  assert.deepEqual(rulesOf({ cages: [1], rules: 1 }), ["killer", "diagonal"]);
  // Dutch Whispers stands in German Whispers' place, named and explained.
  const dutch = { whispers: [1], thermos: [1], rules: rule("dutchwhispers") | 1 };
  assert.equal(variantName(dutch), "Thermo, Dutch Whispers, Diagonal");
  assert.deepEqual(rulesOf(dutch), ["thermo", "dutchwhispers", "diagonal"]);
  assert.equal(seedVariantName("TSQDW-H-BBBB"), "Thermo, Dutch Whispers");
  // A part with two lists is found, and named once, by either.
  assert.deepEqual(rulesOf({ circlesets: [1], indexcells: [1] }), ["counting", "rowcolindex"]);
  assert.equal(seedVariantName("QCCQCSQRXQCX-H-BBBB"), "Counting Circles, Row/Column Indexing");
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

// The daily calendar: its days, its months laid out from Monday, and runs
// of days in a row, which a day filled in later mends.
test("the daily calendar lays out months and counts streaks", () => {
  assert.ok(isDate("2026-02-28") && isDate("2024-02-29"));
  assert.ok(!isDate("2026-02-29") && !isDate("2026-9-01") && !isDate(null), "only real days, written in full");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2025-12", 1), "2026-01");

  // September 2026 starts on a Tuesday and ends on a Wednesday.
  const weeks = monthWeeks("2026-09");
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0].slice(0, 2), [null, "2026-09-01"]);
  assert.deepEqual(weeks[4].slice(1, 4), ["2026-09-29", "2026-09-30", null]);
  assert.ok(weeks.every((w) => w.length === 7));
  // February 2021 starts on a Monday and fills exactly four weeks.
  assert.equal(monthWeeks("2021-02").length, 4);

  assert.equal(monthName("2026-09"), "September 2026");
  assert.equal(dayName("2026-09-12"), "12 Sep");
  assert.equal(dayName("2026-09-12", true), "Saturday 12 September 2026");
  assert.ok(isDate(DAILY_FIRST));

  const today = "2026-09-29";
  assert.deepEqual(streaks([], today), { current: 0, longest: 0 });
  assert.deepEqual(streaks(["2026-09-27", "2026-09-28", "2026-09-29"], today), { current: 3, longest: 3 });
  // Today still to play leaves yesterday's run going; a missed day ends it.
  assert.deepEqual(streaks(["2026-09-27", "2026-09-28"], today), { current: 2, longest: 2 });
  assert.deepEqual(streaks(["2026-09-26", "2026-09-27"], today), { current: 0, longest: 2 });
  // Filling in the 25th joins two runs; the order they come in does not matter.
  const gap = ["2026-09-29", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-26", "2026-09-27", "2026-09-28"];
  assert.deepEqual(streaks(gap, today), { current: 4, longest: 4 });
  assert.deepEqual(streaks([...gap, "2026-09-25", "2026-09-25"], today), { current: 8, longest: 8 });
  // Across a month's end, and nonsense left out.
  assert.deepEqual(streaks(["2026-08-31", "2026-09-01", "bad"], "2026-09-01"), { current: 2, longest: 2 });
});

console.log(`engine ok: ${passed} tests.`);
