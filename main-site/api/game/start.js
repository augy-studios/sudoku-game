// POST /api/game/start
//   { client_key, mode, level?, seed?, max_hints?, date?, kind? }
//   -> { game_id, seed, server_seed, created_at, date, kind }
// The start ticket. A game can only go on the leaderboard if it began here,
// which is what gives it a start time no browser can move. Games started
// offline play the same; they just have no ticket.
//
// mode is "solo", "daily", "race" (a network race's host; the guest plays
// the other side of the same ticket), or "made": a solo game of a made
// puzzle, whose seed carries the puzzle and which goes only on that
// puzzle's own board. With no seed, the server picks one at
// `level`, and only those games earn the time bonuses: a seed the player
// chose could have been solved beforehand. A daily's seed is the day's, from
// a secret, for today or any day before it back to the first daily; each
// scores in full, time bonuses included, the first time. A daily's kind is
// "classic" (the default) or "killer", each day having one of each, with a
// board of its own. max_hints is how many hints are free, 0 to 81, or null for all
// of them; hints past it cost points, and none is ever refused.

import { endpoint, HttpError, clientKey, limit } from "../_lib/http.js";
import { rest, rpc } from "../_lib/supabase.js";
import { dailyConfigured, dailyDate, dailyKind, dailySeed } from "../_lib/daily.js";
import { LEVEL_IDS } from "../../js/levels.js";
import { newSeed, parseSeed } from "../../js/seed.js";

export default endpoint("POST", async ({ req, body }) => {
  const key = clientKey(body.client_key);
  const mode = body.mode;
  if (!["solo", "daily", "race", "made"].includes(mode)) throw new HttpError(400, "bad_mode");

  const maxHints = body.max_hints ?? null;
  if (maxHints !== null && !(Number.isInteger(maxHints) && maxHints >= 0 && maxHints <= 81)) {
    throw new HttpError(400, "bad_max_hints");
  }

  await limit(req, "start", 600, 60);

  let seed;
  let serverSeed;
  let date = null;
  let kind = null;
  if (mode === "daily") {
    if (!dailyConfigured()) throw new HttpError(503, "no_daily", "The daily puzzle is not set up yet.");
    date = dailyDate(body.date);
    kind = dailyKind(body.kind);
    seed = dailySeed(date, kind);
    // A second ticket for the same day's puzzle from the same browser could
    // follow a first look at it, so it plays without the time bonuses.
    const seen = await rest(
      `sudoku_games?select=id&mode=eq.daily&daily_date=eq.${date}&daily_kind=eq.${kind}&host_key=eq.${encodeURIComponent(key)}&limit=1`
    );
    serverSeed = !seen?.length;
  } else if (body.seed == null && mode !== "made") {
    const level = body.level ?? "M";
    if (!LEVEL_IDS.includes(level)) throw new HttpError(400, "bad_level");
    seed = newSeed(level);
    serverSeed = true;
  } else {
    seed = parseSeed(body.seed);
    if (!seed) throw new HttpError(400, "bad_seed");
    // Its maker knows the answer, so a made puzzle keeps to its own board.
    if (Boolean(seed.made) !== (mode === "made")) throw new HttpError(400, "made_seed", "Made puzzles play solo, on their own board.");
    serverSeed = false;
  }

  const [row] = await rest("sudoku_games?select=id,created_at", {
    method: "POST",
    prefer: "return=representation",
    body: {
      mode,
      seed: seed.text,
      level: seed.level,
      daily_date: date,
      server_seed: serverSeed,
      max_hints: maxHints,
      host_key: key,
    },
  });

  // Now and then, clear out what nobody will submit.
  if (Math.random() < 0.02) rpc("sudoku_prune", {}).catch(() => {});

  return { game_id: row.id, seed: seed.text, server_seed: serverSeed, created_at: row.created_at, date, kind };
});
