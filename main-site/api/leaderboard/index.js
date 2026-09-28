// GET /api/leaderboard?board=best|total|daily|made[&date=YYYY-MM-DD][&seed=...][&q=...]
//   best  (default) -> { board, entries: [{ rank, name, score, mode, level, elapsed_ms }] }
//   total           -> { board, entries: [{ rank, name, total, games }] }
//   daily           -> { board, date, entries: [{ rank, name, score, elapsed_ms, mistakes, hints }] }
//   made, seed      -> { board, seed, code, entries: [{ rank, name, score, elapsed_ms, mistakes, hints }] },
//                      one made puzzle's own board, and its short code or null
//   made            -> { board, q, puzzles: [{ seed, code, level, players, top_score }] },
//                      made puzzles with a board, most played first, those
//                      whose seed holds q, or whose short code is q or holds
//                      it, if there is one
//   days, name      -> { board, name, dates: ["YYYY-MM-DD", ...] }, the days
//                      whose daily a name has on the board, oldest first,
//                      for the calendar and its streak
// Public, no login, one row per name, cached briefly at the edge.

import { endpoint, HttpError } from "../_lib/http.js";
import { rest } from "../_lib/supabase.js";
import { cleanName } from "../_lib/names.js";
import { parseSeed, parseCode, codeText } from "../../js/seed.js";

// A name's days. Names are matched without case, as the boards match them;
// _ is the one character a name can have that ilike reads as a wildcard.
async function nameDays(name) {
  const pattern = encodeURIComponent(name.replace(/_/g, "\\_"));
  const rows = await rest(`sudoku_leaderboard?select=daily_date&mode=eq.daily&name=ilike.${pattern}&order=daily_date.asc&limit=5000`);
  return [...new Set((rows ?? []).map((r) => r.daily_date))];
}

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
  made: {
    query: (seed) =>
      `sudoku_leaderboard_made?select=name,score,elapsed_ms,mistakes,hints&seed=eq.${encodeURIComponent(seed)}` +
      `&order=score.desc,created_at.asc&limit=${LIMIT}`,
    row: (r) => ({ name: r.name, score: r.score, elapsed_ms: r.elapsed_ms, mistakes: r.mistakes, hints: r.hints }),
  },
  daily: {
    query: (date) =>
      `sudoku_leaderboard_daily?select=name,score,elapsed_ms,mistakes,hints&daily_date=eq.${date}` +
      `&order=score.desc,created_at.asc&limit=${LIMIT}`,
    row: (r) => ({ name: r.name, score: r.score, elapsed_ms: r.elapsed_ms, mistakes: r.mistakes, hints: r.hints }),
  },
};

// A search: letters and digits only, as a seed's are, dashes aside.
const searchKey = (q) => String(q ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 80);

async function madePuzzles(q) {
  const key = searchKey(q);
  // A whole short code finds its puzzle; anything else matches part of a
  // seed or of a code.
  const code = parseCode(key);
  const match = code ? `&code=eq.${code.code}` : key ? `&or=(seed_key.like.*${key}*,code.like.*${key}*)` : "";
  const rows = await rest(`sudoku_made_puzzles?select=seed,code,level,players,top_score${match}&order=players.desc,last_at.desc&limit=${LIMIT}`);
  return (rows ?? []).map((r) => ({
    seed: r.seed,
    code: r.code ? codeText(r.level, r.code) : null,
    level: r.level,
    players: r.players,
    top_score: r.top_score,
  }));
}

// A seed's short code as written, or null if it has none.
async function codeOf(seed) {
  const rows = await rest(`sudoku_seed_codes?select=code&seed=eq.${encodeURIComponent(seed.text)}&limit=1`);
  return rows?.[0]?.code ? codeText(seed.level, rows[0].code) : null;
}

export default endpoint("GET", async ({ req, res }) => {
  const board = req.query?.board ?? "best";
  if (board === "days") {
    const name = cleanName(req.query?.name);
    const dates = await nameDays(name);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    return { board, name, dates };
  }
  const spec = BOARDS[board];
  if (!spec) throw new HttpError(400, "bad_board", "board is best, total, daily, made or days.");
  if (board === "made" && req.query?.seed == null) {
    const puzzles = await madePuzzles(req.query?.q);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    return { board, q: searchKey(req.query?.q), puzzles };
  }
  let seed = null;
  if (board === "made") {
    seed = parseSeed(req.query.seed);
    if (!seed?.made) throw new HttpError(400, "bad_seed", "That is not a made puzzle's seed.");
  }
  const date = String(req.query?.date ?? "");
  if (board === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "bad_date");

  const [rows, code] = await Promise.all([rest(spec.query(board === "made" ? seed.text : date)), board === "made" ? codeOf(seed) : null]);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
  const entries = (rows ?? []).map((r, i) => ({ rank: i + 1, ...spec.row(r) }));
  if (board === "made") return { board, seed: seed.text, code, entries };
  return board === "daily" ? { board, date, entries } : { board, entries };
});
