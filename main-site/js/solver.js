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
// bulb, then each next cell, Add thermo); Arrow adds arrows, drawn the same
// way with the Arrows tool, from the circle; Whispers, Renban, Palindrome,
// Zipper, Between, Lockout, Entropic and Modular add German Whispers,
// renban, palindrome, zipper, between, lockout, entropic and modular lines,
// drawn the same way again with their own tools, a between line from one circle to the other and a lockout line from
// one diamond to the other;
// Kropki and XV add dots and X and V marks on the sides between cells, put
// down with the Marks tool; Sandwich, Little Killer, Skyscrapers and
// X-Sums add clues outside the grid, put down with the Outside tool in a
// margin the board leaves for them; Jigsaw puts regions in the boxes'
// place, cut with the Regions tool; and Diagonal, Anti-knight, Anti-king and Windoku add their
// rules (variant.js). Every check, hint and candidate then follows them
// too.
//
// Either can open a seed, from the new-game screen, a made puzzle's board or
// Copy seed: its puzzle goes in to change, check again for a new seed, or
// save as an image. A made seed brings its rules and everything drawn on it.
//
// Nothing here is scored or leaves the browser, until a made puzzle is
// played as a game.

import { ROW, COL, BOX } from "./sudoku.js";
import { clashes, candidates, nextStep, bitCount, parseGrid, puzzleText, checkClues, rateLevel, MIN_CLUES } from "./steps.js";
import { madeSeed, parseSeed, puzzleFor } from "./seed.js";
import {
  cageProblem,
  cageOf,
  thermoProblem,
  arrowProblem,
  whisperProblem,
  renbanProblem,
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  entropicProblem,
  modularProblem,
  LOCKOUT_GAP,
  dotProblem,
  xvProblem,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  regionProblem,
  diagonalFrom,
  SANDWICH_MAX,
  DOT_MARKS,
  XV_MARKS,
  touching,
  beside,
  RULES,
  ALL_RULES,
  variantName,
} from "./variant.js";
import { LEVELS } from "./levels.js";
import { BoardView } from "./board.js";
import { getSettings, onSettingsChange } from "./settings.js";
import { showPanel, renderSetup, launch } from "./game.js";
import { store, copyText, hydrateIcons, fillRuleHelp } from "./ui.js";
import { RULE_HELP, rulesOf } from "./rule-help.js";
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
// killer, thermo, arrow, whisper, renban, palindrome, zipper, between,
// lockout, entropic, modular, kropki, xv, sandwich, little, skyscraper, xsum, jigsaw and rules
// are the variant's switches; cages are kept while Killer is off, for
// when it comes back on, and each kind of line, dot, mark and outside clue
// likewise.
const fresh = () => ({
  open: false,
  stage: "enter",
  clues: empty(),
  values: empty(),
  candidates: false,
  killer: false,
  thermo: false,
  arrow: false,
  whisper: false,
  renban: false,
  palindrome: false,
  zipper: false,
  between: false,
  lockout: false,
  entropic: false,
  modular: false,
  kropki: false,
  xv: false,
  sandwich: false,
  little: false,
  skyscraper: false,
  xsum: false,
  jigsaw: false,
  rules: 0,
  cages: [],
  thermos: [],
  arrows: [],
  whispers: [],
  renbans: [],
  palindromes: [],
  zippers: [],
  betweens: [],
  lockouts: [],
  entropics: [],
  modulars: [],
  dots: [],
  xvs: [],
  sandwiches: [],
  littles: [],
  skyscrapers: [],
  xsums: [],
  // A Jigsaw's regions, from the boxes until the maker cuts them.
  regions: Array.from(BOX),
});
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
// The Thermos, Arrows or another line tool, likewise: which is on, a key of
// LINES below, the path so far from its first cell, and the line
// being changed.
let lineKind = null;
let path = [];
let editingLine = -1;
// The Marks tool: on, and the cell picked for a mark on one of its sides.
let markMode = false;
let anchor = null;
// The Outside tool: on, the margin spot [r, c] picked, and which of the
// clues it can take is chosen (spotKinds below).
let outMode = false;
let spot = null;
let choice = 0;
// The Regions tool: on, and the region cells tapped go into, if one is
// picked.
let regionMode = false;
let brush = null;
let selected = null;
let padDigit = 0;
let checked = false; // Check was pressed, and nothing has changed since
let pending = null; // a hint pointed at but not yet shown
let mark = null; // the cell a hint just filled
let note = ""; // says what just happened, until the next change
let seedNote = ""; // why the Open a seed box's seed did not open
let editTimer = null;

const creating = () => mode === "create";
// The grid this stage edits.
const grid = () => (s.stage === "solve" ? s.values : s.clues);
const goLabel = () => (creating() ? "Check it" : "Help me solve it");
const killer = () => s.killer;
// The cages the rules use: none with Killer off, even if some are kept.
const cages = () => (killer() && s.cages.length ? s.cages : null);
const thermos = () => (s.thermo && s.thermos.length ? s.thermos : null);
const arrows = () => (s.arrow && s.arrows.length ? s.arrows : null);
const whispers = () => (s.whisper && s.whispers.length ? s.whispers : null);
const renbans = () => (s.renban && s.renbans.length ? s.renbans : null);
const palindromes = () => (s.palindrome && s.palindromes.length ? s.palindromes : null);
const zippers = () => (s.zipper && s.zippers.length ? s.zippers : null);
const betweens = () => (s.between && s.betweens.length ? s.betweens : null);
const lockouts = () => (s.lockout && s.lockouts.length ? s.lockouts : null);
const entropics = () => (s.entropic && s.entropics.length ? s.entropics : null);
const modulars = () => (s.modular && s.modulars.length ? s.modulars : null);
const dots = () => (s.kropki && s.dots.length ? s.dots : null);
const xvs = () => (s.xv && s.xvs.length ? s.xvs : null);
const sandwiches = () => (s.sandwich && s.sandwiches.length ? s.sandwiches : null);
const littles = () => (s.little && s.littles.length ? s.littles : null);
const skyscrapers = () => (s.skyscraper && s.skyscrapers.length ? s.skyscrapers : null);
const xsums = () => (s.xsum && s.xsums.length ? s.xsums : null);
const regions = () => (s.jigsaw ? s.regions : null);
const drawn = () =>
  Boolean(cages() || thermos() || arrows() || whispers() || renbans() || palindromes() || zippers() || betweens() || lockouts() || entropics() || modulars() || dots() || xvs() || sandwiches() || littles() || skyscrapers() || xsums());
// The variant, for steps.js and variant.js, or null for a classic puzzle.
const variant = () =>
  drawn() || s.rules || regions()
    ? {
        cages: cages() ?? [],
        thermos: thermos() ?? [],
        arrows: arrows() ?? [],
        whispers: whispers() ?? [],
        renbans: renbans() ?? [],
        palindromes: palindromes() ?? [],
        zippers: zippers() ?? [],
        betweens: betweens() ?? [],
        lockouts: lockouts() ?? [],
        entropics: entropics() ?? [],
        modulars: modulars() ?? [],
        dots: dots() ?? [],
        xvs: xvs() ?? [],
        sandwiches: sandwiches() ?? [],
        littles: littles() ?? [],
        skyscrapers: skyscrapers() ?? [],
        xsums: xsums() ?? [],
        regions: regions(),
        rules: s.rules,
      }
    : null;

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
  for (const [kind, P] of [...Object.entries(LINES), ...Object.entries(EDGES), ...Object.entries(OUTSIDE)]) {
    st[kind] = saved[kind] === true;
    const kept = Array.isArray(saved[P.list]) ? saved[P.list] : [];
    st[P.list] = !P.problem(kept) ? kept : [];
  }
  const kept = Array.isArray(saved.cages) ? saved.cages : [];
  st.cages = kept.every((k) => k && Array.isArray(k.cells)) && !cageProblem(kept) ? kept : [];
  // Regions part way through cutting may be uneven, so only their shape is
  // checked.
  st.jigsaw = saved.jigsaw === true;
  const cut = saved.regions;
  st.regions = Array.isArray(cut) && cut.length === 81 && cut.every((r) => Number.isInteger(r) && r >= 0 && r <= 8) ? cut : Array.from(BOX);
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
  if (u.kind === "region") return `the region holding ${where(u.cells[0])}`;
  if (u.kind === "diagonal") return `the diagonal from the top ${u.index ? "right" : "left"}`;
  if (u.kind === "window") return `the ${WINDOW_NAMES[u.index]} window`;
  if (u.kind === "group") return `the ${BOX_NAMES[u.index]} cells of the boxes`;
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
    const parts = [
      "row",
      "column",
      regions() ? "region" : "box",
      ...(cages() ? ["cage"] : []),
      ...(thermos() ? ["thermometers"] : []),
      ...(arrows() ? ["arrows"] : []),
      ...(whispers() ? ["whisper lines"] : []),
      ...(renbans() ? ["renban lines"] : []),
      ...(palindromes() ? ["palindrome lines"] : []),
      ...(zippers() ? ["zipper lines"] : []),
      ...(betweens() ? ["between lines"] : []),
      ...(lockouts() ? ["lockout lines"] : []),
      ...(entropics() ? ["entropic lines"] : []),
      ...(modulars() ? ["modular lines"] : []),
      ...(dots() ? ["dots"] : []),
      ...(xvs() ? ["X and V marks"] : []),
      ...(sandwiches() ? ["Sandwich sums"] : []),
      ...(littles() ? ["Little Killer sums"] : []),
      ...(skyscrapers() ? ["Skyscraper counts"] : []),
      ...(xsums() ? ["X-Sums"] : []),
    ];
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
  if (why === "arrows") return ARROW_PROBLEMS[check.problem.why];
  if (why === "whispers") return WHISPER_PROBLEMS[check.problem.why];
  if (why === "renbans") return RENBAN_PROBLEMS[check.problem.why];
  if (why === "palindromes") return PALINDROME_PROBLEMS[check.problem.why];
  if (why === "zippers") return ZIPPER_PROBLEMS[check.problem.why];
  if (why === "betweens") return BETWEEN_PROBLEMS[check.problem.why];
  if (why === "lockouts") return LOCKOUT_PROBLEMS[check.problem.why];
  if (why === "entropics") return ENTROPIC_PROBLEMS[check.problem.why];
  if (why === "modulars") return MODULAR_PROBLEMS[check.problem.why];
  if (why === "dots") return DOT_PROBLEMS[check.problem.why];
  if (why === "xvs") return XV_PROBLEMS[check.problem.why];
  if (why === "sandwiches") return SANDWICH_PROBLEMS[check.problem.why];
  if (why === "littles") return LITTLE_PROBLEMS[check.problem.why];
  if (why === "skyscrapers") return SKYSCRAPER_PROBLEMS[check.problem.why];
  if (why === "xsums") return XSUM_PROBLEMS[check.problem.why];
  if (why === "regions") return regionText(check.problem);
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
  if (arrows()) extra.push("not adding up to an arrow's circle");
  if (whispers()) extra.push("less than 5 apart next to each other on a whisper line");
  if (renbans()) extra.push("repeating or leaving a gap on a renban line");
  if (palindromes()) extra.push("not the same from either end of a palindrome line");
  if (zippers()) extra.push("not making a zipper line's total");
  if (betweens()) extra.push("not between a between line's circles");
  if (lockouts()) extra.push(`not outside a lockout line's diamonds, or diamonds less than ${LOCKOUT_GAP} apart`);
  if (entropics()) extra.push("not one low, one middle and one high in three cells in a row on an entropic line");
  if (modulars()) extra.push("not one each of 1 4 7, 2 5 8 and 3 6 9 in three cells in a row on a modular line");
  if (dots()) extra.push("breaking a dot");
  if (xvs()) extra.push("not adding up to an X or a V");
  if (sandwiches()) extra.push("not adding up to a Sandwich sum between a 1 and a 9");
  if (littles()) extra.push("not adding up to a Little Killer sum");
  if (skyscrapers()) extra.push("showing more or fewer than a Skyscraper count");
  if (xsums()) extra.push("not adding up to an X-Sum");
  return `The red digits clash: the same digit twice in a row, column or ${regions() ? "region" : "box"}${extra.length ? `, ${extra.join(", or ")}` : ""}.`;
}

const THERMO_PROBLEMS = {
  count: "There is room for forty thermometers.",
  length: "A thermometer needs two to nine cells.",
  cell: "A thermometer has a cell off the board.",
  loop: "A thermometer cannot cross itself.",
  apart: "Each cell of a thermometer must touch the one before it.",
};

const ARROW_PROBLEMS = {
  count: "There is room for forty arrows.",
  length: "An arrow needs two to nine cells, its circle included.",
  cell: "An arrow has a cell off the board.",
  loop: "An arrow cannot cross itself.",
  apart: "Each cell of an arrow must touch the one before it.",
};

const WHISPER_PROBLEMS = {
  count: "There is room for forty whisper lines.",
  length: "A whisper line needs two to nine cells.",
  cell: "A whisper line has a cell off the board.",
  loop: "A whisper line cannot cross itself.",
  apart: "Each cell of a whisper line must touch the one before it.",
};

const RENBAN_PROBLEMS = {
  count: "There is room for forty renban lines.",
  length: "A renban line needs two to nine cells.",
  cell: "A renban line has a cell off the board.",
  loop: "A renban line cannot cross itself.",
  apart: "Each cell of a renban line must touch the one before it.",
};

const PALINDROME_PROBLEMS = {
  count: "There is room for forty palindrome lines.",
  length: "A palindrome line needs two to nine cells.",
  cell: "A palindrome line has a cell off the board.",
  loop: "A palindrome line cannot cross itself.",
  apart: "Each cell of a palindrome line must touch the one before it.",
};

const ZIPPER_PROBLEMS = {
  count: "There is room for forty zipper lines.",
  length: "A zipper line needs two to nine cells.",
  cell: "A zipper line has a cell off the board.",
  loop: "A zipper line cannot cross itself.",
  apart: "Each cell of a zipper line must touch the one before it.",
};

const BETWEEN_PROBLEMS = {
  count: "There is room for forty between lines.",
  length: "A between line needs two to nine cells, its circles included.",
  cell: "A between line has a cell off the board.",
  loop: "A between line cannot cross itself.",
  apart: "Each cell of a between line must touch the one before it.",
};

const LOCKOUT_PROBLEMS = {
  count: "There is room for forty lockout lines.",
  length: "A lockout line needs two to nine cells, its diamonds included.",
  cell: "A lockout line has a cell off the board.",
  loop: "A lockout line cannot cross itself.",
  apart: "Each cell of a lockout line must touch the one before it.",
};

const ENTROPIC_PROBLEMS = {
  count: "There is room for forty entropic lines.",
  length: "An entropic line needs three to nine cells.",
  cell: "An entropic line has a cell off the board.",
  loop: "An entropic line cannot cross itself.",
  apart: "Each cell of an entropic line must touch the one before it.",
};

const MODULAR_PROBLEMS = {
  count: "There is room for forty modular lines.",
  length: "A modular line needs three to nine cells.",
  cell: "A modular line has a cell off the board.",
  loop: "A modular line cannot cross itself.",
  apart: "Each cell of a modular line must touch the one before it.",
};

const DOT_PROBLEMS = {
  cell: "A dot has a cell off the board.",
  apart: "A dot must sit on the side two cells share.",
  mark: "A dot must be white or black.",
  twice: "Two dots sit on the same side.",
};

const SANDWICH_PROBLEMS = {
  line: "A Sandwich sum goes left of a row or above a column.",
  sum: `A Sandwich sum is 0 to ${SANDWICH_MAX}: the digits 2 to 8 add up to ${SANDWICH_MAX} at most.`,
  twice: "That row or column has a Sandwich sum already.",
};

const LITTLE_PROBLEMS = {
  cell: "A Little Killer sum needs a diagonal of two cells at least.",
  diagonal: "A Little Killer sum's diagonal runs from the edge it sits by to the far edge.",
  sum: "That diagonal cannot add up to that: each of its cells holds 1 to 9.",
  twice: "Two Little Killer sums point down the same diagonal from the same end.",
};

const SKYSCRAPER_PROBLEMS = {
  view: "A Skyscraper count goes beside a row or a column.",
  count: "A Skyscraper count is 1 to 9.",
  twice: "That side of that row or column has a count already.",
};

const XSUM_PROBLEMS = {
  view: "An X-Sum goes beside a row or a column.",
  sum: "An X-Sum is 1 to 45.",
  twice: "That side of that row or column has an X-Sum already.",
};

// What is wrong with a Jigsaw's regions, from regionProblem, naming each
// region by its first cell.
function regionText({ why, region, size }) {
  const first = s.regions.indexOf(region);
  const which = first >= 0 ? `the one holding ${where(first)}` : "one";
  if (why === "size") return `Each region needs nine cells, and ${which} has ${size}. Tap Regions to move cells between them.`;
  if (why === "apart") return `A region's cells must join up edge to edge, and ${which} is in pieces. Tap Regions to join it up.`;
  return "The regions are not set out right. Tap Regions, then Back to boxes, to start them again.";
}

const XV_PROBLEMS = {
  cell: "An X or a V has a cell off the board.",
  apart: "An X or a V must sit on the side two cells share.",
  mark: "A mark must be an X or a V.",
  twice: "Two marks sit on the same side.",
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

// The lists of drawn parts: "cages", then LINES's lists and EDGES's.
const partLists = () => ["cages", "regions", ...[LINES, EDGES, OUTSIDE].flatMap((table) => Object.values(table).map((P) => P.list))];

const snapshot = () => {
  const out = { clues: s.clues.slice(), values: s.values.slice() };
  for (const list of partLists()) out[list] = s[list].slice();
  return out;
};

// Puts a new grid in this stage, and any of new { cages, thermos, ... } as
// partLists names them, undoably.
function change(next, parts = {}) {
  history.push(snapshot());
  if (s.stage === "solve") s.values = next;
  else s.clues = next;
  for (const list of partLists()) if (parts[list]) s[list] = parts[list];
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

// at: where in the cell a pointer tapped, for the Marks tool (board.js).
function selectCell(c, { focus = false, at = null } = {}) {
  if (!canEdit()) return;
  if (cageMode) return pickCell(c);
  if (lineKind) return pickLineCell(c);
  if (markMode) return pickMarkSide(c, at);
  if (outMode) return say("Clues outside go round the edge of the grid: tap a spot there, or Done.");
  if (regionMode) return pickRegionCell(c);
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
  if (lineKind) {
    const L = LINES[lineKind];
    return say(`Digits wait until the ${L.name} is done: tap its cells, ${L.start} first, then ${addLabel()}.`);
  }
  if (markMode) return say("Digits wait until the marks are done: tap Done first.");
  if (outMode) return typeOutSum(String(d));
  if (regionMode) return say("Digits wait until the regions are done: tap Done first.");
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
  if (lineKind) return stepBack();
  if (markMode) return;
  if (outMode) return typeOutSum("back");
  if (regionMode) return;
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
  for (const list of partLists()) s[list] = back[list];
  clearPicked();
  anchor = null;
  clearSpot();
  brush = null;
  path = [];
  editingLine = -1;
  checked = false;
  pending = null;
  mark = null;
  note = "";
  save();
  render();
}

function clearAll() {
  if (s.stage !== "enter" || (!s.clues.some(Boolean) && !drawn())) return;
  endCage();
  // Only what the rules on use: the rest is kept for when they come back.
  const parts = { cages: killer() ? [] : s.cages };
  for (const [kind, P] of [...Object.entries(LINES), ...Object.entries(EDGES), ...Object.entries(OUTSIDE)]) parts[P.list] = s[kind] ? [] : s[P.list];
  parts.regions = s.jigsaw ? Array.from(BOX) : s.regions;
  change(empty(), parts);
  selected = null;
  say("Cleared. Undo brings it back.");
}

// Puts a seed's puzzle in, undoably: a made one's clues, rules and
// everything drawn on it, or a generated one's clues. Every rule is switched
// to what the seed has, so a classic seed turns them all off; what the rules
// switched off had drawn is kept for when they come back. `how` starts the
// note, "Pasted" or "Opened".
function openSeed(found, how) {
  endCage();
  const seed = found.made ? found : madeSeed(found.level, puzzleFor(found).puzzle);
  s.killer = Boolean(seed.cages);
  s.rules = seed.rules ?? 0;
  const parts = { cages: seed.cages ? seed.cages.map((k) => ({ sum: k.sum, cells: k.cells.slice() })) : s.cages };
  for (const [kind, L] of Object.entries(LINES)) {
    s[kind] = Boolean(seed[L.list]);
    parts[L.list] = seed[L.list] ? seed[L.list].map((t) => t.slice()) : s[L.list];
  }
  for (const [kind, E] of Object.entries(EDGES)) {
    s[kind] = Boolean(seed[E.list]);
    parts[E.list] = seed[E.list] ? seed[E.list].map((e) => ({ cells: e.cells.slice(), mark: e.mark })) : s[E.list];
  }
  for (const [kind, O] of Object.entries(OUTSIDE)) {
    s[kind] = Boolean(seed[O.list]);
    parts[O.list] = seed[O.list] ? seed[O.list].map((o) => ({ ...o, ...(o.cells ? { cells: o.cells.slice() } : {}) })) : s[O.list];
  }
  s.jigsaw = Boolean(seed.regions);
  parts.regions = seed.regions ? seed.regions.slice() : s.regions;
  change(seed.grid.slice(), parts);
  selected = null;
  const name = variantName(seed);
  const what = found.made ? `a made ${name ? `${name} ` : ""}puzzle` : `seed ${found.text}'s puzzle`;
  const next = creating() ? "Change it and tap Check it for its new seed" : `Tap ${goLabel()} when ready`;
  say(`${how} ${what}. ${next}, or Save image to download it. Undo takes it back.`);
}

function pasteText(text) {
  if (s.stage !== "enter") return say("Tap Edit puzzle first to paste in a different one.");
  // A seed brings its puzzle, and a made one its rules and drawn parts.
  const seed = parseGrid(text) ? null : parseSeed(text);
  if (seed) return openSeed(seed, "Pasted");
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
  if (!s.clues.some(Boolean) && !drawn()) return;
  let ok = false;
  try {
    ok = await savePuzzleImage(s.clues, "sudoku-puzzle.png", variant());
  } catch {
    ok = false;
  }
  flash("solverImageLabel", ok ? "Saved" : "Save failed", "Save image");
}

// The Open a seed box.
function onSeedOpen() {
  const box = $("solverSeedInput");
  const text = box.value.trim();
  if (s.stage !== "enter") return;
  if (!text) {
    seedNote = "Type or paste a seed first, such as one from Copy seed.";
    return render();
  }
  const seed = parseSeed(text);
  if (!seed) {
    seedNote = "That is not a seed, or not one with a single answer. Seeds look like H-BXK4-M9TR; a made puzzle's are longer.";
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    return render();
  }
  box.value = "";
  seedNote = "";
  openSeed(seed, "Opened");
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
  if (s.arrow && !s.arrows.length) return say("Draw an arrow first: tap Arrows, then the circle and each cell along it.");
  if (s.whisper && !s.whispers.length) return say("Draw a whisper line first: tap Whispers, then each cell along it.");
  if (s.renban && !s.renbans.length) return say("Draw a renban line first: tap Renbans, then each cell along it.");
  if (s.palindrome && !s.palindromes.length) return say("Draw a palindrome line first: tap Palindromes, then each cell along it.");
  if (s.zipper && !s.zippers.length) return say("Draw a zipper line first: tap Zippers, then each cell along it.");
  if (s.between && !s.betweens.length) return say("Draw a between line first: tap Betweens, then a circle, each cell along it, and the other circle.");
  if (s.lockout && !s.lockouts.length) return say("Draw a lockout line first: tap Lockouts, then a diamond, each cell along it, and the other diamond.");
  if (s.entropic && !s.entropics.length) return say("Draw an entropic line first: tap Entropics, then each cell along it.");
  if (s.modular && !s.modulars.length) return say("Draw a modular line first: tap Modulars, then each cell along it.");
  if (s.kropki && !s.dots.length) return say("Put a dot down first: tap Marks, then near the side between two cells.");
  if (s.xv && !s.xvs.length) return say("Put an X or a V down first: tap Marks, then near the side between two cells.");
  if (s.sandwich && !s.sandwiches.length) return say("Put a Sandwich sum down first: tap Outside, then a spot left of a row or above a column.");
  if (s.little && !s.littles.length) return say("Put a Little Killer sum down first: tap Outside, then a spot round the edge.");
  if (s.skyscraper && !s.skyscrapers.length) return say("Put a Skyscraper count down first: tap Outside, then a spot beside a row or column.");
  if (s.xsum && !s.xsums.length) return say("Put an X-Sum down first: tap Outside, then a spot beside a row or column.");
  if (s.jigsaw && boxesStill()) return say("Cut the regions first: tap Regions, then a cell to pick its region, then cells to move into it.");
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
  const what = name ? `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} puzzle with ${made.cages ? `${plural(made.cages.length, "cage")} and ` : ""}${clues}` : `with ${clues}`;
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

// A rule button's key: killer, jigsaw, a key of LINES, EDGES or OUTSIDE, all
// switches in a stage's state, or one of RULES by key, a bit of s.rules.
const isSwitch = (key) => key === "killer" || key === "jigsaw" || key in LINES || key in EDGES || key in OUTSIDE;
const ruleOn = (key) => (isSwitch(key) ? s[key] : Boolean(s.rules & RULES.find((r) => r.key === key).bit));

function toggleRule(key) {
  if (s.stage !== "enter") return;
  endCage();
  if (isSwitch(key)) s[key] = !s[key];
  else s.rules ^= RULES.find((r) => r.key === key).bit;
  save();
  note = "";
  render();
}

function toggleCageMode() {
  if (cageMode) return endCage(true);
  endLine();
  endMarks();
  endOutside();
  endRegions();
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

// Leaves the Cages tool, and any line tool or the Marks tool with it; `draw`
// to show it at once.
function endCage(draw = false) {
  cageMode = false;
  clearPicked();
  endLine();
  endMarks();
  endOutside();
  endRegions();
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
  change(s.clues, { cages: next.sort((a, b) => a.cells[0] - b.cells[0]) });
  clearPicked();
  say(`Cage of ${plural(cells.length, "cell")} adding to ${sum}. Tap the cells of the next one.`);
}

function onCageRemove() {
  if (editing < 0) return;
  change(s.clues, { cages: s.cages.filter((_, i) => i !== editing) });
  clearPicked();
  say("Cage removed. Undo brings it back.");
}

/* ---- thermometers, arrows and the other lines ---- */

// The line tools all draw alike, a path from its first cell; they differ in
// words, and in where their lines are kept. Each key is also the name of the
// rule's switch in a stage's state.
const LINES = {
  thermo: {
    list: "thermos",
    short: "thermo",
    name: "thermometer",
    title: "Thermometer",
    a: "A thermometer",
    start: "bulb",
    started: "Bulb placed. Tap the next cell: digits rise from the bulb.",
    problem: thermoProblem,
    problems: THERMO_PROBLEMS,
  },
  arrow: {
    list: "arrows",
    short: "arrow",
    name: "arrow",
    title: "Arrow",
    a: "An arrow",
    start: "circle",
    started: "Circle placed. Tap the next cell: the digits along the arrow add up to the circle's.",
    problem: arrowProblem,
    problems: ARROW_PROBLEMS,
  },
  whisper: {
    list: "whispers",
    short: "whisper",
    name: "whisper line",
    title: "Whisper line",
    a: "A whisper line",
    start: "end",
    started: "One end placed. Tap the next cell: digits next to each other on the line differ by at least 5.",
    problem: whisperProblem,
    problems: WHISPER_PROBLEMS,
  },
  renban: {
    list: "renbans",
    short: "renban",
    name: "renban line",
    title: "Renban line",
    a: "A renban line",
    start: "end",
    started: "One end placed. Tap the next cell: the line's digits are a run, like 3 4 5, in any order.",
    problem: renbanProblem,
    problems: RENBAN_PROBLEMS,
  },
  palindrome: {
    list: "palindromes",
    short: "palindrome",
    name: "palindrome line",
    title: "Palindrome line",
    a: "A palindrome line",
    start: "end",
    started: "One end placed. Tap the next cell: the line's digits read the same from either end.",
    problem: palindromeProblem,
    problems: PALINDROME_PROBLEMS,
  },
  zipper: {
    list: "zippers",
    short: "zipper",
    name: "zipper line",
    title: "Zipper line",
    a: "A zipper line",
    start: "end",
    started: "One end placed. Tap the next cell: cells the same way in from each end add up to the same total, and a middle cell is that total.",
    problem: zipperProblem,
    problems: ZIPPER_PROBLEMS,
  },
  between: {
    list: "betweens",
    short: "between",
    name: "between line",
    title: "Between line",
    a: "A between line",
    start: "circle",
    started: "One circle placed. Tap each next cell; the last one is the other circle. Digits along the line lie between the circles'.",
    problem: betweenProblem,
    problems: BETWEEN_PROBLEMS,
  },
  lockout: {
    list: "lockouts",
    short: "lockout",
    name: "lockout line",
    title: "Lockout line",
    a: "A lockout line",
    start: "diamond",
    started: `One diamond placed. Tap each next cell; the last one is the other diamond. The diamonds differ by ${LOCKOUT_GAP} or more, and digits along the line lie outside them.`,
    problem: lockoutProblem,
    problems: LOCKOUT_PROBLEMS,
  },
  entropic: {
    list: "entropics",
    short: "entropic",
    name: "entropic line",
    title: "Entropic line",
    a: "An entropic line",
    start: "end",
    least: 3,
    started: "One end placed. Tap the next cell: any three in a row hold one of 1 to 3, one of 4 to 6 and one of 7 to 9.",
    problem: entropicProblem,
    problems: ENTROPIC_PROBLEMS,
  },
  modular: {
    list: "modulars",
    short: "modular",
    name: "modular line",
    title: "Modular line",
    a: "A modular line",
    start: "end",
    least: 3,
    started: "One end placed. Tap the next cell: any three in a row hold one each of 1 4 7, 2 5 8 and 3 6 9.",
    problem: modularProblem,
    problems: MODULAR_PROBLEMS,
  },
};

const addLabel = () => `${editingLine >= 0 ? "Change" : "Add"} ${LINES[lineKind].short}`;

// kind: a key of LINES.
function toggleLineMode(kind) {
  if (lineKind === kind) return endCage(true);
  endCage();
  lineKind = kind;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// Leaves the line tool, dropping any path not added.
function endLine() {
  lineKind = null;
  path = [];
  editingLine = -1;
}

// A tap in a line tool: with no path, a cell of a line picks it up, and
// then its first cell starts another line there, for lines that share a
// bulb, a circle or an end; the path's last cell takes that step back;
// otherwise the cell is the next step, if it touches the last.
function pickLineCell(c) {
  const L = LINES[lineKind];
  const lines = s[L.list];
  if (!path.length) {
    const i = lines.findIndex((t) => t.includes(c));
    if (i >= 0) {
      editingLine = i;
      path = lines[i].slice();
      note = "";
      return render();
    }
  }
  if (editingLine >= 0 && c === path[0]) {
    editingLine = -1;
    path = [c];
    note = "";
    return render();
  }
  if (c === path.at(-1)) return stepBack();
  if (path.includes(c)) return say(L.problems.loop);
  if (path.length && !touching(path.at(-1), c)) return say("The next cell must touch the last one, along a side or at a corner.");
  if (path.length === 9) return say(`${L.a} has nine cells at most.`);
  path.push(c);
  note = "";
  render();
}

function stepBack() {
  path.pop();
  note = "";
  render();
}

function lineStatus() {
  const L = LINES[lineKind];
  if (!path.length) return `Tap the ${L.start}, then each next cell in order. Tap ${L.a.toLowerCase()} already drawn to change it.`;
  if (path.length === 1) return L.started;
  const again = editingLine >= 0 ? ` Tap its ${L.start} to start another from it.` : "";
  return `${plural(path.length, "cell")} long. Tap on, or ${addLabel()}. Tapping the last cell takes it back.${again}`;
}

// The fewest cells a kind of line has.
const least = (L) => L.least ?? 2;

function onLineAdd() {
  const L = LINES[lineKind];
  if (path.length < least(L)) {
    return say(least(L) === 2 ? `${L.a} needs two cells at least: the ${L.start} and one more.` : `${L.a} needs ${least(L) === 3 ? "three" : least(L)} cells at least.`);
  }
  const next = s[L.list].filter((_, i) => i !== editingLine).concat([path.slice()]);
  const problem = L.problem(next);
  if (problem) return say(L.problems[problem.why]);
  const n = path.length;
  change(s.clues, { [L.list]: next });
  path = [];
  editingLine = -1;
  say(`${L.title} of ${plural(n, "cell")} added. Tap the ${L.start} of the next one, or Done.`);
}

function onLineRemove() {
  if (editingLine < 0) return;
  const L = LINES[lineKind];
  change(s.clues, { [L.list]: s[L.list].filter((_, i) => i !== editingLine) });
  path = [];
  editingLine = -1;
  say(`${L.title} removed. Undo brings it back.`);
}

/* ---- dots and XV marks ---- */

// Kropki's dots and XV's marks, each kept in a list of its own as lines
// are. Each key is also the name of the rule's switch.
const EDGES = {
  kropki: { list: "dots", marks: DOT_MARKS, problem: dotProblem },
  xv: { list: "xvs", marks: XV_MARKS, problem: xvProblem },
};
const MARK_WORDS = { white: "white dot", black: "black dot", x: "X", v: "V" };
const capital = (text) => text[0].toUpperCase() + text.slice(1);

// The marks a side steps through, with the rules on: white dot, black dot,
// X, V, then none.
const markCycle = () => Object.entries(EDGES).flatMap(([kind, E]) => (s[kind] ? E.marks : []));

function toggleMarkMode() {
  if (markMode) return endCage(true);
  endCage();
  markMode = true;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

function endMarks() {
  markMode = false;
  anchor = null;
}

// The cell across the side of cell c nearest a tap at `at`, or -1 when
// the tap was nearer the middle, or came from the keyboard.
function sideNear(c, at) {
  if (!at) return -1;
  const [x, y] = at;
  const sides = [
    [y, c - 9],
    [1 - y, c + 9],
    [x, c - 1],
    [1 - x, c + 1],
  ].filter(([, o]) => o >= 0 && o < 81 && (ROW[o] === ROW[c] || COL[o] === COL[c]));
  const [gap, o] = sides.sort((p, q) => p[0] - q[0])[0];
  return gap < 0.28 ? o : -1;
}

// A tap in the Marks tool: near a side, the mark on it steps on. Nearer the
// middle, the cell is picked, and then a tap on a cell beside it steps on
// the mark between the two.
function pickMarkSide(c, at) {
  let other = sideNear(c, at);
  if (other < 0 && anchor != null && beside(Math.min(anchor, c), Math.max(anchor, c))) other = anchor;
  if (other < 0) {
    anchor = anchor === c ? null : c;
    note = "";
    return render();
  }
  anchor = null;
  stepMark(Math.min(c, other), Math.max(c, other));
}

// The next mark on the side between cells a and b, a first. A mark there
// under a rule that is off goes too, so a side never holds two.
function stepMark(a, b) {
  const on = (e) => e.cells[0] === a && e.cells[1] === b;
  const now = Object.entries(EDGES).map(([kind, E]) => (s[kind] ? s[E.list].find(on)?.mark : null)).find(Boolean) ?? null;
  const cycle = markCycle();
  const next = cycle[cycle.indexOf(now) + 1] ?? null;
  const parts = {};
  for (const E of Object.values(EDGES)) {
    const kept = s[E.list].filter((e) => !on(e));
    if (E.marks.includes(next)) kept.push({ cells: [a, b], mark: next });
    parts[E.list] = kept.sort((p, q) => p.cells[0] * 81 + p.cells[1] - (q.cells[0] * 81 + q.cells[1]));
  }
  change(s.clues, parts);
  const between = `between ${where(a)} and ${where(b)}`;
  say(next ? `${capital(MARK_WORDS[next])} ${between}. Tap there again for the next mark.` : `Mark ${between} taken off. Undo brings it back.`);
}

function markStatus() {
  if (anchor != null) return `${capital(where(anchor))} picked. Tap a cell beside it to mark the side between them.`;
  const kinds = markCycle().map((m) => MARK_WORDS[m]).join(", ");
  return `Tap near the side between two cells to mark it, or tap a cell and then one beside it. Each tap steps on: ${kinds}, then none.`;
}

/* ---- clues outside the grid ---- */

// The ways a Little Killer diagonal can run, and an arrow for each.
const DIAGONAL_WAYS = [
  [1, 1, "↘"],
  [1, -1, "↙"],
  [-1, 1, "↗"],
  [-1, -1, "↖"],
];

// A row or column seen from one side (VIEWS in variant.js), and the margin
// spot [r, c] its clue sits in; -1 for a spot that is not beside one.
function viewAt([r, c]) {
  const along = (i) => i >= 0 && i <= 8;
  if (c === -1 && along(r)) return r;
  if (r === -1 && along(c)) return 9 + c;
  if (c === 9 && along(r)) return 18 + r;
  if (r === 9 && along(c)) return 27 + c;
  return -1;
}
const viewSpot = (view) => {
  const i = view % 9;
  return [
    [i, -1],
    [-1, i],
    [i, 9],
    [9, i],
  ][Math.floor(view / 9)];
};
const viewWords = (view) => `${view % 18 < 9 ? "row" : "column"} ${(view % 9) + 1} from the ${["left", "top", "right", "bottom"][Math.floor(view / 9)]}`;
const arrowOf = (cells) => DIAGONAL_WAYS.find(([dr, dc]) => ROW[cells[1]] - ROW[cells[0]] === dr && COL[cells[1]] - COL[cells[0]] === dc)[2];

// The clues outside the grid, each kept in a list of its own as lines are;
// each key is also the name of the rule's switch. For each: its list, what
// its value is called, its checks, the spot a clue sits in, what a spot can
// take (each a clue short of its value), what it is called, and what Turn
// calls it.
const OUTSIDE = {
  sandwich: {
    list: "sandwiches",
    key: "sum",
    problem: sandwichProblem,
    problems: SANDWICH_PROBLEMS,
    spotOf: ({ line }) => viewSpot(line),
    at: (spot) => {
      const view = viewAt(spot);
      return view >= 0 && view < 18 ? [{ line: view }] : [];
    },
    words: ({ line }) => `Sandwich sum for ${line < 9 ? `row ${line + 1}` : `column ${line - 8}`}`,
    turn: () => "Sandwich",
    place: "left of a row or above a column for a Sandwich sum",
    means: "a Sandwich sum adds up the digits between a line's 1 and 9",
  },
  little: {
    list: "littles",
    key: "sum",
    problem: littleProblem,
    problems: LITTLE_PROBLEMS,
    spotOf: ({ cells }) => [ROW[cells[0]] * 2 - ROW[cells[1]], COL[cells[0]] * 2 - COL[cells[1]]],
    at: ([r, c]) =>
      DIAGONAL_WAYS.map(([dr, dc]) => ({ cells: diagonalFrom(r + dr, c + dc, dr, dc) })).filter(({ cells }) => cells.length >= 2),
    words: ({ cells }) => `Little Killer sum ${arrowOf(cells)} from ${where(cells[0])}`,
    turn: ({ cells }) => `Diagonal ${arrowOf(cells)}`,
    place: "round the edge for a Little Killer sum",
    means: "a Little Killer sum, the diagonal its arrow points along",
  },
  skyscraper: {
    list: "skyscrapers",
    key: "count",
    problem: skyscraperProblem,
    problems: SKYSCRAPER_PROBLEMS,
    spotOf: ({ view }) => viewSpot(view),
    at: (spot) => (viewAt(spot) >= 0 ? [{ view: viewAt(spot) }] : []),
    words: ({ view }) => `Skyscraper count for ${viewWords(view)}`,
    turn: () => "Skyscraper",
    place: "beside a row or column for a Skyscraper count",
    means: "a Skyscraper count, the digits seen from that side, taller ones hiding shorter",
  },
  xsum: {
    list: "xsums",
    key: "sum",
    problem: xsumProblem,
    problems: XSUM_PROBLEMS,
    spotOf: ({ view }) => viewSpot(view),
    at: (spot) => (viewAt(spot) >= 0 ? [{ view: viewAt(spot) }] : []),
    words: ({ view }) => `X-Sum for ${viewWords(view)}`,
    turn: () => "X-Sum",
    place: "beside a row or column for an X-Sum",
    means: "an X-Sum, the first X digits from that side, X being the first",
  },
};
const outsideOn = () => Object.keys(OUTSIDE).some((kind) => s[kind]);

// The clues margin spot [r, c] can take, with the rules on: { kind, base },
// base being the clue without its value.
const spotKinds = (at) => Object.entries(OUTSIDE).flatMap(([kind, O]) => (s[kind] ? O.at(at).map((base) => ({ kind, base })) : []));
const sameSpot = (a, b) => a[0] === b[0] && a[1] === b[1];
// Whether a clue is the one `base` would make, whatever its value.
const isBase = (clue, base) => Object.keys(base).every((f) => JSON.stringify(clue[f]) === JSON.stringify(base[f]));

// Every margin spot, for the ones a clue can go in.
const MARGIN = [];
for (let r = -1; r <= 9; r++) for (let c = -1; c <= 9; c++) if (r < 0 || r > 8 || c < 0 || c > 8) MARGIN.push([r, c]);

const kindWords = ({ kind, base }) => OUTSIDE[kind].words(base);

function toggleOutMode() {
  if (outMode) return endCage(true);
  endCage();
  outMode = true;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

function clearSpot() {
  spot = null;
  choice = 0;
  $("outSum").value = "";
}

function endOutside() {
  outMode = false;
  clearSpot();
}

// The clue already at the picked spot, of the rules on: { kind, index }, or
// null.
function heldAtSpot() {
  if (!spot) return null;
  for (const [kind, O] of Object.entries(OUTSIDE)) {
    if (!s[kind]) continue;
    const index = s[O.list].findIndex((clue) => sameSpot(O.spotOf(clue), spot));
    if (index >= 0) return { kind, index };
  }
  return null;
}

const places = () => Object.entries(OUTSIDE).filter(([kind]) => s[kind]).map(([, O]) => O.place);

// A tap in the margin: picks the spot, and the clue there if it has one.
// Out of the Outside tool, it opens it first.
function pickSpot(at) {
  if (s.stage !== "enter" || !outsideOn()) return;
  if (!outMode) toggleOutMode();
  const kinds = spotKinds(at);
  if (!kinds.length) {
    clearSpot();
    const beside = s.skyscraper || s.xsum ? "beside a row or column" : s.sandwich ? "left of a row or above a column" : "";
    const round = s.little ? "round the edge with a diagonal into the grid" : "";
    return say(`No clue goes there. Tap a spot ${[beside, round].filter(Boolean).join(", or ")}.`);
  }
  spot = at;
  const held = heldAtSpot();
  const clue = held && s[OUTSIDE[held.kind].list][held.index];
  choice = held ? Math.max(0, kinds.findIndex((k) => k.kind === held.kind && isBase(clue, k.base))) : 0;
  $("outSum").value = held ? String(clue[OUTSIDE[held.kind].key]) : "";
  note = "";
  render();
}

// Digits typed while a spot is picked go to its value; "back" takes one off.
function typeOutSum(key) {
  if (!spot) return say("Tap a spot round the edge of the grid first, then type its number.");
  const box = $("outSum");
  box.value = key === "back" ? box.value.slice(0, -1) : (box.value + key).slice(-2);
  note = "";
  render();
}

function turnSpot() {
  const kinds = spot ? spotKinds(spot) : [];
  if (kinds.length < 2) return;
  choice = (choice + 1) % kinds.length;
  note = "";
  render();
}

// The picked spot's clue, put down or changed: whatever was at the spot
// before goes, so a spot never holds two.
function onOutAdd() {
  if (!spot) return;
  const text = $("outSum").value.trim();
  if (!/^\d+$/.test(text)) return say("Type the number first.");
  const k = spotKinds(spot)[choice];
  const O = OUTSIDE[k.kind];
  const parts = {};
  for (const other of Object.values(OUTSIDE)) parts[other.list] = s[other.list].filter((clue) => !sameSpot(other.spotOf(clue), spot));
  parts[O.list].push({ ...structuredClone(k.base), [O.key]: Number(text) });
  const problem = O.problem(parts[O.list]);
  if (problem) return say(O.problems[problem.why]);
  change(s.clues, parts);
  clearSpot();
  say(`${kindWords(k)}: ${text}. Tap the next spot, or Done.`);
}

function onOutRemove() {
  const held = heldAtSpot();
  if (!held) return;
  const { list } = OUTSIDE[held.kind];
  change(s.clues, { [list]: s[list].filter((_, i) => i !== held.index) });
  clearSpot();
  say("Clue removed. Undo brings it back.");
}

// Margin spots open for a clue: those that can take one and have none yet.
function openSpots() {
  const taken = Object.entries(OUTSIDE).flatMap(([kind, O]) => (s[kind] ? s[O.list].map(O.spotOf) : []));
  return MARGIN.filter((at) => spotKinds(at).length && !taken.some((t) => sameSpot(t, at)));
}

function outStatus() {
  if (!spot) {
    const means = Object.entries(OUTSIDE).filter(([kind]) => s[kind]).map(([, O]) => O.means);
    return `Tap a spot ${places().join(", or ")}. ${capital(means.join("; "))}.`;
  }
  const kinds = spotKinds(spot);
  const turn = kinds.length > 1 ? " Turn picks what goes there." : "";
  return `${kindWords(kinds[choice])}: type it, then ${heldAtSpot() ? "Change" : "Add"}.${turn}`;
}

/* ---- a Jigsaw's regions ---- */

// Whether the regions are still the 3x3 boxes, not yet cut.
const boxesStill = () => s.regions.every((r, c) => r === BOX[c]);

function toggleRegionMode() {
  if (regionMode) return endCage(true);
  endCage();
  regionMode = true;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

function endRegions() {
  regionMode = false;
  brush = null;
}

// A tap in the Regions tool: with no region picked, or on the picked one,
// picks the cell's region, or lets it go; otherwise the cell moves into the
// picked region.
function pickRegionCell(c) {
  const region = s.regions[c];
  if (brush == null || region === brush) {
    brush = brush === region ? null : region;
    note = "";
    return render();
  }
  const next = s.regions.slice();
  next[c] = brush;
  change(s.clues, { regions: next });
  render();
}

function onRegionReset() {
  if (boxesStill()) return;
  change(s.clues, { regions: Array.from(BOX) });
  brush = null;
  say("Back to the 3x3 boxes. Undo brings the regions back.");
}

function regionStatus() {
  if (brush == null) return "Tap a cell to pick its region, then tap cells to move them into it. Each region needs nine cells, joined edge to edge.";
  const size = s.regions.filter((r) => r === brush).length;
  const need = size === 9 ? "" : ": it needs nine";
  return `This region has ${plural(size, "cell")}${need}. Tap cells to move them in, or one of its own to let it go.`;
}

/* ---- drawing ---- */

function defaultStatus() {
  const n = s.clues.filter(Boolean).length;
  if (s.stage === "enter") {
    if (cageMode) return cageStatus();
    if (lineKind) return lineStatus();
    if (markMode) return markStatus();
    if (outMode) return outStatus();
    if (regionMode) return regionStatus();
    if (s.thermo && !s.thermos.length) return "A thermo puzzle: tap Thermos, then the bulb and each next cell. Digits rise from the bulb.";
    if (s.arrow && !s.arrows.length) return "An arrow puzzle: tap Arrows, then the circle and each cell along the arrow. Its digits add up to the circle's.";
    if (s.whisper && !s.whispers.length) return "A German Whispers puzzle: tap Whispers, then each cell along a line. Digits next to each other on it differ by at least 5.";
    if (s.renban && !s.renbans.length) return "A renban puzzle: tap Renbans, then each cell along a line. Its digits are a run, like 3 4 5, in any order.";
    if (s.palindrome && !s.palindromes.length) {
      return "A palindrome puzzle: tap Palindromes, then each cell along a line. Its digits read the same from either end, like 3 7 1 7 3.";
    }
    if (s.zipper && !s.zippers.length) {
      return "A zipper puzzle: tap Zippers, then each cell along a line. Cells the same way in from each end add up to the same total, like 2 5 9 4 7.";
    }
    if (s.between && !s.betweens.length) {
      return "A between puzzle: tap Betweens, then a circle, each cell along the line and the other circle. The line's digits lie between the circles', like 2 5 4 7.";
    }
    if (s.lockout && !s.lockouts.length) {
      return `A lockout puzzle: tap Lockouts, then a diamond, each cell along the line and the other diamond. The diamonds differ by ${LOCKOUT_GAP} or more, and the line's digits lie outside them, like 3 8 1 7.`;
    }
    if (s.entropic && !s.entropics.length) {
      return "An entropic puzzle: tap Entropics, then each cell along a line. Any three in a row hold one low digit (1 to 3), one middle and one high, like 2 9 5.";
    }
    if (s.modular && !s.modulars.length) {
      return "A modular puzzle: tap Modulars, then each cell along a line. Any three in a row hold one each of 1 4 7, 2 5 8 and 3 6 9, like 1 5 9.";
    }
    if (s.kropki && !s.dots.length) {
      return "A Kropki puzzle: tap Marks, then near the side between two cells. A white dot joins consecutive digits, a black dot a digit and its double.";
    }
    if (s.xv && !s.xvs.length) return "An XV puzzle: tap Marks, then near the side between two cells. Digits either side of an X add up to 10, of a V to 5.";
    if (s.sandwich && !s.sandwiches.length) {
      return "A Sandwich puzzle: tap Outside, then a spot left of a row or above a column, and type the sum of the digits between its 1 and its 9.";
    }
    if (s.little && !s.littles.length) return "A Little Killer puzzle: tap Outside, then a spot round the edge, and type the sum of the diagonal its arrow points along.";
    if (s.skyscraper && !s.skyscrapers.length) {
      return "A Skyscrapers puzzle: tap Outside, then a spot beside a row or column, and type how many digits are seen from there, taller ones hiding shorter.";
    }
    if (s.xsum && !s.xsums.length) {
      return "An X-Sums puzzle: tap Outside, then a spot beside a row or column, and type the sum of the first X digits from there, X being the first.";
    }
    if (s.jigsaw && boxesStill()) return "A Jigsaw puzzle: tap Regions to cut the grid into nine regions of nine cells, in place of the boxes.";
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
  solver: "Not scored, and nothing leaves this browser. Paste takes 81 cells in reading order, with 0 or . for blanks, or a seed.",
  create: "Paste takes 81 cells in reading order, with 0 or . for blanks, or a seed. A made puzzle gets a leaderboard of its own.",
  made: "The seed carries the whole puzzle: paste it into the Seed box on the new-game screen to play it. Played solo, it scores on its own board, never the main ones.",
};

// A kind of line to draw, with its rule on: all but the one being changed,
// which is drawn as the path, not twice. null with the rule off.
const shownLines = (kind) => (s[kind] ? s[LINES[kind].list].filter((_, i) => lineKind !== kind || i !== editingLine) : null);

function render() {
  if (!board) return;
  const { stage } = s;
  const enter = stage === "enter";
  const solving = stage === "solve";
  const g = grid();
  const solved = isSolved();
  const settings = getSettings();
  const wrong = clashes(g, variant());
  // The rules explained: while the clues go in, every one switched on, drawn
  // yet or not; after, those the puzzle uses.
  const helpKeys = enter ? Object.keys(RULE_HELP).filter(ruleOn) : rulesOf(variant());
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
    thermos: shownLines("thermo"),
    arrows: shownLines("arrow"),
    whispers: shownLines("whisper"),
    renbans: shownLines("renban"),
    palindromes: shownLines("palindrome"),
    zippers: shownLines("zipper"),
    betweens: shownLines("between"),
    lockouts: shownLines("lockout"),
    entropics: shownLines("entropic"),
    modulars: shownLines("modular"),
    dots: s.kropki ? s.dots : null,
    xvs: s.xv ? s.xvs : null,
    sandwiches: s.sandwich ? s.sandwiches : null,
    littles: s.little ? s.littles : null,
    skyscrapers: s.skyscraper ? s.skyscrapers : null,
    xsums: s.xsum ? s.xsums : null,
    regions: regions(),
    margin: outsideOn(),
    spots: outMode ? openSpots() : [],
    spot: outMode ? spot : null,
    path: lineKind ? path : [],
    pathKind: lineKind ?? "thermo",
    rules: s.rules,
    picked: cageMode
      ? picked
      : lineKind
        ? new Set(path)
        : markMode && anchor != null
          ? new Set([anchor])
          : regionMode && brush != null
            ? new Set([...Array(81).keys()].filter((c) => s.regions[c] === brush))
            : null,
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
    solverSeedGroup: enter,
    solverRuleHelp: Boolean(helpKeys.length),
    solverCages: enter && killer(),
    cageBar: cageMode,
    solverThermos: enter && s.thermo,
    solverArrows: enter && s.arrow,
    solverWhispers: enter && s.whisper,
    solverRenbans: enter && s.renban,
    solverPalindromes: enter && s.palindrome,
    solverZippers: enter && s.zipper,
    solverBetweens: enter && s.between,
    solverLockouts: enter && s.lockout,
    solverEntropics: enter && s.entropic,
    solverModulars: enter && s.modular,
    lineBar: Boolean(lineKind),
    solverMarks: enter && (s.kropki || s.xv),
    markBar: markMode,
    solverOutside: enter && outsideOn(),
    outBar: outMode,
    solverRegions: enter && s.jigsaw,
    regionBar: regionMode,
    // A variant's rules and cages do not fit in 81 characters.
    solverCopy: !killer() && !s.jigsaw && ![LINES, EDGES, OUTSIDE].some((table) => Object.keys(table).some((kind) => s[kind])) && !s.rules,
  };
  for (const [id, on] of Object.entries(shown)) $(id).classList.toggle("hidden", !on);

  const icon = creating() ? "check" : "bulb";
  if ($("solverGoIcon").dataset.icon !== icon) {
    $("solverGoIcon").dataset.icon = icon;
    hydrateIcons($("solverGo"));
  }
  $("solverGoLabel").textContent = goLabel();

  const any = s.clues.some(Boolean) || drawn();
  $("solverUndo").disabled = !history.length;
  $("solverErase").disabled = !canEdit();
  $("solverClear").disabled = !any;
  $("solverCopy").disabled = !s.clues.some(Boolean);
  $("solverImage").disabled = !any;
  for (const id of ["solverCheck", "solverHint", "solverSolve"]) $(id).disabled = solved;
  $("solverHintLabel").textContent = pending ? "Show it" : "Hint";
  $("solverCands").setAttribute("aria-pressed", String(s.candidates));
  $("solverCandsLabel").textContent = s.candidates ? "Hide candidates" : "Show candidates";
  document.querySelectorAll("#solverRules [data-rule]").forEach((b) => b.setAttribute("aria-pressed", String(ruleOn(b.dataset.rule))));
  fillRuleHelp($("solverRuleHelp"), helpKeys, { draw: enter });
  $("solverSeedNote").textContent =
    seedNote || (creating() ? "A seed's puzzle, to change and check again for a new seed, or to save as an image." : "A seed's puzzle, to solve here or save as an image.");
  $("solverCages").setAttribute("aria-pressed", String(cageMode));
  $("solverThermos").setAttribute("aria-pressed", String(lineKind === "thermo"));
  $("solverArrows").setAttribute("aria-pressed", String(lineKind === "arrow"));
  $("solverWhispers").setAttribute("aria-pressed", String(lineKind === "whisper"));
  $("solverRenbans").setAttribute("aria-pressed", String(lineKind === "renban"));
  $("solverPalindromes").setAttribute("aria-pressed", String(lineKind === "palindrome"));
  $("solverZippers").setAttribute("aria-pressed", String(lineKind === "zipper"));
  $("solverBetweens").setAttribute("aria-pressed", String(lineKind === "between"));
  $("solverLockouts").setAttribute("aria-pressed", String(lineKind === "lockout"));
  $("solverEntropics").setAttribute("aria-pressed", String(lineKind === "entropic"));
  $("solverModulars").setAttribute("aria-pressed", String(lineKind === "modular"));
  $("solverMarks").setAttribute("aria-pressed", String(markMode));
  $("solverOutside").setAttribute("aria-pressed", String(outMode));
  $("solverRegions").setAttribute("aria-pressed", String(regionMode));
  $("regionReset").disabled = boxesStill();
  if (outMode) {
    const kinds = spot ? spotKinds(spot) : [];
    const held = heldAtSpot();
    for (const id of ["outSum", "outAdd"]) $(id).classList.toggle("hidden", !spot);
    $("outTurn").classList.toggle("hidden", kinds.length < 2);
    $("outRemove").classList.toggle("hidden", !held);
    $("outAddLabel").textContent = held ? "Change" : "Add";
    $("outAdd").disabled = !/^\d+$/.test($("outSum").value.trim());
    // Turn names what it turns the spot's clue into.
    const next = kinds[(choice + 1) % kinds.length];
    if (next) $("outTurnLabel").textContent = OUTSIDE[next.kind].turn(next.base);
  }
  if (lineKind) {
    $("lineAddLabel").textContent = addLabel();
    $("lineRemoveLabel").textContent = `Remove ${LINES[lineKind].short}`;
    $("lineRemove").classList.toggle("hidden", editingLine < 0);
    $("lineAdd").disabled = path.length < least(LINES[lineKind]);
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
  else if (lineKind && e.key === "Enter") onLineAdd();
  else if (lineKind && e.key === "Escape") endCage(true);
  else if (markMode && e.key === "Escape") endCage(true);
  else if (outMode && /^[0-9]$/.test(e.key)) typeOutSum(e.key);
  else if (outMode && (e.key === "Backspace" || e.key === "Delete")) typeOutSum("back");
  else if (outMode && e.key === "Enter") onOutAdd();
  else if (outMode && e.key === "Escape") endCage(true);
  else if (regionMode && e.key === "Escape") endCage(true);
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
  board = new BoardView($("solverBoard"), { onSelect: selectCell, onSpot: pickSpot });
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
  $("solverSeedOpen").addEventListener("click", onSeedOpen);
  $("solverSeedInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSeedOpen();
  });
  $("solverSeedInput").addEventListener("input", () => {
    if (!seedNote) return;
    seedNote = "";
    render();
  });
  // What each rule means, on hover, before it is switched on.
  document.querySelectorAll("#solverRules [data-rule]").forEach((b) => (b.title = RULE_HELP[b.dataset.rule].rule));
  $("solverRules").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rule]");
    if (b) toggleRule(b.dataset.rule);
  });
  $("solverCages").addEventListener("click", toggleCageMode);
  $("solverThermos").addEventListener("click", () => toggleLineMode("thermo"));
  $("solverArrows").addEventListener("click", () => toggleLineMode("arrow"));
  $("solverWhispers").addEventListener("click", () => toggleLineMode("whisper"));
  $("solverRenbans").addEventListener("click", () => toggleLineMode("renban"));
  $("solverPalindromes").addEventListener("click", () => toggleLineMode("palindrome"));
  $("solverZippers").addEventListener("click", () => toggleLineMode("zipper"));
  $("solverBetweens").addEventListener("click", () => toggleLineMode("between"));
  $("solverLockouts").addEventListener("click", () => toggleLineMode("lockout"));
  $("solverEntropics").addEventListener("click", () => toggleLineMode("entropic"));
  $("solverModulars").addEventListener("click", () => toggleLineMode("modular"));
  $("solverMarks").addEventListener("click", toggleMarkMode);
  $("markDone").addEventListener("click", () => endCage(true));
  $("solverOutside").addEventListener("click", toggleOutMode);
  $("outAdd").addEventListener("click", onOutAdd);
  $("outTurn").addEventListener("click", turnSpot);
  $("outRemove").addEventListener("click", onOutRemove);
  $("outDone").addEventListener("click", () => endCage(true));
  $("solverRegions").addEventListener("click", toggleRegionMode);
  $("regionReset").addEventListener("click", onRegionReset);
  $("regionDone").addEventListener("click", () => endCage(true));
  $("outSum").addEventListener("input", () => render());
  $("outSum").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onOutAdd();
  });
  $("lineAdd").addEventListener("click", onLineAdd);
  $("lineRemove").addEventListener("click", onLineRemove);
  $("lineDone").addEventListener("click", () => endCage(true));
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
