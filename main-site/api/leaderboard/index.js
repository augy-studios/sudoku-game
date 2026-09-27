// GET /api/leaderboard?board=best|total|daily[&date=YYYY-MM-DD]
//   best  (default) -> { board, entries: [{ rank, name, score, mode, level, elapsed_ms }] }
//   total           -> { board, entries: [{ rank, name, total, games }] }
//   daily           -> { board, date, entries: [{ rank, name, score, elapsed_ms, mistakes, hints }] }
// Public, no login, one row per name, cached briefly at the edge.

import { endpoint, HttpError } from "../_lib/http.js";
import { rest } from "../_lib/supabase.js";

const LIMIT = 100;

const BOARDS = {
  best: {
    query: () =>
      `sudoku_leaderboard_best?select=name,score,mode,level,elapsed_ms&order=score.desc,created_at.asc&limit=${LIMIT}`,
    row: (r) => ({ name: r.name, score: r.score, mode: r.mode, level: r.level, elapsed_ms: r.elapsed_ms }),
  },
  total: {
    query: () => `sudoku_leaderboard_total?select=name,total,games&order=total.desc,games.asc,last_at.asc&limit=${LIMIT}`,
    row: (r) => ({ name: r.name, total: Number(r.total), games: r.games }),
  },
  daily: {
    query: (date) =>
      `sudoku_leaderboard_daily?select=name,score,elapsed_ms,mistakes,hints&daily_date=eq.${date}` +
      `&order=score.desc,created_at.asc&limit=${LIMIT}`,
    row: (r) => ({ name: r.name, score: r.score, elapsed_ms: r.elapsed_ms, mistakes: r.mistakes, hints: r.hints }),
  },
};

export default endpoint("GET", async ({ req, res }) => {
  const board = req.query?.board ?? "best";
  const spec = BOARDS[board];
  if (!spec) throw new HttpError(400, "bad_board", "board is best, total or daily.");
  const date = String(req.query?.date ?? "");
  if (board === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "bad_date");

  const rows = await rest(spec.query(date));
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
  const entries = (rows ?? []).map((r, i) => ({ rank: i + 1, ...spec.row(r) }));
  return board === "daily" ? { board, date, entries } : { board, entries };
});
