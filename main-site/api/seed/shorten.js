// POST /api/seed/shorten  { seed } -> { seed, code }
// A short code for a made puzzle's seed longer than 20 characters, as
// written, "H-B7K4Q-M9TRZ". The seed is checked as any seed is, one answer
// and all, and gets the same code every time it is asked for; lookup gives
// it back to anyone with the code.

import { endpoint, HttpError, limit } from "../_lib/http.js";
import { rest, UpstreamError } from "../_lib/supabase.js";
import { longSeed, newCode } from "../_lib/codes.js";
import { codeText } from "../../js/seed.js";

// The code a seed already has, or null.
async function codeOf(text) {
  const rows = await rest(`sudoku_seed_codes?select=code&seed=eq.${encodeURIComponent(text)}&limit=1`);
  return rows?.[0]?.code ?? null;
}

export default endpoint("POST", async ({ req, body }) => {
  // Checking a seed runs the solver, so the limit comes first.
  await limit(req, "shorten", 600, 30);
  const seed = longSeed(body.seed);
  const reply = (code) => ({ seed: seed.text, code: codeText(seed.level, code) });

  const had = await codeOf(seed.text);
  if (had) return reply(had);
  // A clash, on the code or on a seed that got one meanwhile, refuses the
  // insert: the seed's code if it has one now, or another try.
  for (let tries = 0; tries < 3; tries++) {
    const code = newCode();
    try {
      await rest("sudoku_seed_codes", { method: "POST", body: { code, seed: seed.text } });
      return reply(code);
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      const now = await codeOf(seed.text);
      if (now) return reply(now);
    }
  }
  throw new HttpError(503, "busy", "No short code could be made just now. Try again in a moment.");
});
