// The solver and the puzzle maker, which share one screen: a board to type
// a puzzle into, row by row or pasted in, checked with the engine's own
// solver for exactly one answer.
//
// The solver is for a puzzle from a book, a newspaper or another app. Once
// its clues check out, the person solves it here, with hints that say why,
// a check of their digits, the candidates, and the whole answer if they
// want it.
//
// The maker is for a puzzle of the person's own. Once it checks out, it has
// a seed that carries the whole puzzle, to share, play, copy or save as an
// image.
//
// Either can be a variant puzzle, with the rule buttons over the board:
// Killer adds cages, drawn with the Cages tool (tap cells, type the sum, Add
// cage); Thermo adds thermometers, drawn with the Thermos tool (tap the
// bulb, then each next cell, Add thermo); and Diagonal, Anti-knight,
// Anti-king and Windoku add their rules (variant.js). Every check, hint and
// candidate then follows them too.
//
// Nothing here is scored or leaves the browser, until a made puzzle is
// played as a game.

import { ROW, COL } from "./sudoku.js";
import { clashes, candidates, nextStep, bitCount, parseGrid, puzzleText, checkClues, rateLevel, MIN_CLUES } from "./steps.js";
import { madeSeed, parseSeed } from "./seed.js";
import { cageProblem, cageOf, thermoProblem, touching, RULES, ALL_RULES, variantName } from "./variant.js";
import { LEVELS } from "./levels.js";
import { BoardView } from "./board.js";
import { getSettings, onSettingsChange } from "./settings.js";
import { showPanel, renderSetup, launch } from "./game.js";
import { store, copyText, hydrateIcons } from "./ui.js";
import { confetti } from "./confetti.js";
import { savePuzzleImage } from "./image.js";

const BOX_NAMES = ["top left", "top middle", "top right", "middle left", "centre", "middle right", "bottom left", "bottom middle", "bottom right"];

const $ = (id) => document.getElementById(id);
const empty = () => new Array(81).fill(0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let board = null;

// One of these for the solver and one for the maker, each kept in this
// browser so a reload comes back to the same puzzle. stage is "enter" while
// the clues go in; then "solve" in the solver, or "made" in the maker.
// killer and rules are the variant's switches; cages are kept while Killer
// is off, for when it comes back on.
const fresh = () => ({ open: false, stage: "enter", clues: empty(), values: empty(), candidates: false, killer: false, thermo: false, rules: 0, cages: [], thermos: [] });
const states = { solver: fresh(), create: fresh() };
let mode = "solver";
let s = states.solver;

let solution = null; // the answer, from the solve or made stage on
let made = null; // the made puzzle's seed, in the made stage
let history = []; // earlier states of this stage, for undo
// The Cages tool: on, the cells being gathered, the sum typed so far, and
// the cage being changed, if one was picked up.
let cageMode = false;
let picked = new Set();
let editing = -1;
// The Thermos tool, likewise: on, the path so far from the bulb, and the
// thermometer being changed.
let thermoMode = false;
let path = [];
let editingThermo = -1;
let selected = null;
let padDigit = 0;
let checked = false; // Check was pressed, and nothing has changed since
let pending = null; // a hint pointed at but not yet shown
let mark = null; // the cell a hint just filled
let note = ""; // says what just happened, until the next change
let editTimer = null;

const creating = () => mode === "create";
// The grid this stage edits.
const grid = () => (s.stage === "solve" ? s.values : s.clues);
const goLabel = () => (creating() ? "Check it" : "Help me solve it");
const killer = () => s.killer;
// The cages the rules use: none with Killer off, even if some are kept.
const cages = () => (killer() && s.cages.length ? s.cages : null);
const thermos = () => (s.thermo && s.thermos.length ? s.thermos : null);
// The variant, for steps.js and variant.js, or null for a classic puzzle.
const variant = () => (cages() || thermos() || s.rules ? { cages: cages() ?? [], thermos: thermos() ?? [], rules: s.rules } : null);

/* ---- keeping it ---- */

const storageKey = (which) => `uwusudoku.${which}`;

function save() {
  store.set(storageKey(mode), s);
}

// Also works out the answer, and the made seed, for a stage past "enter".
function settle() {
  solution = null;
  made = null;
  if (s.stage === "enter") return;
  const check = checkClues(s.clues, variant());
  if (!check.ok) {
    s.stage = "enter";
    return;
  }
  solution = check.solution;
  if (s.stage === "made") made = madeSeed(rateLevel(s.clues, variant()), s.clues, variant());
}

function load(which) {
  const saved = store.getJSON(storageKey(which));
  const ok = (a) => Array.isArray(a) && a.length === 81 && a.every((d) => Number.isInteger(d) && d >= 0 && d <= 9);
  if (!saved || !ok(saved.clues)) return;
  const st = states[which];
  st.clues = saved.clues;
  st.open = saved.open === true;
  st.candidates = saved.candidates === true;
  // Before the switch rules, a killer puzzle was saved as variant "killer".
  st.killer = saved.killer === true || saved.variant === "killer";
  st.rules = Number.isInteger(saved.rules) ? saved.rules & ALL_RULES : 0;
  st.thermo = saved.thermo === true;
  const lines = Array.isArray(saved.thermos) ? saved.thermos : [];
  st.thermos = !thermoProblem(lines) ? lines : [];
  const kept = Array.isArray(saved.cages) ? saved.cages : [];
  st.cages = kept.every((k) => k && Array.isArray(k.cells)) && !cageProblem(kept) ? kept : [];
  if (which === "solver" && saved.stage === "solve" && ok(saved.values) && st.clues.every((d, c) => !d || saved.values[c] === d)) {
    st.stage = "solve";
    st.values = saved.values;
  }
  if (which === "create" && saved.stage === "made") st.stage = "made";
}

/* ---- words ---- */

const where = (c) => `row ${ROW[c] + 1}, column ${COL[c] + 1}`;
const WINDOW_NAMES = ["top left", "top right", "bottom left", "bottom right"];
function unitName(u) {
  if (u.kind === "box") return `the ${BOX_NAMES[u.index]} box`;
  if (u.kind === "diagonal") return `the diagonal from the top ${u.index ? "right" : "left"}`;
  if (u.kind === "window") return `the ${WINDOW_NAMES[u.index]} window`;
  return `${u.kind} ${u.index + 1}`;
}

// A hint in two taps: where to look, then the digit and why.
function hintText(step, reveal) {
  const { c, d, kind, unit } = step;
  if (!reveal) {
    if (kind === "single") return `Look at ${where(c)}: only one digit fits there. Tap Show it for the digit.`;
    if (kind === "hidden") return `Look at ${where(c)}: in ${unitName(unit)}, one digit has nowhere else to go. Tap Show it for the digit.`;
    return `Nothing can be filled by looking alone now. The cell at ${where(c)} has the fewest options; tap Show it for its digit.`;
  }
  if (kind === "single") {
    if (!variant()) return `${d} goes in ${where(c)}: every other digit is already in its row, column or box.`;
    const parts = ["row", "column", "box", ...(cages() ? ["cage"] : []), ...(thermos() ? ["thermometers"] : [])];
    const its = `its ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
    return `${d} goes in ${where(c)}: ${its}${s.rules ? `, with the ${ruleNames()} rules,` : ""} rule out every other digit.`;
  }
  if (kind === "hidden") return `${d} goes in ${where(c)}: it is the only place left for ${d === 8 ? "an" : "a"} ${d} in ${unitName(unit)}.`;
  return `${d} goes in ${where(c)}. That takes more than one step to see, so it comes from the answer.`;
}

// Why clues are not a puzzle yet, from checkClues. A solver's clues were
// copied from somewhere, so the fault is likely a typo; a maker's are their
// own, so the way on is to change them.
function problemText(check) {
  const { why } = check;
  if (why === "empty") return creating() ? "Put some clues in first." : "Type in the puzzle's digits first.";
  if (why === "clash") return `${clashText()} Fix them first.`;
  if (why === "cages") return CAGE_PROBLEMS[check.problem.why];
  if (why === "thermos") return THERMO_PROBLEMS[check.problem.why];
  if (why === "hard") return "The checker gave up: this has so much freedom it could not settle whether there is one answer. Add a clue or split a big cage, then check again.";
  if (why === "few") {
    return `A sudoku needs at least ${MIN_CLUES} clues to have only one answer, and this has ${check.n}. ${creating() ? "Add some more." : "Check for missing ones."}`;
  }
  if (why === "none") {
    return creating()
      ? "These clues have no answer: no digit repeats, but they cannot all be right together. Change or take out a clue, then check again."
      : "This puzzle has no answer, so a digit is probably mistyped. Check it against the original.";
  }
  const [a, b] = check.digits;
  const either = `It has more than one answer: ${where(check.c)} could be ${a} or ${b}, for one.`;
  return creating() ? `${either} Add a clue there or nearby, then check again.` : `${either} A clue is probably missing or wrong; check it against the original.`;
}

const ruleNames = () => variantName({ rules: s.rules });

// What makes digits clash, under the rules on.
function clashText() {
  const extra = [];
  if (s.rules) extra.push(`against the ${ruleNames()} rules`);
  if (cages()) extra.push("twice in a cage, or past a cage's sum");
  if (thermos()) extra.push("not rising along a thermometer");
  return `The red digits clash: the same digit twice in a row, column or box${extra.length ? `, ${extra.join(", or ")}` : ""}.`;
}

const THERMO_PROBLEMS = {
  count: "There is room for forty thermometers.",
  length: "A thermometer needs two to nine cells.",
  cell: "A thermometer has a cell off the board.",
  loop: "A thermometer cannot cross itself.",
  apart: "Each cell of a thermometer must touch the one before it.",
};

const CAGE_PROBLEMS = {
  size: "A cage needs one to nine cells.",
  cell: "A cage has a cell off the board.",
  overlap: "Two cages share a cell.",
  sum: "A cage has a sum its cells cannot make with different digits.",
  apart: "A cage's cells must join up edge to edge.",
};

/* ---- state ---- */

function isSolved() {
  return s.stage === "solve" && s.values.every((d, c) => d === solution[c]);
}

function canEdit() {
  return s.stage === "enter" || (s.stage === "solve" && !isSolved());
}

// Digits the person put in that are not the answer's.
function wrongCells() {
  const out = new Set();
  if (s.stage !== "solve") return out;
  for (let c = 0; c < 81; c++) if (!s.clues[c] && s.values[c] && s.values[c] !== solution[c]) out.add(c);
  return out;
}

const snapshot = () => ({ clues: s.clues.slice(), values: s.values.slice(), cages: s.cages.slice(), thermos: s.thermos.slice() });

// Puts a new grid in this stage, or new cages, undoably.
function change(next, nextCages = s.cages, nextThermos = s.thermos) {
  history.push(snapshot());
  if (s.stage === "solve") s.values = next;
  else s.clues = next;
  s.cages = nextCages;
  s.thermos = nextThermos;
  checked = false;
  pending = null;
  mark = null;
  note = "";
  save();
}

function say(text) {
  note = text;
  render();
}

// Forgets everything about the stage before.
function resetStage() {
  history = [];
  selected = null;
  padDigit = 0;
  checked = false;
  pending = null;
  mark = null;
  note = "";
}

/* ---- actions ---- */

function selectCell(c, { focus = false } = {}) {
  if (!canEdit()) return;
  if (cageMode) return pickCell(c);
  if (thermoMode) return pickThermoCell(c);
  selected = c;
  padDigit = 0;
  render();
  if (focus) board.focusSelected();
}

// After a digit goes in, the selection moves on, so a puzzle can be typed
// straight through: to the next cell while the clues go in, blanks and all,
// and to the next empty one while solving, round to the top if need be. The
// keyboard's focus follows it when it was on the board.
function advance() {
  const g = grid();
  let to = null;
  if (s.stage === "enter") to = selected < 80 ? selected + 1 : null;
  else {
    for (let i = 1; i < 81 && to == null; i++) {
      const c = (selected + i) % 81;
      if (!g[c]) to = c;
    }
  }
  if (to == null) return;
  const focused = board.root.contains(document.activeElement);
  selected = to;
  render();
  if (focused) board.focusSelected();
}

function inputDigit(d) {
  if (!canEdit()) return;
  if (cageMode) return typeSum(String(d));
  if (thermoMode) return say("Digits wait until the thermometer is done: tap its cells, bulb first, then Add thermo.");
  if (selected == null || (s.stage === "solve" && s.clues[selected])) {
    // Nothing to put it in: light the digit up instead.
    padDigit = padDigit === d ? 0 : d;
    selected = null;
    render();
    return;
  }
  const next = grid().slice();
  // The same digit again takes it out, and stays put.
  const placed = next[selected] !== d;
  next[selected] = placed ? d : 0;
  change(next);
  if (isSolved()) {
    note = "Solved. Every digit is right.";
    confetti();
  }
  render();
  if (placed && !isSolved()) advance();
}

// A blank while the clues go in: 0 or ., as in a pasted puzzle. Clears the
// cell and moves on, so blanks need no tapping past.
function blank() {
  if (s.stage !== "enter" || selected == null) return;
  if (s.clues[selected]) {
    const next = s.clues.slice();
    next[selected] = 0;
    change(next);
    render();
  }
  advance();
}

function erase() {
  if (cageMode) return typeSum("back");
  if (thermoMode) return stepBack();
  if (!canEdit() || selected == null || (s.stage === "solve" && s.clues[selected]) || !grid()[selected]) return;
  const next = grid().slice();
  next[selected] = 0;
  change(next);
  render();
}

function undo() {
  if (!history.length) return;
  const back = history.pop();
  s.clues = back.clues;
  s.values = back.values;
  s.cages = back.cages;
  s.thermos = back.thermos;
  clearPicked();
  path = [];
  editingThermo = -1;
  checked = false;
  pending = null;
  mark = null;
  note = "";
  save();
  render();
}

function clearAll() {
  if (s.stage !== "enter" || (!s.clues.some(Boolean) && !cages() && !thermos())) return;
  endCage();
  change(empty(), killer() ? [] : s.cages, s.thermo ? [] : s.thermos);
  selected = null;
  say("Cleared. Undo brings it back.");
}

function pasteText(text) {
  if (s.stage !== "enter") return say("Tap Edit puzzle first to paste in a different one.");
  // A made puzzle's seed brings its cages too.
  const seed = parseGrid(text) ? null : parseSeed(text);
  if (seed?.made) {
    endCage();
    s.killer = Boolean(seed.cages);
    s.thermo = Boolean(seed.thermos);
    s.rules = seed.rules ?? 0;
    change(
      seed.grid.slice(),
      seed.cages ? seed.cages.map((k) => ({ sum: k.sum, cells: k.cells.slice() })) : s.cages,
      seed.thermos ? seed.thermos.map((t) => t.slice()) : s.thermos
    );
    selected = null;
    const name = variantName(seed);
    return say(`Pasted a made ${name ? `${name} ` : ""}puzzle. Tap ${goLabel()} when ready.`);
  }
  const next = parseGrid(text);
  if (!next) return say("That paste is not a puzzle. It needs 81 cells in reading order: digits for clues, and 0 or . for blanks.");
  change(next);
  selected = null;
  say(`Pasted ${plural(next.filter(Boolean).length, "clue")}. Check them over, then tap ${goLabel()}.`);
}

// A label that says how a copy or save went, then goes back.
function flash(id, text, back) {
  $(id).textContent = text;
  setTimeout(() => ($(id).textContent = back), 1500);
}

// The clues, in the same form Paste takes.
async function onCopy() {
  if (!s.clues.some(Boolean)) return;
  flash("solverCopyLabel", (await copyText(puzzleText(s.clues))) ? "Copied" : "Copy failed", "Copy puzzle");
}

async function onSeedCopy() {
  if (!made) return;
  flash("solverSeedCopyLabel", (await copyText(made.text)) ? "Copied" : "Copy failed", "Copy seed");
}

// The clues as a PNG, to print or send.
async function onImage() {
  if (!s.clues.some(Boolean) && !cages()) return;
  let ok = false;
  try {
    ok = await savePuzzleImage(s.clues, "sudoku-puzzle.png", variant());
  } catch {
    ok = false;
  }
  flash("solverImageLabel", ok ? "Saved" : "Save failed", "Save image");
}

async function onPasteBtn() {
  try {
    pasteText(await navigator.clipboard.readText());
  } catch {
    say("The browser would not share the clipboard. Press Ctrl+V instead, or type the digits in.");
  }
}

// Only clues with exactly one answer go on: to solving, in the solver, or
// to sharing, in the maker.
function onGo() {
  endCage();
  if (killer() && !s.cages.length) return say("Draw some cages first: tap Cages, then the cells of a cage, then type its sum.");
  if (s.thermo && !s.thermos.length) return say("Draw a thermometer first: tap Thermos, then the bulb and each next cell.");
  const check = checkClues(s.clues, variant());
  if (!check.ok) {
    // Where two answers part, so the person can see where a clue is wanted.
    if (check.why === "many") selected = check.c;
    return say(problemText(check));
  }
  resetStage();
  solution = check.solution;
  if (creating()) {
    s.stage = "made";
    made = madeSeed(rateLevel(s.clues, variant()), s.clues, variant());
    save();
    return say(`It has exactly one answer, so it is a proper puzzle. ${madeSummary()}`);
  }
  s.stage = "solve";
  s.values = s.clues.slice();
  save();
  say("It has one answer. Fill it in here, and tap Hint whenever you are stuck.");
}

function madeSummary() {
  const clues = plural(s.clues.filter(Boolean).length, "clue");
  const name = variantName(made);
  const what = name ? `a ${name} puzzle with ${made.cages ? `${plural(made.cages.length, "cage")} and ` : ""}${clues}` : `with ${clues}`;
  return `Rated ${LEVELS[made.level].name}, ${what}. Share the seed, ${name ? "" : "copy the puzzle "}or save it as an image.`;
}

// A made puzzle, played as a game. It scores only on its own board: its
// maker knows the answer.
function onPlay() {
  if (!made) return;
  s.open = false;
  save();
  launch({ mode: "solo", seed: made, maxHints: null });
}

function disarmEdit() {
  clearTimeout(editTimer);
  editTimer = null;
  $("solverEdit").classList.remove("armed");
  $("solverEditLabel").textContent = "Edit puzzle";
}

// Back to the clues. Digits already filled in ask for a second tap.
function onEdit() {
  endCage();
  const progress = s.stage === "solve" && s.values.some((d, c) => d && !s.clues[c]);
  if (progress && !editTimer) {
    $("solverEdit").classList.add("armed");
    $("solverEditLabel").textContent = "Tap again: your digits go";
    editTimer = setTimeout(disarmEdit, 3000);
    return;
  }
  disarmEdit();
  s.stage = "enter";
  s.values = empty();
  solution = null;
  made = null;
  resetStage();
  save();
  say(`Change the clues, then tap ${goLabel()} again.`);
}

function onCheck() {
  if (s.stage !== "solve" || isSolved()) return;
  checked = true;
  pending = null;
  const wrong = wrongCells().size;
  const left = s.values.filter((d) => !d).length;
  say(wrong ? `${plural(wrong, "digit")} ${wrong === 1 ? "is" : "are"} wrong, marked in red.` : `Everything so far is right. ${plural(left, "cell")} to go.`);
}

// The empty cell with the fewest candidates, and its digit from the answer:
// for when nothing can be filled by looking.
function easiest() {
  const cand = candidates(s.values, variant());
  let best = -1;
  for (let c = 0; c < 81; c++) {
    if (!s.values[c] && (best < 0 || bitCount(cand[c]) < bitCount(cand[best]))) best = c;
  }
  return { c: best, d: solution[best], kind: "answer" };
}

function onHint() {
  if (s.stage !== "solve" || isSolved()) return;
  const wrong = wrongCells().size;
  if (wrong) {
    checked = true;
    pending = null;
    return say(`${plural(wrong, "digit")} ${wrong === 1 ? "is" : "are"} wrong, marked in red. Fix ${wrong === 1 ? "it" : "them"} first: hints build on what is on the board.`);
  }
  // The second tap: fill in the cell the first one pointed at.
  if (pending && !s.values[pending.c]) {
    const step = pending;
    const next = s.values.slice();
    next[step.c] = step.d;
    change(next);
    selected = step.c;
    mark = { c: step.c, kind: "hint" };
    note = hintText(step, true);
    if (isSolved()) note += " That was the last one: solved.";
    render();
    return;
  }
  pending = nextStep(s.values, selected, variant()) ?? easiest();
  selected = pending.c;
  padDigit = 0;
  mark = null;
  say(hintText(pending, false));
}

function onSolveAll() {
  if (s.stage !== "solve" || isSolved()) return;
  change(solution.slice());
  selected = null;
  say("Filled in with the answer. Undo takes it back.");
}

function toggleCandidates() {
  s.candidates = !s.candidates;
  save();
  render();
}

/* ---- cages ---- */

// A rule button: killer, or one of RULES by key.
function toggleRule(key) {
  if (s.stage !== "enter") return;
  endCage();
  if (key === "killer") s.killer = !s.killer;
  else if (key === "thermo") s.thermo = !s.thermo;
  else s.rules ^= RULES.find((r) => r.key === key).bit;
  save();
  note = "";
  render();
}

function toggleCageMode() {
  if (cageMode) return endCage(true);
  endThermo();
  cageMode = true;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// Drops the cells gathered but not added, and any cage picked up.
function clearPicked() {
  picked = new Set();
  editing = -1;
  $("cageSum").value = "";
}

// Leaves the Cages tool, and the Thermos tool with it; `draw` to show it
// at once.
function endCage(draw = false) {
  cageMode = false;
  clearPicked();
  endThermo();
  if (draw) {
    note = "";
    render();
  }
}

// A tap in the Cages tool: a cell of another cage, with nothing gathered,
// picks that cage up; otherwise the cell goes in or out of the gathering.
function pickCell(c) {
  const of = cageOf(s.cages);
  if (!picked.size && of[c] >= 0) {
    editing = of[c];
    picked = new Set(s.cages[editing].cells);
    $("cageSum").value = String(s.cages[editing].sum);
  } else if (of[c] >= 0 && of[c] !== editing) {
    return say("That cell is in another cage. Add or clear this one first, then tap it to change that cage.");
  } else if (picked.has(c)) picked.delete(c);
  else picked.add(c);
  note = "";
  render();
}

// Digits typed while gathering go to the sum; "back" takes one off.
function typeSum(key) {
  const box = $("cageSum");
  box.value = key === "back" ? box.value.slice(0, -1) : (box.value + key).slice(-2);
  note = "";
  render();
}

function cageStatus() {
  const n = picked.size;
  if (!n) return "Tap the cells of a cage, then type its sum. Tap a cage already drawn to change it.";
  return `${plural(n, "cell")} picked. Type the sum, then ${editing >= 0 ? "Change cage" : "Add cage"}.`;
}

function onCageAdd() {
  const sum = Number($("cageSum").value);
  const cells = [...picked].sort((a, b) => a - b);
  if (!cells.length) return;
  if (!Number.isInteger(sum) || sum < 1) return say("Type the cage's sum first.");
  const next = s.cages.filter((_, i) => i !== editing).concat([{ sum, cells }]);
  const problem = cageProblem(next);
  if (problem) return say(CAGE_PROBLEMS[problem.why]);
  change(s.clues, next.sort((a, b) => a.cells[0] - b.cells[0]));
  clearPicked();
  say(`Cage of ${plural(cells.length, "cell")} adding to ${sum}. Tap the cells of the next one.`);
}

function onCageRemove() {
  if (editing < 0) return;
  change(s.clues, s.cages.filter((_, i) => i !== editing));
  clearPicked();
  say("Cage removed. Undo brings it back.");
}

/* ---- thermometers ---- */

function toggleThermoMode() {
  if (thermoMode) return endCage(true);
  endCage();
  thermoMode = true;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// Leaves the Thermos tool, dropping any path not added.
function endThermo() {
  thermoMode = false;
  path = [];
  editingThermo = -1;
}

// A tap in the Thermos tool: with no path, a cell of a thermometer picks it
// up; the path's last cell takes that step back; otherwise the cell is the
// next step, if it touches the last.
function pickThermoCell(c) {
  if (!path.length) {
    const i = s.thermos.findIndex((t) => t.includes(c));
    if (i >= 0) {
      editingThermo = i;
      path = s.thermos[i].slice();
      note = "";
      return render();
    }
  }
  if (c === path.at(-1)) return stepBack();
  if (path.includes(c)) return say("A thermometer cannot cross itself.");
  if (path.length && !touching(path.at(-1), c)) return say("The next cell must touch the last one, along a side or at a corner.");
  if (path.length === 9) return say("A thermometer has nine cells at most.");
  path.push(c);
  note = "";
  render();
}

function stepBack() {
  path.pop();
  note = "";
  render();
}

function thermoStatus() {
  if (!path.length) return "Tap the bulb, then each next cell in order. Tap a thermometer already drawn to change it.";
  if (path.length === 1) return "Bulb placed. Tap the next cell: digits rise from the bulb.";
  return `${plural(path.length, "cell")} long. Tap on, or ${editingThermo >= 0 ? "Change thermo" : "Add thermo"}. Tapping the last cell takes it back.`;
}

function onThermoAdd() {
  if (path.length < 2) return say("A thermometer needs two cells at least: the bulb and one more.");
  const next = s.thermos.filter((_, i) => i !== editingThermo).concat([path.slice()]);
  const problem = thermoProblem(next);
  if (problem) return say(THERMO_PROBLEMS[problem.why]);
  const n = path.length;
  change(s.clues, s.cages, next);
  path = [];
  editingThermo = -1;
  say(`Thermometer of ${plural(n, "cell")} added. Tap the next bulb, or Done.`);
}

function onThermoRemove() {
  if (editingThermo < 0) return;
  change(s.clues, s.cages, s.thermos.filter((_, i) => i !== editingThermo));
  path = [];
  editingThermo = -1;
  say("Thermometer removed. Undo brings it back.");
}

/* ---- drawing ---- */

function defaultStatus() {
  const n = s.clues.filter(Boolean).length;
  if (s.stage === "enter") {
    if (cageMode) return cageStatus();
    if (thermoMode) return thermoStatus();
    if (s.thermo && !s.thermos.length) return "A thermo puzzle: tap Thermos, then the bulb and each next cell. Digits rise from the bulb.";
    if (clashes(s.clues, variant()).size) return clashText();
    if (killer()) {
      const k = s.cages.length;
      if (!k) return "A killer puzzle: tap Cages, then the cells of a cage, then type its sum. Clues are optional.";
      return `${plural(k, "cage")} and ${plural(n, "clue")} so far. Tap Cages for more, or ${goLabel()} when it is done.`;
    }
    if (creating()) {
      if (!n) return "Type your clues in, row by row, 0 or . for a blank. Check it tells you whether it has exactly one answer.";
      return `${plural(n, "clue")} so far. Tap Check it to see whether it has exactly one answer.`;
    }
    if (!n) return "Pick the first cell and type the puzzle row by row, 0 or . for a blank. Or paste in the whole puzzle.";
    return `${plural(n, "clue")} so far. Tap Help me solve it when they are all in.`;
  }
  if (s.stage === "made") return `It has exactly one answer. ${madeSummary()}`;
  if (isSolved()) return "Solved. Every digit is right.";
  if (clashes(s.values, variant()).size) return clashText();
  return `${plural(s.values.filter((d) => !d).length, "cell")} to go. Stuck? Tap Hint.`;
}

const TITLES = {
  solver: { enter: "Type in a puzzle", solve: "Solve it" },
  create: { enter: "Make a puzzle", made: "Your puzzle" },
};

const FOOTS = {
  solver: "Not scored, and nothing leaves this browser. Paste takes 81 cells in reading order, with 0 or . for blanks.",
  create: "Paste takes 81 cells in reading order, with 0 or . for blanks. A made puzzle gets a leaderboard of its own.",
  made: "The seed carries the whole puzzle: paste it into the Seed box on the new-game screen to play it. Played solo, it scores on its own board, never the main ones.",
};

function render() {
  if (!board) return;
  const { stage } = s;
  const enter = stage === "enter";
  const solving = stage === "solve";
  const g = grid();
  const solved = isSolved();
  const settings = getSettings();
  const wrong = clashes(g, variant());
  if (checked) for (const c of wrongCells()) wrong.add(c);

  board.set({
    // While the clues go in they are drawn as clues.
    puzzle: solving ? s.clues : g,
    solution: solving ? solution : g,
    values: g,
    notes: solving && s.candidates && !solved ? candidates(g, variant()) : empty(),
    selected,
    interactive: canEdit(),
    highlightSame: settings.highlight_same,
    highlightPeers: settings.highlight_peers,
    focusDigit: padDigit,
    mark,
    wrong,
    // In the classic switch, cages kept for later are not shown.
    cages: killer() ? s.cages : null,
    // The thermometer being changed is drawn as the path, not twice.
    thermos: s.thermo ? s.thermos.filter((_, i) => i !== editingThermo) : null,
    path: thermoMode ? path : [],
    rules: s.rules,
    picked: cageMode ? picked : thermoMode ? new Set(path) : null,
  });

  $("solverTitle").textContent = TITLES[mode][stage];
  $("solverStatus").textContent = note || defaultStatus();
  $("solverSeed").textContent = made ? `Seed ${made.text}` : "";
  $("solverSeed").classList.toggle("hidden", !made);
  $("solverFoot").textContent = stage === "made" ? FOOTS.made : FOOTS[mode];

  const counts = new Array(10).fill(0);
  for (const v of g) counts[v]++;
  document.querySelectorAll("#solverPad [data-digit]").forEach((btn) => {
    const d = Number(btn.dataset.digit);
    const left = Math.max(0, 9 - counts[d]);
    btn.querySelector(".count").textContent = settings.show_counts ? String(left) : "";
    btn.classList.toggle("done", left === 0);
    btn.classList.toggle("lit", padDigit === d);
    btn.disabled = !canEdit();
    btn.setAttribute("aria-label", settings.show_counts ? `${d}, ${left} left` : String(d));
  });

  // What each stage shows.
  const shown = {
    solverPad: enter || solving,
    solverTools: enter || solving,
    solverPaste: enter,
    solverClear: enter,
    solverGo: enter,
    solverCheck: solving,
    solverHint: solving,
    solverSolve: solving,
    solverCands: solving && !solved,
    solverEdit: !enter,
    solverPlay: stage === "made",
    solverSeedCopy: stage === "made",
    solverRules: enter,
    solverRuleLine: !enter && Boolean(variant()),
    solverCages: enter && killer(),
    cageBar: cageMode,
    solverThermos: enter && s.thermo,
    thermoBar: thermoMode,
    // A variant's rules and cages do not fit in 81 characters.
    solverCopy: !killer() && !s.thermo && !s.rules,
  };
  for (const [id, on] of Object.entries(shown)) $(id).classList.toggle("hidden", !on);

  const icon = creating() ? "check" : "bulb";
  if ($("solverGoIcon").dataset.icon !== icon) {
    $("solverGoIcon").dataset.icon = icon;
    hydrateIcons($("solverGo"));
  }
  $("solverGoLabel").textContent = goLabel();

  const any = s.clues.some(Boolean) || Boolean(cages());
  $("solverUndo").disabled = !history.length;
  $("solverErase").disabled = !canEdit();
  $("solverClear").disabled = !any;
  $("solverCopy").disabled = !s.clues.some(Boolean);
  $("solverImage").disabled = !any;
  for (const id of ["solverCheck", "solverHint", "solverSolve"]) $(id).disabled = solved;
  $("solverHintLabel").textContent = pending ? "Show it" : "Hint";
  $("solverCands").setAttribute("aria-pressed", String(s.candidates));
  $("solverCandsLabel").textContent = s.candidates ? "Hide candidates" : "Show candidates";
  document.querySelectorAll("#solverRules [data-rule]").forEach((b) => {
    const { rule } = b.dataset;
    const on = rule === "killer" ? s.killer : rule === "thermo" ? s.thermo : Boolean(s.rules & RULES.find((r) => r.key === rule).bit);
    b.setAttribute("aria-pressed", String(on));
  });
  $("solverRuleLine").textContent = variant() ? `Rules: ${variantName(variant())}` : "";
  $("solverCages").setAttribute("aria-pressed", String(cageMode));
  $("solverThermos").setAttribute("aria-pressed", String(thermoMode));
  if (thermoMode) {
    $("thermoAddLabel").textContent = editingThermo >= 0 ? "Change thermo" : "Add thermo";
    $("thermoRemove").classList.toggle("hidden", editingThermo < 0);
    $("thermoAdd").disabled = path.length < 2;
  }
  if (cageMode) {
    $("cageAddLabel").textContent = editing >= 0 ? "Change cage" : "Add cage";
    $("cageRemove").classList.toggle("hidden", editing < 0);
    $("cageAdd").disabled = !picked.size;
  }
}

/* ---- in and out ---- */

// which: "solver" or "create".
export function openSolver(which = "solver") {
  if (which !== mode) {
    disarmEdit();
    mode = which;
    s = states[mode];
  }
  for (const [name, st] of Object.entries(states)) {
    st.open = name === mode;
    store.set(storageKey(name), st);
  }
  resetStage();
  endCage();
  settle();
  showPanel("solver");
  render();
}

function closeSolver() {
  s.open = false;
  save();
  disarmEdit();
  showPanel("setup");
  renderSetup();
  $("startBtn").focus();
}

function onKey(e) {
  if ($("solver").classList.contains("hidden")) return;
  if (e.defaultPrevented || e.target.closest("input, textarea, select") || document.body.classList.contains("modal-open")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (cageMode && /^[0-9]$/.test(e.key)) typeSum(e.key);
  else if (cageMode && e.key === "Enter") onCageAdd();
  else if (cageMode && e.key === "Escape") endCage(true);
  else if (thermoMode && e.key === "Enter") onThermoAdd();
  else if (thermoMode && e.key === "Escape") endCage(true);
  else if (/^[1-9]$/.test(e.key)) inputDigit(Number(e.key));
  else if (s.stage === "enter" && (e.key === "0" || e.key === ".")) blank();
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
  else if (e.key.startsWith("Arrow") && selected == null && canEdit()) selectCell(40, { focus: true });
  else return;
  e.preventDefault();
}

// reopen: go back into the solver or the maker if one was open when the
// page was left.
export function initSolver({ reopen = true } = {}) {
  board = new BoardView($("solverBoard"), { onSelect: selectCell });
  load("solver");
  load("create");

  $("solverPad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-digit]");
    if (b) inputDigit(Number(b.dataset.digit));
  });
  $("solverUndo").addEventListener("click", undo);
  $("solverErase").addEventListener("click", erase);
  $("solverPaste").addEventListener("click", onPasteBtn);
  $("solverClear").addEventListener("click", clearAll);
  $("solverCheck").addEventListener("click", onCheck);
  $("solverHint").addEventListener("click", onHint);
  $("solverSolve").addEventListener("click", onSolveAll);
  $("solverGo").addEventListener("click", onGo);
  $("solverPlay").addEventListener("click", onPlay);
  $("solverSeedCopy").addEventListener("click", onSeedCopy);
  $("solverCands").addEventListener("click", toggleCandidates);
  $("solverCopy").addEventListener("click", onCopy);
  $("solverImage").addEventListener("click", onImage);
  $("solverEdit").addEventListener("click", onEdit);
  $("solverBack").addEventListener("click", closeSolver);
  $("solverRules").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rule]");
    if (b) toggleRule(b.dataset.rule);
  });
  $("solverCages").addEventListener("click", toggleCageMode);
  $("solverThermos").addEventListener("click", toggleThermoMode);
  $("thermoAdd").addEventListener("click", onThermoAdd);
  $("thermoRemove").addEventListener("click", onThermoRemove);
  $("thermoDone").addEventListener("click", () => endCage(true));
  $("cageAdd").addEventListener("click", onCageAdd);
  $("cageRemove").addEventListener("click", onCageRemove);
  $("cageDone").addEventListener("click", () => endCage(true));
  $("cageSum").addEventListener("input", () => render());
  $("cageSum").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onCageAdd();
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("paste", (e) => {
    if ($("solver").classList.contains("hidden") || e.target.closest?.("input, textarea")) return;
    e.preventDefault();
    pasteText(e.clipboardData?.getData("text"));
  });
  onSettingsChange(render);

  const open = Object.keys(states).find((name) => states[name].open);
  if (reopen && open && !$("setup").classList.contains("hidden")) openSolver(open);
}
