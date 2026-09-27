// The board on screen. Nine boxes of nine cells, so the 3 by 3 boxes are
// real elements with their own thick edges and alternating tint, rather than
// borders picked out cell by cell. Tap or click a cell to select it; arrow
// keys move the selection. What happens with a digit is game.js's business.

import { ROW, COL, BOX } from "./sudoku.js";
import { cellName } from "./record.js";

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
  // highlightSame, highlightPeers, mark: { c, kind } | null }. kind is ok,
  // wrong, hint, erase, note or undo, for the replay's last action.
  set(view) {
    this.view = view;
    const { puzzle, solution, values, notes, selected, interactive, mark } = view;
    const sel = selected ?? null;
    const selDigit = sel != null ? values[sel] : 0;
    const focusDigit = view.focusDigit || selDigit;
    this.root.classList.toggle("interactive", Boolean(interactive));

    for (let c = 0; c < 81; c++) {
      const cell = this.cells[c];
      const v = values[c];
      const given = puzzle[c] !== 0;
      const wrong = !given && v !== 0 && v !== solution[c];
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
      if (v) label += `${v}${given ? ", given" : wrong ? ", wrong" : ""}`;
      else if (notes[c]) label += `notes ${[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => notes[c] & (1 << d)).join(" ")}`;
      else label += "empty";
      if (cell.getAttribute("aria-label") !== label) cell.setAttribute("aria-label", label);
      cell.tabIndex = interactive && c === (sel ?? 0) ? 0 : -1;
      cell.setAttribute("aria-pressed", String(c === sel));
    }
  }
}
