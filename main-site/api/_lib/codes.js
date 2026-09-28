// Short codes for long made seeds (seed.js): what may have one, and a new
// one. The routes in api/seed/ keep them in sudoku_seed_codes.

import { randomBytes } from "node:crypto";
import { parseSeed, needsCode, bodyFromBytes, CODE_LENGTH } from "../../js/seed.js";
import { HttpError } from "./http.js";

// The longest seed worth reading: far past any real one, well short of
// asking the solver to chew on a pasted book.
const SEED_MOST = 4000;

// The seed a short code is asked for: a made puzzle's, one answer and all,
// longer than CODE_OVER characters.
export function longSeed(value) {
  const seed = typeof value === "string" && value.length <= SEED_MOST ? parseSeed(value) : null;
  if (!seed?.made || !needsCode(seed.text)) {
    throw new HttpError(400, "bad_seed", "Only a made puzzle's seed longer than 20 characters has a short code.");
  }
  return seed;
}

// A fresh code, CODE_LENGTH random seed characters.
export function newCode() {
  let code = null;
  while (!code) code = bodyFromBytes(randomBytes(32), CODE_LENGTH);
  return code;
}
