// The solver: a puzzle from a book, a newspaper or another app, typed in,
// and help finishing it. Two stages. First the clues go in, and the
// engine's own solver checks they have exactly one answer; then the person
// solves it here, with hints that say why, a check of their digits, the
// candidates, and the whole answer if they want it. Nothing is scored, and
// nothing leaves the browser.

import { solve, countSolutions, ROW, COL } from "./sudoku.js";
import { clashes, candidates, nextStep, bitCount, parseGrid, puzzleText } from "./steps.js";
import { BoardView } from "./board.js";
import { getSettings, onSettingsChange } from "./settings.js";
import { showPanel, renderSetup } from "./game.js";
import { store, copyText } from "./ui.js";
import { confetti } from "./confetti.js";
import { savePuzzleImage } from "./image.js";

const STORAGE = "uwusudoku.solver";
// Fewer clues than this never has one answer.
const MIN_CLUES = 17;
const BOX_NAMES = ["top left", "top middle", "top right", "middle left", "centre", "middle right", "bottom left", "bottom middle", "bottom right"];

const $ = (id) => document.getElementById(id);
const empty = () => new Array(81).fill(0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let board = null;
// stage is "enter" while the clues go in, and "solve" once they have one
// answer. Kept in this browser, so a reload comes back to the same puzzle.
const s = { open: false, stage: "enter", clues: empty(), values: empty(), candidates: false };
let solution = null; // the answer, in the solve stage
let history = []; // earlier grids of this stage, for undo
let selected = null;
let padDigit = 0;
let checked = false; // Check was pressed, and nothing has changed since
let pending = null; // a hint pointed at but not yet shown
let mark = null; // the cell a hint just filled
let note = ""; // says what just happened, until the next change
let editTimer = null;

// The grid this stage edits.
const grid = () => (s.stage === "enter" ? s.clues : s.values);

/* ---- keeping it ---- */

function save() {
  store.set(STORAGE, s);
}

function load() {
  const saved = store.getJSON(STORAGE);
  const ok = (a) => Array.isArray(a) && a.length === 81 && a.every((d) => Number.isInteger(d) && d >= 0 && d <= 9);
  if (!saved || !ok(saved.clues)) return;
  s.clues = saved.clues;
  s.open = saved.open === true;
  s.candidates = saved.candidates === true;
  if (saved.stage !== "solve" || !ok(saved.values)) return;
  const answer = countSolutions(s.clues) === 1 ? solve(s.clues) : null;
  if (answer && s.clues.every((d, c) => !d || saved.values[c] === d)) {
    s.stage = "solve";
    s.values = saved.values;
    solution = answer;
  }
}

/* ---- words ---- */

const where = (c) => `row ${ROW[c] + 1}, column ${COL[c] + 1}`;
const unitName = (u) => (u.kind === "box" ? `the ${BOX_NAMES[u.index]} box` : `${u.kind} ${u.index + 1}`);

// A hint in two taps: where to look, then the digit and why.
function hintText(step, reveal) {
  const { c, d, kind, unit } = step;
  if (!reveal) {
    if (kind === "single") return `Look at ${where(c)}: only one digit fits there. Tap Show it for the digit.`;
    if (kind === "hidden") return `Look at ${where(c)}: in ${unitName(unit)}, one digit has nowhere else to go. Tap Show it for the digit.`;
    return `Nothing can be filled by looking alone now. The cell at ${where(c)} has the fewest options; tap Show it for its digit.`;
  }
  if (kind === "single") return `${d} goes in ${where(c)}: every other digit is already in its row, column or box.`;
  if (kind === "hidden") return `${d} goes in ${where(c)}: it is the only place left for a ${d} in ${unitName(unit)}.`;
  return `${d} goes in ${where(c)}. That takes more than one step to see, so it comes from the answer.`;
}

/* ---- state ---- */

function isSolved() {
  return s.stage === "solve" && s.values.every((d, c) => d === solution[c]);
}

function canEdit() {
  return s.stage === "enter" || !isSolved();
}

// Digits the person put in that are not the answer's.
function wrongCells() {
  const out = new Set();
  if (s.stage !== "solve") return out;
  for (let c = 0; c < 81; c++) if (!s.clues[c] && s.values[c] && s.values[c] !== solution[c]) out.add(c);
  return out;
}

// Puts a new grid in this stage, undoably.
function change(next) {
  history.push(grid().slice());
  if (s.stage === "enter") s.clues = next;
  else s.values = next;
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

/* ---- actions ---- */

function selectCell(c, { focus = false } = {}) {
  if (!canEdit()) return;
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
  if (!canEdit() || selected == null || (s.stage === "solve" && s.clues[selected]) || !grid()[selected]) return;
  const next = grid().slice();
  next[selected] = 0;
  change(next);
  render();
}

function undo() {
  if (!history.length) return;
  if (s.stage === "enter") s.clues = history.pop();
  else s.values = history.pop();
  checked = false;
  pending = null;
  mark = null;
  note = "";
  save();
  render();
}

function clearAll() {
  if (s.stage !== "enter" || !s.clues.some(Boolean)) return;
  change(empty());
  selected = null;
  say("Cleared. Undo brings it back.");
}

function pasteText(text) {
  if (s.stage !== "enter") return say("Tap Edit puzzle first to paste in a different one.");
  const next = parseGrid(text);
  if (!next) return say("That paste is not a puzzle. It needs 81 cells in reading order: digits for clues, and 0 or . for blanks.");
  change(next);
  selected = null;
  say(`Pasted ${plural(next.filter(Boolean).length, "clue")}. Check them against the original, then tap Help me solve it.`);
}

// The clues, in the same form Paste takes.
async function onCopy() {
  if (!s.clues.some(Boolean)) return;
  const ok = await copyText(puzzleText(s.clues));
  $("solverCopyLabel").textContent = ok ? "Copied" : "Copy failed";
  setTimeout(() => ($("solverCopyLabel").textContent = "Copy puzzle"), 1500);
}

// The clues as a PNG, to print or send.
async function onImage() {
  if (!s.clues.some(Boolean)) return;
  let ok = false;
  try {
    ok = await savePuzzleImage(s.clues, "sudoku-puzzle.png");
  } catch {
    ok = false;
  }
  $("solverImageLabel").textContent = ok ? "Saved" : "Save failed";
  setTimeout(() => ($("solverImageLabel").textContent = "Save image"), 1500);
}

async function onPasteBtn() {
  try {
    pasteText(await navigator.clipboard.readText());
  } catch {
    say("The browser would not share the clipboard. Press Ctrl+V instead, or type the digits in.");
  }
}

// From typing the clues to solving: only a puzzle with one answer.
function onGo() {
  const n = s.clues.filter(Boolean).length;
  if (!n) return say("Type in the puzzle's digits first.");
  if (clashes(s.clues).size) return say("The red digits clash: the same digit twice in a row, column or box. Fix them first.");
  if (n < MIN_CLUES) return say(`A sudoku needs at least ${MIN_CLUES} clues to have only one answer, and this has ${n}. Check for missing ones.`);
  const count = countSolutions(s.clues, 2);
  if (count === 0) return say("This puzzle has no answer, so a digit is probably mistyped. Check it against the original.");
  if (count > 1) return say("This puzzle has more than one answer, so a clue is probably missing or wrong. Check it against the original.");
  solution = solve(s.clues);
  s.stage = "solve";
  s.values = s.clues.slice();
  history = [];
  selected = null;
  padDigit = 0;
  checked = false;
  pending = null;
  mark = null;
  save();
  say("It has one answer. Fill it in here, and tap Hint whenever you are stuck.");
}

function disarmEdit() {
  clearTimeout(editTimer);
  editTimer = null;
  $("solverEdit").classList.remove("armed");
  $("solverEditLabel").textContent = "Edit puzzle";
}

// Back to the clues. Digits already filled in ask for a second tap.
function onEdit() {
  const progress = s.values.some((d, c) => d && !s.clues[c]);
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
  history = [];
  checked = false;
  pending = null;
  mark = null;
  save();
  say("Change the clues, then tap Help me solve it again.");
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
  const cand = candidates(s.values);
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
  pending = nextStep(s.values, selected) ?? easiest();
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

/* ---- drawing ---- */

function defaultStatus() {
  if (s.stage === "enter") {
    const n = s.clues.filter(Boolean).length;
    if (clashes(s.clues).size) return "The red digits clash: the same digit twice in a row, column or box.";
    if (!n) return "Pick the first cell and type the puzzle row by row, 0 or . for a blank. Or paste in the whole puzzle.";
    return `${plural(n, "clue")} so far. Tap Help me solve it when they are all in.`;
  }
  if (isSolved()) return "Solved. Every digit is right.";
  if (clashes(s.values).size) return "The red digits clash: the same digit twice in a row, column or box.";
  return `${plural(s.values.filter((d) => !d).length, "cell")} to go. Stuck? Tap Hint.`;
}

function render() {
  if (!board) return;
  const enter = s.stage === "enter";
  const g = grid();
  const solved = isSolved();
  const settings = getSettings();
  const wrong = clashes(g);
  if (checked) for (const c of wrongCells()) wrong.add(c);

  board.set({
    // While the clues go in they are drawn as clues.
    puzzle: enter ? g : s.clues,
    solution: enter ? g : solution,
    values: g,
    notes: !enter && s.candidates && !solved ? candidates(g) : empty(),
    selected,
    interactive: canEdit(),
    highlightSame: settings.highlight_same,
    highlightPeers: settings.highlight_peers,
    focusDigit: padDigit,
    mark,
    wrong,
  });

  $("solverTitle").textContent = enter ? "Type in a puzzle" : "Solve it";
  $("solverStatus").textContent = note || defaultStatus();

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

  for (const id of ["solverPaste", "solverClear", "solverGo"]) $(id).classList.toggle("hidden", !enter);
  for (const id of ["solverCheck", "solverHint", "solverSolve", "solverEdit"]) $(id).classList.toggle("hidden", enter);
  $("solverCands").classList.toggle("hidden", enter || solved);
  $("solverUndo").disabled = !history.length;
  $("solverErase").disabled = !canEdit();
  $("solverClear").disabled = !s.clues.some(Boolean);
  $("solverCopy").disabled = !s.clues.some(Boolean);
  $("solverImage").disabled = !s.clues.some(Boolean);
  for (const id of ["solverCheck", "solverHint", "solverSolve"]) $(id).disabled = solved;
  $("solverHintLabel").textContent = pending ? "Show it" : "Hint";
  $("solverCands").setAttribute("aria-pressed", String(s.candidates));
  $("solverCandsLabel").textContent = s.candidates ? "Hide candidates" : "Show candidates";
}

/* ---- in and out ---- */

export function openSolver() {
  s.open = true;
  save();
  selected = null;
  padDigit = 0;
  note = "";
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
  if (/^[1-9]$/.test(e.key)) inputDigit(Number(e.key));
  else if (s.stage === "enter" && (e.key === "0" || e.key === ".")) blank();
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
  else if (e.key.startsWith("Arrow") && selected == null && canEdit()) selectCell(40, { focus: true });
  else return;
  e.preventDefault();
}

// reopen: go back into the solver if it was open when the page was left.
export function initSolver({ reopen = true } = {}) {
  board = new BoardView($("solverBoard"), { onSelect: selectCell });
  load();

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
  $("solverCands").addEventListener("click", toggleCandidates);
  $("solverCopy").addEventListener("click", onCopy);
  $("solverImage").addEventListener("click", onImage);
  $("solverEdit").addEventListener("click", onEdit);
  $("solverBack").addEventListener("click", closeSolver);
  document.addEventListener("keydown", onKey);
  document.addEventListener("paste", (e) => {
    if ($("solver").classList.contains("hidden") || e.target.closest?.("input, textarea")) return;
    e.preventDefault();
    pasteText(e.clipboardData?.getData("text"));
  });
  onSettingsChange(render);

  if (reopen && s.open && !$("setup").classList.contains("hidden")) openSolver();
}
