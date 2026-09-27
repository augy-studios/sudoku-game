// The leaderboard window: best score, total points, or today's daily, one
// row per name.

import { api, localDate } from "./api.js";
import { LEVELS } from "./levels.js";
import { escapeHtml, openModal } from "./ui.js";

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
    about: () => "Each name's single best game.",
  },
  total: {
    head: ["#", "Name", "Total", "Games"],
    row: (e) => [e.rank, e.name, e.total, e.games],
    about: () => "Every game added under a name, scores added up.",
  },
  daily: {
    head: ["#", "Name", "Score", "Time"],
    row: (e) => [e.rank, e.name, e.score, formatTime(e.elapsed_ms)],
    about: (date) => `Today's daily puzzle, ${date}. One entry per name.`,
  },
};

let board = "best";
let loading = 0;

function setTab(next) {
  board = next;
  document.querySelectorAll("#boardTabs [data-board]").forEach((el) => {
    const on = el.dataset.board === board;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
  });
}

async function load() {
  const body = document.getElementById("boardBody");
  const note = document.getElementById("boardNote");
  const ticket = ++loading;
  const spec = BOARDS[board];
  const date = localDate();
  body.setAttribute("aria-busy", "true");
  note.textContent = spec.about(date);

  try {
    const data = await api.leaderboard(board, board === "daily" ? date : undefined);
    if (ticket !== loading) return;
    const entries = data.entries ?? [];
    body.innerHTML = entries.length
      ? `<table class="board-table">
          <thead><tr>${spec.head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
          <tbody>${entries
            .map((e) => `<tr>${spec.row(e).map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`)
            .join("")}</tbody>
        </table>`
      : `<p class="board-empty">${
          board === "daily" ? "Nobody has finished today's puzzle yet. Be the first." : "No scores yet. Finish a game and add yours."
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

export function openLeaderboard(which = board) {
  setTab(which);
  openModal("boardModal");
  load();
}

export function initLeaderboard() {
  document.getElementById("boardBtn").addEventListener("click", () => openLeaderboard());
  document.getElementById("boardTabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-board]");
    if (!tab || tab.dataset.board === board) return;
    setTab(tab.dataset.board);
    load();
  });
}
