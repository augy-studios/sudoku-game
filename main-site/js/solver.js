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
// cage); Rellik, Lunchbox, Look and Say, Equality, Equal Sum, Same Values,
// Connected and Count Distinct add their own kinds of cage with the same
// tool, its kind button picking which a new one is;
// Thermo adds thermometers, drawn with the Thermos tool (tap the
// bulb, then each next cell, Add thermo); Arrow adds arrows, drawn the same
// way with the Arrows tool, from the circle; Double Arrow adds double
// arrows, from one circle to the other; Pill Arrow adds pill arrows, a pill
// of two or three cells and then its arrow; Whispers, Renban, Palindrome,
// Zipper, Between, Lockout, Entropic and Modular add German Whispers,
// renban, palindrome, zipper, between, lockout, entropic and modular lines,
// drawn the same way again with their own tools, a between line from one circle to the other and a lockout line from
// one diamond to the other; Sum Line, Region Sum and Value Indexing add sum
// lines, with a sum typed as a cage's is, closed in a loop by tapping the
// first cell again, region sum lines and value indexing lines, from the
// dot; Dutch Whispers makes the whisper lines Dutch;
// Kropki, XV and Greater Than add dots, X and V marks and signs on the
// sides between cells, Quad circles on the corners where four meet, and
// Counting Circles circles in cells, in sets if need be, put down with the
// Marks tool, which puts single Row/Column Indexing cells down too, and
// Chaos Arrows and Chaos Counts, for Chaos Construction, whose regions are
// worked out, not drawn, and Yin-Yang's circles, whose shading is;
// Sandwich, Little Killer, Skyscrapers, X-Sums, Hidden Skyscraper,
// Numbered Room, Full Rank and Row/Column Indexing add clues outside the
// grid, No Rank Ties and Clued Rank Ties saying which Full Rank numbers may
// tie, put down with the Outside tool in a
// margin the board leaves for them; Jigsaw puts regions in the boxes'
// place, cut with the Regions tool; and Diagonal, Anti-knight, Anti-king and Windoku add their
// rules (variant.js). Every check, hint and candidate then follows them
// too.
//
// Either can open a seed, from the new-game screen, a made puzzle's board or
// Copy seed: its puzzle goes in to change, check again for a new seed, or
// save as an image. A made seed brings its rules and everything drawn on it.
//
// The maker's Show sample puts a made-up puzzle in the board's place, with
// an example of each part the rules on would draw (sample.js), until Hide
// sample brings the person's own back.
//
// Nothing here is scored or leaves the browser, until a made puzzle is
// played as a game.

import { ROW, COL, BOX } from "./sudoku.js";
import { clashes, candidates, nextStep, bitCount, parseGrid, puzzleText, checkClues, rateLevel, MIN_CLUES } from "./steps.js";
import { madeSeed, parseSeed, parseCode, puzzleFor } from "./seed.js";
import { findSeed, fetchCode, seedLabel, CODE_TROUBLE } from "./api.js";
import {
  cageProblem,
  rellikProblem,
  lunchboxProblem,
  lookSayProblem,
  equalityProblem,
  equalSumProblem,
  sameValueProblem,
  connectedProblem,
  distinctProblem,
  piecesFor,
  tidyPieces,
  linkWords,
  LUNCHBOX_MAX,
  sayWords,
  thermoProblem,
  arrowProblem,
  doubleProblem,
  pillProblem,
  PILL_ARROW_MOST,
  whisperProblem,
  dutchProblem,
  DUTCH_GAP,
  renbanProblem,
  palindromeProblem,
  zipperProblem,
  betweenProblem,
  lockoutProblem,
  entropicProblem,
  modularProblem,
  sumLineProblem,
  regionSumProblem,
  indexProblem,
  LONG_LINE_MOST,
  LOOP_LINE_MOST,
  whisperGap,
  SUM_LINE_MAX,
  INDEX_LINE_MOST,
  LOCKOUT_GAP,
  dotProblem,
  xvProblem,
  signProblem,
  quadProblem,
  quadCells,
  sandwichProblem,
  littleProblem,
  skyscraperProblem,
  xsumProblem,
  hiddenProblem,
  roomProblem,
  circleProblem,
  CIRCLES_MOST,
  circleSetProblem,
  CIRCLE_SETS_MOST,
  chaosArrowProblem,
  chaosCountProblem,
  waysFrom,
  chaosArms,
  chaosAround,
  countCell,
  sideOf,
  shadeProblem,
  rankProblem,
  RANK_MOST,
  indexingProblem,
  indexCellProblem,
  hasRule,
  regionProblem,
  diagonalFrom,
  SANDWICH_MAX,
  DOT_MARKS,
  XV_MARKS,
  SIGN_MARKS,
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
import { samplePuzzle } from "./sample.js";

const BOX_NAMES = ["top left", "top middle", "top right", "middle left", "centre", "middle right", "bottom left", "bottom middle", "bottom right"];

const $ = (id) => document.getElementById(id);
const empty = () => new Array(81).fill(0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let board = null;

// One of these for the solver and one for the maker, each kept in this
// browser so a reload comes back to the same puzzle. stage is "enter" while
// the clues go in; then "solve" in the solver, or "made" in the maker.
// killer, rellik, lunchbox, looksay, equality, equalsum, samevalue,
// connected, countdistinct, thermo, arrow, doublearrow, pillarrow, whisper, dutch, renban, palindrome, zipper, between,
// lockout, entropic, modular, sumline, regionsum, valueindex, kropki, xv, greater, quad, counting, sandwich, little, skyscraper, xsum,
// hiddensky, room, fullrank, rowcolindex, chaosarrow, chaoscount, yinyang,
// jigsaw and rules
// are the variant's switches; cages are kept while Killer is off, for
// when it comes back on, and each other kind of cage, line, dot, mark and
// outside clue likewise. Counting Circles' first set is circles, and any
// more circlesets; Row/Column Indexing's marked lines are indexings, and its
// single cells indexcells.
const fresh = () => ({
  open: false,
  stage: "enter",
  clues: empty(),
  values: empty(),
  candidates: false,
  killer: false,
  rellik: false,
  lunchbox: false,
  looksay: false,
  equality: false,
  equalsum: false,
  samevalue: false,
  connected: false,
  countdistinct: false,
  thermo: false,
  arrow: false,
  doublearrow: false,
  pillarrow: false,
  whisper: false,
  dutch: false,
  renban: false,
  palindrome: false,
  zipper: false,
  between: false,
  lockout: false,
  entropic: false,
  modular: false,
  sumline: false,
  regionsum: false,
  valueindex: false,
  kropki: false,
  xv: false,
  greater: false,
  quad: false,
  counting: false,
  sandwich: false,
  little: false,
  skyscraper: false,
  xsum: false,
  hiddensky: false,
  room: false,
  fullrank: false,
  rowcolindex: false,
  chaosarrow: false,
  chaoscount: false,
  yinyang: false,
  jigsaw: false,
  rules: 0,
  cages: [],
  relliks: [],
  lunchboxes: [],
  looksays: [],
  equalities: [],
  equalsums: [],
  samevalues: [],
  connecteds: [],
  distincts: [],
  thermos: [],
  arrows: [],
  doubles: [],
  pills: [],
  whispers: [],
  dutches: [],
  renbans: [],
  palindromes: [],
  zippers: [],
  betweens: [],
  lockouts: [],
  entropics: [],
  modulars: [],
  sumlines: [],
  regionsums: [],
  indexes: [],
  dots: [],
  xvs: [],
  signs: [],
  quads: [],
  circles: [],
  circlesets: [],
  sandwiches: [],
  littles: [],
  skyscrapers: [],
  xsums: [],
  hiddens: [],
  rooms: [],
  ranks: [],
  indexings: [],
  indexcells: [],
  chaosarrows: [],
  chaoscounts: [],
  shades: [],
  // A Jigsaw's regions, from the boxes until the maker cuts them.
  regions: Array.from(BOX),
});
const states = { solver: fresh(), create: fresh() };
let mode = "solver";
let s = states.solver;

let solution = null; // the answer, from the solve or made stage on
let made = null; // the made puzzle's seed, in the made stage
let history = []; // earlier states of this stage, for undo
// The Cages tool: on, the kind of cage it draws (a key of CAGES below), the
// cells being gathered, the clue typed so far, and the cage being changed,
// if one was picked up: { kind, index }.
let cageMode = false;
let cageKind = "killer";
let picked = new Set();
let editing = null;
// An Equal Sum or Same Values cage's pieces ended with Next piece, each a
// list of the picked cells; the picked cells after them are the next piece.
let closedPieces = [];
// The Thermos, Arrows or another line tool, likewise: which is on, a key of
// LINES below, the path so far from its first cell, and the line
// being changed.
let lineKind = null;
let path = [];
let editingLine = -1;
// The kind of the line being changed, which the Whispers tool's kind button
// may since have turned from.
let editingKind = null;
// Whether the sum line being drawn is closed in a loop.
let pathLoop = false;
// The Pills tool's pill size, 2 or 3: the path's first that many cells are
// the pill, and the rest its arrow.
let pillSize = 2;
// The Marks tool: on, the cell picked for a mark on one of its sides, and
// the corner picked for a quad, by the top left of its four cells.
let markMode = false;
let anchor = null;
let quadAt = null;
// What a tap in a cell's middle puts there: an index into middleKinds().
let middle = 0;
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
// Show sample, in the maker: on, and the sample made for the rules on, with
// the key it was made for (sampleKey), until they change.
let sampleOn = false;
let sample = null;
let sampleTimer = null;

const creating = () => mode === "create";
// The grid this stage edits.
const grid = () => (s.stage === "solve" ? s.values : s.clues);
const goLabel = () => (creating() ? "Check it" : "Help me solve it");
const killer = () => s.killer;
// The cages the rules use: none with Killer off, even if some are kept.
const cages = () => (killer() && s.cages.length ? s.cages : null);
const relliks = () => (s.rellik && s.relliks.length ? s.relliks : null);
const lunchboxes = () => (s.lunchbox && s.lunchboxes.length ? s.lunchboxes : null);
const looksays = () => (s.looksay && s.looksays.length ? s.looksays : null);
const equalities = () => (s.equality && s.equalities.length ? s.equalities : null);
const equalsums = () => (s.equalsum && s.equalsums.length ? s.equalsums : null);
const samevalues = () => (s.samevalue && s.samevalues.length ? s.samevalues : null);
const connecteds = () => (s.connected && s.connecteds.length ? s.connecteds : null);
const distincts = () => (s.countdistinct && s.distincts.length ? s.distincts : null);
const thermos = () => (s.thermo && s.thermos.length ? s.thermos : null);
const arrows = () => (s.arrow && s.arrows.length ? s.arrows : null);
const doubles = () => (s.doublearrow && s.doubles.length ? s.doubles : null);
const pills = () => (s.pillarrow && s.pills.length ? s.pills : null);
const whispers = () => (s.whisper && s.whispers.length ? s.whispers : null);
const dutches = () => (s.dutch && s.dutches.length ? s.dutches : null);
const renbans = () => (s.renban && s.renbans.length ? s.renbans : null);
const palindromes = () => (s.palindrome && s.palindromes.length ? s.palindromes : null);
const zippers = () => (s.zipper && s.zippers.length ? s.zippers : null);
const betweens = () => (s.between && s.betweens.length ? s.betweens : null);
const lockouts = () => (s.lockout && s.lockouts.length ? s.lockouts : null);
const entropics = () => (s.entropic && s.entropics.length ? s.entropics : null);
const modulars = () => (s.modular && s.modulars.length ? s.modulars : null);
const sumlines = () => (s.sumline && s.sumlines.length ? s.sumlines : null);
const regionsums = () => (s.regionsum && s.regionsums.length ? s.regionsums : null);
const indexes = () => (s.valueindex && s.indexes.length ? s.indexes : null);
const dots = () => (s.kropki && s.dots.length ? s.dots : null);
const xvs = () => (s.xv && s.xvs.length ? s.xvs : null);
const signs = () => (s.greater && s.signs.length ? s.signs : null);
const quads = () => (s.quad && s.quads.length ? s.quads : null);
const sandwiches = () => (s.sandwich && s.sandwiches.length ? s.sandwiches : null);
const littles = () => (s.little && s.littles.length ? s.littles : null);
const skyscrapers = () => (s.skyscraper && s.skyscrapers.length ? s.skyscrapers : null);
const xsums = () => (s.xsum && s.xsums.length ? s.xsums : null);
const hiddens = () => (s.hiddensky && s.hiddens.length ? s.hiddens : null);
const rooms = () => (s.room && s.rooms.length ? s.rooms : null);
const circles = () => (s.counting && s.circles.length ? s.circles : null);
const circlesets = () => (s.counting && s.circlesets.length ? s.circlesets : null);
const ranks = () => (s.fullrank && s.ranks.length ? s.ranks : null);
const indexings = () => (s.rowcolindex && s.indexings.length ? s.indexings : null);
const indexcells = () => (s.rowcolindex && s.indexcells.length ? s.indexcells : null);
const chaosarrows = () => (s.chaosarrow && s.chaosarrows.length ? s.chaosarrows : null);
const chaoscounts = () => (s.chaoscount && s.chaoscounts.length ? s.chaoscounts : null);
const shades = () => (s.yinyang && s.shades.length ? s.shades : null);
const regions = () => (s.jigsaw ? s.regions : null);
const chaos = () => hasRule(s.rules, "chaos");
// Doppelgänger: its 0, digit 10 in a grid, and how many of each digit a
// full grid has, eight of 1 to 9 and nine 0s.
const zero = () => hasRule(s.rules, "doppelganger");
const eachDigit = (d) => (!zero() ? 9 : d === 10 ? 9 : 8);
const drawn = () =>
  Boolean(cages() || relliks() || lunchboxes() || looksays() || equalities() || equalsums() || samevalues() || connecteds() || distincts() || thermos() || arrows() || doubles() || pills() || whispers() || dutches() || renbans() || palindromes() || zippers() || betweens() || lockouts() || entropics() || modulars() || sumlines() || regionsums() || indexes() || dots() || xvs() || signs() || quads() || circles() || circlesets() || sandwiches() || littles() || skyscrapers() || xsums() || hiddens() || rooms() || ranks() || indexings() || indexcells() || chaosarrows() || chaoscounts() || shades());
// The variant, for steps.js and variant.js, or null for a classic puzzle.
const variant = () =>
  drawn() || s.rules || regions()
    ? {
        cages: cages() ?? [],
        relliks: relliks() ?? [],
        lunchboxes: lunchboxes() ?? [],
        looksays: looksays() ?? [],
        equalities: equalities() ?? [],
        equalsums: equalsums() ?? [],
        samevalues: samevalues() ?? [],
        connecteds: connecteds() ?? [],
        distincts: distincts() ?? [],
        thermos: thermos() ?? [],
        arrows: arrows() ?? [],
        doubles: doubles() ?? [],
        pills: pills() ?? [],
        whispers: whispers() ?? [],
        dutches: dutches() ?? [],
        renbans: renbans() ?? [],
        palindromes: palindromes() ?? [],
        zippers: zippers() ?? [],
        betweens: betweens() ?? [],
        lockouts: lockouts() ?? [],
        entropics: entropics() ?? [],
        modulars: modulars() ?? [],
        sumlines: sumlines() ?? [],
        regionsums: regionsums() ?? [],
        indexes: indexes() ?? [],
        dots: dots() ?? [],
        xvs: xvs() ?? [],
        signs: signs() ?? [],
        quads: quads() ?? [],
        sandwiches: sandwiches() ?? [],
        littles: littles() ?? [],
        skyscrapers: skyscrapers() ?? [],
        xsums: xsums() ?? [],
        hiddens: hiddens() ?? [],
        rooms: rooms() ?? [],
        circles: circles() ?? [],
        circlesets: circlesets() ?? [],
        chaosarrows: chaosarrows() ?? [],
        chaoscounts: chaoscounts() ?? [],
        shades: shades() ?? [],
        ranks: ranks() ?? [],
        indexings: indexings() ?? [],
        indexcells: indexcells() ?? [],
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
  if (s.stage === "made") {
    made = madeSeed(rateLevel(s.clues, variant()), s.clues, variant());
    showMadeCode();
  }
}

function load(which) {
  const saved = store.getJSON(storageKey(which));
  // Doppelgänger's 0 is 10 in a grid.
  const ok = (a) => Array.isArray(a) && a.length === 81 && a.every((d) => Number.isInteger(d) && d >= 0 && d <= 10);
  if (!saved || !ok(saved.clues)) return;
  const st = states[which];
  st.clues = saved.clues;
  st.open = saved.open === true;
  st.candidates = saved.candidates === true;
  st.rules = Number.isInteger(saved.rules) ? saved.rules & ALL_RULES : 0;
  for (const [kind, P] of [...Object.entries(CAGES), ...Object.entries(LINES), ...Object.entries(EDGES), ...Object.entries(QUADS), ...Object.entries(OUTSIDE), ...Object.entries(EXTRAS)]) {
    st[kind] = saved[kind] === true;
    const kept = Array.isArray(saved[P.list]) ? saved[P.list] : [];
    // A cage's sum goes by the rules, as it may hold Doppelgänger's 0.
    st[P.list] = !(kind in CAGES ? P.problem(kept, st.rules) : P.problem(kept)) ? kept : [];
  }
  // Before the switch rules, a killer puzzle was saved as variant "killer".
  if (saved.variant === "killer") st.killer = true;
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
  undutch(st);
}

// The Dutch Whispers rule of before turned every whisper line Dutch. Each
// line is now one kind or the other, so a state with the rule has its
// whisper lines made Dutch ones, and the rule off.
const DUTCH_RULE = RULES.find((r) => r.key === "dutchwhispers").bit;
function undutch(st) {
  if (!(st.rules & DUTCH_RULE)) return;
  st.rules &= ~DUTCH_RULE;
  st.dutches = st.dutches.concat(st.whispers);
  st.whispers = [];
  st.dutch = st.dutch || st.whisper;
  st.whisper = false;
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
  const { c, kind, unit } = step;
  const d = step.d % 10;
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
      ...(chaos() ? [] : [regions() ? "region" : "box"]),
      ...(cages() ? ["cage"] : []),
      ...(relliks() ? ["Rellik cage"] : []),
      ...(lunchboxes() ? ["lunchbox"] : []),
      ...(looksays() ? ["Look and Say cage"] : []),
      ...(equalities() ? ["Equality cage"] : []),
      ...(equalsums() ? ["Equal Sum cage"] : []),
      ...(samevalues() ? ["Same Values cage"] : []),
      ...(connecteds() ? ["Connected Values cage"] : []),
      ...(distincts() ? ["Count Distinct cage"] : []),
      ...(thermos() ? ["thermometers"] : []),
      ...(arrows() ? ["arrows"] : []),
      ...(doubles() ? ["double arrows"] : []),
      ...(pills() ? ["pill arrows"] : []),
      ...(whispers() ? ["whisper lines"] : []),
      ...(dutches() ? ["Dutch whisper lines"] : []),
      ...(renbans() ? ["renban lines"] : []),
      ...(palindromes() ? ["palindrome lines"] : []),
      ...(zippers() ? ["zipper lines"] : []),
      ...(betweens() ? ["between lines"] : []),
      ...(lockouts() ? ["lockout lines"] : []),
      ...(entropics() ? ["entropic lines"] : []),
      ...(modulars() ? ["modular lines"] : []),
      ...(sumlines() ? ["sum lines"] : []),
      ...(regionsums() ? ["region sum lines"] : []),
      ...(indexes() ? ["value indexing lines"] : []),
      ...(dots() ? ["dots"] : []),
      ...(xvs() ? ["X and V marks"] : []),
      ...(signs() ? ["Greater Than signs"] : []),
      ...(quads() ? ["quads"] : []),
      ...(circles() ? ["Counting Circles"] : []),
      ...(chaos() ? ["Chaos Construction regions"] : []),
      ...(sandwiches() ? ["Sandwich sums"] : []),
      ...(littles() ? ["Little Killer sums"] : []),
      ...(skyscrapers() ? ["Skyscraper counts"] : []),
      ...(xsums() ? ["X-Sums"] : []),
      ...(hiddens() ? ["Hidden Skyscraper clues"] : []),
      ...(rooms() ? ["Numbered Room clues"] : []),
      ...(ranks() ? ["Full Rank clues"] : []),
      ...(indexings() || indexcells() ? ["indexing marks"] : []),
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
  const K = Object.values(CAGES).find((k) => k.list === why);
  if (K) return K.problems[check.problem.why];
  if (why === "thermos") return THERMO_PROBLEMS[check.problem.why];
  if (why === "arrows") return ARROW_PROBLEMS[check.problem.why];
  if (why === "doubles") return DOUBLE_PROBLEMS[check.problem.why];
  if (why === "pills") return PILL_PROBLEMS[check.problem.why];
  if (why === "whispers" || why === "dutches") return WHISPER_PROBLEMS[check.problem.why];
  if (why === "renbans") return RENBAN_PROBLEMS[check.problem.why];
  if (why === "palindromes") return PALINDROME_PROBLEMS[check.problem.why];
  if (why === "zippers") return ZIPPER_PROBLEMS[check.problem.why];
  if (why === "betweens") return BETWEEN_PROBLEMS[check.problem.why];
  if (why === "lockouts") return LOCKOUT_PROBLEMS[check.problem.why];
  if (why === "entropics") return ENTROPIC_PROBLEMS[check.problem.why];
  if (why === "modulars") return MODULAR_PROBLEMS[check.problem.why];
  if (why === "sumlines") return SUM_LINE_PROBLEMS[check.problem.why];
  if (why === "regionsums") return REGION_SUM_PROBLEMS[check.problem.why];
  if (why === "indexes") return INDEX_PROBLEMS[check.problem.why];
  if (why === "dots") return DOT_PROBLEMS[check.problem.why];
  if (why === "xvs") return XV_PROBLEMS[check.problem.why];
  if (why === "signs") return SIGN_PROBLEMS[check.problem.why];
  if (why === "quads") return QUAD_PROBLEMS[check.problem.why];
  if (why === "sandwiches") return SANDWICH_PROBLEMS[check.problem.why];
  if (why === "littles") return LITTLE_PROBLEMS[check.problem.why];
  if (why === "skyscrapers") return SKYSCRAPER_PROBLEMS[check.problem.why];
  if (why === "xsums") return XSUM_PROBLEMS[check.problem.why];
  if (why === "hiddens") return HIDDEN_PROBLEMS[check.problem.why];
  if (why === "rooms") return ROOM_PROBLEMS[check.problem.why];
  if (why === "circles" || why === "circlesets") return CIRCLE_PROBLEMS[check.problem.why];
  if (why === "chaosarrows") return CHAOS_ARROW_PROBLEMS[check.problem.why];
  if (why === "shades") return SHADE_PROBLEMS[check.problem.why];
  if (why === "shading") {
    const how = creating() ? "Add a Yin-Yang circle near there, then check again." : "A circle is probably missing or wrong; check it against the original.";
    return `The digits come out one way, but the shading can go more than one way: ${where(check.c)} could be shaded or not. ${how}`;
  }
  if (why === "chaoscounts") return CHAOS_COUNT_PROBLEMS[check.problem.why];
  if (why === "zero") return `Doppelgänger's 0 means nothing to ${check.rule}: turn one of them off.`;
  if (why === "chaosrule") return "Chaos Arrows and Chaos Counts count regions worked out under Chaos Construction: turn it on, or take them off.";
  if (why === "cuts") {
    const how = creating() ? "Add a Chaos Arrow or Count, or a clue, near there, then check again." : "A clue is probably missing or wrong; check it against the original.";
    return `The digits come out one way, but the regions can be cut more than one way: ${where(check.c)} could go in either of two. ${how}`;
  }
  if (why === "ranks") return RANK_PROBLEMS[check.problem.why];
  if (why === "indexings") return INDEXING_PROBLEMS[check.problem.why];
  if (why === "indexcells") return INDEX_CELL_PROBLEMS[check.problem.why];
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
  if (relliks()) extra.push("adding up to a Rellik cage's number");
  if (lunchboxes()) extra.push("twice in a lunchbox, or not making its sum between its smallest and largest");
  if (looksays()) extra.push("more or fewer of a digit than a Look and Say clue counts");
  if (equalities()) extra.push("a 5, a repeat, or too many odd, even, low or high digits in an Equality cage");
  if (equalsums()) extra.push("pieces of an Equal Sum cage adding up to different totals");
  if (samevalues()) extra.push("a digit in one piece of a Same Values cage that another has no room for");
  if (connecteds()) extra.push("a Connected Values cage's digits cut off from each other, or none of them");
  if (distincts()) extra.push("more or fewer different digits than a Count Distinct cage's # cell counts");
  if (thermos()) extra.push("not rising along a thermometer");
  if (arrows()) extra.push("not adding up to an arrow's circle");
  if (doubles()) extra.push("not adding up to a double arrow's two circles");
  if (pills()) extra.push("not adding up to a pill arrow's pill");
  if (whispers()) extra.push(`less than ${whisperGap(s.rules)} apart next to each other on a whisper line`);
  if (dutches()) extra.push(`less than ${DUTCH_GAP} apart next to each other on a Dutch whisper line`);
  if (renbans()) extra.push("repeating or leaving a gap on a renban line");
  if (palindromes()) extra.push("not the same from either end of a palindrome line");
  if (zippers()) extra.push("not making a zipper line's total");
  if (betweens()) extra.push("not between a between line's circles");
  if (lockouts()) extra.push(`not outside a lockout line's diamonds, or diamonds less than ${LOCKOUT_GAP} apart`);
  if (entropics()) extra.push("not one low, one middle and one high in three cells in a row on an entropic line");
  if (modulars()) extra.push("not one each of 1 4 7, 2 5 8 and 3 6 9 in three cells in a row on a modular line");
  if (sumlines()) extra.push("not cutting a sum line into runs that each make its sum");
  if (regionsums() && !chaos()) extra.push(`not making the same total in each ${regions() ? "region" : "box"} along a region sum line`);
  if (indexes()) extra.push("not the dot's digit where a value indexing line's count points");
  if (dots()) extra.push("breaking a dot");
  if (xvs()) extra.push("not adding up to an X or a V");
  if (signs()) extra.push("not larger on the open side of a sign");
  if (quads()) extra.push("leaving a quad's digit too few cells");
  if (circles()) extra.push(`in more circles${circlesets() ? " of a set" : ""} than itself, or too few circles left to make up its count`);
  if (chaosarrows() || chaoscounts()) extra.push("more than a Chaos Arrow or Count could count, or 1 where it counts a cell beside it");
  if (sandwiches()) extra.push("not adding up to a Sandwich sum between a 1 and a 9");
  if (littles()) extra.push("not adding up to a Little Killer sum");
  if (skyscrapers()) extra.push("showing more or fewer than a Skyscraper count");
  if (xsums()) extra.push("not adding up to an X-Sum");
  if (hiddens()) extra.push("hiding some other height first than a Hidden Skyscraper clue");
  if (rooms()) extra.push("putting some other digit where a Numbered Room's first digit points");
  if (ranks()) extra.push("starting a Full Rank row or column with the wrong digit, or ranking it too high or too low");
  if (indexings() || indexcells()) extra.push("putting some other digit where an indexing cell points");
  const house = chaos() ? "row or column" : `row, column or ${regions() ? "region" : "box"}`;
  return `The red digits clash: the same digit twice in a ${house}${extra.length ? `, ${extra.join(", or ")}` : ""}.`;
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

const DOUBLE_PROBLEMS = {
  count: "There is room for forty double arrows.",
  length: "A double arrow needs three to nine cells, its circles included: one between them at least.",
  cell: "A double arrow has a cell off the board.",
  loop: "A double arrow cannot cross itself.",
  apart: "Each cell of a double arrow must touch the one before it.",
};

const PILL_PROBLEMS = {
  count: "There is room for forty pill arrows.",
  pill: "A pill is two or three cells side by side, along a row or down a column.",
  length: `A pill arrow's arrow needs one to ${PILL_ARROW_MOST} cells.`,
  cell: "A pill arrow has a cell off the board.",
  loop: "A pill arrow cannot cross itself or its pill.",
  apart: "A pill arrow's arrow starts beside its pill, and each cell must touch the one before it.",
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

const SUM_LINE_PROBLEMS = {
  count: "There is room for forty sum lines.",
  length: `A sum line needs two to ${LONG_LINE_MOST} cells.`,
  cell: "A sum line has a cell off the board.",
  loop: "A sum line cannot cross itself.",
  apart: "Each cell of a sum line must touch the one before it.",
  sum: `A sum line's sum is 1 to ${SUM_LINE_MAX}.`,
  looplength: `A sum line closed in a loop needs three to ${LOOP_LINE_MOST} cells.`,
  open: "A sum line closes in a loop only where its last cell touches its first.",
};

const REGION_SUM_PROBLEMS = {
  count: "There is room for forty region sum lines.",
  length: `A region sum line needs two to ${LONG_LINE_MOST} cells.`,
  cell: "A region sum line has a cell off the board.",
  loop: "A region sum line cannot cross itself.",
  apart: "Each cell of a region sum line must touch the one before it.",
};

const INDEX_PROBLEMS = {
  count: "There is room for forty value indexing lines.",
  length: `A value indexing line needs three to ${INDEX_LINE_MOST} cells: the dot, the counting cell, and a cell to count to at least.`,
  cell: "A value indexing line has a cell off the board.",
  loop: "A value indexing line cannot cross itself.",
  apart: "Each cell of a value indexing line must touch the one before it.",
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

const HIDDEN_PROBLEMS = {
  view: "A Hidden Skyscraper clue goes beside a row or a column.",
  height: "A Hidden Skyscraper clue is 1 to 8: a 9 is never hidden.",
  twice: "That side of that row or column has a Hidden Skyscraper clue already.",
};

const ROOM_PROBLEMS = {
  view: "A Numbered Room clue goes beside a row or a column.",
  digit: "A Numbered Room clue is a digit, 1 to 9.",
  twice: "That side of that row or column has a Numbered Room clue already.",
};

const CIRCLE_PROBLEMS = {
  count: `There is room for ${CIRCLES_MOST} counting circles: 1 to 9 in them, each digit that many times.`,
  cell: "A counting circle has a cell off the board.",
  twice: "A cell has two counting circles.",
  sets: `There is room for ${CIRCLE_SETS_MOST + 1} sets of counting circles.`,
};

const RANK_PROBLEMS = {
  view: "A Full Rank clue goes beside a row or a column.",
  rank: `A Full Rank clue is 1 to ${RANK_MOST}: there are ${RANK_MOST} rows and columns, read from each side.`,
  twice: "That side of that row or column has a Full Rank clue already.",
  same: "Two Full Rank clues have the same rank: each rank goes beside one row or column.",
};

const INDEXING_PROBLEMS = {
  line: "An indexing mark goes left of a row or above a column.",
  twice: "That row or column has an indexing mark already.",
};

const CHAOS_ARROW_PROBLEMS = {
  cell: "A Chaos Arrow is off the board.",
  ways: "A Chaos Arrow points one to four ways, each with a cell to point at.",
  arms: "A Chaos Arrow has one to four arms, each from beside it, each cell beside the last, and none sharing a cell.",
  twice: "That cell has a Chaos Arrow already.",
};

const SHADE_PROBLEMS = {
  cell: "A Yin-Yang circle is off the board.",
  shade: "A Yin-Yang circle is shaded or unshaded.",
  twice: "That cell has a Yin-Yang circle already.",
};

const CHAOS_COUNT_PROBLEMS = {
  cell: "A Chaos Count is off the board.",
  twice: "That cell has a Chaos Count already.",
  counted: "A Chaos Count of its own cells counts one cell at least, not its own.",
};

const INDEX_CELL_PROBLEMS = {
  cell: "An indexing cell is off the board.",
  line: "An indexing cell goes by its own row or its own column.",
  twice: "That cell is marked that way already.",
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

const SIGN_PROBLEMS = {
  cell: "A sign has a cell off the board.",
  apart: "A sign must sit on the side two cells share.",
  mark: "A sign must point one way or the other.",
  twice: "Two signs sit on the same side.",
};

const QUAD_PROBLEMS = {
  cell: "A quad sits on a corner where four cells meet.",
  digits: "A quad holds one to four digits, 1 to 9.",
  thrice: "Four cells round a corner hold a digit twice at most, so a quad lists it twice at most.",
  twice: "That corner has a quad already.",
};

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

const RELLIK_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A Rellik cage needs one to nine cells.",
  sum: "A Rellik cage's number is 1 to 45.",
  apart: "A Rellik cage's cells must join up edge to edge.",
};

const LUNCHBOX_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A lunchbox needs two to nine cells.",
  sum: `A lunchbox's sum is 0 to ${LUNCHBOX_MAX}, and one the digits between its smallest and largest can make: 0 or 2 to 8 with three cells, and so on.`,
  line: "A lunchbox's cells sit side by side in a straight line, along a row or down a column.",
};

const LOOKSAY_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A Look and Say cage needs one to nine cells.",
  clue: "A Look and Say clue is pairs of a count and a digit 1 to 9, like 2314 for two 3s and one 4: each digit once, and no more counted than the cage has cells.",
  apart: "A Look and Say cage's cells must join up edge to edge.",
};

const EQUALITY_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "An Equality cage needs two, four, six or eight cells: as many odd digits as even, and none a 5.",
  apart: "An Equality cage's cells must join up edge to edge.",
};

const EQUAL_SUM_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "An Equal Sum cage needs two cells at least, in two pieces or more.",
  pieces: "An Equal Sum cage comes in two pieces or more: cells touching along a side are one piece, unless Next piece split them.",
  piece: "Each piece of an Equal Sum cage is one to nine cells.",
  split: "Each piece of an Equal Sum cage must join up edge to edge.",
};

const SAME_VALUE_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A Same Values cage needs two cells at least, in two pieces or more.",
  pieces: "A Same Values cage comes in two pieces or more: cells touching along a side are one piece, unless Next piece split them.",
  piece: "Each piece of a Same Values cage is one to nine cells.",
  uneven: "The pieces of a Same Values cage are all the same size.",
  split: "Each piece of a Same Values cage must join up edge to edge.",
};

const CONNECTED_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A Connected Values cage needs two cells at least.",
  clue: "A Connected Values clue is one to eight different digits 1 to 9, like 135.",
  apart: "A Connected Values cage's cells must join up edge to edge.",
  groupsize: "A Connected Values cage's group size is 1 up to how many cells the cage has.",
};

const DISTINCT_PROBLEMS = {
  ...CAGE_PROBLEMS,
  size: "A Count Distinct cage needs two cells at least: the # cell and one to count.",
  control: "A Count Distinct cage's # cell is one of its own cells.",
  apart: "A Count Distinct cage's cells must join up edge to edge.",
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

// The lists of drawn parts: CAGES's, "regions", then LINES's and the others'.
const partLists = () => [...Object.values(CAGES).map((K) => K.list), "regions", ...[LINES, EDGES, QUADS, OUTSIDE, EXTRAS].flatMap((table) => Object.values(table).map((P) => P.list))];

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
  if (cageMode) return typeSum(String(d % 10));
  if (lineKind && LINES[lineKind].sum) return typeLineSum(String(d % 10));
  if (lineKind) {
    const L = LINES[lineKind];
    return say(`Digits wait until the ${L.name} is done: tap its cells, ${L.start} first, then ${addLabel()}.`);
  }
  if (markMode && quadAt != null) return typeQuadDigit(d);
  if (markMode) return say(s.quad ? "Tap near a corner where four cells meet first, for a quad's digits." : "Digits wait until the marks are done: tap Done first.");
  if (outMode) return typeOutSum(String(d % 10));
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
  if (markMode) return quadAt != null ? eraseQuadDigit() : undefined;
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
  editingKind = null;
  pathLoop = false;
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
  const parts = {};
  for (const [kind, P] of [...Object.entries(CAGES), ...Object.entries(LINES), ...Object.entries(EDGES), ...Object.entries(QUADS), ...Object.entries(OUTSIDE), ...Object.entries(EXTRAS)]) parts[P.list] = s[kind] ? [] : s[P.list];
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
  s.rules = seed.rules ?? 0;
  const parts = {};
  for (const [kind, K] of Object.entries(CAGES)) {
    s[kind] = Boolean(seed[K.list]);
    parts[K.list] = seed[K.list] ? seed[K.list].map((k) => ({ ...k, cells: k.cells.slice() })) : s[K.list];
  }
  for (const [kind, L] of Object.entries(LINES)) {
    s[kind] = Boolean(seed[L.list]);
    parts[L.list] = seed[L.list] ? seed[L.list].map(copyLine) : s[L.list];
  }
  for (const [kind, E] of Object.entries(EDGES)) {
    s[kind] = Boolean(seed[E.list]);
    parts[E.list] = seed[E.list] ? seed[E.list].map((e) => ({ cells: e.cells.slice(), mark: e.mark })) : s[E.list];
  }
  for (const [kind, Q] of Object.entries(QUADS)) {
    s[kind] = Boolean(seed[Q.list]);
    parts[Q.list] = seed[Q.list] ? Q.copy(seed[Q.list]) : s[Q.list];
  }
  for (const [kind, O] of Object.entries(OUTSIDE)) {
    s[kind] = Boolean(seed[O.list]);
    parts[O.list] = seed[O.list] ? seed[O.list].map((o) => ({ ...o, ...(o.cells ? { cells: o.cells.slice() } : {}) })) : s[O.list];
  }
  // A seed with only single indexing cells turns Row/Column Indexing on as
  // well; whatever of the switch's was kept for later goes with the seed's.
  for (const [kind, X] of Object.entries(EXTRAS)) {
    if (seed[X.list] && !s[kind]) {
      s[kind] = true;
      parts[X.main] = [];
    }
    parts[X.list] = seed[X.list] ? X.copy(seed[X.list]) : s[kind] ? [] : s[X.list];
  }
  s.jigsaw = Boolean(seed.regions);
  parts.regions = seed.regions ? seed.regions.slice() : s.regions;
  // A seed from before Dutch Whispers lines, with the rule that made every
  // whisper line Dutch: its lines go in as Dutch ones.
  if (s.rules & DUTCH_RULE && seed.whispers) {
    s.rules &= ~DUTCH_RULE;
    parts.dutches = (seed.dutches ?? []).concat(parts.whispers);
    parts.whispers = [];
    s.dutch = true;
    s.whisper = false;
  }
  s.rules &= ~DUTCH_RULE;
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
  if (parseCode(text)) return openCode(text);
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

// The answer, once it is all filled in, in the same form. It is 81 digits
// whatever the rules, so a variant's copies too.
async function onCopyAnswer() {
  if (!isSolved()) return;
  flash("solverAnswerLabel", (await copyText(puzzleText(solution))) ? "Copied" : "Copy failed", "Copy answer");
}

// A pasted short code, looked up, then opened as its seed.
async function openCode(text) {
  say("Looking up that short seed…");
  const found = await findSeed(text);
  if (s.stage !== "enter") return;
  if (!found.seed) return say(CODE_TROUBLE[found.why]);
  openSeed(found.seed, "Pasted");
}

// The made seed's short code, once it comes: shown in its place, and what
// Copy seed copies.
function showMadeCode() {
  const seed = made;
  fetchCode(seed).then((code) => code && made === seed && render());
}

async function onSeedCopy() {
  if (!made) return;
  flash("solverSeedCopyLabel", (await copyText(seedLabel(made))) ? "Copied" : "Copy failed", "Copy seed");
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

// The Open a seed box. A short code is looked up first.
async function onSeedOpen() {
  const box = $("solverSeedInput");
  const text = box.value.trim();
  if (s.stage !== "enter") return;
  if (!text) {
    seedNote = "Type or paste a seed first, such as one from Copy seed.";
    return render();
  }
  if (parseCode(text)) {
    seedNote = "Looking up that short seed…";
    render();
  }
  const { seed, why } = await findSeed(text);
  if (s.stage !== "enter") return;
  if (!seed) {
    seedNote = CODE_TROUBLE[why] ?? "That is not a seed, or not one with a single answer. Seeds look like H-BXK4-M9TR; a made puzzle's are longer.";
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
  for (const [kind, K] of Object.entries(CAGES)) if (s[kind] && !s[K.list].length) return say(K.first);
  if (s.thermo && !s.thermos.length) return say("Draw a thermometer first: tap Thermos, then the bulb and each next cell.");
  if (s.arrow && !s.arrows.length) return say("Draw an arrow first: tap Arrows, then the circle and each cell along it.");
  if (s.doublearrow && !s.doubles.length) return say("Draw a double arrow first: tap Doubles, then a circle, each cell along it, and the other circle.");
  if (s.pillarrow && !s.pills.length) return say("Draw a pill arrow first: tap Pills, then the pill's cells and each cell along its arrow.");
  if (s.whisper && !s.whispers.length) return say("Draw a whisper line first: tap Whispers, then each cell along it.");
  if (s.dutch && !s.dutches.length) return say("Draw a Dutch whisper line first: tap Whispers, then each cell along it.");
  if (s.renban && !s.renbans.length) return say("Draw a renban line first: tap Renbans, then each cell along it.");
  if (s.palindrome && !s.palindromes.length) return say("Draw a palindrome line first: tap Palindromes, then each cell along it.");
  if (s.zipper && !s.zippers.length) return say("Draw a zipper line first: tap Zippers, then each cell along it.");
  if (s.between && !s.betweens.length) return say("Draw a between line first: tap Betweens, then a circle, each cell along it, and the other circle.");
  if (s.lockout && !s.lockouts.length) return say("Draw a lockout line first: tap Lockouts, then a diamond, each cell along it, and the other diamond.");
  if (s.entropic && !s.entropics.length) return say("Draw an entropic line first: tap Entropics, then each cell along it.");
  if (s.modular && !s.modulars.length) return say("Draw a modular line first: tap Modulars, then each cell along it.");
  if (s.sumline && !s.sumlines.length) return say("Draw a sum line first: tap Sum lines, then each cell along it, and type its sum.");
  if (s.regionsum && !s.regionsums.length) return say("Draw a region sum line first: tap Region sums, then each cell along it.");
  if (s.valueindex && !s.indexes.length) return say("Draw a value indexing line first: tap Indexing, then the dot, the counting cell and each cell after it.");
  if (s.kropki && !s.dots.length) return say("Put a dot down first: tap Marks, then near the side between two cells.");
  if (s.xv && !s.xvs.length) return say("Put an X or a V down first: tap Marks, then near the side between two cells.");
  if (s.greater && !s.signs.length) return say("Put a sign down first: tap Marks, then near the side between two cells.");
  if (s.quad && !s.quads.length) return say("Put a quad down first: tap Marks, then near a corner where four cells meet, and type its digits.");
  if (s.counting && !s.circles.length) return say("Put some counting circles down first: tap Marks, then the middle of a cell.");
  if (s.chaosarrow && !s.chaosarrows.length) return say("Put a Chaos Arrow down first: tap Marks, pick Chaos arrow with Middle, then the middle of a cell.");
  if (s.chaoscount && !s.chaoscounts.length) return say("Put a Chaos Count down first: tap Marks, pick Chaos count with Middle, then the middle of a cell.");
  if (s.yinyang && !s.shades.length) return say("Put some Yin-Yang circles down first: tap Marks, pick Yin-Yang with Middle, then the middle of a cell.");
  if ((chaosarrows() || chaoscounts()) && !chaos()) return say("Chaos Arrows and Chaos Counts count regions worked out under Chaos Construction: turn it on too.");
  if (chaos() && !chaosarrows() && !chaoscounts() && !regionsums()) {
    return say("Chaos Construction needs something to say where the regions go, as rows and columns always fit: turn on Chaos Arrow or Chaos Count and put some down.");
  }
  if (s.sandwich && !s.sandwiches.length) return say("Put a Sandwich sum down first: tap Outside, then a spot left of a row or above a column.");
  if (s.little && !s.littles.length) return say("Put a Little Killer sum down first: tap Outside, then a spot round the edge.");
  if (s.skyscraper && !s.skyscrapers.length) return say("Put a Skyscraper count down first: tap Outside, then a spot beside a row or column.");
  if (s.xsum && !s.xsums.length) return say("Put an X-Sum down first: tap Outside, then a spot beside a row or column.");
  if (s.hiddensky && !s.hiddens.length) return say("Put a Hidden Skyscraper clue down first: tap Outside, then a spot beside a row or column.");
  if (s.room && !s.rooms.length) return say("Put a Numbered Room clue down first: tap Outside, then a spot beside a row or column.");
  if (s.fullrank && !s.ranks.length) return say("Put a Full Rank clue down first: tap Outside, then a spot beside a row or column.");
  if (hasRule(s.rules, "cluedrankties") && !ranks()) return say("Clued Rank Ties changes Full Rank clues: turn Full Rank on and put one down, or turn Clued Rank Ties off.");
  if (s.rowcolindex && !s.indexings.length && !s.indexcells.length) {
    return say("Put an indexing mark down first: tap Outside, then a spot left of a row or above a column; or tap Marks for a single cell.");
  }
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
    showMadeCode();
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
  const caged = Object.values(CAGES).reduce((n, K) => n + (made[K.list]?.length ?? 0), 0);
  const what = name ? `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} puzzle with ${caged ? `${plural(caged, "cage")} and ` : ""}${clues}` : `with ${clues}`;
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

// The kinds of cage, all drawn with the one Cages tool; they differ in
// their clue, their words and where they are kept. Each key is also the
// name of the rule's switch in a stage's state. clue: what is typed for
// one, "sum" for a number, "clue" for digits kept as typed (after tidy, if
// a kind has it), or none; most, how many digits of it at most; typed,
// what the words call it; control, whether the first cell tapped is the
// cage's control.
const CAGES = {
  killer: {
    list: "cages",
    title: "Killer cage",
    clue: "sum",
    most: 2,
    typed: "sum",
    label: "Cage sum",
    problem: cageProblem,
    problems: CAGE_PROBLEMS,
    tap: "Tap the cells of a cage, then type its sum.",
    first: "Draw some cages first: tap Cages, then the cells of a cage, then type its sum.",
    intro: "A killer puzzle: tap Cages, then the cells of a cage, then type its sum. Clues are optional.",
    added: ({ sum }) => `adding to ${sum}`,
  },
  rellik: {
    list: "relliks",
    title: "Rellik cage",
    clue: "sum",
    most: 2,
    typed: "number",
    label: "Rellik cage's number",
    problem: rellikProblem,
    problems: RELLIK_PROBLEMS,
    tap: "Tap the cells of a Rellik cage, then type its number: no digits in it add up to that.",
    first: "Draw a Rellik cage first: tap Cages, then the cells of a cage, then type its number.",
    intro: "A Rellik puzzle: tap Cages, then the cells of a cage, then type its number. No digits in the cage add up to it, together or alone.",
    added: ({ sum }) => `with no digits adding to ${sum}`,
  },
  lunchbox: {
    list: "lunchboxes",
    title: "Lunchbox",
    clue: "sum",
    most: 2,
    typed: "sum",
    label: "Lunchbox sum",
    problem: lunchboxProblem,
    problems: LUNCHBOX_PROBLEMS,
    tap: "Tap cells side by side along a row or down a column, then type the sum of the digits between the smallest and largest.",
    first: "Draw a lunchbox first: tap Cages, then cells side by side along a row or down a column, then type its sum.",
    intro: "A lunchbox puzzle: tap Cages, then cells side by side along a row or down a column, then type the sum of the digits between its smallest and largest.",
    added: ({ sum }) => `with ${sum} between its smallest and largest`,
  },
  looksay: {
    list: "looksays",
    title: "Look and Say cage",
    clue: "clue",
    most: 18,
    typed: "clue",
    label: "Look and Say clue",
    problem: lookSayProblem,
    problems: LOOKSAY_PROBLEMS,
    tap: "Tap the cells of a Look and Say cage, then type its clue as pairs of a count and a digit, like 2314 for two 3s and one 4.",
    first: "Draw a Look and Say cage first: tap Cages, then the cells of a cage, then type its clue.",
    intro: "A Look and Say puzzle: tap Cages, then the cells of a cage, then type its clue as pairs of a count and a digit, like 2314 for two 3s and one 4.",
    added: ({ clue }) => `holding ${sayWords(clue)}`,
  },
  equality: {
    list: "equalities",
    title: "Equality cage",
    clue: null,
    problem: equalityProblem,
    problems: EQUALITY_PROBLEMS,
    tap: "Tap two, four, six or eight cells of an Equality cage: it holds as many odd digits as even, and low as high.",
    first: "Draw an Equality cage first: tap Cages, then two, four, six or eight cells.",
    intro: "An Equality puzzle: tap Cages, then two, four, six or eight cells. Each cage holds as many odd digits as even, and as many low as high.",
    added: () => "with as many odd digits as even, and low as high",
  },
  equalsum: {
    list: "equalsums",
    title: "Equal Sum cage",
    clue: null,
    problem: equalSumProblem,
    problems: EQUAL_SUM_PROBLEMS,
    split: true,
    tap: "Tap the cells of two or more pieces of an Equal Sum cage: every piece adds up to the same. Next piece ends one, even beside the next.",
    first: "Draw an Equal Sum cage first: tap Cages, then the cells of two or more pieces.",
    intro: "An Equal Sum puzzle: tap Cages, then the cells of two or more pieces, tapping Next piece between pieces side by side. Every piece of a cage adds up to the same total.",
    added: (cage) => `in ${piecesFor(cage).length} pieces adding up the same`,
  },
  samevalue: {
    list: "samevalues",
    title: "Same Values cage",
    clue: null,
    problem: sameValueProblem,
    problems: SAME_VALUE_PROBLEMS,
    split: true,
    tap: "Tap the cells of two or more pieces of a Same Values cage, the same size: every piece holds the same digits. Next piece ends one, even beside the next.",
    first: "Draw a Same Values cage first: tap Cages, then the cells of two or more pieces the same size.",
    intro: "A Same Values puzzle: tap Cages, then the cells of two or more pieces the same size, tapping Next piece between pieces side by side. Every piece of a cage holds the same digits.",
    added: (cage) => `in ${piecesFor(cage).length} pieces holding the same digits`,
  },
  connected: {
    list: "connecteds",
    title: "Connected Values cage",
    clue: "clue",
    most: 9,
    typed: "digits",
    label: "Connected digits",
    // The digits in rising order, each once.
    tidy: (text) => [...new Set(text)].sort().join(""),
    problem: connectedProblem,
    problems: CONNECTED_PROBLEMS,
    // An optional group size, in the Size box.
    size: true,
    tap: "Tap the cells of a Connected Values cage, then type its digits, like 135: the cells holding them join up. The Size box, if filled in, says how many of them there are.",
    first: "Draw a Connected Values cage first: tap Cages, then the cells of a cage, then type its digits.",
    intro: "A Connected Values puzzle: tap Cages, then the cells of a cage, then type its digits, like 135. The cells holding any of them join up edge to edge.",
    added: ({ clue, size }) => `with its ${linkWords(clue)} joined up${size ? `, ${plural(size, "cell")} of them` : ""}`,
  },
  countdistinct: {
    list: "distincts",
    title: "Count Distinct cage",
    clue: null,
    control: true,
    problem: distinctProblem,
    problems: DISTINCT_PROBLEMS,
    tap: "Tap the # cell of a Count Distinct cage first, then the rest of its cells: the # cell's digit counts the different digits in the rest.",
    first: "Draw a Count Distinct cage first: tap Cages, then its # cell, then the rest of its cells.",
    intro: "A Count Distinct puzzle: tap Cages, then a cage's # cell, then the rest of its cells. The # cell's digit counts the different digits in the rest.",
    added: ({ control }) => `counting from ${where(control)}`,
  },
};

// The kinds of cage with their rules on, in CAGES's order.
const cageKinds = () => Object.keys(CAGES).filter((kind) => s[kind]);

// The cage of a kind on that holds cell c: { kind, index }, or null.
function cageAt(c) {
  for (const kind of cageKinds()) {
    const index = s[CAGES[kind].list].findIndex((k) => k.cells.includes(c));
    if (index >= 0) return { kind, index };
  }
  return null;
}

// A cage's clue as it is typed.
const clueText = (kind, cage) => (CAGES[kind].clue === "sum" ? String(cage.sum) : CAGES[kind].clue === "clue" ? cage.clue : "");

// A rule button's key: a key of CAGES, LINES, EDGES or OUTSIDE, or jigsaw,
// all switches in a stage's state, or one of RULES by key, a bit of s.rules.
const isSwitch = (key) => key in CAGES || key === "jigsaw" || key in LINES || key in EDGES || key in QUADS || key in OUTSIDE;
const ruleOn = (key) => (isSwitch(key) ? s[key] : Boolean(s.rules & RULES.find((r) => r.key === key).bit));

// Rules that say opposite things, so one on turns the other off: a
// Jigsaw's regions are drawn, and Chaos Construction's found.
const EITHER = [
  ["norankties", "cluedrankties"],
  ["jigsaw", "chaos"],
];

// Turns a rule button's rule on or off.
function setRule(key, on) {
  if (isSwitch(key)) s[key] = on;
  else if (on) s.rules |= RULES.find((r) => r.key === key).bit;
  else s.rules &= ~RULES.find((r) => r.key === key).bit;
}

function toggleRule(key) {
  if (s.stage !== "enter") return;
  endCage();
  setRule(key, !ruleOn(key));
  for (const pair of EITHER) {
    const other = pair.find((k) => k !== key);
    if (pair.includes(key) && ruleOn(key)) setRule(other, false);
  }
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
  if (!s[cageKind]) cageKind = cageKinds()[0] ?? "killer";
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// Drops the cells gathered but not added, and any cage picked up.
function clearPicked() {
  picked = new Set();
  editing = null;
  closedPieces = [];
  $("cageSum").value = "";
  $("cageSize").value = "";
}

// The picked cells not in a piece ended with Next piece.
const openPiece = () => {
  const closed = new Set(closedPieces.flat());
  return [...picked].filter((c) => !closed.has(c)).sort((a, b) => a - b);
};

// Next piece: the cells picked since the last one are a piece of their own,
// even if the next one's cells touch them.
function onNextPiece() {
  const piece = openPiece();
  if (!piece.length) return say("Tap the cells of this piece first, then Next piece.");
  closedPieces.push(piece);
  say(`Piece ${closedPieces.length} of ${plural(piece.length, "cell")}. Tap the cells of the next one.`);
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

// A tap in the Cages tool: a cell of another cage, of any kind on, with
// nothing gathered, picks that cage up, and its kind with it; otherwise the
// cell goes in or out of the gathering.
function pickCell(c) {
  const held = cageAt(c);
  const same = held && editing && held.kind === editing.kind && held.index === editing.index;
  if (!picked.size && held) {
    editing = held;
    cageKind = held.kind;
    const cage = s[CAGES[held.kind].list][held.index];
    // A control goes first, as it was tapped; pieces side by side come back
    // ended, all but the last.
    picked = new Set(cage.control != null ? [cage.control, ...cage.cells] : cage.cells);
    closedPieces = cage.pieces ? cage.pieces.slice(0, -1).map((p) => p.slice()) : [];
    $("cageSum").value = clueText(held.kind, cage);
    $("cageSize").value = cage.size != null ? String(cage.size) : "";
  } else if (held && !same) {
    return say("That cell is in another cage. Add or clear this one first, then tap it to change that cage.");
  } else if (picked.has(c)) {
    picked.delete(c);
    closedPieces = closedPieces.map((p) => p.filter((o) => o !== c)).filter((p) => p.length);
  } else picked.add(c);
  note = "";
  render();
}

// Digits typed while gathering go to the clue; "back" takes one off.
function typeSum(key) {
  const K = CAGES[cageKind];
  if (!K.clue) return say(`${K.title}s have no clue: tap the cells, then Add cage.`);
  const box = $("cageSum");
  box.value = key === "back" ? box.value.slice(0, -1) : (box.value + key).slice(-K.most);
  note = "";
  render();
}

// The kind button: the next kind of cage with its rule on. A cage picked
// up turns into that kind when it is changed.
function turnCageKind() {
  const kinds = cageKinds();
  cageKind = kinds[(kinds.indexOf(cageKind) + 1) % kinds.length];
  note = "";
  render();
}

function cageStatus() {
  const K = CAGES[cageKind];
  const n = picked.size;
  const kinds = cageKinds().length > 1 ? ` The kind button says which kind: now ${K.title}.` : "";
  if (!n) return `${K.tap} Tap a cage already drawn to change it.${kinds}`;
  const then = editing ? "Change cage" : "Add cage";
  const head = K.control ? ` The # cell is ${where([...picked][0])}.` : "";
  const pieces = K.split && closedPieces.length ? ` Piece ${closedPieces.length + 1} has ${plural(openPiece().length, "cell")}.` : "";
  return `${plural(n, "cell")} picked.${head}${pieces} ${K.clue ? `Type the ${K.typed}, then ${then}` : `Tap ${then}`}.${kinds}`;
}

function onCageAdd() {
  const K = CAGES[cageKind];
  const cells = [...picked].sort((a, b) => a - b);
  if (!cells.length) return;
  const typed = $("cageSum").value.trim();
  if (K.clue && !/^\d+$/.test(typed)) return say(`Type the ${K.typed} first.`);
  const text = K.tidy ? K.tidy(typed) : typed;
  let cage = K.clue === "sum" ? { sum: Number(text), cells } : K.clue === "clue" ? { clue: text, cells } : K.control ? { control: [...picked][0], cells } : { cells };
  // Pieces ended with Next piece, kept only where some sit side by side.
  if (K.split && closedPieces.length) cage = tidyPieces(cells, [...closedPieces, openPiece()].filter((p) => p.length));
  if (K.size) {
    const size = $("cageSize").value.trim();
    if (size && !/^\d+$/.test(size)) return say("Type the group's size as a number, or leave the Size box empty.");
    if (size) cage.size = Number(size);
  }
  // The cage picked up goes from its own kind's list, whichever that is.
  const parts = {};
  if (editing) parts[CAGES[editing.kind].list] = s[CAGES[editing.kind].list].filter((_, i) => i !== editing.index);
  const next = (parts[K.list] ?? s[K.list]).concat([cage]).sort((a, b) => a.cells[0] - b.cells[0]);
  const problem = K.problem(next, s.rules);
  if (problem) return say(K.problems[problem.why]);
  parts[K.list] = next;
  change(s.clues, parts);
  clearPicked();
  say(`${K.title} of ${plural(cells.length, "cell")} ${K.added(cage)}. Tap the cells of the next one.`);
}

function onCageRemove() {
  if (!editing) return;
  const { list } = CAGES[editing.kind];
  change(s.clues, { [list]: s[list].filter((_, i) => i !== editing.index) });
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
  doublearrow: {
    list: "doubles",
    short: "double arrow",
    name: "double arrow",
    title: "Double arrow",
    a: "A double arrow",
    start: "circle",
    least: 3,
    started: "One circle placed. Tap each next cell; the last one is the other circle. The digits between add up to the two circles' together.",
    problem: doubleProblem,
    problems: DOUBLE_PROBLEMS,
  },
  // Kept as { pill, arrow }, not a path: pathOf and copyLine below.
  pillarrow: {
    list: "pills",
    short: "pill arrow",
    name: "pill arrow",
    title: "Pill arrow",
    a: "A pill arrow",
    start: "pill",
    pill: true,
    started: "Pill placed. Tap the arrow's first cell, beside the pill: the digits along the arrow add up to the pill's number.",
    problem: pillProblem,
    problems: PILL_PROBLEMS,
  },
  // German and Dutch Whispers lines are both drawn with the Whispers tool,
  // its kind button picking which a line is (WHISPER_KINDS below).
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
  dutch: {
    list: "dutches",
    short: "whisper",
    name: "Dutch whisper line",
    title: "Dutch whisper line",
    a: "A Dutch whisper line",
    start: "end",
    started: `One end placed. Tap the next cell: digits next to each other on the line differ by at least ${DUTCH_GAP}.`,
    problem: dutchProblem,
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
  // Kept as { sum, cells }, the sum typed in the bar's box: pathOf and
  // copyLine below.
  sumline: {
    list: "sumlines",
    short: "sum line",
    name: "sum line",
    title: "Sum line",
    a: "A sum line",
    start: "end",
    sum: true,
    loops: true,
    most: LONG_LINE_MOST,
    started: "One end placed. Tap the next cell, and type the line's sum: it cuts into runs of cells that each add up to it.",
    problem: sumLineProblem,
    problems: SUM_LINE_PROBLEMS,
  },
  regionsum: {
    list: "regionsums",
    short: "region sum",
    name: "region sum line",
    title: "Region sum line",
    a: "A region sum line",
    start: "end",
    most: LONG_LINE_MOST,
    // A Jigsaw's regions, or Chaos Construction's, in the boxes' place.
    get started() {
      return `One end placed. Tap the next cell: the line's digits in each ${regions() || chaos() ? "region" : "box"} it passes through add up to the same total.`;
    },
    problem: regionSumProblem,
    problems: REGION_SUM_PROBLEMS,
  },
  valueindex: {
    list: "indexes",
    short: "indexing line",
    name: "value indexing line",
    title: "Value indexing line",
    a: "A value indexing line",
    start: "dot",
    least: 3,
    most: INDEX_LINE_MOST,
    started: "Dot placed. Tap the counting cell next: its digit says how many cells on past it the dot's digit sits again.",
    problem: indexProblem,
    problems: INDEX_PROBLEMS,
  },
};

const addLabel = () => `${editingLine >= 0 ? "Change" : "Add"} ${LINES[lineKind].short}`;

// The kinds of line the Whispers tool draws, and those of them with their
// rules on: German and Dutch. A tool for one kind of line, `kind`, draws
// those of `kind` alone.
const WHISPER_KINDS = ["whisper", "dutch"];
const kindsOf = (kind) => (WHISPER_KINDS.includes(kind) ? WHISPER_KINDS.filter((k) => s[k]) : [kind]);
// The kind of whisper line drawn last, for the Whispers tool to start on.
let whisperKind = "whisper";

// kind: a key of LINES; for the Whispers tool, either kind of whisper line.
function toggleLineMode(kind) {
  if (lineKind && kindsOf(kind).includes(lineKind)) return endCage(true);
  endCage();
  const kinds = kindsOf(kind);
  lineKind = kinds.includes(whisperKind) ? whisperKind : kinds[0] ?? kind;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// The Whispers tool's kind button: the line being drawn, or the next one,
// German or Dutch.
function turnLineKind() {
  const kinds = kindsOf(lineKind);
  if (kinds.length < 2) return;
  lineKind = whisperKind = kinds[(kinds.indexOf(lineKind) + 1) % kinds.length];
  note = "";
  render();
}

// A line as the tool draws it, a path from its first cell: a pill arrow's
// pill and then its arrow, a sum line's cells, any other the line itself.
// copyLine copies one.
const pathOf = (t) => (t.pill ? [...t.pill, ...t.arrow] : t.cells ?? t);
const copyLine = (t) =>
  t.pill ? { pill: t.pill.slice(), arrow: t.arrow.slice() } : t.cells ? { sum: t.sum, cells: t.cells.slice(), ...(t.loop ? { loop: true } : {}) } : t.slice();

// Leaves the line tool, dropping any path not added. The sum typed for a
// sum line goes too.
function endLine() {
  lineKind = null;
  path = [];
  editingLine = -1;
  editingKind = null;
  pathLoop = false;
  $("lineSum").value = "";
}

// Digits typed in the Sum lines tool go to the sum; "back" takes one off.
function typeLineSum(key) {
  const box = $("lineSum");
  box.value = key === "back" ? box.value.slice(0, -1) : (box.value + key).slice(-2);
  note = "";
  render();
}
const lineSumTyped = () => /^\d+$/.test($("lineSum").value.trim());

// Whether the sum line being drawn can close in a loop: three cells or more,
// its last touching its first.
const canClose = () => LINES[lineKind].loops && !pathLoop && path.length >= 3 && touching(path[0], path.at(-1));

// A tap in a line tool: with no path, a cell of a line picks it up, and
// then its first cell (any of a pill's) starts another line there, for
// lines that share a bulb, a circle, an end or a pill; the path's last cell
// takes that step back; otherwise the cell is the next step, if it can be.
// A sum line's first cell, tapped again where the line can close, closes
// it in a loop; its first or last cell then opens it again.
function pickLineCell(c) {
  if (!path.length) {
    // A line of any kind the tool draws; the tool turns to its kind.
    for (const kind of kindsOf(lineKind)) {
      const lines = s[LINES[kind].list];
      const i = lines.findIndex((t) => pathOf(t).includes(c));
      if (i < 0) continue;
      lineKind = kind;
      editingLine = i;
      editingKind = kind;
      path = pathOf(lines[i]).slice();
      pathLoop = Boolean(lines[i].loop);
      if (LINES[kind].pill) pillSize = lines[i].pill.length;
      if (LINES[kind].sum) $("lineSum").value = String(lines[i].sum);
      note = "";
      return render();
    }
  }
  const L = LINES[lineKind];
  if (pathLoop) {
    if (c !== path[0] && c !== path.at(-1)) return say(`The loop is closed. Tap its first or last cell to open it, or ${addLabel()}.`);
    pathLoop = false;
    note = "";
    return render();
  }
  if (c === path[0] && canClose()) {
    if (path.length > LOOP_LINE_MOST) return say(L.problems.looplength);
    pathLoop = true;
    note = "";
    return render();
  }
  const head = path.slice(0, L.pill ? pillSize : 1);
  if (editingLine >= 0 && head.includes(c)) {
    editingLine = -1;
    editingKind = null;
    path = head;
    note = "";
    return render();
  }
  if (c === path.at(-1)) return stepBack();
  if (path.includes(c)) return say(L.problems.loop);
  const why = L.pill ? pillStep(c) : path.length && !touching(path.at(-1), c) ? "The next cell must touch the last one, along a side or at a corner." : "";
  if (why) return say(why);
  if (path.length === most(L)) return say(`${L.a} has ${most(L) === 9 ? "nine" : most(L)} cells at most.`);
  path.push(c);
  note = "";
  render();
}

// Why cell c cannot come next on a pill arrow being drawn, or "": the
// pill's cells go side by side in a straight line, then the arrow starts
// beside any of them, each cell after touching the one before.
function pillStep(c) {
  const n = path.length;
  if (!n) return "";
  const last = path.at(-1);
  if (n < pillSize) {
    const straight = n < 2 || c - last === last - path[n - 2];
    return beside(Math.min(last, c), Math.max(last, c)) && straight ? "" : "A pill's cells sit side by side in a straight line, along a row or down a column.";
  }
  if (n === pillSize) return path.some((o) => touching(o, c)) ? "" : "The arrow starts beside the pill, along a side or at a corner.";
  return touching(last, c) ? "" : "The next cell must touch the last one, along a side or at a corner.";
}

// The Pills tool's size button: a pill of 2 cells or of 3, keeping those of
// the pill's cells already tapped that still fit.
function turnPill() {
  const next = pillSize === 2 ? 3 : 2;
  path = path.slice(0, Math.min(pillSize, next));
  pillSize = next;
  note = "";
  render();
}

// A step back opens a closed loop before it takes a cell off.
function stepBack() {
  if (pathLoop) pathLoop = false;
  else path.pop();
  note = "";
  render();
}

function lineStatus() {
  const L = LINES[lineKind];
  if (L.pill && path.length < pillSize) {
    if (path.length) return `${path.length} of the pill's ${pillSize} cells. Tap the next, beside it in a straight line.`;
    return `Tap the pill's ${pillSize} cells, side by side, then each cell along its arrow. Pill of ${pillSize} changes its size. Tap a pill arrow already drawn to change it.`;
  }
  if (L.pill && path.length === pillSize) return L.started;
  if (!path.length) return `Tap the ${L.start}, then each next cell in order. Tap ${L.a.toLowerCase()} already drawn to change it.`;
  if (path.length === 1) return L.started;
  const sum = L.sum && !lineSumTyped() ? " Type its sum too." : "";
  if (pathLoop) return `A loop of ${plural(path.length, "cell")}: ${addLabel()}.${sum} Tapping its first or last cell opens it again.`;
  const close = canClose() ? ` Tap its first cell to close it in a loop.` : "";
  const again = editingLine >= 0 && !close ? ` Tap its ${L.start} to start another from it.` : "";
  return `${plural(path.length, "cell")} long. Tap on, or ${addLabel()}.${sum} Tapping the last cell takes it back.${close}${again}`;
}

// The fewest and the most cells a kind of line has, a pill arrow's pill
// included.
const least = (L) => (L.pill ? pillSize + 1 : L.least ?? 2);
const most = (L) => (L.pill ? pillSize + PILL_ARROW_MOST : L.most ?? 9);

function onLineAdd() {
  const L = LINES[lineKind];
  if (path.length < least(L)) {
    if (L.pill) return say(`A pill arrow needs its pill of ${pillSize} cells and one cell of arrow at least.`);
    return say(least(L) === 2 ? `${L.a} needs two cells at least: the ${L.start} and one more.` : `${L.a} needs ${least(L) === 3 ? "three" : least(L)} cells at least.`);
  }
  if (L.sum && !lineSumTyped()) return say("Type the line's sum first.");
  const sum = Number($("lineSum").value.trim());
  const line = L.pill
    ? { pill: path.slice(0, pillSize).sort((a, b) => a - b), arrow: path.slice(pillSize) }
    : L.sum
      ? { sum, cells: path.slice(), ...(pathLoop ? { loop: true } : {}) }
      : path.slice();
  // The line picked up goes from its own kind's list, whichever that is.
  const parts = {};
  if (editingKind && editingKind !== lineKind) parts[LINES[editingKind].list] = s[LINES[editingKind].list].filter((_, i) => i !== editingLine);
  const next = s[L.list].filter((_, i) => editingKind !== lineKind || i !== editingLine).concat([line]);
  const problem = L.problem(next);
  if (problem) return say(L.problems[problem.why]);
  const n = path.length;
  const closed = pathLoop;
  parts[L.list] = next;
  change(s.clues, parts);
  path = [];
  editingLine = -1;
  editingKind = null;
  pathLoop = false;
  // The sum stays typed for the next line, as puzzles often give every
  // line the same.
  const runs = L.sum ? `, its runs adding up to ${sum}` : "";
  say(`${closed ? "Loop" : L.title} of ${plural(n, "cell")} added${runs}. Tap the ${L.start} of the next one, or Done.`);
}

function onLineRemove() {
  if (editingLine < 0) return;
  const L = LINES[editingKind ?? lineKind];
  change(s.clues, { [L.list]: s[L.list].filter((_, i) => i !== editingLine) });
  path = [];
  editingLine = -1;
  editingKind = null;
  pathLoop = false;
  say(`${L.title} removed. Undo brings it back.`);
}

/* ---- dots and XV marks ---- */

// Kropki's dots, XV's marks and Greater Than's signs, each kept in a list of
// its own as lines are. Each key is also the name of the rule's switch.
const EDGES = {
  kropki: { list: "dots", marks: DOT_MARKS, problem: dotProblem },
  xv: { list: "xvs", marks: XV_MARKS, problem: xvProblem },
  greater: { list: "signs", marks: SIGN_MARKS, problem: signProblem },
};
const MARK_WORDS = { white: "white dot", black: "black dot", x: "X", v: "V", gt: "sign one way", lt: "sign the other way" };

// Quad's circles on corners, Counting Circles' in cells, Chaos Arrows' and
// Counts' in cells, and Yin-Yang's circles in cells, likewise, each with how
// to copy its list.
const QUADS = {
  quad: { list: "quads", problem: quadProblem, copy: (quads) => quads.map((q) => ({ cell: q.cell, digits: q.digits.slice() })) },
  counting: { list: "circles", problem: circleProblem, copy: (circles) => circles.slice() },
  chaosarrow: {
    list: "chaosarrows",
    problem: chaosArrowProblem,
    copy: (arrows) => arrows.map(({ cell, ways, arms }) => (arms ? { cell, arms: arms.map((arm) => arm.slice()) } : { cell, ways })),
  },
  chaoscount: {
    list: "chaoscounts",
    problem: chaosCountProblem,
    copy: (counts) => counts.map((x) => (typeof x === "number" ? x : { cell: x.cell, cells: x.cells.slice() })),
  },
  yinyang: { list: "shades", problem: shadeProblem, copy: (list) => list.map(({ cell, shade }) => ({ cell, shade })) },
};

// More of what a switch already puts down, in a list of its own under the
// same switch: Counting Circles' sets past the first, and Row/Column
// Indexing's single cells beside its marked lines (`main`). Each with how
// to check and copy it.
const EXTRAS = {
  counting: { list: "circlesets", main: "circles", problem: circleSetProblem, copy: (sets) => sets.map((set) => set.slice()) },
  rowcolindex: { list: "indexcells", main: "indexings", problem: indexCellProblem, copy: (cells) => cells.map(({ cell, line }) => ({ cell, line })) },
};
const capital = (text) => text[0].toUpperCase() + text.slice(1);

// The marks a side steps through, with the rules on: white dot, black dot,
// X, V, a sign one way and the other, then none.
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
  quadAt = null;
  ownAt = null;
}

// The corner of cell c nearest a tap at `at`, by the top left of its four
// cells, or -1 when the tap was not near a corner, the corner is on the
// grid's edge, or the tap came from the keyboard.
function cornerNear(c, at) {
  if (!at) return -1;
  const [x, y] = at;
  if (Math.min(x, 1 - x) >= 0.28 || Math.min(y, 1 - y) >= 0.28) return -1;
  const r = ROW[c] - (y < 0.5 ? 1 : 0);
  const col = COL[c] - (x < 0.5 ? 1 : 0);
  return r >= 0 && r < 8 && col >= 0 && col < 8 ? r * 9 + col : -1;
}

const cornerName = (cell) => `the corner of rows ${ROW[cell] + 1} and ${ROW[cell] + 2}, columns ${COL[cell] + 1} and ${COL[cell] + 2}`;
const sortQuads = (list) => list.sort((p, q) => p.cell - q.cell);

// A digit typed with a corner picked goes in its quad.
function typeQuadDigit(d) {
  const now = s.quads.find((q) => q.cell === quadAt);
  const digits = [...(now?.digits ?? []), d];
  const next = sortQuads(s.quads.filter((q) => q.cell !== quadAt).concat([{ cell: quadAt, digits }]));
  const problem = quadProblem(next);
  if (problem) return say(QUAD_PROBLEMS[problem.why]);
  change(s.clues, { quads: next });
  say(`Quad at ${cornerName(quadAt)}: ${digits.join(" ")}.${digits.length < 4 ? " Type another, or tap another corner." : ""}`);
}

// Erase with a corner picked takes its quad's last digit off, and the quad
// with its last one.
function eraseQuadDigit() {
  const now = s.quads.find((q) => q.cell === quadAt);
  if (!now) return;
  const digits = now.digits.slice(0, -1);
  change(s.clues, { quads: sortQuads(s.quads.filter((q) => q.cell !== quadAt).concat(digits.length ? [{ cell: quadAt, digits }] : [])) });
  say(digits.length ? `Quad at ${cornerName(quadAt)}: ${digits.join(" ")}.` : "Quad taken off. Undo brings it back.");
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
// the mark between the two. With Counting Circles or Row/Column Indexing
// on, a tap in the middle puts what Middle says there, or takes it off,
// instead; from the keyboard, where there is no middle, a cell picked twice
// does.
function pickMarkSide(c, at) {
  // Giving an arrow arms or a count cells of its own, every tap is for it.
  if (ownAt != null) return middleKind()?.arms ? tapArms(c) : tapCounted(c);
  // With Quad on, a tap near a corner picks it for the quad's digits.
  const corner = s.quad ? cornerNear(c, at) : -1;
  if (corner >= 0) {
    anchor = null;
    quadAt = quadAt === corner ? null : corner;
    note = "";
    return render();
  }
  quadAt = null;
  const sides = markCycle().length > 0;
  const middles = middleKinds().length > 0;
  // With Chaos arrow picked, a tap near the side of a cell holding one
  // turns it to point that way, or not.
  const way = middles && middleKind().arrow ? wayNear(c, at) : -1;
  if (way >= 0 && s.chaosarrows.some((a) => a.cell === c && !a.arms)) {
    anchor = null;
    return turnArrowWay(c, way);
  }
  if (!sides && !middles) return say("Tap near a corner where four cells meet to put a quad there.");
  let other = sides ? sideNear(c, at) : -1;
  if (other < 0 && anchor != null && beside(Math.min(anchor, c), Math.max(anchor, c))) other = anchor;
  if (other >= 0) {
    anchor = null;
    return stepMark(Math.min(c, other), Math.max(c, other));
  }
  if (middles && (at || !sides || anchor === c)) {
    anchor = null;
    const kind = middleKind();
    if (kind.circle) return toggleCircle(c, kind.set);
    if (kind.arrow) return toggleChaosArrow(c);
    if (kind.arms) return tapArms(c);
    if (kind.count) return toggleChaosCount(c);
    if (kind.counted) return tapCounted(c);
    if (kind.shade) return turnShade(c);
    return toggleIndexCell(c, kind.column);
  }
  anchor = anchor === c ? null : c;
  note = "";
  render();
}

// Every set of counting circles drawn: the first, then the rest.
const allCircleSets = () => (s.circles.length ? [s.circles, ...s.circlesets] : []);

// What a tap in a cell's middle can put there, with the rules on: a circle
// of each set of Counting Circles there is, and of a new set while there is
// room; and a cell indexing by its column, as a marked column's cells do,
// or by its row. [{ circle: true, set } or { column }], and what Middle
// shows for each.
function middleKinds() {
  const out = [];
  if (s.counting) {
    const n = allCircleSets().length;
    for (let set = 0; set < Math.max(n, 1); set++) out.push({ circle: true, set, label: n < 2 ? "Circles" : `Circles, set ${set + 1}` });
    if (n && n <= CIRCLE_SETS_MOST) out.push({ circle: true, set: n, label: "New circle set" });
  }
  if (s.rowcolindex) out.push({ column: true, label: "Column indexing" }, { column: false, label: "Row indexing" });
  if (s.chaosarrow) out.push({ arrow: true, label: "Chaos arrow" }, { arms: true, label: "Chaos arms" });
  if (s.chaoscount) out.push({ count: true, label: "Chaos count" }, { counted: true, label: "Count cells" });
  if (s.yinyang) out.push({ shade: true, label: "Yin-Yang" });
  return out;
}

// A Yin-Yang circle in cell c, on to the next: none, shaded, unshaded, none.
function turnShade(c) {
  const now = s.shades.find((x) => x.cell === c)?.shade ?? 0;
  const next = (now + 1) % 3;
  const kept = s.shades.filter((x) => x.cell !== c);
  change(s.clues, { shades: next ? kept.concat([{ cell: c, shade: next }]).sort((a, b) => a.cell - b.cell) : kept });
  if (!next) return say(`Yin-Yang circle at ${where(c)} taken off. Undo brings it back.`);
  say(`${capital(where(c))} is ${next === 1 ? "shaded" : "unshaded"}. Tap it again for ${next === 1 ? "unshaded" : "none"}.`);
}

// Which side of cell c a tap at `at` is near, up, right, down or left as
// ARROW_WAYS has them, or -1 when it was nearer the middle, or came from
// the keyboard.
function wayNear(c, at) {
  if (!at) return -1;
  const [x, y] = at;
  const gaps = [y, 1 - x, 1 - y, x];
  const way = gaps.indexOf(Math.min(...gaps));
  return gaps[way] < 0.28 ? way : -1;
}

const WAY_WORDS = ["up", "right", "down", "left"];
const waysText = (ways) => {
  const names = WAY_WORDS.filter((_, i) => ways & (1 << i));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
};

// Puts a Chaos Arrow in cell c, pointing every way it can, or takes it out.
function toggleChaosArrow(c) {
  const had = s.chaosarrows.some((a) => a.cell === c);
  const next = had ? s.chaosarrows.filter((a) => a.cell !== c) : s.chaosarrows.concat([{ cell: c, ways: waysFrom(c) }]).sort((a, b) => a.cell - b.cell);
  change(s.clues, { chaosarrows: next });
  if (had) return say(`Chaos Arrow at ${where(c)} taken off. Undo brings it back.`);
  say(`Chaos Arrow at ${where(c)}, pointing ${waysText(waysFrom(c))}. Tap near one of its sides to turn that way off.`);
}

// Turns the Chaos Arrow in cell c to point the way `way`, or not: one way
// at least, and only where there is a cell to point at.
function turnArrowWay(c, way) {
  const bit = 1 << way;
  if (!(waysFrom(c) & bit)) return say("That side is the grid's edge: there is nothing to point at.");
  const arrow = s.chaosarrows.find((a) => a.cell === c);
  const ways = arrow.ways ^ bit;
  if (!ways) return say("A Chaos Arrow points one way at least. Tap its middle to take it off.");
  change(s.clues, { chaosarrows: s.chaosarrows.map((a) => (a.cell === c ? { cell: c, ways } : a)) });
  say(`Chaos Arrow at ${where(c)} now points ${waysText(ways)}.`);
}

// Puts a Chaos Count in cell c, or takes it out, of its own cells or not.
function toggleChaosCount(c) {
  const had = s.chaoscounts.some((x) => countCell(x) === c);
  change(s.clues, { chaoscounts: had ? s.chaoscounts.filter((x) => countCell(x) !== c) : s.chaoscounts.concat([c]).sort((a, b) => countCell(a) - countCell(b)) });
  say(had ? `Chaos Count at ${where(c)} taken off. Undo brings it back.` : `Chaos Count at ${where(c)}: its digit counts it and the cells round it in its region.`);
}

// Chaos arms and Count cells: the cell of the Chaos Arrow being given arms
// of its own, or of the Chaos Count being given cells of its own, once one
// is tapped; tapping it again is done.
let ownAt = null;

// A tap with Chaos arms picked: the arrow's cell first, then cells along
// its arms. A cell beside the end of an arm, along a side, carries it on;
// one beside the arrow starts another, up to four; an arm's last cell takes
// it back. An arrow pointing its ways starts from those arms, to the edge.
function tapArms(c) {
  if (ownAt == null || c === ownAt) {
    ownAt = ownAt == null ? c : null;
    note = "";
    return render();
  }
  const cell = ownAt;
  const arrow = s.chaosarrows.find((a) => a.cell === cell);
  const arms = (arrow ? arrow.arms ?? chaosArms(cell, arrow.ways) : []).map((arm) => arm.slice());
  const end = arms.findIndex((arm) => arm.at(-1) === c);
  if (end >= 0) {
    arms[end].pop();
    if (!arms[end].length) arms.splice(end, 1);
  } else {
    if (arms.some((arm) => arm.includes(c))) return say("That cell is on an arm already: tap an arm's last cell to take it back.");
    const from = arms.findIndex((arm) => sideOf(arm.at(-1), c) >= 0);
    if (from >= 0) arms[from].push(c);
    else if (sideOf(cell, c) >= 0 && arms.length < 4) arms.push([c]);
    else return say("An arm starts beside the arrow and goes on a cell at a time, each beside the last along a side.");
  }
  const kept = s.chaosarrows.filter((a) => a.cell !== cell);
  const next = arms.length ? kept.concat([{ cell, arms }]).sort((a, b) => a.cell - b.cell) : kept;
  const problem = chaosArrowProblem(next);
  if (problem) return say(CHAOS_ARROW_PROBLEMS[problem.why]);
  change(s.clues, { chaosarrows: next });
  if (!arms.length) return say(`Chaos Arrow at ${where(cell)} taken off. Undo brings it back.`);
  const long = arms.map((arm) => arm.length);
  const lengths = long.length > 1 ? `${long.slice(0, -1).join(", ")} and ${long.at(-1)} cells long` : plural(long[0], "cell") + " long";
  say(`Chaos Arrow at ${where(cell)}: ${plural(arms.length, "arm")}, ${lengths}. Tap on, or its cell when done.`);
}

// A tap with Count cells picked: the count's cell first, then each cell it
// counts, in or out. A count of the cells round it is a plain one; it
// starts from those.
function tapCounted(c) {
  if (ownAt == null || c === ownAt) {
    ownAt = ownAt == null ? c : null;
    note = "";
    return render();
  }
  const cell = ownAt;
  const now = s.chaoscounts.find((x) => countCell(x) === cell);
  const cells = now == null ? [] : typeof now === "number" ? chaosAround(cell) : now.cells.slice();
  const at = cells.indexOf(c);
  if (at >= 0) cells.splice(at, 1);
  else cells.push(c);
  cells.sort((a, b) => a - b);
  const plain = cells.join() === chaosAround(cell).join();
  const kept = s.chaoscounts.filter((x) => countCell(x) !== cell);
  const next = cells.length ? kept.concat([plain ? cell : { cell, cells }]).sort((a, b) => countCell(a) - countCell(b)) : kept;
  change(s.clues, { chaoscounts: next });
  if (!cells.length) return say(`Chaos Count at ${where(cell)} taken off. Undo brings it back.`);
  say(`Chaos Count at ${where(cell)} counts ${plain ? "the cells round it" : plural(cells.length, "cell")} of its region. Tap more, or its cell when done.`);
}

// The cells the arrow or count being given its own has, for the board.
function ownCells() {
  if (ownAt == null) return [];
  if (middleKind()?.arms) {
    const arrow = s.chaosarrows.find((a) => a.cell === ownAt);
    return arrow ? (arrow.arms ?? chaosArms(ownAt, arrow.ways)).flat() : [];
  }
  const count = s.chaoscounts.find((x) => countCell(x) === ownAt);
  return count == null ? [] : typeof count === "number" ? chaosAround(ownAt) : count.cells;
}
const middleKind = () => {
  const kinds = middleKinds();
  return kinds[Math.min(middle, kinds.length - 1)];
};

// The Middle button: on to the next of middleKinds.
function turnMiddle() {
  const kinds = middleKinds();
  middle = (Math.min(middle, kinds.length - 1) + 1) % kinds.length;
  ownAt = null;
  note = "";
  render();
}

// Puts a counting circle of set `set` in cell c, taking it out of any
// other set; or takes it out, if it was in that one. A set left empty goes,
// and those after it move down.
function toggleCircle(c, set) {
  const sets = allCircleSets().map((cells) => cells.filter((o) => o !== c));
  const was = allCircleSets().findIndex((cells) => cells.includes(c));
  if (was !== set) {
    if (set === sets.length) sets.push([]);
    sets[set] = sets[set].concat([c]).sort((a, b) => a - b);
    if (sets[set].length > CIRCLES_MOST) return say(CIRCLE_PROBLEMS.count);
  }
  const kept = sets.filter((cells) => cells.length);
  change(s.clues, { circles: kept[0] ?? [], circlesets: kept.slice(1) });
  if (was === set) return say(`Circle at ${where(c)} taken off. Undo brings it back.`);
  const count = plural(sets[set].length, "circle");
  const of = kept.length > 1 ? ` in set ${set + 1}` : "";
  say(`${capital(where(c))}${was >= 0 ? ` moved to set ${set + 1}` : " circled"}: ${count}${of} so far. Tap it again to take it off.`);
}

// Marks cell c as indexing by its column, or by its row, or takes the mark
// off. A row or column marked whole already has its cells.
function toggleIndexCell(c, column) {
  const line = column ? 9 + COL[c] : ROW[c];
  const name = column ? `Column ${COL[c] + 1}` : `Row ${ROW[c] + 1}`;
  if (s.indexings.some((i) => i.line === line)) return say(`${name} has an indexing mark already, so all its cells index.`);
  const had = s.indexcells.some((x) => x.cell === c && x.line === line);
  const next = had
    ? s.indexcells.filter((x) => x.cell !== c || x.line !== line)
    : s.indexcells.concat([{ cell: c, line }]).sort((a, b) => a.cell - b.cell || b.line - a.line);
  change(s.clues, { indexcells: next });
  if (had) return say(`Indexing at ${where(c)} taken off. Undo brings it back.`);
  const digit = column ? COL[c] + 1 : ROW[c] + 1;
  const holds = `holds ${digit === 8 ? "an" : "a"} ${digit}`;
  const says = column ? `which column of row ${ROW[c] + 1} ${holds}` : `which row of column ${COL[c] + 1} ${holds}`;
  say(`${capital(where(c))} indexes by its ${column ? "column" : "row"}: its digit says ${says}. Tap it again to take it off.`);
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
  if (next === "gt" || next === "lt") return say(`Sign ${between}: ${where(next === "gt" ? a : b)} is the larger. Tap there again for the next mark.`);
  say(next ? `${capital(MARK_WORDS[next])} ${between}. Tap there again for the next mark.` : `Mark ${between} taken off. Undo brings it back.`);
}

function markStatus() {
  if (quadAt != null) {
    const digits = s.quads.find((q) => q.cell === quadAt)?.digits;
    return `Quad at ${cornerName(quadAt)}: ${digits ? digits.join(" ") : "no digits yet"}. Type the digits its four cells hold, up to four; Erase takes the last off.`;
  }
  const kind = middleKinds().length ? middleKind() : null;
  const n = allCircleSets().length;
  let what = kind?.label.toLowerCase() ?? "";
  if (kind?.circle) what = n < 2 && kind.set < 1 ? "a counting circle" : kind.set < n ? `a circle of set ${kind.set + 1}` : "a circle of a new set";
  if (kind?.arrow) what = "a Chaos Arrow pointing every way; tap near the side of one to turn that way off or on";
  if (kind?.count) what = "a Chaos Count";
  if (kind?.arms && ownAt != null) {
    return `Arms for the Chaos Arrow at ${where(ownAt)}: tap a cell beside it to start an arm, or beside an arm's last cell to carry it on; an arm's last cell takes it back. Tap the arrow's cell when done.`;
  }
  if (kind?.counted && ownAt != null) return `Cells the Chaos Count at ${where(ownAt)} counts: tap a cell to put it in or take it out. Tap the count's cell when done.`;
  if (kind?.arms) what = "a Chaos Arrow with arms of its own, then the cells along each arm";
  if (kind?.counted) what = "a Chaos Count of cells of its own, then each cell it counts";
  if (kind?.shade) what = "a Yin-Yang circle, once shaded and again unshaded";
  if (anchor != null) return `${capital(where(anchor))} picked. Tap a cell beside it to mark the side between them${kind ? `, or it again for ${what}` : ""}.`;
  const kinds = markCycle().map((m) => MARK_WORDS[m]).join(", ");
  const tapped = kind ? "" : ", or tap a cell and then one beside it";
  const sides = kinds ? `Tap near the side between two cells to mark it${tapped}. Each tap steps on: ${kinds}, then none.` : "";
  const corners = s.quad ? "Tap near a corner where four cells meet for a quad, then type its digits." : "";
  const circled = kind?.circle ? ` ${plural(allCircleSets().flat().length, "circle")} so far.` : "";
  const turn = middleKinds().length > 1 ? " Middle picks what goes there." : "";
  const middles = kind ? `Tap the middle of a cell for ${what}, or to take it off.${circled}${turn}` : "";
  return [sides, corners, middles].filter(Boolean).join(" ");
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
  hiddensky: {
    list: "hiddens",
    key: "height",
    problem: hiddenProblem,
    problems: HIDDEN_PROBLEMS,
    spotOf: ({ view }) => viewSpot(view),
    at: (spot) => (viewAt(spot) >= 0 ? [{ view: viewAt(spot) }] : []),
    words: ({ view }) => `Hidden Skyscraper clue for ${viewWords(view)}`,
    turn: () => "Hidden Skyscraper",
    place: "beside a row or column for a Hidden Skyscraper clue",
    means: "a Hidden Skyscraper clue, the first digit from that side hidden behind a taller one",
  },
  room: {
    list: "rooms",
    key: "digit",
    problem: roomProblem,
    problems: ROOM_PROBLEMS,
    spotOf: ({ view }) => viewSpot(view),
    at: (spot) => (viewAt(spot) >= 0 ? [{ view: viewAt(spot) }] : []),
    words: ({ view }) => `Numbered Room clue for ${viewWords(view)}`,
    turn: () => "Numbered Room",
    place: "beside a row or column for a Numbered Room clue",
    means: "a Numbered Room clue, the digit in the cell the first digit from that side counts to",
  },
  fullrank: {
    list: "ranks",
    key: "rank",
    problem: rankProblem,
    problems: RANK_PROBLEMS,
    spotOf: ({ view }) => viewSpot(view),
    at: (spot) => (viewAt(spot) >= 0 ? [{ view: viewAt(spot) }] : []),
    words: ({ view }) => `Full Rank clue for ${viewWords(view)}`,
    turn: () => "Full Rank",
    place: "beside a row or column for a Full Rank clue",
    means: `a Full Rank clue, where the row or column read from that side comes among all ${RANK_MOST}, smallest first`,
  },
  // A mark with no number: key null.
  rowcolindex: {
    list: "indexings",
    key: null,
    problem: indexingProblem,
    problems: INDEXING_PROBLEMS,
    spotOf: ({ line }) => viewSpot(line),
    at: (spot) => {
      const view = viewAt(spot);
      return view >= 0 && view < 18 ? [{ line: view }] : [];
    },
    words: ({ line }) => (line < 9 ? `Indexing mark for row ${line + 1}` : `Indexing mark for column ${line - 8}`),
    turn: () => "Indexing",
    place: "left of a row or above a column for an indexing mark",
    means: "an indexing mark, each digit in its row or column saying where that line's number sits across it",
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
  if (s.stage !== "enter" || !outsideOn() || showingSample()) return;
  if (!outMode) toggleOutMode();
  const kinds = spotKinds(at);
  if (!kinds.length) {
    clearSpot();
    const beside = s.skyscraper || s.xsum || s.hiddensky || s.room || s.fullrank ? "beside a row or column" : s.sandwich || s.rowcolindex ? "left of a row or above a column" : "";
    const round = s.little ? "round the edge with a diagonal into the grid" : "";
    return say(`No clue goes there. Tap a spot ${[beside, round].filter(Boolean).join(", or ")}.`);
  }
  spot = at;
  const held = heldAtSpot();
  const clue = held && s[OUTSIDE[held.kind].list][held.index];
  choice = held ? Math.max(0, kinds.findIndex((k) => k.kind === held.kind && isBase(clue, k.base))) : 0;
  $("outSum").value = held && OUTSIDE[held.kind].key ? String(clue[OUTSIDE[held.kind].key]) : "";
  note = "";
  render();
}

// Whether the picked spot's clue, as Turn has it, takes a number.
const spotNumbered = () => Boolean(spot && OUTSIDE[spotKinds(spot)[choice].kind].key);

// Digits typed while a spot is picked go to its value; "back" takes one off.
function typeOutSum(key) {
  if (!spot) return say("Tap a spot round the edge of the grid first, then type its number.");
  if (!spotNumbered()) return say("An indexing mark has no number: tap Add.");
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
  const k = spotKinds(spot)[choice];
  const O = OUTSIDE[k.kind];
  if (O.key && !/^\d+$/.test(text)) return say("Type the number first.");
  const parts = {};
  for (const other of Object.values(OUTSIDE)) parts[other.list] = s[other.list].filter((clue) => !sameSpot(other.spotOf(clue), spot));
  parts[O.list].push({ ...structuredClone(k.base), ...(O.key ? { [O.key]: Number(text) } : {}) });
  // Kept in the order of their spots, as a seed keeps them.
  if (!O.key) parts[O.list].sort((a, b) => a.line - b.line);
  // A Little Killer sum goes by the rules: Doppelgänger's 0 adds nothing.
  const problem = O.problem(parts[O.list], s.rules);
  if (problem) return say(O.problems[problem.why]);
  change(s.clues, parts);
  clearSpot();
  say(`${kindWords(k)}${O.key ? `: ${text}` : " added"}. Tap the next spot, or Done.`);
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
  const add = heldAtSpot() ? "Change" : "Add";
  return `${kindWords(kinds[choice])}: ${spotNumbered() ? `type it, then ${add}` : `tap ${add}`}.${turn}`;
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

/* ---- Show sample ---- */

// While the clues go in, the maker can show a made-up puzzle in the board's
// place with an example of each part the rules on would draw, to see how a
// puzzle like that looks. It follows the rule buttons as they are pressed,
// and goes on Hide sample, leaving the person's own puzzle as it was.
const showingSample = () => sampleOn && creating() && s.stage === "enter";

// The parts' switches on, and the switch rules, which the sample is made
// for.
const sampleSwitches = () => [...new Set([...Object.keys(CAGES), "jigsaw", ...Object.keys(LINES), ...Object.keys(EDGES), ...Object.keys(QUADS), ...Object.keys(OUTSIDE)])].filter((k) => s[k]);
const sampleKey = () => JSON.stringify([sampleSwitches(), s.rules]);

function toggleSample() {
  if (!creating() || s.stage !== "enter") return;
  endCage();
  sampleOn = !sampleOn;
  selected = null;
  padDigit = 0;
  note = "";
  render();
}

// Makes the sample a moment later, so "Making a sample…" shows first: a
// Chaos Construction grid can take a second or so to find.
function scheduleSample() {
  if (sampleTimer) return;
  sampleTimer = setTimeout(() => {
    sampleTimer = null;
    if (!showingSample()) return;
    const key = sampleKey();
    sample = { key, ...samplePuzzle({ on: sampleSwitches(), rules: s.rules }) };
    render();
  }, 30);
}

const sampleReady = () => sample && sample.key === sampleKey();

// The board's view of the sample: its clues as givens, its parts, and the
// regions and shading it was made with.
function sampleView(settings) {
  const shown = sampleReady() ? sample : null;
  const clues = shown?.clues ?? empty();
  return {
    puzzle: clues,
    solution: shown?.grid ?? clues,
    values: clues,
    notes: empty(),
    selected: null,
    interactive: false,
    highlightSame: settings.highlight_same,
    highlightPeers: false,
    focusDigit: 0,
    mark: null,
    wrong: new Set(),
    ...(shown?.parts ?? {}),
    shading: shown?.shading ? shown.shading.map((shade) => (shade === 1 ? 1 : 0)) : null,
    regions: shown?.regions ?? null,
    margin: outsideOn(),
    rules: s.rules,
  };
}

function sampleStatus() {
  if (!sampleReady()) return "Making a sample…";
  const name = variantName({ ...sample.parts, regions: s.jigsaw ? sample.regions : null, rules: s.rules });
  const what = name ? `${/^[AEIOU]/.test(name) ? "An" : "A"} ${name} puzzle` : "A classic puzzle";
  const parts = [`${what}, made up to show how one looks: every clue and mark in it is true of the same answer.`];
  if (sample.regions && chaos()) parts.push("Its regions are drawn, though a real one finds them while solving.");
  if (sample.shading) parts.push("Its shading is drawn too, though a real one finds it while solving.");
  if (sample.loose) parts.push("Its digits leave some of these rules out, as they cannot all hold in one grid.");
  const chaosOnly = sample.missing.filter((k) => k === "chaosarrow" || k === "chaoscount");
  if (chaosOnly.length && !chaos()) parts.push(`${chaosOnly.map((k) => RULE_HELP[k].name).join(" and ")} need Chaos Construction on.`);
  const rest = sample.missing.filter((k) => !chaosOnly.includes(k));
  if (rest.length) parts.push(`No example of ${rest.map((k) => RULE_HELP[k].name).join(", ")} fits this one.`);
  parts.push("Turn rules on or off to see others, or tap Hide sample to go back to yours.");
  return parts.join(" ");
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
    if (s.doublearrow && !s.doubles.length) {
      return "A double arrow puzzle: tap Doubles, then a circle, each cell along the line and the other circle. The digits between add up to the two circles' together.";
    }
    if (s.pillarrow && !s.pills.length) {
      return "A pill arrow puzzle: tap Pills, then the pill's cells and each cell along its arrow. The pill's digits make a number, like 17, that the arrow's add up to.";
    }
    if (s.whisper && !s.whispers.length) {
      const both = s.dutch ? " With Dutch Whispers on too, the kind button says which a line is." : "";
      return `A German Whispers puzzle: tap Whispers, then each cell along a line. Digits next to each other on it differ by at least 5.${both}`;
    }
    if (s.dutch && !s.dutches.length) {
      return `A Dutch Whispers puzzle: tap Whispers${s.whisper ? ", pick Dutch line with the kind button," : ""} then each cell along a line. Digits next to each other on it differ by at least ${DUTCH_GAP}.`;
    }
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
    if (s.sumline && !s.sumlines.length) {
      return "A sum line puzzle: tap Sum lines, then each cell along a line, and type its sum. The line cuts into runs of cells that each add up to it, like 3 7 and then 1 9 for 10.";
    }
    if (s.regionsum && !s.regionsums.length) {
      return `A region sum puzzle: tap Region sums, then each cell along a line. Its digits in each ${regions() || chaos() ? "region" : "box"} it passes through add up to the same total.`;
    }
    if (s.valueindex && !s.indexes.length) {
      return "A value indexing puzzle: tap Indexing, then the dot and each cell along the line. The second cell's digit counts how many cells on past it the dot's digit sits again.";
    }
    if (s.kropki && !s.dots.length) {
      return "A Kropki puzzle: tap Marks, then near the side between two cells. A white dot joins consecutive digits, a black dot a digit and its double.";
    }
    if (s.xv && !s.xvs.length) return "An XV puzzle: tap Marks, then near the side between two cells. Digits either side of an X add up to 10, of a V to 5.";
    if (s.greater && !s.signs.length) return "A Greater Than puzzle: tap Marks, then near the side between two cells. A sign opens towards the larger digit.";
    if (s.quad && !s.quads.length) {
      return "A Quad puzzle: tap Marks, then near a corner where four cells meet, and type the digits those four cells hold between them.";
    }
    if (s.counting && !s.circles.length) {
      return "A Counting Circles puzzle: tap Marks, then the middle of each cell with a circle. A digit in a circle is in exactly that many circles.";
    }
    if (s.chaosarrow && !s.chaosarrows.length) {
      return "A Chaos Arrow puzzle: tap Marks, pick Chaos arrow with Middle, then the middle of a cell. Its digit counts it and the cells of its region in a line from it each way it points.";
    }
    if (s.chaoscount && !s.chaoscounts.length) {
      return "A Chaos Count puzzle: tap Marks, pick Chaos count with Middle, then the middle of a cell. Its digit counts it and the cells round it in its region.";
    }
    if (s.yinyang && !s.shades.length) {
      return "A Yin-Yang puzzle: tap Marks, pick Yin-Yang with Middle, then the middle of a cell for a shaded circle, again for an unshaded one. Every cell is shaded or not, each shade joins up, and no 2×2 is all one shade.";
    }
    if (chaos() && !s.chaosarrow && !s.chaoscount && !s.regionsum) {
      return "A Chaos Construction puzzle: no boxes, but nine regions of nine cells to find. Turn on Chaos Arrow or Chaos Count to say where they go.";
    }
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
    if (s.hiddensky && !s.hiddens.length) {
      return "A Hidden Skyscraper puzzle: tap Outside, then a spot beside a row or column, and type the height of the first digit from there hidden behind a taller one.";
    }
    if (s.room && !s.rooms.length) {
      return "A Numbered Room puzzle: tap Outside, then a spot beside a row or column, and type the digit in the cell the first digit from there counts to.";
    }
    if (s.fullrank && !s.ranks.length) {
      return `A Full Rank puzzle: tap Outside, then a spot beside a row or column, and type where the number it reads from there comes among all ${RANK_MOST}, smallest first.`;
    }
    if (s.rowcolindex && !s.indexings.length && !s.indexcells.length) {
      return "A Row/Column Indexing puzzle: tap Outside, then a spot above a column or left of a row, and tap Add. Its digits each say where its number sits across them. Tap Marks for single cells.";
    }
    if (s.jigsaw && boxesStill()) return "A Jigsaw puzzle: tap Regions to cut the grid into nine regions of nine cells, in place of the boxes.";
    if (clashes(s.clues, variant()).size) return clashText();
    const kinds = cageKinds();
    if (kinds.length) {
      // A kind switched on with none drawn yet says how, first.
      const none = kinds.find((kind) => !s[CAGES[kind].list].length);
      if (none) return CAGES[none].intro;
      const k = kinds.reduce((t, kind) => t + s[CAGES[kind].list].length, 0);
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
  made: "Paste the seed into the Seed box on the new-game screen to play it; a short one needs a connection the first time. Played solo, it scores on its own board, never the main ones.",
};

// A kind of line to draw, with its rule on: all but the one being changed,
// which is drawn as the path, not twice. null with the rule off.
const shownLines = (kind) => (s[kind] ? s[LINES[kind].list].filter((_, i) => !lineKind || editingKind !== kind || i !== editingLine) : null);

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
  const sampled = showingSample();
  if (sampled && !sampleReady()) scheduleSample();

  if (sampled) board.set(sampleView(settings));
  else board.set({
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
    // With a kind's rule off, its cages kept for later are not shown.
    cages: killer() ? s.cages : null,
    relliks: s.rellik ? s.relliks : null,
    lunchboxes: s.lunchbox ? s.lunchboxes : null,
    looksays: s.looksay ? s.looksays : null,
    equalities: s.equality ? s.equalities : null,
    equalsums: s.equalsum ? s.equalsums : null,
    samevalues: s.samevalue ? s.samevalues : null,
    connecteds: s.connected ? s.connecteds : null,
    distincts: s.countdistinct ? s.distincts : null,
    thermos: shownLines("thermo"),
    arrows: shownLines("arrow"),
    doubles: shownLines("doublearrow"),
    pills: shownLines("pillarrow"),
    whispers: shownLines("whisper"),
    dutches: shownLines("dutch"),
    renbans: shownLines("renban"),
    palindromes: shownLines("palindrome"),
    zippers: shownLines("zipper"),
    betweens: shownLines("between"),
    lockouts: shownLines("lockout"),
    entropics: shownLines("entropic"),
    modulars: shownLines("modular"),
    sumlines: shownLines("sumline"),
    regionsums: shownLines("regionsum"),
    indexes: shownLines("valueindex"),
    dots: s.kropki ? s.dots : null,
    xvs: s.xv ? s.xvs : null,
    signs: s.greater ? s.signs : null,
    quads: s.quad ? s.quads : null,
    circles: s.counting ? s.circles : null,
    circlesets: s.counting ? s.circlesets : null,
    chaosarrows: s.chaosarrow ? s.chaosarrows : null,
    chaoscounts: s.chaoscount ? s.chaoscounts : null,
    // Yin-Yang's circles, and its shading once there is an answer to show.
    shades: s.yinyang ? s.shades : null,
    // Only the shaded cells, so the unshaded ones are not all marked.
    shading: s.yinyang && solution?.shading && (stage === "made" || solved) ? solution.shading.map((shade) => (shade === 1 ? 1 : 0)) : null,
    sandwiches: s.sandwich ? s.sandwiches : null,
    littles: s.little ? s.littles : null,
    skyscrapers: s.skyscraper ? s.skyscrapers : null,
    xsums: s.xsum ? s.xsums : null,
    hiddens: s.hiddensky ? s.hiddens : null,
    rooms: s.room ? s.rooms : null,
    ranks: s.fullrank ? s.ranks : null,
    indexings: s.rowcolindex ? s.indexings : null,
    indexcells: s.rowcolindex ? s.indexcells : null,
    // Chaos Construction's regions, once there is an answer to show them.
    regions: regions() ?? (chaos() && solution?.regions && (stage === "made" || solved) ? solution.regions : null),
    margin: outsideOn(),
    spots: outMode ? openSpots() : [],
    spot: outMode ? spot : null,
    path: lineKind ? path : [],
    pathLoop: Boolean(lineKind) && pathLoop,
    pathKind: lineKind ?? "thermo",
    pathPill: pillSize,
    rules: s.rules,
    picked: cageMode
      ? picked
      : lineKind
        ? new Set(path)
        : markMode && ownAt != null
          ? new Set([ownAt, ...ownCells()])
          : markMode && quadAt != null
          ? new Set(quadCells(quadAt))
          : markMode && anchor != null
            ? new Set([anchor])
            : regionMode && brush != null
              ? new Set([...Array(81).keys()].filter((c) => s.regions[c] === brush))
              : null,
  });

  $("solverTitle").textContent = TITLES[mode][stage];
  $("solverStatus").textContent = sampled ? sampleStatus() : note || defaultStatus();
  $("solverSeed").textContent = made ? `Seed ${seedLabel(made)}` : "";
  $("solverSeed").classList.toggle("hidden", !made);
  $("solverFoot").textContent = stage === "made" ? FOOTS.made : FOOTS[mode];

  const counts = new Array(11).fill(0);
  for (const v of g) counts[v]++;
  $("solverPad").classList.toggle("ten", zero());
  $("solverPad").querySelector(".zero-btn").classList.toggle("hidden", !zero());
  document.querySelectorAll("#solverPad [data-digit]").forEach((btn) => {
    const d = Number(btn.dataset.digit);
    const left = Math.max(0, eachDigit(d) - counts[d]);
    btn.querySelector(".count").textContent = settings.show_counts ? String(left) : "";
    btn.classList.toggle("done", left === 0);
    btn.classList.toggle("lit", padDigit === d);
    btn.disabled = !canEdit();
    btn.setAttribute("aria-label", settings.show_counts ? `${d % 10}, ${left} left` : String(d % 10));
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
    solverCages: enter && cageKinds().length > 0,
    cageBar: cageMode,
    solverThermos: enter && s.thermo,
    solverArrows: enter && s.arrow,
    solverDoubles: enter && s.doublearrow,
    solverPills: enter && s.pillarrow,
    solverWhispers: enter && (s.whisper || s.dutch),
    solverRenbans: enter && s.renban,
    solverPalindromes: enter && s.palindrome,
    solverZippers: enter && s.zipper,
    solverBetweens: enter && s.between,
    solverLockouts: enter && s.lockout,
    solverEntropics: enter && s.entropic,
    solverModulars: enter && s.modular,
    solverSumLines: enter && s.sumline,
    solverRegionSums: enter && s.regionsum,
    solverIndexes: enter && s.valueindex,
    lineBar: Boolean(lineKind),
    solverMarks: enter && (s.kropki || s.xv || s.greater || s.quad || s.counting || s.rowcolindex || s.chaosarrow || s.chaoscount || s.yinyang),
    markBar: markMode,
    solverOutside: enter && outsideOn(),
    outBar: outMode,
    solverRegions: enter && s.jigsaw,
    regionBar: regionMode,
    // A variant's rules and cages do not fit in 81 characters.
    solverCopy: !cageKinds().length && !s.jigsaw && ![LINES, EDGES, QUADS, OUTSIDE].some((table) => Object.keys(table).some((kind) => s[kind])) && !s.rules,
    solverAnswer: solved,
    solverSample: creating() && enter,
    solverImage: true,
  };
  // A sample shows only itself, the rule buttons that change it, and the
  // way back.
  if (sampled) for (const id of Object.keys(shown)) if (!["solverRules", "solverRuleHelp", "solverSample"].includes(id)) shown[id] = false;
  for (const [id, on] of Object.entries(shown)) $(id).classList.toggle("hidden", !on);
  $("solverSample").setAttribute("aria-pressed", String(sampled));
  $("solverSampleLabel").textContent = sampled ? "Hide sample" : "Show sample";

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
  fillRuleHelp($("solverRuleHelp"), helpKeys, { draw: enter && !sampled });
  $("solverSeedNote").textContent =
    seedNote || (creating() ? "A seed's puzzle, to change and check again for a new seed, or to save as an image." : "A seed's puzzle, to solve here or save as an image.");
  $("solverCages").setAttribute("aria-pressed", String(cageMode));
  $("solverThermos").setAttribute("aria-pressed", String(lineKind === "thermo"));
  $("solverArrows").setAttribute("aria-pressed", String(lineKind === "arrow"));
  $("solverDoubles").setAttribute("aria-pressed", String(lineKind === "doublearrow"));
  $("solverPills").setAttribute("aria-pressed", String(lineKind === "pillarrow"));
  $("solverWhispers").setAttribute("aria-pressed", String(WHISPER_KINDS.includes(lineKind)));
  $("solverRenbans").setAttribute("aria-pressed", String(lineKind === "renban"));
  $("solverPalindromes").setAttribute("aria-pressed", String(lineKind === "palindrome"));
  $("solverZippers").setAttribute("aria-pressed", String(lineKind === "zipper"));
  $("solverBetweens").setAttribute("aria-pressed", String(lineKind === "between"));
  $("solverLockouts").setAttribute("aria-pressed", String(lineKind === "lockout"));
  $("solverEntropics").setAttribute("aria-pressed", String(lineKind === "entropic"));
  $("solverModulars").setAttribute("aria-pressed", String(lineKind === "modular"));
  $("solverSumLines").setAttribute("aria-pressed", String(lineKind === "sumline"));
  $("solverRegionSums").setAttribute("aria-pressed", String(lineKind === "regionsum"));
  $("solverIndexes").setAttribute("aria-pressed", String(lineKind === "valueindex"));
  $("solverMarks").setAttribute("aria-pressed", String(markMode));
  $("solverOutside").setAttribute("aria-pressed", String(outMode));
  $("solverRegions").setAttribute("aria-pressed", String(regionMode));
  $("regionReset").disabled = boxesStill();
  if (markMode) {
    const kinds = middleKinds();
    $("markMiddle").classList.toggle("hidden", kinds.length < 2);
    if (kinds.length) $("markMiddleLabel").textContent = middleKind().label;
  }
  if (outMode) {
    const kinds = spot ? spotKinds(spot) : [];
    const held = heldAtSpot();
    // An indexing mark has no number to type.
    const numbered = spotNumbered();
    $("outSum").classList.toggle("hidden", !numbered);
    $("outAdd").classList.toggle("hidden", !spot);
    $("outTurn").classList.toggle("hidden", kinds.length < 2);
    $("outRemove").classList.toggle("hidden", !held);
    $("outAddLabel").textContent = held ? "Change" : "Add";
    $("outAdd").disabled = numbered && !/^\d+$/.test($("outSum").value.trim());
    // Turn names what it turns the spot's clue into.
    const next = kinds[(choice + 1) % kinds.length];
    if (next) $("outTurnLabel").textContent = OUTSIDE[next.kind].turn(next.base);
  }
  if (lineKind) {
    $("lineAddLabel").textContent = addLabel();
    $("lineRemoveLabel").textContent = `Remove ${LINES[lineKind].short}`;
    $("lineRemove").classList.toggle("hidden", editingLine < 0);
    $("lineAdd").disabled = path.length < least(LINES[lineKind]);
    $("linePill").classList.toggle("hidden", !LINES[lineKind].pill);
    $("linePillLabel").textContent = `Pill of ${pillSize}`;
    $("lineKind").classList.toggle("hidden", kindsOf(lineKind).length < 2);
    $("lineKindLabel").textContent = lineKind === "dutch" ? "Dutch line" : "German line";
    for (const id of ["lineSum", "lineSumLabel"]) $(id).classList.toggle("hidden", !LINES[lineKind].sum);
  }
  if (cageMode) {
    const K = CAGES[cageKind];
    $("cageAddLabel").textContent = editing ? "Change cage" : "Add cage";
    $("cageRemove").classList.toggle("hidden", !editing);
    $("cageAdd").disabled = !picked.size;
    $("cageKind").classList.toggle("hidden", cageKinds().length < 2);
    $("cageKindLabel").textContent = K.title;
    // An Equality cage, among others, has no clue to type.
    for (const id of ["cageSum", "cageSumLabel"]) $(id).classList.toggle("hidden", !K.clue);
    $("cageSize").classList.toggle("hidden", !K.size);
    $("cageNext").classList.toggle("hidden", !K.split);
    $("cageNext").disabled = !openPiece().length;
    if (K.clue) {
      $("cageSumLabel").textContent = K.label;
      $("cageSum").placeholder = K.clue === "clue" ? "Clue" : "Sum";
    }
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
  sampleOn = false;
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
  // A sample takes no digits; Escape puts it away.
  if (showingSample()) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    toggleSample();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (cageMode && /^[0-9]$/.test(e.key)) typeSum(e.key);
  else if (cageMode && e.key === "Enter") onCageAdd();
  else if (cageMode && e.key === "Escape") endCage(true);
  // A sum line's sum can be 10 or more, so 0 is typed too; Backspace takes
  // the sum's last digit, then steps the path back.
  else if (lineKind && LINES[lineKind].sum && /^[0-9]$/.test(e.key)) typeLineSum(e.key);
  else if (lineKind && LINES[lineKind].sum && e.key === "Backspace" && $("lineSum").value) typeLineSum("back");
  else if (lineKind && e.key === "Enter") onLineAdd();
  else if (lineKind && e.key === "Escape") endCage(true);
  else if (markMode && e.key === "Escape") endCage(true);
  else if (outMode && /^[0-9]$/.test(e.key)) typeOutSum(e.key);
  else if (outMode && (e.key === "Backspace" || e.key === "Delete")) typeOutSum("back");
  else if (outMode && e.key === "Enter") onOutAdd();
  else if (outMode && e.key === "Escape") endCage(true);
  else if (regionMode && e.key === "Escape") endCage(true);
  else if (/^[1-9]$/.test(e.key)) inputDigit(Number(e.key));
  else if (e.key === "0" && zero() && s.stage !== "made") inputDigit(10);
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
  $("solverAnswer").addEventListener("click", onCopyAnswer);
  $("solverImage").addEventListener("click", onImage);
  $("solverSample").addEventListener("click", toggleSample);
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
  $("solverDoubles").addEventListener("click", () => toggleLineMode("doublearrow"));
  $("solverPills").addEventListener("click", () => toggleLineMode("pillarrow"));
  $("solverWhispers").addEventListener("click", () => toggleLineMode("whisper"));
  $("solverRenbans").addEventListener("click", () => toggleLineMode("renban"));
  $("solverPalindromes").addEventListener("click", () => toggleLineMode("palindrome"));
  $("solverZippers").addEventListener("click", () => toggleLineMode("zipper"));
  $("solverBetweens").addEventListener("click", () => toggleLineMode("between"));
  $("solverLockouts").addEventListener("click", () => toggleLineMode("lockout"));
  $("solverEntropics").addEventListener("click", () => toggleLineMode("entropic"));
  $("solverModulars").addEventListener("click", () => toggleLineMode("modular"));
  $("solverSumLines").addEventListener("click", () => toggleLineMode("sumline"));
  $("solverRegionSums").addEventListener("click", () => toggleLineMode("regionsum"));
  $("solverIndexes").addEventListener("click", () => toggleLineMode("valueindex"));
  $("solverMarks").addEventListener("click", toggleMarkMode);
  $("markDone").addEventListener("click", () => endCage(true));
  $("markMiddle").addEventListener("click", turnMiddle);
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
  $("lineSum").addEventListener("input", () => render());
  $("lineSum").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onLineAdd();
  });
  $("linePill").addEventListener("click", turnPill);
  $("lineKind").addEventListener("click", turnLineKind);
  $("lineRemove").addEventListener("click", onLineRemove);
  $("lineDone").addEventListener("click", () => endCage(true));
  $("cageKind").addEventListener("click", turnCageKind);
  $("cageAdd").addEventListener("click", onCageAdd);
  $("cageRemove").addEventListener("click", onCageRemove);
  $("cageDone").addEventListener("click", () => endCage(true));
  $("cageSum").addEventListener("input", () => render());
  $("cageSum").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onCageAdd();
  });
  $("cageSize").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onCageAdd();
  });
  $("cageNext").addEventListener("click", onNextPiece);
  document.addEventListener("keydown", onKey);
  document.addEventListener("paste", (e) => {
    if ($("solver").classList.contains("hidden") || e.target.closest?.("input, textarea") || showingSample()) return;
    e.preventDefault();
    pasteText(e.clipboardData?.getData("text"));
  });
  onSettingsChange(render);
  // Offline, the made seed shows whole, as a short code needs a connection
  // to open elsewhere; back online, its code again, fetched if need be.
  window.addEventListener("offline", render);
  window.addEventListener("online", () => {
    if (made) showMadeCode();
    render();
  });

  const open = Object.keys(states).find((name) => states[name].open);
  if (reopen && open && !$("setup").classList.contains("hidden")) openSolver(open);
}
