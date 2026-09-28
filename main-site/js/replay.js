// The instant replay: a finished game played back on the same board, one
// action at a time, with play, pause, a step either way, and a jump to any
// action from the list or the slider. Mistakes stay in, marked, and so do
// undos, so a player can see where a game went wrong.

import { play, cellName } from "./record.js";
import { layout } from "./variant.js";
import { escapeHtml, hydrateIcons, store } from "./ui.js";

const STEP_MS = 700;
const SPEEDS = [0.5, 1, 2, 4];
const SPEED_STORAGE = "uwusudoku.replaySpeed";

const $ = (id) => document.getElementById(id);

// What an action did, for the board's mark and the list.
function describe(a, step, log, players) {
  const who = players > 1 ? `P${a.b + 1} ` : "";
  switch (a.k) {
    case "p":
      return { c: a.c, kind: step.ok ? "ok" : "wrong", text: `${who}${cellName(a.c)} ${a.d}${step.ok ? "" : ", wrong"}` };
    case "e":
      return { c: a.c, kind: "erase", text: `${who}${cellName(a.c)} erased` };
    case "n":
      return { c: a.c, kind: "note", text: `${who}${cellName(a.c)} note ${a.d}` };
    case "h":
      return { c: a.c, kind: "hint", text: `${who}${cellName(a.c)} hint` };
    case "u": {
      const undone = log[step.undid];
      return { c: undone?.c ?? null, kind: "undo", text: `${who}Undo${undone && undone.k !== "s" ? ` ${cellName(undone.c)}` : ""}` };
    }
    default:
      return { c: null, kind: "hint", text: `${who}Solve` };
  }
}

export class Replay {
  constructor(board) {
    this.board = board;
    this.timer = null;
    this.index = 0;
    this.frames = [];
    this.marks = [];
    this.view = {};
    const saved = Number(store.get(SPEED_STORAGE));
    this.speed = SPEEDS.includes(saved) ? saved : 1;
    this.syncSpeed();

    $("rpSpeed").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-speed]");
      if (btn) this.setSpeed(Number(btn.dataset.speed));
    });
    $("rpStart").addEventListener("click", () => this.jump(0));
    $("rpBack").addEventListener("click", () => this.step(-1));
    $("rpForward").addEventListener("click", () => this.step(1));
    $("rpEnd").addEventListener("click", () => this.jump(this.frames.length - 1));
    $("rpPlay").addEventListener("click", () => (this.timer ? this.pause() : this.play()));
    $("rpScrub").addEventListener("input", (e) => this.jump(Number(e.target.value)));
    $("actionList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step]");
      if (btn) this.jump(Number(btn.dataset.step) + 1);
    });
    document.addEventListener("keydown", (e) => {
      if (!this.active || e.target.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") this.step(-1);
      else if (e.key === "ArrowRight") this.step(1);
      else return;
      e.preventDefault();
    });
  }

  // game: { puzzle, solution, log, players, cages?, relliks?, lunchboxes?,
  // looksays?, equalities?, thermos?, arrows?,
  // doubles?, pills?, whispers?, renbans?, palindromes?, zippers?, betweens?, lockouts?,
  // entropics?, modulars?, dots?, xvs?, signs?, quads?, sandwiches?, littles?, skyscrapers?, xsums?, hiddens?, rooms?, regions?,
  // rules? }.
  // view: { highlightSame }.
  // Starts at the end, or from the start and playing when `autoplay` is set.
  load(game, view, { autoplay = false } = {}) {
    this.pause();
    this.active = true;
    this.game = game;
    this.view = view;
    // A Jigsaw's notes clear along its regions, as in the game.
    const peers = game.regions ? layout(0, game.regions).peers : undefined;
    const result = play(game.puzzle, game.solution, game.log, { frames: true, peers });
    this.frames = result.frames;
    this.marks = game.log.slice(0, result.steps.length).map((a, i) => describe(a, result.steps[i], game.log, game.players));

    $("rpScrub").max = String(this.frames.length - 1);
    $("actionList").innerHTML = this.marks
      .map((m, i) => `<li><button type="button" class="step-btn ${m.kind}" data-step="${i}">${i + 1}. ${escapeHtml(m.text)}</button></li>`)
      .join("");

    if (autoplay && this.frames.length > 1) {
      this.show(0);
      this.timer = setTimeout(() => this.play(), 500);
      this.syncPlayButton(true);
    } else {
      this.show(this.frames.length - 1);
    }
  }

  stop() {
    this.pause();
    this.active = false;
  }

  show(i) {
    const frame = this.frames[i];
    if (!frame) return;
    this.index = i;
    const mark = i > 0 ? this.marks[i - 1] : null;
    this.board.set({
      puzzle: this.game.puzzle,
      solution: this.game.solution,
      values: frame.values,
      notes: frame.notes,
      selected: null,
      interactive: false,
      highlightSame: this.view.highlightSame,
      highlightPeers: false,
      focusDigit: mark?.c != null ? frame.values[mark.c] : 0,
      mark: mark?.c != null ? { c: mark.c, kind: mark.kind } : null,
      cages: this.game.cages ?? null,
      relliks: this.game.relliks ?? null,
      lunchboxes: this.game.lunchboxes ?? null,
      looksays: this.game.looksays ?? null,
      equalities: this.game.equalities ?? null,
      rules: this.game.rules ?? 0,
      thermos: this.game.thermos ?? null,
      arrows: this.game.arrows ?? null,
      doubles: this.game.doubles ?? null,
      pills: this.game.pills ?? null,
      whispers: this.game.whispers ?? null,
      renbans: this.game.renbans ?? null,
      palindromes: this.game.palindromes ?? null,
      zippers: this.game.zippers ?? null,
      betweens: this.game.betweens ?? null,
      lockouts: this.game.lockouts ?? null,
      entropics: this.game.entropics ?? null,
      modulars: this.game.modulars ?? null,
      dots: this.game.dots ?? null,
      xvs: this.game.xvs ?? null,
      signs: this.game.signs ?? null,
      quads: this.game.quads ?? null,
      sandwiches: this.game.sandwiches ?? null,
      littles: this.game.littles ?? null,
      skyscrapers: this.game.skyscrapers ?? null,
      xsums: this.game.xsums ?? null,
      hiddens: this.game.hiddens ?? null,
      rooms: this.game.rooms ?? null,
      regions: this.game.regions ?? null,
      margin: Boolean(this.game.sandwiches || this.game.littles || this.game.skyscrapers || this.game.xsums || this.game.hiddens || this.game.rooms),
    });
    $("rpScrub").value = String(i);
    const total = this.frames.length - 1;
    $("rpLabel").textContent = i === 0 ? `Start, ${total} moves` : `Move ${i} of ${total}: ${mark.text}`;
    const list = $("actionList");
    list.querySelectorAll(".step-btn").forEach((b) => {
      const on = Number(b.dataset.step) === i - 1;
      b.classList.toggle("current", on);
      if (on) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    // Keep the current move in view within the list, not the page.
    const current = list.querySelector(".step-btn.current");
    if (current) {
      const top = current.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 24) list.scrollTop = top - 40;
    } else if (i === 0) {
      list.scrollTop = 0;
    }
    $("rpBack").disabled = $("rpStart").disabled = i === 0;
    $("rpForward").disabled = $("rpEnd").disabled = i === total;
  }

  step(delta, fromTimer = false) {
    if (!fromTimer) this.pause();
    const next = this.index + delta;
    if (next < 0 || next >= this.frames.length) return false;
    this.show(next);
    return true;
  }

  jump(i) {
    this.pause();
    this.show(Math.max(0, Math.min(this.frames.length - 1, i)));
  }

  get stepMs() {
    return STEP_MS / this.speed;
  }

  // Remembered in this browser. A replay that is playing picks the new pace
  // up from its next move, without restarting.
  setSpeed(speed) {
    if (!SPEEDS.includes(speed)) return;
    this.speed = speed;
    store.set(SPEED_STORAGE, String(speed));
    this.syncSpeed();
    if (this.timer && this.ticking) {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.ticking, this.stepMs);
    }
  }

  syncSpeed() {
    document.querySelectorAll("#rpSpeed [data-speed]").forEach((el) => {
      el.setAttribute("aria-checked", String(Number(el.dataset.speed) === this.speed));
    });
  }

  play() {
    clearTimeout(this.timer);
    // Played to the end already: start over.
    if (this.index >= this.frames.length - 1) this.show(0);
    this.syncPlayButton(true);
    const tick = () => {
      if (!this.step(1, true) || this.index >= this.frames.length - 1) {
        this.pause();
        return;
      }
      this.timer = setTimeout(tick, this.stepMs);
    };
    this.ticking = tick;
    this.timer = setTimeout(tick, this.index === 0 ? Math.min(400, this.stepMs) : this.stepMs / 2);
  }

  pause() {
    clearTimeout(this.timer);
    this.timer = null;
    this.ticking = null;
    this.syncPlayButton(false);
  }

  syncPlayButton(playing) {
    const btn = $("rpPlay");
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
    btn.querySelector("[data-icon]").setAttribute("data-icon", playing ? "pause" : "play");
    hydrateIcons(btn);
  }
}
