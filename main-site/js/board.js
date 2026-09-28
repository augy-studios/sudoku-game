// The board on screen. Nine boxes of nine cells, so the 3 by 3 boxes are
// real elements with their own thick edges and alternating tint, rather than
// borders picked out cell by cell. Tap or click a cell to select it; arrow
// keys move the selection. What happens with a digit is game.js's business.
//
// A killer puzzle's cages are drawn over the cells: a dashed line just inside
// each cage's edge, and its sum in the corner of its first cell. A Diagonal
// puzzle has a faint line along each long diagonal, and a Windoku puzzle
// tints its four windows. Anti-knight and anti-king have nothing to draw.

import { ROW, COL, BOX } from "./sudoku.js";
import { cellName } from "./record.js";
import { layout, RULES } from "./variant.js";

const DIAGONAL = RULES.find((r) => r.key === "diagonal").bit;
const WINDOKU = RULES.find((r) => r.key === "windoku").bit;

// Box b, place i within it, to the cell's index in reading order.
const cellAt = (b, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3);

export class BoardView {
  constructor(root, { onSelect }) {
    this.root = root;
    this.onSelect = onSelect;
    this.cells = [];
    this.keys = [];
    this.view = null;

    root.classList.add("board");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Sudoku board");
    for (let b = 0; b < 9; b++) {
      const box = document.createElement("div");
      box.className = "box";
      // Alternate boxes tinted, like a chequerboard of boxes.
      if ((Math.floor(b / 3) + (b % 3)) % 2 === 1) box.classList.add("alt");
      for (let i = 0; i < 9; i++) {
        const c = cellAt(b, i);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cell = String(c);
        cell.tabIndex = -1;
        box.append(cell);
        this.cells[c] = cell;
      }
      root.append(box);
    }

    // The cages' layer, over the cells and letting taps through. Redrawn when
    // the board changes size, since it is drawn in pixels.
    this.cageKey = "";
    this.cageLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.cageLayer.classList.add("cage-layer");
    this.cageLayer.setAttribute("aria-hidden", "true");
    root.parentElement.append(this.cageLayer);
    new ResizeObserver(() => this.drawCages(true)).observe(root);

    root.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-cell]");
      if (cell && this.view?.interactive) this.onSelect(Number(cell.dataset.cell));
    });
    root.addEventListener("keydown", (e) => {
      if (!this.view?.interactive) return;
      const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      const from = this.view.selected ?? 40;
      let r = ROW[from];
      let c = COL[from];
      if (e.key === "ArrowUp") r = (r + 8) % 9;
      if (e.key === "ArrowDown") r = (r + 1) % 9;
      if (e.key === "ArrowLeft") c = (c + 8) % 9;
      if (e.key === "ArrowRight") c = (c + 1) % 9;
      this.onSelect(r * 9 + c, { focus: true });
    });
  }

  focusSelected() {
    const c = this.view?.selected;
    if (c != null) this.cells[c].focus({ preventScroll: true });
  }

  // view: { puzzle, solution, values, notes, selected, interactive,
  // highlightSame, highlightPeers, mark: { c, kind } | null, wrong?, cages?,
  // picked? }. kind is ok, wrong, hint, erase, note or undo, for the
  // replay's last action. wrong, a Set of cells, overrides telling wrong
  // digits by the solution. cages are a killer puzzle's, and rules the
  // variant's switches (variant.js); picked, a Set of cells, are those
  // being gathered into a new cage.
  set(view) {
    this.view = view;
    const { puzzle, solution, values, notes, selected, interactive, mark } = view;
    const sel = selected ?? null;
    const selDigit = sel != null ? values[sel] : 0;
    const focusDigit = view.focusDigit || selDigit;
    this.root.classList.toggle("interactive", Boolean(interactive));
    this.cages = view.cages ?? [];
    this.rules = view.rules ?? 0;
    const windows = new Set(
      this.rules & WINDOKU ? layout(WINDOKU).houses.filter((h) => h.kind === "window").flatMap((h) => h.cells) : []
    );
    // Each cage's first cell carries its sum, so its notes make room.
    const heads = new Set(this.cages.map((cage) => Math.min(...cage.cells)));
    this.drawCages();

    for (let c = 0; c < 81; c++) {
      const cell = this.cells[c];
      const v = values[c];
      const given = puzzle[c] !== 0;
      const wrong = view.wrong ? view.wrong.has(c) : !given && v !== 0 && v !== solution[c];
      const peer = view.highlightPeers && sel != null && c !== sel && (ROW[c] === ROW[sel] || COL[c] === COL[sel] || BOX[c] === BOX[sel]);
      // Notes holding the digit light up on their own, below.
      const same = view.highlightSame && focusDigit && v === focusDigit;
      const cls = [
        "cell",
        given ? "given" : v ? "user" : "",
        wrong ? "wrong" : "",
        c === sel ? "selected" : "",
        peer ? "peer" : "",
        same ? "same" : "",
        mark && mark.c === c ? `mark mark-${mark.kind}` : "",
        view.picked?.has(c) ? "picked" : "",
        heads.has(c) ? "cage-head" : "",
        windows.has(c) ? "window" : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (cell.className !== cls) cell.className = cls;

      const key = v ? `v${v}` : `n${notes[c]}|${focusDigit}`;
      if (this.keys[c] !== key) {
        this.keys[c] = key;
        if (v) {
          cell.textContent = String(v);
        } else if (notes[c]) {
          let html = `<span class="notes">`;
          for (let d = 1; d <= 9; d++) {
            const on = notes[c] & (1 << d);
            html += `<span class="${on && view.highlightSame && d === focusDigit ? "on" : ""}">${on ? d : ""}</span>`;
          }
          cell.innerHTML = `${html}</span>`;
        } else {
          cell.textContent = "";
        }
      }

      let label = `${cellName(c).replace("r", "Row ").replace("c", ", column ")}, `;
      const cage = this.cages.find((k) => k.cells.includes(c));
      if (cage) label += `cage of ${cage.cells.length} adding to ${cage.sum}, `;
      if (v) label += `${v}${wrong ? ", wrong" : given ? ", given" : ""}`;
      else if (notes[c]) label += `notes ${[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => notes[c] & (1 << d)).join(" ")}`;
      else label += "empty";
      if (cell.getAttribute("aria-label") !== label) cell.setAttribute("aria-label", label);
      cell.tabIndex = interactive && c === (sel ?? 0) ? 0 : -1;
      cell.setAttribute("aria-pressed", String(c === sel));
    }
  }

  // The dashed outlines and sums, and the diagonals. Only redrawn when they
  // change, or when `resized`.
  drawCages(resized = false) {
    const cages = this.cages ?? [];
    const diagonal = Boolean(this.rules & DIAGONAL);
    const key = JSON.stringify([cages, diagonal]);
    if (!resized && key === this.cageKey) return;
    this.cageKey = key;
    const layer = this.cageLayer;
    if (!cages.length && !diagonal) {
      layer.innerHTML = "";
      return;
    }
    const base = layer.parentElement.getBoundingClientRect();
    const rect = (c) => {
      const r = this.cells[c].getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };
    const of = new Array(81).fill(-1);
    cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
    let path = "";
    let sums = "";
    const f = (n) => n.toFixed(1);
    for (const [i, cage] of cages.entries()) {
      for (const c of cage.cells) {
        const { x, y, w, h } = rect(c);
        const d = w * 0.1;
        const r0 = Math.floor(c / 9);
        const c0 = c % 9;
        const same = (dr, dc) => {
          const r = r0 + dr;
          const col = c0 + dc;
          return r >= 0 && r < 9 && col >= 0 && col < 9 && of[r * 9 + col] === i;
        };
        const right = x + w;
        const bottom = y + h;
        // An edge runs from corner to corner of the inset, on to the cell's
        // edge where the cage carries on, or past it where the cage turns a
        // corner inwards.
        const from = (side, gone, turn) => (gone ? side + d : turn ? side - d : side);
        const to = (side, gone, turn) => (gone ? side - d : turn ? side + d : side);
        if (!same(-1, 0)) path += `M${f(from(x, !same(0, -1), same(-1, -1)))} ${f(y + d)}H${f(to(right, !same(0, 1), same(-1, 1)))}`;
        if (!same(1, 0)) path += `M${f(from(x, !same(0, -1), same(1, -1)))} ${f(bottom - d)}H${f(to(right, !same(0, 1), same(1, 1)))}`;
        if (!same(0, -1)) path += `M${f(x + d)} ${f(from(y, !same(-1, 0), same(-1, -1)))}V${f(to(bottom, !same(1, 0), same(1, -1)))}`;
        if (!same(0, 1)) path += `M${f(right - d)} ${f(from(y, !same(-1, 0), same(-1, 1)))}V${f(to(bottom, !same(1, 0), same(1, 1)))}`;
      }
      const head = rect(Math.min(...cage.cells));
      sums += `<text class="cage-sum" x="${f(head.x + head.w * 0.06)}" y="${f(head.y + head.w * 0.27)}" font-size="${f(head.w * 0.24)}">${cage.sum}</text>`;
    }
    let diagonals = "";
    if (diagonal) {
      const a = rect(0);
      const b = rect(80);
      const c = rect(8);
      const d = rect(72);
      diagonals =
        `<path class="diagonal-line" d="M${f(a.x)} ${f(a.y)}L${f(b.x + b.w)} ${f(b.y + b.h)}` +
        `M${f(c.x + c.w)} ${f(c.y)}L${f(d.x)} ${f(d.y + d.h)}"/>`;
    }
    layer.innerHTML = `${diagonals}<path class="cage-line" d="${path}"/>${sums}`;
  }
}
