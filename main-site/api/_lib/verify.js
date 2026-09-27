// Replays a submitted game with the same modules the browser plays with,
// and works out what it is worth. Nothing a browser says about a game is
// taken on trust: the log is replayed from the seed, the board has to end
// complete and correct, the times are checked against the ticket and the
// server's own clock, and the score is computed here, with the ticket's free
// hints.
//
// What this cannot check is how long each turn really took: those times come
// from the browser. They are held to never running backwards, to fitting
// inside the server's clock, and to a human pace.

import { parseSeed, puzzleFor } from "../../js/seed.js";
import { play, fromWire } from "../../js/record.js";
import { tally, finalScore, timeBonus } from "../../js/score.js";
import { HttpError } from "./http.js";

// The log's last time may run this far past the server's clock: the start
// ticket's round trip, a pasted seed's game starting before its ticket
// arrived, and a little drift.
const CLAIM_SLACK_MS = 10000;
// Turns closer together than this are faster than a person taps. A few are
// forgiven; a game of them is a script.
const MIN_TURN_MS = 150;
const FAST_TURNS_ALLOWED = 5;
// A whole game faster than this per blank cell, or under 20 seconds, is a
// script or a pasted answer.
const MIN_MS_PER_BLANK = 800;
const MIN_GAME_MS = 20000;

export function readLog(value) {
  if (Array.isArray(value) && value.length === 0) {
    throw new HttpError(400, "no_moves", "A game needs at least one move to go on the leaderboard.");
  }
  const log = fromWire(value, 1);
  if (!log) throw new HttpError(400, "bad_log", "That game could not be read.");
  return log;
}

// The replayed game, checked. elapsedMs: the server's time from the start
// ticket to the game's end.
export function settle(game, log, elapsedMs) {
  const seed = parseSeed(game.seed);
  if (!seed) throw new HttpError(500, "bad_seed");
  const { puzzle, solution, blanks } = puzzleFor(seed);

  const result = play(puzzle, solution, log);
  if (result.error) {
    throw new HttpError(409, "illegal", `Move ${result.error.at + 1} cannot be played in this puzzle.`);
  }
  if (result.solved) throw new HttpError(409, "auto_solved", "Games finished with Solve are not ranked.");
  if (!result.complete) throw new HttpError(409, "unfinished", "Only a finished board can go on the leaderboard.");

  if (log.at(-1).t > elapsedMs + CLAIM_SLACK_MS) {
    throw new HttpError(409, "clock", "That game's times run past the time it really took.");
  }
  let fast = 0;
  let prev = -Infinity;
  for (const a of log) {
    if (a.k !== "p" && a.k !== "h") continue;
    if (a.t - prev < MIN_TURN_MS) fast++;
    prev = a.t;
  }
  if (fast > FAST_TURNS_ALLOWED || elapsedMs < Math.max(MIN_GAME_MS, MIN_MS_PER_BLANK * blanks)) {
    throw new HttpError(409, "too_fast", "That game was played too quickly to count.");
  }
  return { seed, result };
}

// game: the sudoku_games row. log: the side's whole log. elapsedMs: as above.
export function verify(game, log, elapsedMs) {
  const { seed, result } = settle(game, log, elapsedMs);
  const speed = game.server_seed === true;
  const t = tally(result, log, { speed, freeHints: game.max_hints ?? null });
  const bonus = timeBonus(seed.level, elapsedMs, speed);
  return {
    score: finalScore(seed.level, t, bonus),
    timeBonus: bonus,
    mistakes: t.mistakes,
    hints: t.hints,
  };
}
