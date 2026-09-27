// Scoring. The score grows as the board fills, from each correct digit, and
// the finish adds a bonus. It scales with the level, with how quickly each
// digit followed the one before, and with how long the whole game took. The
// API recomputes it from the replayed log and never takes a score from a
// browser.
//
// Integers throughout, so the page and the server always agree.

import { LEVELS } from "./levels.js";

// Before the level's percentage.
export const CELL = 100;
export const MISTAKE = 60;
export const HINT = 150;
export const FINISH = 1000;

// Each turn: a digit placed within 3 seconds of the player's previous one
// earns up to half as much again, shrinking evenly to nothing at 30 seconds.
export const TURN_BONUS_MAX = 50;
export const TURN_FAST_MS = 3000;
export const TURN_SLOW_MS = 30000;

// The whole game: a finished board earns up to half as much again, shrinking
// evenly to nothing over the level's window.
export const TIME_BONUS_MAX = 50;

export function turnBonus(gapMs) {
  if (gapMs <= TURN_FAST_MS) return TURN_BONUS_MAX;
  if (gapMs >= TURN_SLOW_MS) return 0;
  return Math.floor((TURN_BONUS_MAX * (TURN_SLOW_MS - gapMs)) / (TURN_SLOW_MS - TURN_FAST_MS));
}

// What the log so far is worth, before the level's percentage. `result` is
// play()'s. `speed` is whether the time bonuses count: only on a seed the
// server picked, since a seed the player chose could have been solved
// beforehand. A turn is a digit placed or a hint; its time runs from the
// same player's previous turn, or from the start.
export function tally(result, log, { speed = false } = {}) {
  let points = 0;
  let placed = 0;
  let mistakes = 0;
  let hints = 0;
  const lastTurn = [0, 0];
  result.steps.forEach((step, i) => {
    const a = log[i];
    if (a.k !== "p" && a.k !== "h") return;
    const gap = a.t - lastTurn[a.b];
    lastTurn[a.b] = a.t;
    if (a.k === "h") {
      hints++;
      return;
    }
    if (!step.ok) {
      mistakes++;
    } else if (step.credit) {
      placed++;
      points += Math.floor((CELL * (100 + (speed ? turnBonus(gap) : 0))) / 100);
    }
  });
  return { points: points - MISTAKE * mistakes - HINT * hints, placed, mistakes, hints };
}

const scaled = (level, raw) => Math.max(0, Math.floor((raw * LEVELS[level].percent) / 100));

// The score so far, shown while playing. Never below zero.
export function liveScore(level, t) {
  return scaled(level, t.points);
}

export function timeBonus(level, elapsedMs, speed) {
  if (!speed) return 0;
  const window = LEVELS[level].window * 60000;
  const left = Math.max(0, window - Math.max(0, Math.floor(elapsedMs)));
  return Math.floor((TIME_BONUS_MAX * left) / window);
}

// A finished board's score: the finish bonus added, the level's percentage,
// then the time bonus percentage.
export function finalScore(level, t, bonusPercent = 0) {
  const base = scaled(level, t.points + FINISH);
  return Math.floor((base * (100 + bonusPercent)) / 100);
}
