// GET /api/seed/lookup?code=H-B7K4Q-M9TRZ -> { seed }
// The whole seed a short code stands for. A code never changes what it
// stands for, so the answer is cached for good; the level in front is the
// seed's own, and the page checks the seed as it checks any other.

import { endpoint, HttpError } from "../_lib/http.js";
import { rest } from "../_lib/supabase.js";
import { parseCode } from "../../js/seed.js";

export default endpoint("GET", async ({ req, res }) => {
  const code = parseCode(req.query?.code);
  if (!code) throw new HttpError(400, "bad_code", "Short seeds look like H-B7K4Q-M9TRZ.");
  const rows = await rest(`sudoku_seed_codes?select=seed&code=eq.${code.code}&limit=1`);
  if (!rows?.length) throw new HttpError(404, "unknown_code", "No puzzle has that short seed.");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, immutable");
  return { seed: rows[0].seed };
});
