// The game screen: choosing a game, playing it, and what happens after.
//
// A game is a seed and a log of actions, and everything on screen is derived
// from those two by replaying the log over the seed's puzzle. That is also
// all that is saved, sent to the other device in a network game, put in a
// replay link, and submitted to the leaderboard, where the API replays it
// the same way.

import { LEVELS, LEVEL_IDS } from "./levels.js";
import { newSeed, parseSeed, puzzleFor, madeSeed } from "./seed.js";
import { play, toWire, fromWire, unpackLog, packReplay, unpackReplay } from "./record.js";
import { tally, liveScore, finalScore, timeBonus, TIME_BONUS_MAX } from "./score.js";
import { BoardView } from "./board.js";
import { Replay } from "./replay.js";
import { api, localDate } from "./api.js";
import { getSettings, onSettingsChange, saveSettings } from "./settings.js";
import { openLeaderboard, formatTime } from "./leaderboard.js";
import { copyText, hydrateIcons, store } from "./ui.js";
import { confetti } from "./confetti.js";
import { openSolver } from "./solver.js";
import { puzzleText, parseGrid, checkClues, rateLevel } from "./steps.js";

const GAME_STORAGE = "uwusudoku.game";
const SETUP_STORAGE = "uwusudoku.setup";
// How long to wait for the server to pick a seed before starting offline.
const START_WAIT_MS = 5000;
const HINT_PRESETS = [0, 1, 3, 5];
const SEED_NOTE = "Leave it empty for a new puzzle, or paste a seed or a copied puzzle to play that one.";

const $ = (id) => document.getElementById(id);

let board = null;
let replayer = null;
let g = null; // the game on screen, or null
let res = null; // play(g.puzzle, g.solution, g.log), refreshed on every change
let selected = null; // the selected cell
let padDigit = 0; // a digit picked with no cell selected, to light it up
let notesMode = false;
let launching = false;
let gameCounter = 0;
let solveTimer = null;
let leaveTimer = null;
let net = null; // set by multiplayer.js for network games
let watching = null; // a shared replay being watched

/* ---- setup ---- */

// hints, how many are free: a preset number, "all" for every one, or
// "custom" for `custom`. Hints past the free ones cost points.
const setup = { mode: "solo", level: "M", kind: "race", hints: 3, custom: 10 };

function loadSetup() {
  const saved = store.getJSON(SETUP_STORAGE) ?? {};
  if (["solo", "daily", "network", "solver", "create"].includes(saved.mode)) setup.mode = saved.mode;
  if (LEVEL_IDS.includes(saved.level)) setup.level = saved.level;
  if (["race", "coop"].includes(saved.kind)) setup.kind = saved.kind;
  if (HINT_PRESETS.includes(saved.hints) || saved.hints === "all" || saved.hints === "custom") setup.hints = saved.hints;
  if (Number.isInteger(saved.custom) && saved.custom >= 0 && saved.custom <= 81) setup.custom = saved.custom;
}

function saveSetup() {
  store.set(SETUP_STORAGE, setup);
}

function modeNote() {
  if (setup.mode === "solo") return "Scored on the leaderboard when the game starts while you are online.";
  if (setup.mode === "daily") return "The same puzzle for everyone today, with its own leaderboard. Starting it needs a connection.";
  if (setup.mode === "create") return "Make your own puzzle: put the clues in, check it has exactly one answer, then share it as a seed, copy it, or save it as an image.";
  if (setup.mode === "solver") return "Stuck on a puzzle from a book, a newspaper or another app? Type it in for hints that say why, a check of your digits, or the whole answer. Not scored.";
  return setup.kind === "race"
    ? "Race someone on the same wifi: the same puzzle, each on your own board. Scored when started online."
    : "Solve one board together on the same wifi. Co-op games are not scored.";
}

// The chosen number of free hints, null for all of them, or undefined if
// the custom number is not one.
function maxHintsFromSetup() {
  if (setup.hints === "all") return null;
  if (setup.hints !== "custom") return setup.hints;
  const n = Number($("customHints").value);
  return Number.isInteger(n) && n >= 0 && n <= 81 ? n : undefined;
}

function hintNote() {
  const n = setup.hints === "custom" ? setup.custom : setup.hints;
  if (n === "all") return "Every hint is free, though a hinted cell earns nothing.";
  if (n === 0) return "Every hint costs points.";
  return `The first ${n === 1 ? "hint is" : `${n} hints are`} free, and each one after that costs points.`;
}

function renderSetup() {
  const check = (sel, attr, value) =>
    document.querySelectorAll(sel).forEach((el) => el.setAttribute("aria-checked", String(el.dataset[attr] === String(value))));
  check("#modePick [data-pick]", "pick", setup.mode);
  check("#levelPick [data-level]", "level", setup.level);
  check("#kindPick [data-kind]", "kind", setup.kind);
  check("#hintPick [data-hints]", "hints", setup.hints);
  // The solver and the maker open their own screen, and need none of this.
  const tool = setup.mode === "solver" || setup.mode === "create";
  $("levelGroup").classList.toggle("hidden", setup.mode === "daily" || tool);
  $("kindGroup").classList.toggle("hidden", setup.mode !== "network");
  $("hintGroup").classList.toggle("hidden", tool);
  $("seedGroup").classList.toggle("hidden", setup.mode === "daily" || tool);
  $("joinForm").classList.toggle("hidden", setup.mode !== "network");
  $("startLabel").textContent = launching
    ? "Starting"
    : setup.mode === "network"
      ? "Host a game"
      : setup.mode === "daily"
        ? "Start today's puzzle"
        : setup.mode === "solver"
          ? "Open the solver"
          : setup.mode === "create"
            ? "Make a puzzle"
            : "Start game";
  $("startBtn").disabled = launching;
  $("playModeNote").textContent = modeNote();
  $("customHintsRow").classList.toggle("hidden", setup.hints !== "custom");
  if (document.activeElement !== $("customHints")) $("customHints").value = String(setup.custom);
  $("hintNote").textContent = hintNote();
}

function shake(input) {
  input.classList.remove("shake");
  void input.offsetWidth;
  input.classList.add("shake");
  input.focus();
}

// What the seed box holds: a seed, or a whole puzzle with one answer, as
// Copy puzzle writes it, which plays as a made puzzle. null if neither.
function seedFromInput(text) {
  const seed = parseSeed(text, setup.level);
  if (seed) return seed;
  const grid = parseGrid(text);
  return grid && checkClues(grid).ok ? madeSeed(rateLevel(grid), grid) : null;
}

function onStart() {
  if (setup.mode === "solver" || setup.mode === "create") return openSolver(setup.mode);
  const maxHints = maxHintsFromSetup();
  if (maxHints === undefined) {
    $("hintNote").textContent = "Enter a whole number of free hints, 0 to 81.";
    return shake($("customHints"));
  }
  if (setup.mode === "daily") return launchDaily(maxHints);

  const typed = $("seedInput").value.trim() !== "";
  const seed = typed ? seedFromInput($("seedInput").value) : null;
  if (typed && !seed) {
    $("seedNote").textContent = "That is not a seed, or a puzzle with one answer. Seeds look like H-BXK4-M9TR.";
    return shake($("seedInput"));
  }
  if (setup.mode === "network") {
    net?.host({ kind: setup.kind, level: setup.level, seed, maxHints });
    return;
  }
  launch({ mode: "solo", level: setup.level, seed, maxHints });
}

function setLaunching(on) {
  launching = on;
  $("againBtn").disabled = on;
  renderSetup();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// Starts a solo game or a race's host side. With no seed, it asks the server
// to pick one (only those earn the time bonuses); if the server cannot be
// reached in a few seconds, the game starts anyway on a seed of its own,
// unscored. A pasted seed starts at once and fetches its ticket meanwhile.
// Resolves with the game, or null if a start was already under way.
export async function launch({ mode, role = null, level = "M", seed = null, maxHints = null }) {
  if (seed) return startGame({ mode, role, seed, maxHints });
  if (launching) return null;
  setLaunching(true);
  let ticket = null;
  try {
    ticket = await withTimeout(api.start({ mode, level, maxHints }), START_WAIT_MS);
  } catch {
    ticket = null;
  }
  setLaunching(false);
  const picked = ticket && parseSeed(ticket.seed);
  if (picked) {
    return startGame({ mode, role, seed: picked, maxHints, gameId: ticket.game_id, ticket: "ok", serverSeed: ticket.server_seed === true });
  }
  return startGame({ mode, role, seed: newSeed(level), maxHints, ticket: "offline" });
}

// Today's puzzle comes from the server, so it needs a connection.
async function launchDaily(maxHints) {
  if (launching) return;
  setLaunching(true);
  let t = null;
  let problem = "";
  try {
    t = await withTimeout(api.start({ mode: "daily", date: localDate(), maxHints }), START_WAIT_MS * 2);
  } catch (err) {
    problem =
      err.code === "offline" || err.message === "timeout"
        ? "Today's puzzle needs a connection. Try again once you are online."
        : err.message && err.message !== err.code
          ? err.message
          : "Today's puzzle did not load. Try again in a moment.";
  }
  setLaunching(false);
  const seed = t && parseSeed(t.seed);
  if (!seed) {
    $("playModeNote").textContent = problem || "Today's puzzle did not load. Try again in a moment.";
    return;
  }
  startGame({ mode: "daily", seed, date: t.date, maxHints, gameId: t.game_id, ticket: "ok", serverSeed: t.server_seed === true });
}

/* ---- the game ---- */

// opts: { mode ("solo" | "daily" | "race" | "coop"), seed, role?, log?,
// maxHints?, gameId?, ticket?, serverSeed?, date?, submitted?,
// submittedText?, startedAt?, elapsed?, netMatch? }
export function startGame(opts) {
  replayer.stop();
  if (watching) closeWatch({ show: false });
  const { puzzle, solution, blanks } = puzzleFor(opts.seed);
  const role = opts.role ?? null;
  g = {
    id: ++gameCounter,
    mode: opts.mode,
    role,
    seed: opts.seed,
    puzzle,
    solution,
    blanks,
    log: opts.log?.slice() ?? [],
    // The co-op guest is player 1 in the shared log; everyone else is 0.
    me: opts.mode === "coop" && role === "guest" ? 1 : 0,
    maxHints: opts.maxHints ?? null,
    gameId: opts.gameId ?? null,
    // A made puzzle scores only solo, on its own board.
    ticket: opts.seed.made && opts.mode !== "solo" ? "none" : (opts.ticket ?? (opts.mode === "coop" || role === "guest" ? "none" : "pending")),
    serverSeed: opts.serverSeed ?? false,
    date: opts.date ?? null,
    submitted: opts.submitted ?? false,
    submittedText: opts.submittedText ?? null,
    startedAt: opts.startedAt ?? Date.now(),
    elapsed: opts.elapsed ?? null,
    finishSent: opts.elapsed != null,
    netMatch: opts.netMatch ?? 0,
    wasOver: false,
  };
  res = play(g.puzzle, g.solution, g.log);
  if (res.error) {
    // A saved game that no longer replays: keep what still does.
    g.log = g.log.slice(0, res.error.at);
    res = play(g.puzzle, g.solution, g.log);
  }
  selected = null;
  padDigit = 0;
  notesMode = false;
  disarmSolve();
  disarmLeave();
  showPanel("play");
  resetResult();
  persist();
  update({ fresh: true });
  if (g.ticket === "pending") fetchTicket(g);
  return g;
}

// The ticket for a game on a seed the player chose. It never earns the time
// bonuses, but it can go on the leaderboard.
async function fetchTicket(game) {
  try {
    const t = await api.start({ mode: game.seed.made ? "made" : game.mode, seed: game.seed.text, maxHints: game.maxHints });
    if (game !== g) return;
    g.gameId = t.game_id;
    g.ticket = "ok";
  } catch {
    if (game !== g) return;
    g.ticket = "offline";
  }
  persist();
  update();
  net?.changed();
}

export function isOver() {
  return Boolean(g && res && (res.complete || res.solved));
}

// A made puzzle's own board is the only one it goes on.
const madeOffBoard = () => g.seed.made && g.mode !== "solo";

function scoring() {
  return g.mode !== "coop" && !res.solved && !madeOffBoard();
}

// The leaderboard side: a race's guest is 1, everyone else 0.
function side() {
  return g.mode === "race" && g.role === "guest" ? 1 : 0;
}

function hintsUsed() {
  return g.log.filter((a) => a.k === "h").length;
}

// Free hints still to use. The rest cost points, and are never refused.
function freeHintsLeft() {
  return g.maxHints == null ? Infinity : Math.max(0, g.maxHints - hintsUsed());
}

// A co-op guest plays through the host; nobody plays a finished board.
function canPlay() {
  if (!g || isOver()) return false;
  return !(g.mode === "coop" && g.role === "guest" && !net?.connected());
}

/* ---- actions ---- */

function act(k, c = 0, d = 0) {
  if (!canPlay()) return false;
  const a = { k, c, d, b: g.me };
  if (g.mode === "coop" && g.role === "guest") {
    net?.sendAction(a);
    return true;
  }
  return applyAction(a);
}

// Adds an action to the log if it can be played. Also how the co-op host
// applies the guest's. Times never run backwards, even if the clock does.
export function applyAction(a) {
  if (!g || isOver()) return false;
  const last = g.log.at(-1)?.t ?? 0;
  const full = { k: a.k, c: a.c, d: a.d, b: a.b, t: Math.max(last, Date.now() - g.startedAt) };
  const next = play(g.puzzle, g.solution, [...g.log, full]);
  if (next.error) return false;
  g.log.push(full);
  res = next;
  persist();
  // The network first, so a race's finishing order is known when the
  // result draws.
  net?.changed();
  update();
  return true;
}

function selectCell(c, { focus = false } = {}) {
  if (!canPlay()) return;
  selected = c;
  padDigit = 0;
  update();
  if (focus) board.focusSelected();
}

function inputDigit(d) {
  if (!canPlay()) return;
  if (selected == null || g.puzzle[selected]) {
    // Nothing to put it in: light the digit up instead.
    padDigit = padDigit === d ? 0 : d;
    if (selected != null) selected = null;
    update();
    return;
  }
  const c = selected;
  const v = res.values[c];
  if (notesMode) {
    if (!v) act("n", c, d);
    return;
  }
  // The same digit again takes it out.
  if (v === d) act("e", c);
  else act("p", c, d);
}

function erase() {
  if (selected == null || g.puzzle[selected]) return;
  if (res.values[selected] || res.notes[selected]) act("e", selected);
}

// Fills the selected cell if it needs it, or else the first empty cell,
// or else the first wrong one.
function hint() {
  if (!canPlay()) return;
  const needs = (c) => !g.puzzle[c] && res.values[c] !== g.solution[c];
  let target = selected != null && needs(selected) ? selected : -1;
  if (target < 0) target = res.values.findIndex((v, c) => !g.puzzle[c] && !v);
  if (target < 0) target = res.values.findIndex((_, c) => needs(c));
  if (target < 0) return;
  selected = target;
  act("h", target);
}

function canUndo() {
  if (!canPlay()) return false;
  const probe = { k: "u", c: 0, d: 0, b: g.me, t: g.log.at(-1)?.t ?? 0 };
  return !play(g.puzzle, g.solution, [...g.log, probe]).error;
}

function undo() {
  if (canUndo()) act("u");
}

function toggleNotes() {
  notesMode = !notesMode;
  update();
}

/* ---- solving and leaving ---- */

function disarmSolve() {
  clearTimeout(solveTimer);
  solveTimer = null;
  $("solveBtn").classList.remove("armed");
  $("solveLabel").textContent = "Solve";
}

// Two taps, so a stray one does not end the game unranked.
function onSolve() {
  if (!canPlay()) return;
  if (!solveTimer) {
    $("solveBtn").classList.add("armed");
    $("solveLabel").textContent = "Tap again: not ranked";
    solveTimer = setTimeout(disarmSolve, 3000);
    return;
  }
  disarmSolve();
  act("s");
}

function disarmLeave() {
  clearTimeout(leaveTimer);
  leaveTimer = null;
  $("leaveBtn").classList.remove("armed");
}

// Back to choosing a game. A game in progress asks for a second tap.
function onLeave() {
  if (g && !isOver() && g.log.length > 0 && !leaveTimer) {
    $("leaveBtn").classList.add("armed");
    $("leaveLabel").textContent = g.role ? "Tap again to leave" : "Tap again to end this game";
    leaveTimer = setTimeout(() => {
      disarmLeave();
      update();
    }, 3000);
    return;
  }
  disarmLeave();
  if (g?.role) net?.leave();
  endGame();
}

// Drops the game on screen and shows the setup.
export function endGame() {
  replayer.stop();
  g = null;
  res = null;
  store.remove(GAME_STORAGE);
  showPanel("setup");
  renderSetup();
}

/* ---- drawing ---- */

function update({ fresh = false } = {}) {
  if (!g) return;
  const over = isOver();
  if (over && !g.wasOver) {
    g.wasOver = true;
    finish(fresh);
  } else if (over) {
    renderResultHead();
    renderSubmit();
  } else {
    g.wasOver = false;
    const s = getSettings();
    board.set({
      puzzle: g.puzzle,
      solution: g.solution,
      values: res.values,
      notes: res.notes,
      selected,
      interactive: canPlay(),
      highlightSame: s.highlight_same,
      highlightPeers: s.highlight_peers,
      focusDigit: padDigit,
      mark: null,
    });
  }
  renderChips(over);
  renderPad(over);
  renderActions(over);
  renderStatus(over);
  renderOpponent();
}

// Milliseconds the game has taken: the server's figure once it has one,
// otherwise to the last move of a finished game, or to now.
function elapsed() {
  if (g.elapsed != null) return g.elapsed;
  if (isOver()) return g.log.at(-1)?.t ?? 0;
  return Math.max(0, Date.now() - g.startedAt);
}

function renderTimer() {
  if (g && !watching) $("timerChip").textContent = formatTime(elapsed());
}

function currentTally() {
  return tally(res, g.log, { speed: g.serverSeed, freeHints: g.maxHints });
}

function renderChips(over) {
  const level = LEVELS[g.seed.level].name;
  const kind = { daily: "Daily", race: "Race", coop: "Co-op" }[g.mode] ?? (g.seed.made ? "Made" : "");
  $("levelChip").textContent = kind ? `${kind}, ${level}` : level;
  renderTimer();
  const t = currentTally();
  const live = liveScore(g.seed.level, t);
  $("scoreChip").textContent = scoring() && !over ? `${live} ${live === 1 ? "point" : "points"}` : "";
  $("mistakeChip").textContent = `${t.mistakes} ${t.mistakes === 1 ? "mistake" : "mistakes"}`;
  const hints = `${t.hints} ${t.hints === 1 ? "hint" : "hints"}`;
  $("hintChip").textContent =
    g.maxHints == null || g.maxHints === 0
      ? hints
      : t.hints <= g.maxHints
        ? `Free hints ${t.hints} of ${g.maxHints}`
        : `${hints}, ${t.paidHints} paid`;
  $("seedChip").textContent = seedChipText(g.seed);
}

// A made puzzle's seed is too long for a chip, so its chip only offers to
// copy it.
function seedChipText(seed) {
  return seed.made ? "Copy seed" : seed.text;
}

function renderPad(over) {
  const s = getSettings();
  const counts = new Array(10).fill(0);
  for (const v of res.values) counts[v]++;
  document.querySelectorAll("#pad [data-digit]").forEach((btn) => {
    const d = Number(btn.dataset.digit);
    const left = Math.max(0, 9 - counts[d]);
    btn.querySelector(".count").textContent = s.show_counts ? String(left) : "";
    btn.classList.toggle("done", left === 0);
    btn.classList.toggle("lit", padDigit === d);
    btn.disabled = !canPlay();
    btn.setAttribute("aria-label", notesMode ? `Note ${d}` : s.show_counts ? `${d}, ${left} left` : String(d));
  });
  $("pad").classList.toggle("notes-mode", notesMode);
  $("pad").classList.toggle("hidden", over);
}

function renderActions(over) {
  const playable = canPlay();
  $("tools").classList.toggle("hidden", over);
  $("undoBtn").disabled = !canUndo();
  $("eraseBtn").disabled = !playable;
  $("notesBtn").disabled = !playable;
  $("notesBtn").setAttribute("aria-pressed", String(notesMode));
  $("notesLabel").textContent = notesMode ? "Notes on" : "Notes";
  const free = freeHintsLeft();
  $("hintBtn").disabled = !playable;
  $("hintLabel").textContent = free === Infinity ? "Hint, free" : free > 0 ? `Hint, ${free} free` : "Hint";
  $("solveBtn").disabled = !playable;
  // Once it is over the result has its own buttons; a network game keeps
  // its way out of the session here.
  $("leaveRow").classList.toggle("hidden", over && !g.role);
  // Once it is over, the result has its own.
  $("copyPuzzleBtn").classList.toggle("hidden", over);
  if (!leaveTimer) $("leaveLabel").textContent = g.role ? (g.role === "host" ? "Stop hosting" : "Leave") : "New game";

  // A finished game's result says all of this itself.
  let note = "";
  if (!over) {
    note = "Undo as often as you like. Mistakes cost points, and undo does not give them back.";
    if (g.mode === "coop") note += " Co-op games are not scored.";
    else if (madeOffBoard()) note += " Made puzzles only score when played solo.";
    else if (g.seed.made && g.ticket !== "offline") note += " A made puzzle scores on its own board only.";
    else if (g.ticket === "offline") note += " This game started offline, so it is not scored.";
  }
  $("playNote").textContent = note;
}

function renderStatus(over) {
  const el = $("status");
  if (over) {
    el.textContent = "";
    return;
  }
  if (g.mode === "coop" && g.role === "guest" && !net?.connected()) {
    el.textContent = "Waiting for the host's device.";
  } else if (notesMode) {
    el.textContent = "Notes are on: digits go in as pencil marks.";
  } else if (selected == null) {
    el.textContent = "Pick a cell, then a number. Arrow keys and number keys work too.";
  } else {
    el.textContent = "";
  }
}

// A race's other player: how far along they are.
function renderOpponent() {
  const box = $("opponent");
  const info = g?.mode === "race" ? net?.opponent() : null;
  if (!info) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  $("oppText").textContent = info.text;
  $("oppFill").style.width = `${Math.round(info.fraction * 100)}%`;
}

function showPanel(name) {
  for (const id of ["setup", "net", "solver", "play"]) $(id).classList.toggle("hidden", id !== name);
}

/* ---- the end ---- */

function resetResult() {
  if (g) g.submitRefused = false;
  $("result").classList.add("hidden");
  $("replayBar").classList.add("hidden");
  $("submitted").classList.add("hidden");
  $("submitMsg").textContent = "";
}

function renderResultHead() {
  const t = currentTally();
  let title = "Solved";
  if (res.solved) title = "Solved with Solve";
  else if (g.mode === "coop") title = "Solved together";
  else if (g.mode === "race") {
    const place = net?.place?.();
    if (place === 1) title = "You finished first";
    else if (place === 2) title = "You finished second";
  }
  $("resultTitle").textContent = title;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  $("resultReason").textContent = `Took ${formatTime(elapsed())}. ${plural(t.mistakes, "mistake")}, ${plural(t.hints, "hint")}.`;
  renderScoreLine();
}

function renderScoreLine() {
  if (!scoring()) {
    $("resultScore").textContent = res.solved
      ? "Games finished with Solve are not ranked."
      : madeOffBoard()
        ? "Made puzzles only score when played solo."
        : "Co-op games are not scored.";
    return;
  }
  const t = currentTally();
  const bonus = timeBonus(g.seed.level, elapsed(), g.serverSeed);
  const score = finalScore(g.seed.level, t, bonus);
  const parts = [`${score} ${score === 1 ? "point" : "points"}`];
  if (bonus) parts.push(`+${bonus}% for time`);
  let line = `${parts.join(", ")}.`;
  if (g.seed.made) {
    line += " On this puzzle's own board, without time bonuses.";
  } else if (!g.serverSeed && g.gameId) {
    line += " No time bonuses: the seed was chosen, not picked by the server.";
  } else if (g.serverSeed && !bonus) {
    line += ` Up to +${TIME_BONUS_MAX}% for finishing within ${LEVELS[g.seed.level].window} minutes.`;
  }
  $("resultScore").textContent = line;
}

function finish(fresh) {
  const s = getSettings();
  selected = null;
  padDigit = 0;
  notesMode = false;
  renderResultHead();
  $("resultSeed").textContent = `Seed ${g.seed.text}`;
  $("copySeedLabel").textContent = "Copy seed";
  $("shareLabel").textContent = "Share replay";

  $("nameInput").value = s.name ?? "";
  $("submitBtn").disabled = false;
  g.autoTried = fresh;
  renderSubmit();

  const guest = Boolean(g.role === "guest");
  $("againBtn").classList.toggle("hidden", guest);
  $("againLabel").textContent = g.role ? "Next game" : g.mode === "daily" ? "Random puzzle" : "Play again";
  $("newGameBtn").classList.toggle("hidden", Boolean(g.role));
  $("newGameLabel").textContent = "New game";

  $("result").classList.remove("hidden");
  $("replayBar").classList.remove("hidden");
  hydrateIcons($("play"));
  replayer.load(
    { puzzle: g.puzzle, solution: g.solution, log: g.log, players: g.mode === "coop" ? 2 : 1 },
    { highlightSame: s.highlight_same },
    { autoplay: !fresh && s.auto_replay }
  );
  if (!fresh) $("resultTitle").focus({ preventScroll: true });
  if (res.complete && !fresh) confetti();
}

// Tells the server the board is finished, the moment it is, so its clock
// stops there. Tried again when the connection comes back.
async function reportFinish(game) {
  if (!game.gameId || game.finishSent || game !== g || !res.complete) return;
  game.finishSent = true;
  try {
    const r = await api.finish({ game_id: game.gameId, side: side(), log: toWire(game.log) });
    game.elapsed = r.elapsed_ms;
    game.serverSeed = r.server_seed === true;
    if (game === g) {
      persist();
      renderResultHead();
    }
  } catch (err) {
    if (err.code !== "offline") return;
    game.finishSent = false;
    window.addEventListener("online", () => reportFinish(game), { once: true });
  }
}

// The leaderboard part of the result. Redrawn on every update while the game
// is over, because the start ticket can arrive after the board is finished:
// a pasted seed's check-in can be slow, and a race's guest only learns of it
// from the host's next snapshot.
function renderSubmit() {
  reportFinish(g);
  const canSubmit = Boolean(scoring() && g.gameId && !g.submitted && res.complete);
  $("submitForm").classList.toggle("hidden", !canSubmit || g.submitRefused);
  let why = "";
  if (madeOffBoard()) why = "Made puzzles only score when played solo.";
  else if (g.mode === "coop") why = "Co-op games are not scored.";
  else if (res.solved) why = "Games finished with Solve are not ranked.";
  else if (!g.gameId) {
    why =
      g.ticket === "pending"
        ? "Still checking in with the leaderboard."
        : g.mode === "race" && g.role === "guest"
          ? "The host's device could not reach the leaderboard, so this race is not scored."
          : "This game started without a connection, so it cannot go on the leaderboard.";
  }
  $("notScored").textContent = why;
  $("notScored").classList.toggle("hidden", !why);
  $("submittedText").textContent = g.submittedText || "This game is on the leaderboard.";
  $("submitted").classList.toggle("hidden", !g.submitted);

  const s = getSettings();
  if (canSubmit && !g.autoTried && s.auto_submit && s.name) {
    g.autoTried = true;
    submitAs(s.name, true);
  }
}

// Refusals that no retry will change.
const FINAL = [
  "already_submitted",
  "expired",
  "too_fast",
  "overlap",
  "seed_used",
  "daily_done",
  "not_yours",
  "same_device",
  "illegal",
  "auto_solved",
  "unfinished",
  "clock",
];

async function submitAs(name, auto = false) {
  const msg = $("submitMsg");
  const game = g;
  $("submitBtn").disabled = true;
  msg.textContent = auto ? `Adding as ${name}.` : "Checking the game.";
  try {
    const r = await api.submit({ game_id: game.gameId, name, side: side(), log: toWire(game.log) });
    if (game !== g) return;
    saveSettings({ name: r.name });
    g.submitted = true;
    g.elapsed = r.elapsed_ms;
    const games = r.games === 1 ? "1 game" : `${r.games} games`;
    const bonus = r.time_bonus ? `, with +${r.time_bonus}% for time` : "";
    const daily = r.daily_rank ? ` Ranked ${r.daily_rank} on today's puzzle.` : "";
    g.submittedText = game.seed.made
      ? `Added as ${r.name} for ${r.score} points. Ranked ${r.seed_rank} on this puzzle's board.`
      : `Added as ${r.name} for ${r.score} points${bonus}. Best ${r.best_score}, ranked ${r.rank}. ` +
        `Total ${r.total} over ${games}, ranked ${r.total_rank}.${daily}`;
    persist();
    renderResultHead();
    $("submittedText").textContent = g.submittedText;
    $("submitForm").classList.add("hidden");
    $("submitted").classList.remove("hidden");
    msg.textContent = "";
    update();
  } catch (err) {
    if (game !== g) return;
    if (err.code === "offline") msg.textContent = "No connection. Try again once you are back online.";
    else if (auto && err.status === 400) msg.textContent = "Your saved name was refused, so this game was not added. Change it in Settings.";
    else msg.textContent = err.message || "That did not go through. Try again in a moment.";
    if (FINAL.includes(err.code)) {
      g.submitRefused = true;
      $("submitForm").classList.add("hidden");
    } else $("submitBtn").disabled = false;
  }
}

function onSubmit(event) {
  event.preventDefault();
  const name = $("nameInput").value.trim();
  if (!name) {
    $("submitMsg").textContent = "Enter a name.";
    $("nameInput").focus();
    return;
  }
  submitAs(name);
}

/* ---- sharing a replay ----
   A replay link holds the whole game in one parameter, r: the kind of game,
   the seed without its dashes, a dot, and every action packed small
   (record.js), as in /?r=sHBXK4M9TR.Ab3x... Nothing is stored anywhere, so a
   link works for as long as the site does, offline too. It carries no
   score: anyone can edit a link, and only the leaderboard's scores are
   checked. Links from before, /?watch=...&seed=...&game=..., still play. */

const META = { solo: "s", daily: "d", race: "r", coop: "c" };
const META_TEXT = {
  s: "A solo game.",
  d: "A daily puzzle.",
  r: "One player's board from a network race.",
  c: "Two players solving one board together.",
};

function replayLink(seed, log, meta) {
  const { solution } = puzzleFor(seed);
  const packed = packReplay(log, solution, meta === "c" ? 2 : 1);
  return `${location.origin}/?r=${meta}${seed.text.replace(/-/g, "")}.${packed}`;
}

async function onShare() {
  const src = watching ?? (g && { seed: g.seed, log: g.log, meta: META[g.mode] });
  if (!src) return;
  const url = replayLink(src.seed, src.log, src.meta);
  const label = $("shareLabel");
  if (navigator.share) {
    try {
      await navigator.share({ title: "uwuSudoku replay", text: `Watch this sudoku being solved, seed ${src.seed.text}.`, url });
      label.textContent = "Shared";
      return;
    } catch (err) {
      // Dismissed: nothing to say. Refused or unsupported here: copy instead.
      if (err?.name === "AbortError") return;
    }
  }
  label.textContent = (await copyText(url)) ? "Link copied" : "Copy failed";
}

// Reads a replay link's parameters. Returns what to watch, { damaged: true }
// if the link is broken, or null if this is not a replay link.
export function readReplayLink(params) {
  if (params.has("r")) {
    const m = /^([a-z])([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)$/.exec(params.get("r"));
    const seed = m && parseSeed(m[2]);
    if (!seed || !META_TEXT[m[1]]) return { damaged: true };
    const { puzzle, solution } = puzzleFor(seed);
    const log = unpackReplay(m[3], puzzle, solution, m[1] === "c" ? 2 : 1);
    return log ? { seed, log, meta: m[1] } : { damaged: true };
  }
  if (!params.has("watch")) return null;
  const seed = parseSeed(params.get("seed"));
  if (!seed) return { damaged: true };
  const { puzzle, solution } = puzzleFor(seed);
  const log = unpackLog(params.get("watch"), puzzle, solution);
  if (!log) return { damaged: true };
  const meta = META_TEXT[params.get("game")] ? params.get("game") : "s";
  return { seed, log, meta };
}

function watch(link) {
  g = null;
  res = null;
  watching = link;
  const { puzzle, solution } = puzzleFor(link.seed);
  const result = play(puzzle, solution, link.log);

  showPanel("play");
  resetResult();
  for (const id of ["pad", "tools", "leaveRow", "opponent", "netBar", "submitForm", "notScored", "submitted"]) $(id).classList.add("hidden");
  for (const id of ["scoreChip", "mistakeChip", "hintChip", "timerChip"]) $(id).textContent = "";
  $("playNote").textContent = "";
  $("status").textContent = "A shared replay.";
  $("levelChip").textContent = `Replay, ${LEVELS[link.seed.level].name}`;
  $("seedChip").textContent = seedChipText(link.seed);

  const t = tally(result, link.log);
  $("resultTitle").textContent = result.solved ? "Solved with Solve" : result.complete ? "Solved" : "Unfinished game";
  $("resultReason").textContent = `${t.mistakes} ${t.mistakes === 1 ? "mistake" : "mistakes"}, ${t.hints} ${t.hints === 1 ? "hint" : "hints"}, ${link.log.length} moves.`;
  $("resultScore").textContent = META_TEXT[link.meta];
  $("resultSeed").textContent = `Seed ${link.seed.text}`;
  $("copySeedLabel").textContent = "Copy seed";
  $("shareLabel").textContent = "Share replay";
  $("againBtn").classList.remove("hidden");
  $("againLabel").textContent = "Play this seed";
  $("newGameBtn").classList.remove("hidden");
  $("newGameLabel").textContent = "Close replay";

  $("result").classList.remove("hidden");
  $("replayBar").classList.remove("hidden");
  hydrateIcons($("play"));
  replayer.load(
    { puzzle, solution, log: link.log, players: link.meta === "c" ? 2 : 1 },
    { highlightSame: getSettings().highlight_same },
    { autoplay: true }
  );
}

// Leaves a shared replay: the address loses the link, and the page goes
// back to the game this browser had going, or to choosing one.
function closeWatch({ show = true } = {}) {
  watching = null;
  replayer.stop();
  const params = new URLSearchParams(location.search);
  for (const key of ["r", "watch", "seed", "game"]) params.delete(key);
  const rest = params.toString();
  history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
  if (show && !resume()) {
    showPanel("setup");
    renderSetup();
  }
}

// "Play this seed": the new-game screen with the seed filled in.
function playWatchedSeed() {
  const { seed } = watching;
  closeWatch({ show: false });
  setup.mode = "solo";
  setup.level = seed.level;
  saveSetup();
  $("seedInput").value = seed.text;
  showPanel("setup");
  renderSetup();
  $("startBtn").focus();
}

function onAgain() {
  if (watching) return playWatchedSeed();
  if (!g || launching) return;
  if (g.role) {
    net?.nextGame();
    return;
  }
  // A fresh seed at the same level, picked by the server where it can be.
  launch({ mode: "solo", level: g.seed.level, maxHints: g.maxHints });
}

/* ---- saving ---- */

// Solo games and dailies survive a reload. Network games live with the
// connection.
function persist() {
  if (!g || g.role) return;
  store.set(GAME_STORAGE, {
    mode: g.mode,
    seed: g.seed.text,
    log: toWire(g.log),
    maxHints: g.maxHints,
    gameId: g.gameId,
    ticket: g.ticket === "pending" ? "offline" : g.ticket,
    serverSeed: g.serverSeed,
    date: g.date,
    submitted: g.submitted,
    submittedText: g.submittedText ?? null,
    startedAt: g.startedAt,
    elapsed: g.elapsed,
  });
}

function resume() {
  const saved = store.getJSON(GAME_STORAGE);
  const seed = parseSeed(saved?.seed);
  const log = fromWire(saved?.log);
  if (!saved || !seed || !log || !["solo", "daily"].includes(saved.mode)) return false;
  const maxHints = Number.isInteger(saved.maxHints) && saved.maxHints >= 0 && saved.maxHints <= 81 ? saved.maxHints : null;
  startGame({
    mode: saved.mode,
    seed,
    log,
    maxHints,
    gameId: typeof saved.gameId === "string" ? saved.gameId : null,
    ticket: saved.gameId ? "ok" : "offline",
    serverSeed: saved.serverSeed === true,
    date: typeof saved.date === "string" ? saved.date : null,
    submitted: saved.submitted === true,
    submittedText: typeof saved.submittedText === "string" ? saved.submittedText : null,
    startedAt: Number.isFinite(saved.startedAt) ? saved.startedAt : Date.now(),
    elapsed: Number.isFinite(saved.elapsed) ? saved.elapsed : null,
  });
  return true;
}

/* ---- for multiplayer.js ---- */

export function setNet(adapter) {
  net = adapter;
}

export function current() {
  return g;
}

export function refresh() {
  update();
}

// How far along this board is, for a race's other player.
export function progress() {
  if (!g) return null;
  const t = currentTally();
  let filled = 0;
  for (let c = 0; c < 81; c++) if (!g.puzzle[c] && res.values[c] === g.solution[c]) filled++;
  return { filled, blanks: g.blanks, mistakes: t.mistakes, hints: t.hints, done: res.complete, solved: res.solved };
}

// What the host sends about the game. A co-op game's log is the game; a
// race's is each player's own and stays on their device.
export function snapshotData() {
  return {
    kind: g.mode,
    seed: g.seed.text,
    gameId: g.gameId,
    serverSeed: g.serverSeed,
    maxHints: g.maxHints,
    elapsed: Math.max(0, Date.now() - g.startedAt),
    log: g.mode === "coop" ? toWire(g.log) : null,
  };
}

// The guest's side of a snapshot from the host.
export function loadSnapshot(snap) {
  const seed = parseSeed(snap.seed);
  if (!seed) return;
  const same = g && g.role === "guest" && g.mode === snap.kind && g.netMatch === snap.match && g.seed.text === seed.text;
  if (snap.kind === "coop") {
    const log = fromWire(snap.log, 2);
    if (!log) return;
    if (!same) {
      startGame({ mode: "coop", role: "guest", seed, log, maxHints: snap.maxHints, startedAt: Date.now() - snap.elapsed, netMatch: snap.match });
      return;
    }
    if (log.length !== g.log.length) {
      const check = play(g.puzzle, g.solution, log);
      if (check.error) return;
      g.log = log;
      res = check;
    }
    update();
    return;
  }
  if (!same) {
    startGame({
      mode: "race",
      role: "guest",
      seed,
      maxHints: snap.maxHints,
      gameId: snap.gameId,
      ticket: snap.gameId ? "ok" : "none",
      serverSeed: snap.serverSeed,
      startedAt: Date.now() - snap.elapsed,
      netMatch: snap.match,
    });
    return;
  }
  if (snap.gameId && !g.gameId) {
    g.gameId = snap.gameId;
    g.ticket = "ok";
    g.serverSeed = snap.serverSeed;
  }
  update();
}

export { showPanel, renderSetup };

// Plays a seed from elsewhere, such as a made puzzle's board, solo. Never
// over a game in progress, which would be lost: false if there is one.
export function playSeed(seed) {
  if (g && !isOver() && (g.log.length || g.role)) return false;
  if (watching) closeWatch({ show: false });
  launch({ mode: "solo", seed, maxHints: maxHintsFromSetup() ?? null });
  return true;
}

/* ---- wiring ---- */

// A radio group in the setup: clicking a button sets `key` from its data.
function pick(id, attr, key, parse = (v) => v) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b) return;
    setup[key] = parse(b.dataset[attr]);
    saveSetup();
    renderSetup();
    if (key === "hints" && setup.hints === "custom") $("customHints").focus();
  });
}

function onKey(e) {
  if (!g || watching || $("play").classList.contains("hidden")) return;
  if (e.defaultPrevented || e.target.closest("input, textarea, select") || document.body.classList.contains("modal-open")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key)) inputDigit(Number(e.key));
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
  else if (e.key === "n" || e.key === "N") toggleNotes();
  else if (e.key.startsWith("Arrow") && selected == null && canPlay()) selectCell(40, { focus: true });
  else return;
  e.preventDefault();
}

export function initGame({ joinCode, replayLink: shared } = {}) {
  board = new BoardView($("board"), { onSelect: selectCell });
  replayer = new Replay(board);
  loadSetup();

  pick("modePick", "pick", "mode");
  pick("levelPick", "level", "level");
  pick("kindPick", "kind", "kind");
  pick("hintPick", "hints", "hints", (v) => (v === "all" || v === "custom" ? v : Number(v)));
  $("customHints").addEventListener("input", (e) => {
    const n = Number(e.target.value);
    if (Number.isInteger(n) && n >= 0 && n <= 81) {
      setup.custom = n;
      saveSetup();
    }
    $("hintNote").textContent = hintNote();
  });
  $("customHints").addEventListener("blur", renderSetup);

  $("seedInput").addEventListener("input", () => {
    $("seedNote").textContent = SEED_NOTE;
    // A pasted seed says its own level, a made puzzle's included.
    const raw = $("seedInput").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const level = raw.length === 9 ? raw[0] : raw.length > 9 ? parseSeed(raw)?.level : null;
    if (LEVEL_IDS.includes(level) && level !== setup.level) {
      setup.level = level;
      renderSetup();
    }
  });
  $("seedInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onStart();
  });
  $("seedClear").addEventListener("click", () => {
    $("seedInput").value = "";
    $("seedInput").focus();
  });
  $("startBtn").addEventListener("click", onStart);

  $("pad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-digit]");
    if (b) inputDigit(Number(b.dataset.digit));
  });
  $("undoBtn").addEventListener("click", undo);
  $("eraseBtn").addEventListener("click", erase);
  $("notesBtn").addEventListener("click", toggleNotes);
  $("hintBtn").addEventListener("click", hint);
  $("solveBtn").addEventListener("click", onSolve);
  $("leaveBtn").addEventListener("click", onLeave);
  document.addEventListener("keydown", onKey);

  $("submitForm").addEventListener("submit", onSubmit);
  $("againBtn").addEventListener("click", onAgain);
  $("newGameBtn").addEventListener("click", () => (watching ? closeWatch() : endGame()));
  $("resultBoardBtn").addEventListener("click", () => {
    const seed = (watching ?? g)?.seed;
    if (seed?.made) openLeaderboard("made", seed.text);
    else openLeaderboard(g?.mode === "daily" ? "daily" : undefined);
  });
  $("shareBtn").addEventListener("click", onShare);
  const shownSeed = () => (watching ?? g)?.seed;
  $("copySeedBtn").addEventListener("click", async () => {
    const seed = shownSeed();
    if (!seed) return;
    $("copySeedLabel").textContent = (await copyText(seed.text)) ? "Copied" : "Copy failed";
  });
  // The puzzle as it started, for the solver or another app.
  const copyPuzzle = (labelId) => async () => {
    const seed = shownSeed();
    if (!seed) return;
    const ok = await copyText(puzzleText(puzzleFor(seed).puzzle));
    $(labelId).textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => ($(labelId).textContent = "Copy puzzle"), 1500);
  };
  $("copyPuzzleBtn").addEventListener("click", copyPuzzle("copyPuzzleLabel"));
  $("resultPuzzleBtn").addEventListener("click", copyPuzzle("resultPuzzleLabel"));
  $("seedChip").addEventListener("click", async () => {
    const seed = shownSeed();
    if (!seed) return;
    const chip = $("seedChip");
    const ok = await copyText(seed.text);
    chip.textContent = ok ? "Seed copied" : "Copy failed";
    setTimeout(() => shownSeed() && (chip.textContent = seedChipText(shownSeed())), 1200);
  });

  onSettingsChange(() => {
    if (watching || isOver()) {
      replayer.view.highlightSame = getSettings().highlight_same;
      replayer.show(replayer.index);
      if (!watching) update();
      return;
    }
    update();
  });

  // The timer follows the wall clock, so a hidden tab catches up when shown.
  setInterval(renderTimer, 500);

  renderSetup();
  if (shared && !shared.damaged) {
    watch(shared);
    return;
  }
  if (joinCode) {
    setup.mode = "network";
    renderSetup();
    showPanel("setup");
    return;
  }
  // A broken replay link is dropped from the address, and said so on the
  // new-game screen when that is where the page lands.
  if (shared?.damaged) {
    closeWatch({ show: false });
    $("seedNote").textContent = "That replay link is damaged or incomplete, so it cannot be played back.";
  }
  if (!resume()) showPanel("setup");
}
