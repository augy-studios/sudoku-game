// The leaderboard window: best score, total points, or a day's daily, its
// classic puzzle's board or its killer's, one row per name; and made puzzles, each with a board of its own, found by
// searching their seeds.

import { api, localDate, findSeed, knownCode } from "./api.js";
import { LEVELS } from "./levels.js";
import { parseSeed, parseCode, seedVariantName } from "./seed.js";
import { escapeHtml, openModal, closeModal, copyText } from "./ui.js";
import { dayName } from "./calendar.js";
import { playSeed } from "./game.js";

// "12:05", or "1:02:05" past an hour.
export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const MODE = { solo: "", daily: "Daily, ", race: "Race, " };

const BOARDS = {
  best: {
    head: ["#", "Name", "Score", "Game"],
    row: (e) => [e.rank, e.name, e.score, `${MODE[e.mode] ?? ""}${LEVELS[e.level]?.name ?? ""}, ${formatTime(e.elapsed_ms)}`],
    about: () => "Each name's single best game. Made puzzles have boards of their own, under Puzzles.",
  },
  total: {
    head: ["#", "Name", "Total", "Games"],
    row: (e) => [e.rank, e.name, e.total, e.games],
    about: () => "Every game added under a name, scores added up. Made puzzles are left out.",
  },
  daily: {
    head: ["#", "Name", "Score", "Time"],
    row: (e) => [e.rank, e.name, e.score, formatTime(e.elapsed_ms)],
    about: (date, kind) =>
      `${date === localDate() ? "Today's" : "The"} ${kind === "killer" ? "killer" : "classic"} daily puzzle, ${dayName(date, true)}. One entry per name; the other kind has its own board.`,
  },
  made: {
    head: ["#", "Name", "Score", "Time"],
    row: (e) => [e.rank, e.name, e.score, formatTime(e.elapsed_ms)],
    about: () => "Puzzles people made in the Create tab, each with its own board. Their makers know the answers, so these are for fun.",
  },
};

const $ = (id) => document.getElementById(id);

let board = "best";
let madeSeed = null; // a made puzzle's seed, when its board is open
let madeCode = null; // and its short code, if it has one
let dailyDate = null; // the day the daily board shows, null for today
let dailyKind = "classic"; // and which of its two puzzles, "classic" or "killer"
let loading = 0;

// A made seed is long: in a list, its short code, or else its level and
// first groups, say enough.
const shortSeed = (text) => (text.length > 16 ? `${text.slice(0, 14)}…` : text);

function setTab(next) {
  board = next;
  document.querySelectorAll("#boardTabs [data-board]").forEach((el) => {
    const on = el.dataset.board === board;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
  });
  $("madeSearch").classList.toggle("hidden", board !== "made");
  $("dailyKindTabs").classList.toggle("hidden", board !== "daily");
  document.querySelectorAll("#dailyKindTabs [data-daily]").forEach((el) => el.setAttribute("aria-checked", String(el.dataset.daily === dailyKind)));
}

function table(head, rows) {
  return `<table class="board-table">
    <thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

// The made puzzles, most played first, or those matching the search.
function renderPuzzles(data) {
  const puzzles = data.puzzles ?? [];
  if (!puzzles.length) {
    return `<p class="board-empty">${
      data.q ? "No made puzzle with a board has a seed like that. Paste a whole seed or a short one to open its board." : "Nobody has played a made puzzle yet. Make one in the Create tab."
    }</p>`;
  }
  return `<ul class="made-list">${puzzles
    .map(
      (p) => `<li><button class="made-row" type="button" data-seed="${escapeHtml(p.seed)}">
        <span class="made-row-seed">${escapeHtml(p.code ?? shortSeed(p.seed))}</span>
        <span class="made-row-info">${escapeHtml([seedVariantName(p.seed), LEVELS[p.level]?.name].filter(Boolean).join(", "))}, ${p.players} ${p.players === 1 ? "player" : "players"}, best ${p.top_score}</span>
      </button></li>`
    )
    .join("")}</ul>`;
}

// One made puzzle's board, with its seed, and a way to play it.
function renderMade(data) {
  const entries = data.entries ?? [];
  madeCode = data.code ?? knownCode(madeSeed);
  return `<div class="made-head">
      <p class="made-seed">Seed ${escapeHtml(madeCode ?? madeSeed)}</p>
      <div class="round-actions">
        <button class="btn btn-primary pill" type="button" data-made="play">Play it</button>
        <button class="btn btn-quiet pill" type="button" data-made="copy">Copy seed</button>
        <button class="btn btn-quiet pill" type="button" data-made="back">All puzzles</button>
      </div>
      <p class="mode-note" id="madeMsg" role="status" aria-live="polite"></p>
    </div>
    ${entries.length ? table(BOARDS.made.head, entries.map(BOARDS.made.row)) : `<p class="board-empty">Nobody has finished this puzzle yet. Be the first.</p>`}`;
}

async function load() {
  const body = $("boardBody");
  const note = $("boardNote");
  const ticket = ++loading;
  const spec = BOARDS[board];
  const date = dailyDate ?? localDate();
  body.setAttribute("aria-busy", "true");
  note.textContent = spec.about(date, dailyKind);

  try {
    const extra = board === "daily" ? { date, kind: dailyKind } : board === "made" ? (madeSeed ? { seed: madeSeed } : { q: $("madeQuery").value }) : {};
    const data = await api.leaderboard(board, extra);
    if (ticket !== loading) return;
    if (board === "made") {
      body.innerHTML = madeSeed ? renderMade(data) : renderPuzzles(data);
      return;
    }
    const entries = data.entries ?? [];
    body.innerHTML = entries.length
      ? table(spec.head, entries.map(spec.row))
      : `<p class="board-empty">${
          board === "daily"
            ? `Nobody has finished ${date === localDate() ? "today's" : "that day's"} ${dailyKind} puzzle yet. Be the first.`
            : "No scores yet. Finish a game and add yours."
        }</p>`;
  } catch (err) {
    if (ticket !== loading) return;
    body.innerHTML = `<p class="board-empty">${
      err.code === "offline" ? "The leaderboard needs a connection." : "The leaderboard did not load. Try again in a moment."
    }</p>`;
  } finally {
    if (ticket === loading) body.removeAttribute("aria-busy");
  }
}

// A whole made seed, or a short code once looked up, opens its board
// straight away; anything else searches, short codes included.
async function onSearch(e) {
  e.preventDefault();
  const q = $("madeQuery").value;
  const { seed } = parseCode(q) ? await findSeed(q) : { seed: parseSeed(q) };
  madeSeed = seed?.made ? seed.text : null;
  load();
}

async function onMadeAction(action) {
  const msg = $("madeMsg");
  if (action === "back") {
    madeSeed = null;
    load();
  } else if (action === "copy") {
    msg.textContent = (await copyText(madeCode ?? madeSeed)) ? "Seed copied." : "Copy failed.";
  } else if (action === "play") {
    const seed = parseSeed(madeSeed);
    if (seed && playSeed(seed)) closeModal("boardModal");
    else msg.textContent = "Finish or leave the game you are playing first.";
  }
}

// which: a board; for "made", `pick` is the seed whose board to open, and
// for "daily", the day, today's without one, and `kind` which of its
// puzzles, the one shown last without one.
export function openLeaderboard(which = board, pick = null, kind = null) {
  if (which === "made") madeSeed = pick ?? madeSeed;
  dailyDate = which === "daily" ? pick : null;
  if (kind) dailyKind = kind;
  setTab(which);
  openModal("boardModal");
  load();
}

export function initLeaderboard() {
  $("boardBtn").addEventListener("click", () => openLeaderboard());
  $("boardTabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-board]");
    if (!tab || tab.dataset.board === board) return;
    setTab(tab.dataset.board);
    load();
  });
  $("dailyKindTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-daily]");
    if (!b || b.dataset.daily === dailyKind) return;
    dailyKind = b.dataset.daily;
    setTab(board);
    load();
  });
  $("madeSearch").addEventListener("submit", onSearch);
  $("boardBody").addEventListener("click", (e) => {
    const row = e.target.closest("[data-seed]");
    if (row) {
      madeSeed = row.dataset.seed;
      load();
      return;
    }
    const action = e.target.closest("[data-made]");
    if (action) onMadeAction(action.dataset.made);
  });
}
