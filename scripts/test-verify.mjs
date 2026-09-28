#!/usr/bin/env node
// The API's check on a submitted game, without a database: verify.js is
// given game rows as the database would hold them.
//
// Run: node scripts/test-verify.mjs

import assert from "node:assert/strict";
import { parseSeed, puzzleFor, madeSeed, parseCode } from "../main-site/js/seed.js";
import { longSeed, newCode } from "../main-site/api/_lib/codes.js";
import { play } from "../main-site/js/record.js";
import { readLog, settle, verify } from "../main-site/api/_lib/verify.js";
import { tally, finalScore, timeBonus } from "../main-site/js/score.js";
import { dailyDate, dailyKind, dailySeed } from "../main-site/api/_lib/daily.js";
import { DAILY_FIRST, addDays } from "../main-site/js/calendar.js";

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

test("hints past the free ones cost points, and none is refused", () => {
  const log = readLog([["h", blanks[0], 0, 2000], ...wire().slice(1)]);
  const elapsed = log.at(-1).t + 1000;
  const paid = verify(row({ max_hints: 0 }), log, elapsed);
  const free = verify(row({ max_hints: 1 }), log, elapsed);
  assert.equal(paid.hints, 1);
  assert.equal(free.score, verify(row({ max_hints: null }), log, elapsed).score, "null makes every hint free");
  assert.ok(free.score > paid.score);
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

// A daily can be any day from the first to tomorrow in UTC, which is today
// somewhere; the calendar picks from those.
test("a daily's date is any day from the first daily on", () => {
  const utc = new Date().toISOString().slice(0, 10);
  assert.equal(dailyDate(DAILY_FIRST), DAILY_FIRST);
  assert.equal(dailyDate(addDays(utc, -40)), addDays(utc, -40));
  assert.equal(dailyDate(` ${addDays(utc, 1)} `), addDays(utc, 1));
  refused("bad_date", () => dailyDate(addDays(utc, 2)));
  refused("bad_date", () => dailyDate(addDays(DAILY_FIRST, -1)));
  refused("bad_date", () => dailyDate("2026-02-30"));
  refused("bad_date", () => dailyDate(20260101));
});

// Each day has a classic puzzle and a killer one at the same level, each
// the same every time it is asked for, and different on another day. The
// killer's seed is a made killer puzzle's, "K-" first, as the database
// reads its kind from, and scores as any server-picked game does.
test("a day has a classic daily and a killer daily", () => {
  process.env.DAILY_SECRET ??= "test secret";
  refused("bad_kind", () => dailyKind("sandwich"));
  assert.equal(dailyKind(null), "classic");
  assert.equal(dailyKind("killer"), "killer");
  const day = "2026-09-29";
  const classic = dailySeed(day);
  const killer = dailySeed(day, "killer");
  assert.equal(dailySeed(day, "classic").text, classic.text);
  assert.ok(!classic.made && !classic.text.startsWith("K-"));
  assert.match(killer.text, /^K-[EMHX]-/);
  assert.equal(killer.level, classic.level, "the day's level for both");
  assert.ok(killer.cages.length && killer.cages.flatMap((k) => k.cells).length === 81, "cages over every cell");
  const again = parseSeed(killer.text);
  assert.ok(again, "the page reads it back, one answer and all");
  assert.equal(again.text, killer.text);
  assert.notEqual(dailySeed(addDays(day, 1), "killer").text, killer.text);

  // A finished killer daily scores, time bonuses and all.
  const { puzzle: kp, solution: ks } = puzzleFor(killer);
  const log = readLog(kp.map((d, c) => (d ? null : c)).filter((c) => c != null).map((c, i) => ["p", c, ks[c], (i + 1) * 2000]));
  const r = verify({ seed: killer.text, mode: "daily", server_seed: true, max_hints: null }, log, log.at(-1).t + 1000);
  assert.ok(r.score > 0 && r.timeBonus > 0);
});

test("only a long made seed gets a short code, and codes are fresh", () => {
  const made = madeSeed("H", puzzle);
  assert.equal(longSeed(made.text.toLowerCase()).text, made.text, "read as any seed is");
  refused("bad_seed", () => longSeed(seed.text));
  refused("bad_seed", () => longSeed(made.text.slice(0, -2)));
  refused("bad_seed", () => longSeed(null));
  refused("bad_seed", () => longSeed(`${made.text}${"B".repeat(4000)}`));
  const codes = new Set(Array.from({ length: 50 }, newCode));
  assert.equal(codes.size, 50);
  for (const code of codes) assert.ok(parseCode(`H${code}`), code);
});

console.log(`verify ok: ${passed} tests.`);
