#!/usr/bin/env node
// The API's check on a submitted game, without a database: verify.js is
// given game rows as the database would hold them.
//
// Run: node scripts/test-verify.mjs

import assert from "node:assert/strict";
import { parseSeed, puzzleFor } from "../main-site/js/seed.js";
import { play } from "../main-site/js/record.js";
import { readLog, settle, verify } from "../main-site/api/_lib/verify.js";
import { tally, finalScore, timeBonus } from "../main-site/js/score.js";

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

const refused = (code, fn) => assert.throws(fn, (err) => err.code === code, `expected ${code}`);

const seed = parseSeed("E-2345-6789");
const { puzzle, solution } = puzzleFor(seed);
const blanks = puzzle.map((d, c) => (d ? -1 : c)).filter((c) => c >= 0);
const row = (extra = {}) => ({ seed: seed.text, mode: "solo", server_seed: true, max_hints: null, ...extra });
const wire = (gap = 2000) => blanks.map((c, i) => ["p", c, solution[c], (i + 1) * gap]);

test("a fair game scores what the page shows", () => {
  const log = readLog(wire());
  const elapsed = log.at(-1).t + 1000;
  const r = verify(row(), log, elapsed);
  const t = tally(play(puzzle, solution, log), log, { speed: true });
  const bonus = timeBonus("E", elapsed, true);
  assert.equal(r.score, finalScore("E", t, bonus));
  assert.ok(r.timeBonus > 0);
  assert.equal(r.mistakes, 0);
});

test("a chosen seed earns no time bonuses", () => {
  const log = readLog(wire());
  const r = verify(row({ server_seed: false }), log, log.at(-1).t + 1000);
  assert.equal(r.timeBonus, 0);
  assert.equal(r.score, finalScore("E", { points: blanks.length * 100 }, 0));
});

test("Solve, unfinished boards and impossible moves are refused", () => {
  refused("auto_solved", () => settle(row(), readLog([["s", 0, 0, 30000]]), 60000));
  refused("unfinished", () => settle(row(), readLog(wire().slice(0, 5)), 600000));
  const given = puzzle.findIndex((d) => d);
  refused("illegal", () => settle(row(), readLog([["p", given, 1, 1000]]), 60000));
});

test("the hint limit holds", () => {
  const log = readLog([["h", blanks[0], 0, 2000], ...wire().slice(1)]);
  const elapsed = log.at(-1).t + 1000;
  refused("too_many_hints", () => settle(row({ max_hints: 0 }), log, elapsed));
  assert.equal(verify(row({ max_hints: 1 }), log, elapsed).hints, 1);
});

test("times have to fit the server's clock and a human pace", () => {
  const log = readLog(wire());
  refused("clock", () => settle(row(), log, log.at(-1).t - 20000));
  refused("too_fast", () => settle(row(), readLog(wire(100)), 600000));
  refused("too_fast", () => {
    const quick = readLog(wire(400));
    settle(row(), quick, quick.at(-1).t);
  });
});

test("malformed logs are refused before anything runs", () => {
  refused("no_moves", () => readLog([]));
  refused("bad_log", () => readLog([["p", 99, 1, 0]]));
  refused("bad_log", () => readLog([["p", 1, 1, 0, 1]]));
  refused("bad_log", () => readLog("p1.1.0"));
});

console.log(`verify ok: ${passed} tests.`);
