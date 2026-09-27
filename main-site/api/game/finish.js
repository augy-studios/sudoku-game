// POST /api/game/finish  { game_id, client_key, side, log } -> { elapsed_ms, server_seed }
// Sent by the page the moment a board is finished, so the server's clock
// stops then and not whenever somebody gets round to submitting. The log is
// checked as on submit.

import { endpoint, HttpError, clientKey, gameId, side as readSide, limit } from "../_lib/http.js";
import { rest, rpc } from "../_lib/supabase.js";
import { readLog, settle } from "../_lib/verify.js";
import { logText } from "../../js/record.js";

const REFUSALS = {
  not_found: [404, "That game does not exist."],
  expired: [410, "That game started more than 12 hours ago."],
  not_yours: [403, "That game was started in a different browser."],
  same_device: [409, "Both sides of that race were played from one browser, so it stays off the leaderboard."],
  mismatch: [409, "That game is already on the leaderboard with other moves."],
};

export default endpoint("POST", async ({ req, body }) => {
  const id = gameId(body.game_id);
  const key = clientKey(body.client_key);
  const who = readSide(body.side);
  const log = readLog(body.log);

  await limit(req, "finish", 600, 60);

  const [game] = (await rest(`sudoku_games?id=eq.${id}&select=*`)) ?? [];
  if (!game) throw new HttpError(404, "not_found", REFUSALS.not_found[1]);
  if (who === 1 && game.mode !== "race") throw new HttpError(400, "bad_side");
  settle(game, log, Date.now() - Date.parse(game.created_at));

  const [row] = (await rpc("sudoku_finish", { p_game_id: id, p_side: who, p_client_key: key, p_log: logText(log) })) ?? [];
  if (row?.status !== "ok") {
    const [status, message] = REFUSALS[row?.status] ?? [500, "Could not record the end of the game."];
    throw new HttpError(status, row?.status ?? "server", message);
  }
  return {
    elapsed_ms: Date.parse(row.finished_at) - Date.parse(row.created_at),
    server_seed: game.server_seed === true,
  };
});
