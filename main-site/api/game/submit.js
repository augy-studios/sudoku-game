// POST /api/game/submit  { game_id, client_key, name, side, log }
//   -> { name, score, time_bonus, elapsed_ms, mistakes, hints, rank,
//        best_score, total, games, total_rank, daily_rank }
// The score is computed here from the replayed log and the server's own
// times; see verify.js for the checks on the game and the SQL function for
// the rest.

import { endpoint, HttpError, clientKey, gameId, side as readSide, limit } from "../_lib/http.js";
import { cleanName } from "../_lib/names.js";
import { rest, rpc } from "../_lib/supabase.js";
import { readLog, verify } from "../_lib/verify.js";
import { logText } from "../../js/record.js";

const REFUSALS = {
  not_found: [404, "That game does not exist."],
  expired: [410, "That game started more than 12 hours ago."],
  not_yours: [403, "That game was started in a different browser."],
  same_device: [409, "Both sides of that race were played from one browser, so it stays off the leaderboard."],
  already_submitted: [409, "That game is already on the leaderboard."],
  same_name: [409, "Your opponent is already on the leaderboard for this race under that name. Pick another."],
  overlap: [409, "That game was played at the same time as another one already on the leaderboard under this name."],
  seed_used: [409, "That name already has this seed on the leaderboard. Try a new seed."],
  daily_done: [409, "That name already has that day's puzzle on the leaderboard."],
};

export default endpoint("POST", async ({ req, body }) => {
  const id = gameId(body.game_id);
  const key = clientKey(body.client_key);
  const name = cleanName(body.name);
  const who = readSide(body.side);
  const log = readLog(body.log);

  await limit(req, "submit", 600, 30);

  const [game] = (await rest(`sudoku_games?id=eq.${id}&select=*`)) ?? [];
  if (!game) throw new HttpError(404, "not_found", REFUSALS.not_found[1]);
  if (who === 1 && game.mode !== "race") throw new HttpError(400, "bad_side");

  // The game's end as the server saw it: when the page reported it, if the
  // log then is this log, and otherwise now.
  const text = logText(log);
  const finishedAt = who === 0 ? game.finished_0 : game.finished_1;
  const loggedAs = who === 0 ? game.log_0 : game.log_1;
  const endedAt = finishedAt && loggedAs === text ? Date.parse(finishedAt) : Date.now();
  const elapsed = endedAt - Date.parse(game.created_at);

  const result = verify(game, log, elapsed);

  const [row] =
    (await rpc("sudoku_submit", {
      p_game_id: id,
      p_side: who,
      p_name: name,
      p_client_key: key,
      p_log: text,
      p_score: result.score,
      p_elapsed_ms: elapsed,
      p_mistakes: result.mistakes,
      p_hints: result.hints,
    })) ?? [];
  if (row?.status !== "ok") {
    const [status, message] = REFUSALS[row?.status] ?? [500, "Could not submit."];
    throw new HttpError(status, row?.status ?? "server", message);
  }

  return {
    name,
    score: result.score,
    time_bonus: result.timeBonus,
    elapsed_ms: elapsed,
    mistakes: result.mistakes,
    hints: result.hints,
    rank: Number(row.rank),
    best_score: row.best_score,
    total: Number(row.total),
    games: row.games,
    total_rank: Number(row.total_rank),
    daily_rank: row.daily_rank == null ? null : Number(row.daily_rank),
    seed_rank: row.seed_rank == null ? null : Number(row.seed_rank),
  };
});
