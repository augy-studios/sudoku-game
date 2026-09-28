// The board on screen. Nine boxes of nine cells, so the 3 by 3 boxes are
// real elements with their own thick edges and alternating tint, rather than
// borders picked out cell by cell. Tap or click a cell to select it; arrow
// keys move the selection. What happens with a digit is game.js's business.
//
// A killer puzzle's cages are drawn over the cells: a dashed line just inside
// each cage's edge, and its sum in the corner of its first cell. A Diagonal
// puzzle has a faint line along each long diagonal, and a Windoku puzzle
// tints its four windows. Thermometers are a thick grey line from a round
// bulb, faint enough to read digits through, and arrows a thin one from a
// ring round the circle's digit to a head. German Whispers lines are a
// green line as thick as a thermometer's, with no bulb, renban lines a
// purple one, palindrome lines a blue one, zipper lines a pink one,
// entropic lines a gold one and modular lines an orange one.
// Between lines are a thinner teal line from a ring round one end's digit to
// a ring round the other's, and lockout lines a brown one between diamonds.
// Kropki dots sit on the side two cells share, white or black, and XV marks
// there as a letter. Sandwich and Little Killer clues sit
// outside the grid, in a margin a cell wide the board then leaves round it,
// a Little Killer's with a small arrow along its diagonal; so do Skyscraper
// counts, in a small square, and X-Sums, in a small circle. A Jigsaw's
// regions take the boxes' place: the boxes lose their edges and tint, and
// each region gets a heavy line round it instead. Anti-knight, anti-king,
// Disjoint Groups, Anti-consecutive, Strict Kropki and Strict XV have
// nothing to draw.

import { ROW, COL, BOX } from "./sudoku.js";
import { cellName } from "./record.js";
import { layout, RULES } from "./variant.js";

const DIAGONAL = RULES.find((r) => r.key === "diagonal").bit;
const WINDOKU = RULES.find((r) => r.key === "windoku").bit;

// Box b, place i within it, to the cell's index in reading order.
const cellAt = (b, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3);

// The middle of margin spot (r, c), -1 and 9 being the rows and columns just
// outside the grid, from the cells' boxes: { x, y, w }.
function spotCentre(r, c, rect) {
  const w = rect(0).w;
  const across = (i) => {
    if (i < 0) return rect(0).x - w / 2;
    if (i > 8) return rect(8).x + rect(8).w + w / 2;
    return rect(i).x + rect(i).w / 2;
  };
  const down = (i) => {
    if (i < 0) return rect(0).y - w / 2;
    if (i > 8) return rect(72).y + rect(72).h + w / 2;
    return rect(i * 9).y + rect(i * 9).h / 2;
  };
  return { x: across(c), y: down(r), w };
}

export class BoardView {
  // onSpot: called with [r, c] when a tap lands in the margin, for a board
  // that takes clues there.
  constructor(root, { onSelect, onSpot = null }) {
    this.root = root;
    this.onSelect = onSelect;
    this.onSpot = onSpot;
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

    // With `at`, where in the cell a pointer tapped, 0 to 1 across and down,
    // for a tool that cares which side is nearest; null from the keyboard.
    root.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-cell]");
      if (!cell || !this.view?.interactive) return;
      const r = cell.getBoundingClientRect();
      const at = e.detail && r.width ? [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] : null;
      this.onSelect(Number(cell.dataset.cell), { at });
    });
    // A tap in the margin, as the spot it lands in.
    root.parentElement.addEventListener("click", (e) => {
      if (!this.onSpot || !this.view?.interactive || !this.view.margin || e.target.closest("[data-cell]")) return;
      const first = this.cells[0].getBoundingClientRect();
      const last = this.cells[80].getBoundingClientRect();
      const r = Math.floor(((e.clientY - first.top) / (last.bottom - first.top)) * 9);
      const c = Math.floor(((e.clientX - first.left) / (last.right - first.left)) * 9);
      const inside = r >= 0 && r <= 8 && c >= 0 && c <= 8;
      if (r >= -1 && r <= 9 && c >= -1 && c <= 9 && !inside) this.onSpot([r, c]);
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
  // digits by the solution. cages, thermos, arrows, whispers, renbans,
  // palindromes, zippers, betweens, lockouts, entropics, modulars, dots, xvs,
  // sandwiches, littles, skyscrapers, xsums and regions are a variant
  // puzzle's, and
  // rules its switches (variant.js); picked, a Set of cells, are those being
  // gathered into a new cage, and path a line being drawn, as pathKind says:
  // "thermo", "arrow", "whisper", "renban", "palindrome", "zipper",
  // "between", "lockout", "entropic" or "modular". margin leaves room round the
  // grid for clues outside it; spots, margin spots [r, c] to show as open
  // for a clue, and spot the one picked.
  set(view) {
    this.view = view;
    const { puzzle, solution, values, notes, selected, interactive, mark } = view;
    const sel = selected ?? null;
    const selDigit = sel != null ? values[sel] : 0;
    const focusDigit = view.focusDigit || selDigit;
    this.root.classList.toggle("interactive", Boolean(interactive));
    this.cages = view.cages ?? [];
    this.rules = view.rules ?? 0;
    this.thermos = view.thermos ?? [];
    this.arrows = view.arrows ?? [];
    this.whispers = view.whispers ?? [];
    this.renbans = view.renbans ?? [];
    this.palindromes = view.palindromes ?? [];
    this.zippers = view.zippers ?? [];
    this.betweens = view.betweens ?? [];
    this.lockouts = view.lockouts ?? [];
    this.entropics = view.entropics ?? [];
    this.modulars = view.modulars ?? [];
    this.dots = view.dots ?? [];
    this.xvs = view.xvs ?? [];
    this.sandwiches = view.sandwiches ?? [];
    this.littles = view.littles ?? [];
    this.skyscrapers = view.skyscrapers ?? [];
    this.xsums = view.xsums ?? [];
    this.regions = view.regions ?? null;
    this.root.classList.toggle("jigsaw", Boolean(this.regions));
    // Its box for the peer highlight: a Jigsaw's region, or the 3x3 box.
    const house = this.regions ?? BOX;
    this.spots = view.spots ?? [];
    this.spot = view.spot ?? null;
    this.root.parentElement.classList.toggle("margined", Boolean(view.margin));
    this.path = view.path ?? [];
    this.pathKind = view.pathKind ?? "thermo";
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
      const peer = view.highlightPeers && sel != null && c !== sel && (ROW[c] === ROW[sel] || COL[c] === COL[sel] || house[c] === house[sel]);
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

  // The dashed outlines and sums, the diagonals, the thermometers, the
  // arrows, the other lines, and the dots and marks. Only redrawn when they
  // change, or when `resized`.
  drawCages(resized = false) {
    const cages = this.cages ?? [];
    const thermos = this.thermos ?? [];
    const arrows = this.arrows ?? [];
    const whispers = this.whispers ?? [];
    const renbans = this.renbans ?? [];
    const palindromes = this.palindromes ?? [];
    const zippers = this.zippers ?? [];
    const betweens = this.betweens ?? [];
    const lockouts = this.lockouts ?? [];
    const entropics = this.entropics ?? [];
    const modulars = this.modulars ?? [];
    const edges = [...(this.dots ?? []), ...(this.xvs ?? [])];
    const outside = [this.sandwiches ?? [], this.littles ?? [], this.skyscrapers ?? [], this.xsums ?? [], this.spots ?? [], this.spot];
    const path = this.path ?? [];
    const diagonal = Boolean(this.rules & DIAGONAL);
    const margin = this.root.parentElement.classList.contains("margined");
    const regions = this.regions;
    const key = JSON.stringify([cages, diagonal, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, edges, outside, margin, regions, path, this.pathKind]);
    if (!resized && key === this.cageKey) return;
    this.cageKey = key;
    const layer = this.cageLayer;
    const drawn = [cages, thermos, arrows, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, edges, path, ...outside.slice(0, 5)].some((list) => list.length);
    if (!drawn && !diagonal && !this.spot && !regions) {
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
    let outline = "";
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
        if (!same(-1, 0)) outline += `M${f(from(x, !same(0, -1), same(-1, -1)))} ${f(y + d)}H${f(to(right, !same(0, 1), same(-1, 1)))}`;
        if (!same(1, 0)) outline += `M${f(from(x, !same(0, -1), same(1, -1)))} ${f(bottom - d)}H${f(to(right, !same(0, 1), same(1, 1)))}`;
        if (!same(0, -1)) outline += `M${f(x + d)} ${f(from(y, !same(-1, 0), same(-1, -1)))}V${f(to(bottom, !same(1, 0), same(1, -1)))}`;
        if (!same(0, 1)) outline += `M${f(right - d)} ${f(from(y, !same(-1, 0), same(-1, 1)))}V${f(to(bottom, !same(1, 0), same(1, 1)))}`;
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
    // Thermometers, through the cells' middles, the bulb at the first.
    const centre = (c) => {
      const r = rect(c);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w };
    };
    const thermo = (t, cls) => {
      if (!t.length) return "";
      const points = t.map(centre);
      const w = points[0].w;
      const line = points.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("");
      return (
        `<g class="${cls}"><path d="${line}" stroke-width="${f(w * 0.3)}"/>` +
        `<circle cx="${f(points[0].x)}" cy="${f(points[0].y)}" r="${f(w * 0.36)}"/></g>`
      );
    };
    // Arrows: a ring round the circle's digit, a line from its edge through
    // the other cells' middles, and a head at the last.
    const arrow = (a, cls) => {
      if (!a.length) return "";
      const points = a.map(centre);
      const w = points[0].w;
      const ring = w * 0.4;
      let line = "";
      if (points.length > 1) {
        const [p, q] = points;
        // A hidden board's cells measure nothing, so every length is 0.
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        line = `M${f(p.x + ((q.x - p.x) / len) * ring)} ${f(p.y + ((q.y - p.y) / len) * ring)}`;
        line += points.slice(1).map((o) => `L${f(o.x)} ${f(o.y)}`).join("");
        const end = points.at(-1);
        const from = points.at(-2);
        const n = Math.hypot(end.x - from.x, end.y - from.y) || 1;
        const ux = (end.x - from.x) / n;
        const uy = (end.y - from.y) / n;
        const h = w * 0.2;
        line += `M${f(end.x - ux * h - uy * h)} ${f(end.y - uy * h + ux * h)}L${f(end.x)} ${f(end.y)}L${f(end.x - ux * h + uy * h)} ${f(end.y - uy * h - ux * h)}`;
      }
      return (
        `<g class="${cls}" stroke-width="${f(w * 0.06)}"><circle cx="${f(points[0].x)}" cy="${f(points[0].y)}" r="${f(ring)}"/>` +
        `<path d="${line}"/></g>`
      );
    };
    // German Whispers, renban, palindrome, zipper, entropic and modular
    // lines: through the cells' middles, no more. A line of one cell, while it is drawn, is a
    // dot.
    const line = (t, cls) => {
      if (!t.length) return "";
      const points = t.map(centre);
      const d = points.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("") + (t.length === 1 ? "h0" : "");
      return `<path class="${cls}" d="${d}" stroke-width="${f(points[0].w * 0.26)}"/>`;
    };
    // Between and lockout lines: a ring or a diamond round each end's digit,
    // and a line from the edge of one through the other cells' middles to
    // the edge of the other. A line of one cell, while it is drawn, is its
    // first end alone.
    const ended = (shape) => (t, cls) => {
      if (!t.length) return "";
      const points = t.map(centre);
      const w = points[0].w;
      const r = w * (shape === "ring" ? 0.4 : 0.46);
      const end = ({ x, y }) =>
        shape === "ring"
          ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`
          : `<path d="M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r)}L${f(x - r)} ${f(y)}Z"/>`;
      // From an end's middle to its shape's edge, heading for the next cell.
      const edge = (p, q) => {
        // A hidden board's cells measure nothing, so every length is 0.
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const ux = (q.x - p.x) / len;
        const uy = (q.y - p.y) / len;
        const k = shape === "ring" ? r : r / (Math.abs(ux) + Math.abs(uy) || 1);
        return { x: p.x + ux * k, y: p.y + uy * k };
      };
      let d = "";
      if (points.length > 1) {
        const through = [edge(points[0], points[1]), ...points.slice(1, -1), edge(points.at(-1), points.at(-2))];
        d = through.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("");
      }
      const ends = points.length > 1 ? [points[0], points.at(-1)] : points;
      return `<g class="${cls}" stroke-width="${f(w * 0.06)}">${ends.map(end).join("")}<path d="${d}" stroke-width="${f(w * 0.1)}"/></g>`;
    };
    const ring = ended("ring");
    const diamond = ended("diamond");
    const draw = { thermo, arrow, whisper: line, renban: line, palindrome: line, zipper: line, entropic: line, modular: line, between: ring, lockout: diamond };
    const kind = this.pathKind;
    const pending = draw[kind](path, `${kind} ${kind}-pending`);
    const marks =
      whispers.map((t) => line(t, "whisper")).join("") +
      renbans.map((t) => line(t, "renban")).join("") +
      palindromes.map((t) => line(t, "palindrome")).join("") +
      zippers.map((t) => line(t, "zipper")).join("") +
      entropics.map((t) => line(t, "entropic")).join("") +
      modulars.map((t) => line(t, "modular")).join("") +
      betweens.map((t) => ring(t, "between")).join("") +
      lockouts.map((t) => diamond(t, "lockout")).join("") +
      thermos.map((t) => thermo(t, "thermo")).join("") +
      arrows.map((a) => arrow(a, "arrow")).join("") +
      pending;
    // Dots and XV marks, over everything, at the middle of the side.
    const onSides = edges
      .map(({ cells, mark }) => {
        const [p, q] = cells.map(centre);
        const x = f((p.x + q.x) / 2);
        const y = f((p.y + q.y) / 2);
        if (mark === "white" || mark === "black") return `<circle class="dot dot-${mark}" cx="${x}" cy="${y}" r="${f(p.w * 0.12)}"/>`;
        return `<text class="xv-mark" x="${x}" y="${y}" font-size="${f(p.w * 0.36)}">${mark.toUpperCase()}</text>`;
      })
      .join("");
    // Clues outside: open spots faint, the picked one ringed, a Sandwich's
    // sum by its row or column, a Little Killer's with an arrow along its
    // diagonal, off to one side of its spot.
    const spotAt = ([r, c]) => spotCentre(r, c, rect);
    const open = (this.spots ?? []).map((s) => {
      const { x, y, w } = spotAt(s);
      return `<circle class="spot-open" cx="${f(x)}" cy="${f(y)}" r="${f(w * 0.08)}"/>`;
    });
    let picked = "";
    if (this.spot) {
      const { x, y, w } = spotAt(this.spot);
      picked = `<rect class="spot-picked" x="${f(x - w * 0.42)}" y="${f(y - w * 0.42)}" width="${f(w * 0.84)}" height="${f(w * 0.84)}" rx="${f(w * 0.18)}"/>`;
    }
    const sandwichSums = (this.sandwiches ?? []).map(({ line, sum }) => {
      const { x, y, w } = spotAt(line < 9 ? [line, -1] : [-1, line - 9]);
      return `<text class="outside-sum" x="${f(x)}" y="${f(y)}" font-size="${f(w * 0.42)}">${sum}</text>`;
    });
    const littleSums = (this.littles ?? []).map(({ cells, sum }) => {
      const dr = ROW[cells[1]] - ROW[cells[0]];
      const dc = COL[cells[1]] - COL[cells[0]];
      const { x, y, w } = spotAt([ROW[cells[0]] - dr, COL[cells[0]] - dc]);
      const tx = x - dc * w * 0.1;
      const ty = y - dr * w * 0.1;
      const [ax, ay, bx, by] = [x + dc * w * 0.2, y + dr * w * 0.2, x + dc * w * 0.44, y + dr * w * 0.44];
      const h = w * 0.1;
      const head = `M${f(bx - dc * h)} ${f(by)}L${f(bx)} ${f(by)}L${f(bx)} ${f(by - dr * h)}`;
      return (
        `<text class="outside-sum little-sum" x="${f(tx)}" y="${f(ty)}" font-size="${f(w * 0.32)}">${sum}</text>` +
        `<path class="little-arrow" d="M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}${head}" stroke-width="${f(w * 0.04)}"/>`
      );
    });
    // Skyscraper counts in a square, X-Sums in a circle, at their view's spot:
    // left, top, right or bottom of a row or column.
    const viewSpot = (view) => {
      const i = view % 9;
      return [[i, -1], [-1, i], [i, 9], [9, i]][Math.floor(view / 9)];
    };
    const framed = (clues, value, shape) =>
      clues.map((clue) => {
        const { x, y, w } = spotAt(viewSpot(clue.view));
        const r = w * 0.27;
        const frame =
          shape === "square"
            ? `<rect class="outside-frame" x="${f(x - r)}" y="${f(y - r)}" width="${f(r * 2)}" height="${f(r * 2)}" rx="${f(w * 0.05)}"/>`
            : `<circle class="outside-frame" cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.08)}"/>`;
        return `${frame}<text class="outside-sum" x="${f(x)}" y="${f(y)}" font-size="${f(w * 0.34)}">${clue[value]}</text>`;
      });
    const viewClues = [...framed(this.skyscrapers ?? [], "count", "square"), ...framed(this.xsums ?? [], "sum", "circle")];
    const outsides = [...open, picked, ...sandwichSums, ...littleSums, ...viewClues].join("");
    // A Jigsaw's regions: a heavy line along each side between two regions.
    let walls = "";
    if (regions) {
      for (let c = 0; c < 81; c++) {
        const { x, y, w, h } = rect(c);
        if (c % 9 < 8 && regions[c + 1] !== regions[c]) walls += `M${f(x + w)} ${f(y)}V${f(y + h)}`;
        if (c < 72 && regions[c + 9] !== regions[c]) walls += `M${f(x)} ${f(y + h)}H${f(x + w)}`;
      }
      walls = `<path class="region-line" d="${walls}"/>`;
    }
    layer.innerHTML = `${walls}${marks}${diagonals}<path class="cage-line" d="${outline}"/>${sums}${onSides}${outsides}`;
  }
}
