// A puzzle drawn as a PNG, to save, print or send: the clues on a white
// board whatever the theme, in the app's font, with the site's name under it,
// and a variant puzzle's cages of every kind, thermometers, arrows, double and pill
// arrows, German Whispers,
// renban, palindrome, zipper, between, lockout, entropic and modular lines,
// sum lines, region sum lines, value indexing lines,
// Kropki dots, Greater Than signs, quads, Counting Circles, XV
// marks, diagonals and windows as on screen.
// Sandwich, Little Killer, Skyscraper, X-Sum, Hidden Skyscraper, Numbered
// Room, Full Rank and Row/Column Indexing clues sit outside the grid, in a
// margin a cell wide the image grows by, an indexing mark's row or column
// shaded. A Jigsaw's regions take the boxes' heavy lines and tint.

import { variantName, touching, cagesOf, INDEXERS } from "./variant.js";

const CELL = 112;
const PAD = 36;
const BOARD = CELL * 9;
const WIDTH = BOARD + PAD * 2;
const HEIGHT = BOARD + PAD * 2 + 64;
const FONT = "Jua, system-ui, sans-serif";

const INK = "#1d2a22";
const BOX_ALT = "#eaf6ea";
const CELL_LINE = "#c9d2cb";
const BOX_LINE = "#2d3a31";
const CAPTION = "#5b6b60";

// Warm, so windows never pass for the boxes' green tint.
const WINDOW_TINT = "rgba(232, 168, 56, 0.28)";
const THERMO_GREY = "#cdd3ce";
const ARROW_GREY = "#8f9a92";
// Pale, so digits read through them.
const WHISPER_GREEN = "#a8dcb2";
const RENBAN_PURPLE = "#dac6ee";
const PALINDROME_BLUE = "#b2cfee";
const ZIPPER_PINK = "#f0bcd8";
const ENTROPIC_GOLD = "#f0d98c";
const MODULAR_ORANGE = "#f5c19f";
const SUM_OLIVE = "#c9d79b";
const REGION_INDIGO = "#bdbfee";
// Thinner, so darker.
const BETWEEN_TEAL = "#6cc0cf";
const LOCKOUT_BROWN = "#c2a07f";
const DIAGONAL_INK = "rgba(29, 106, 58, 0.3)";
// Cool, so an indexing row or column never passes for a window.
const INDEXING_TINT = "rgba(63, 134, 212, 0.16)";

// variant: { cages, relliks, lunchboxes, looksays, equalities, equalsums,
// samevalues, connecteds, distincts, thermos,
// arrows, doubles, pills, whispers, renbans,
// palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines,
// regionsums, indexes, dots, xvs, signs, quads, circles,
// sandwiches,
// littles, skyscrapers, xsums, hiddens, rooms, ranks, indexings, regions, rules } (variant.js), or nothing for
// a classic puzzle.
export async function drawPuzzle(grid, variant = null) {
  const cages = variant?.cages ?? [];
  const rules = variant?.rules ?? 0;
  const thermos = variant?.thermos ?? [];
  const arrows = variant?.arrows ?? [];
  const doubles = variant?.doubles ?? [];
  const pills = variant?.pills ?? [];
  const whispers = variant?.whispers ?? [];
  const renbans = variant?.renbans ?? [];
  const palindromes = variant?.palindromes ?? [];
  const zippers = variant?.zippers ?? [];
  const betweens = variant?.betweens ?? [];
  const lockouts = variant?.lockouts ?? [];
  const entropics = variant?.entropics ?? [];
  const modulars = variant?.modulars ?? [];
  const sumlines = variant?.sumlines ?? [];
  const regionsums = variant?.regionsums ?? [];
  const indexes = variant?.indexes ?? [];
  const dots = variant?.dots ?? [];
  const xvs = variant?.xvs ?? [];
  const signs = variant?.signs ?? [];
  const quads = variant?.quads ?? [];
  const sandwiches = variant?.sandwiches ?? [];
  const littles = variant?.littles ?? [];
  const skyscrapers = variant?.skyscrapers ?? [];
  const xsums = variant?.xsums ?? [];
  const hiddens = variant?.hiddens ?? [];
  const rooms = variant?.rooms ?? [];
  const circles = variant?.circles ?? [];
  const ranks = variant?.ranks ?? [];
  const indexings = variant?.indexings ?? [];
  const regions = variant?.regions?.length ? variant.regions : null;
  // Room round the grid for clues outside it; the grid is drawn as without.
  const margin = [sandwiches, littles, skyscrapers, xsums, hiddens, rooms, ranks, indexings].some((list) => list.length) ? CELL : 0;
  // The font may not have been needed yet on this page; the canvas only uses
  // it once it has loaded.
  try {
    await document.fonts.load(`${Math.round(CELL * 0.6)}px Jua`);
  } catch {
    // Falls back to the system font.
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH + margin * 2;
  canvas.height = HEIGHT + margin * 2;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(margin, margin);

  // Alternate boxes tinted, as on the board; a Jigsaw has none.
  ctx.fillStyle = BOX_ALT;
  for (let b = 0; b < 9 && !regions; b++) {
    if ((Math.floor(b / 3) + (b % 3)) % 2 === 1) ctx.fillRect(PAD + (b % 3) * CELL * 3, PAD + Math.floor(b / 3) * CELL * 3, CELL * 3, CELL * 3);
  }

  // Windoku's windows, rows and columns 2 to 4 and 6 to 8.
  if (rules & 8) {
    ctx.fillStyle = WINDOW_TINT;
    for (const r of [1, 5]) for (const c of [1, 5]) ctx.fillRect(PAD + c * CELL, PAD + r * CELL, CELL * 3, CELL * 3);
  }
  // Row/Column Indexing's rows and columns, darker where two cross.
  ctx.fillStyle = INDEXING_TINT;
  for (const { line } of indexings) for (const { cell } of INDEXERS[line]) ctx.fillRect(PAD + (cell % 9) * CELL, PAD + Math.floor(cell / 9) * CELL, CELL, CELL);

  const line = (width, colour, every) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 9; i += every) {
      const at = PAD + i * CELL;
      ctx.moveTo(at, PAD);
      ctx.lineTo(at, PAD + BOARD);
      ctx.moveTo(PAD, at);
      ctx.lineTo(PAD + BOARD, at);
    }
    ctx.stroke();
  };
  line(2, CELL_LINE, 1);
  if (!regions) line(6, BOX_LINE, 3);
  else {
    // Round the whole, and along each side between two regions.
    ctx.strokeStyle = BOX_LINE;
    ctx.lineWidth = 6;
    ctx.lineCap = "square";
    ctx.strokeRect(PAD, PAD, BOARD, BOARD);
    ctx.beginPath();
    for (let c = 0; c < 81; c++) {
      const x = PAD + (c % 9) * CELL;
      const y = PAD + Math.floor(c / 9) * CELL;
      if (c % 9 < 8 && regions[c + 1] !== regions[c]) {
        ctx.moveTo(x + CELL, y);
        ctx.lineTo(x + CELL, y + CELL);
      }
      if (c < 72 && regions[c + 9] !== regions[c]) {
        ctx.moveTo(x, y + CELL);
        ctx.lineTo(x + CELL, y + CELL);
      }
    }
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  if (rules & 1) {
    ctx.strokeStyle = DIAGONAL_INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD);
    ctx.lineTo(PAD + BOARD, PAD + BOARD);
    ctx.moveTo(PAD + BOARD, PAD);
    ctx.lineTo(PAD, PAD + BOARD);
    ctx.stroke();
  }
  const at = (c) => [PAD + ((c % 9) + 0.5) * CELL, PAD + (Math.floor(c / 9) + 0.5) * CELL];
  // German Whispers, renban, palindrome, zipper, entropic and modular lines,
  // under everything else: solid, through the cells' middles.
  for (const [lines, colour] of [
    [whispers, WHISPER_GREEN],
    [renbans, RENBAN_PURPLE],
    [palindromes, PALINDROME_BLUE],
    [zippers, ZIPPER_PINK],
    [entropics, ENTROPIC_GOLD],
    [modulars, MODULAR_ORANGE],
    [regionsums, REGION_INDIGO],
  ]) {
    for (const t of lines) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = CELL * 0.26;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      t.forEach((c, i) => (i ? ctx.lineTo(...at(c)) : ctx.moveTo(...at(c))));
      ctx.stroke();
    }
  }
  // Sum lines: dashed, square-ended so the gaps show. Their sums go in with
  // the cages' clues, below.
  ctx.strokeStyle = SUM_OLIVE;
  ctx.lineWidth = CELL * 0.22;
  ctx.lineCap = "butt";
  ctx.setLineDash([CELL * 0.3, CELL * 0.16]);
  for (const { cells } of sumlines) {
    ctx.beginPath();
    cells.forEach((c, i) => (i ? ctx.lineTo(...at(c)) : ctx.moveTo(...at(c))));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Grey, solid, with a round bulb.
  for (const t of thermos) {
    ctx.strokeStyle = THERMO_GREY;
    ctx.fillStyle = THERMO_GREY;
    ctx.lineWidth = CELL * 0.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    t.forEach((c, i) => (i ? ctx.lineTo(...at(c)) : ctx.moveTo(...at(c))));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(...at(t[0]), CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
  // An arrow's head at the second point, pointing on from the first.
  const head = ([fx, fy], [ex, ey]) => {
    const h = CELL * 0.2;
    const n = Math.hypot(ex - fx, ey - fy);
    const ux = (ex - fx) / n;
    const uy = (ey - fy) / n;
    ctx.moveTo(ex - ux * h - uy * h, ey - uy * h + ux * h);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - ux * h + uy * h, ey - uy * h - ux * h);
  };
  ctx.strokeStyle = ARROW_GREY;
  ctx.lineWidth = CELL * 0.05;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // As on the board: a ring round the circle, a line from its edge, a head.
  for (const a of arrows) {
    const ring = CELL * 0.4;
    const [x0, y0] = at(a[0]);
    const [x1, y1] = at(a[1]);
    const len = Math.hypot(x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.arc(x0, y0, ring, 0, Math.PI * 2);
    ctx.moveTo(x0 + ((x1 - x0) / len) * ring, y0 + ((y1 - y0) / len) * ring);
    a.slice(1).forEach((c) => ctx.lineTo(...at(c)));
    head(at(a.at(-2)), at(a.at(-1)));
    ctx.stroke();
  }
  // Double arrows: a ring round each end, and a line from the edge of one
  // to the edge of the other.
  for (const t of doubles) {
    const ring = CELL * 0.4;
    const points = t.map(at);
    const edge = ([x0, y0], [x1, y1]) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      return [x0 + ((x1 - x0) / len) * ring, y0 + ((y1 - y0) / len) * ring];
    };
    ctx.beginPath();
    for (const [x, y] of [points[0], points.at(-1)]) {
      ctx.moveTo(x + ring, y);
      ctx.arc(x, y, ring, 0, Math.PI * 2);
    }
    [edge(points[0], points[1]), ...points.slice(1, -1), edge(points.at(-1), points.at(-2))].forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.stroke();
  }
  // Pill arrows, as on the board: a box with round ends round the pill, and
  // an arrow from its edge, off the pill cell it starts beside.
  for (const { pill, arrow } of pills) {
    const r = CELL * 0.4;
    const [a, b] = [at(pill[0]), at(pill.at(-1))];
    const flat = a[1] === b[1];
    // Along one side from the first cell to the last, round its end, and
    // back along the other side and round the first's.
    const turn = flat ? -Math.PI / 2 : 0;
    const rim = ([x, y], angle) => [x + r * Math.cos(angle), y + r * Math.sin(angle)];
    ctx.beginPath();
    ctx.moveTo(...rim(a, turn));
    ctx.lineTo(...rim(b, turn));
    ctx.arc(...b, r, turn, turn + Math.PI);
    ctx.lineTo(...rim(a, turn + Math.PI));
    ctx.arc(...a, r, turn + Math.PI, turn + Math.PI * 2);
    ctx.closePath();
    const first = arrow[0];
    const off = pill.find((c) => touching(c, first) && (c % 9 === first % 9 || Math.floor(c / 9) === Math.floor(first / 9))) ?? pill.find((c) => touching(c, first));
    const [px, py] = at(off);
    const [qx, qy] = at(first);
    const len = Math.hypot(qx - px, qy - py);
    const [ux, uy] = [(qx - px) / len, (qy - py) / len];
    const [along, across] = flat ? [ux, uy] : [uy, ux];
    const out = (off === pill[0] && along < 0) || (off === pill.at(-1) && along > 0);
    const k = out ? r : r / Math.abs(across);
    ctx.moveTo(px + ux * k, py + uy * k);
    arrow.forEach((c) => ctx.lineTo(...at(c)));
    head(arrow.length > 1 ? at(arrow.at(-2)) : [px, py], at(arrow.at(-1)));
    ctx.stroke();
  }
  // Value indexing lines, as on the board: a faint disc round the first
  // digit, and a thin dashed line on to a head at the last.
  for (const t of indexes) {
    ctx.fillStyle = THERMO_GREY;
    ctx.beginPath();
    ctx.arc(...at(t[0]), CELL * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = "butt";
    ctx.setLineDash([CELL * 0.14, CELL * 0.1]);
    ctx.beginPath();
    t.forEach((c, i) => (i ? ctx.lineTo(...at(c)) : ctx.moveTo(...at(c))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.beginPath();
    head(at(t.at(-2)), at(t.at(-1)));
    ctx.stroke();
  }
  // As on the board: a ring or a diamond round each end, and a line from
  // the edge of one to the edge of the other.
  for (const [lines, colour, ring] of [
    [betweens, BETWEEN_TEAL, true],
    [lockouts, LOCKOUT_BROWN, false],
  ]) {
    const r = CELL * (ring ? 0.4 : 0.46);
    const edge = ([x0, y0], [x1, y1]) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const k = ring ? r : r / (Math.abs(ux) + Math.abs(uy));
      return [x0 + ux * k, y0 + uy * k];
    };
    ctx.strokeStyle = colour;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const t of lines) {
      const points = t.map(at);
      ctx.lineWidth = CELL * 0.05;
      ctx.beginPath();
      for (const [x, y] of [points[0], points.at(-1)]) {
        ctx.moveTo(ring ? x + r : x, ring ? y : y - r);
        if (ring) ctx.arc(x, y, r, 0, Math.PI * 2);
        else {
          ctx.lineTo(x + r, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r, y);
          ctx.closePath();
        }
      }
      ctx.stroke();
      ctx.lineWidth = CELL * 0.09;
      ctx.beginPath();
      [edge(points[0], points[1]), ...points.slice(1, -1), edge(points.at(-1), points.at(-2))].forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.stroke();
    }
  }
  const boxes = cagesOf(variant);
  if (boxes.length) drawCages(ctx, boxes);
  for (const { sum, cells } of sumlines) cornerLabel(ctx, cells[0], String(sum));
  // Signs at the middle of their side, as on the board: a chevron pointing
  // at the smaller digit.
  ctx.strokeStyle = INK;
  ctx.lineWidth = CELL * 0.05;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { cells, mark } of signs) {
    const [p, q] = cells.map(at);
    const [big, small] = mark === "gt" ? [p, q] : [q, p];
    const len = Math.hypot(small[0] - big[0], small[1] - big[1]);
    const ux = (small[0] - big[0]) / len;
    const uy = (small[1] - big[1]) / len;
    const [mx, my] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const h = CELL * 0.1;
    ctx.beginPath();
    ctx.moveTo(mx - ux * h - uy * h * 1.3, my - uy * h + ux * h * 1.3);
    ctx.lineTo(mx + ux * h, my + uy * h);
    ctx.lineTo(mx - ux * h + uy * h * 1.3, my - uy * h - ux * h * 1.3);
    ctx.stroke();
  }
  // Quads: a white circle on the corner, its digits in it, two to a row.
  for (const { cell, digits } of quads) {
    const x = PAD + ((cell % 9) + 1) * CELL;
    const y = PAD + (Math.floor(cell / 9) + 1) * CELL;
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.27, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    const rows = digits.length > 2 ? [digits.slice(0, 2), digits.slice(2)] : [digits];
    const size = CELL * 0.2;
    ctx.fillStyle = INK;
    ctx.font = `${Math.round(size)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    rows.forEach((row, i) => ctx.fillText(row.join(" "), x, y + (i - (rows.length - 1) / 2) * size));
  }
  // Counting Circles: a ring round the cell's digit, as on the board.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(...at(c), CELL * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Dots and XV marks at the middle of their side, over the grid lines.
  for (const { cells, mark } of [...dots, ...xvs]) {
    const [[x0, y0], [x1, y1]] = cells.map(at);
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    if (mark === "white" || mark === "black") {
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = mark === "white" ? "#ffffff" : INK;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.font = `${Math.round(CELL * 0.36)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 10;
      ctx.strokeText(mark.toUpperCase(), x, y);
      ctx.fillStyle = INK;
      ctx.fillText(mark.toUpperCase(), x, y);
    }
  }

  ctx.fillStyle = INK;
  ctx.font = `${Math.round(CELL * 0.6)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c < 81; c++) {
    if (!grid[c]) continue;
    ctx.fillText(String(grid[c]), PAD + ((c % 9) + 0.5) * CELL, PAD + (Math.floor(c / 9) + 0.54) * CELL);
  }

  // Clues outside, as on the board: a Sandwich's sum by its row or column,
  // a Little Killer's to one side of its spot with an arrow along its
  // diagonal. Spots -1 and 9 are the rows and columns just outside.
  const spot = (r, c) => [PAD + (c + 0.5) * CELL, PAD + (r + 0.5) * CELL];
  ctx.fillStyle = INK;
  ctx.font = `${Math.round(CELL * 0.42)}px ${FONT}`;
  for (const { line, sum } of sandwiches) ctx.fillText(String(sum), ...spot(line < 9 ? line : -1, line < 9 ? -1 : line - 9));
  ctx.font = `${Math.round(CELL * 0.32)}px ${FONT}`;
  ctx.strokeStyle = INK;
  ctx.lineWidth = CELL * 0.04;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { cells, sum } of littles) {
    const dr = Math.floor(cells[1] / 9) - Math.floor(cells[0] / 9);
    const dc = (cells[1] % 9) - (cells[0] % 9);
    const [x, y] = spot(Math.floor(cells[0] / 9) - dr, (cells[0] % 9) - dc);
    ctx.fillText(String(sum), x - dc * CELL * 0.1, y - dr * CELL * 0.1);
    const [bx, by] = [x + dc * CELL * 0.44, y + dr * CELL * 0.44];
    const h = CELL * 0.1;
    ctx.beginPath();
    ctx.moveTo(x + dc * CELL * 0.2, y + dr * CELL * 0.2);
    ctx.lineTo(bx, by);
    ctx.moveTo(bx - dc * h, by);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by - dr * h);
    ctx.stroke();
  }
  // Skyscraper counts in a square, X-Sums in a circle, beside their row or
  // column on the side they are seen from.
  const viewAt = (view) => {
    const i = view % 9;
    return [spot(i, -1), spot(-1, i), spot(i, 9), spot(9, i)][Math.floor(view / 9)];
  };
  ctx.font = `${Math.round(CELL * 0.34)}px ${FONT}`;
  ctx.lineWidth = 3;
  // Hidden Skyscraper clues in a dashed square, Numbered Room clues in a
  // diamond.
  for (const [clues, value, shape] of [
    [skyscrapers, "count", "square"],
    [xsums, "sum", "circle"],
    [hiddens, "height", "dashed"],
    [rooms, "digit", "diamond"],
  ]) {
    for (const clue of clues) {
      const [x, y] = viewAt(clue.view);
      const r = CELL * 0.27;
      ctx.beginPath();
      ctx.setLineDash(shape === "dashed" ? [CELL * 0.07, CELL * 0.05] : []);
      if (shape === "square" || shape === "dashed") ctx.roundRect(x - r, y - r, r * 2, r * 2, CELL * 0.05);
      else if (shape === "circle") ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
      else {
        ctx.moveTo(x, y - r * 1.3);
        ctx.lineTo(x + r * 1.3, y);
        ctx.lineTo(x, y + r * 1.3);
        ctx.lineTo(x - r * 1.3, y);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(String(clue[value]), x, y);
    }
  }
  // Full Rank clues after a #, and Row/Column Indexing marks as a pointer
  // into their row or column.
  ctx.font = `${Math.round(CELL * 0.3)}px ${FONT}`;
  for (const { view, rank } of ranks) ctx.fillText(`#${rank}`, ...viewAt(view));
  for (const { line } of indexings) {
    const [x, y] = line < 9 ? spot(line, -1) : spot(-1, line - 9);
    const [dx, dy] = line < 9 ? [1, 0] : [0, 1];
    const h = CELL * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + dx * h, y + dy * h);
    ctx.lineTo(x - dx * h - dy * h, y - dy * h - dx * h);
    ctx.lineTo(x - dx * h + dy * h, y - dy * h + dx * h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = CAPTION;
  ctx.font = `30px ${FONT}`;
  const name = variantName({ ...variant, cages, thermos, arrows, doubles, pills, whispers, renbans, palindromes, zippers, betweens, lockouts, entropics, modulars, sumlines, regionsums, indexes, dots, xvs, signs, quads, circles, sandwiches, littles, skyscrapers, xsums, hiddens, rooms, ranks, indexings, regions, rules });
  const caption = `${name ? `${name}  ·  ` : ""}uwuSudoku  ·  sudoku.uwuapps.org`;
  // A long list of rules shrinks to fit across the image.
  const room = canvas.width - PAD * 2;
  const wide = ctx.measureText(caption).width;
  if (wide > room) ctx.font = `${Math.floor((30 * room) / wide)}px ${FONT}`;
  ctx.fillText(caption, WIDTH / 2, PAD * 2 + BOARD + 20 + margin);
  return canvas;
}

// Dashed lines just inside each cage, solid for a lunchbox, and its clue in
// its first cell's corner, with the same corner rules as the board
// (board.js). cages: of every kind, as cagesOf gives them.
function drawCages(ctx, cages) {
  const of = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
  const d = CELL * 0.1;
  // The ith cage's edges, added to the path.
  const outline = (cage, i) => {
    for (const c of cage.cells) {
      const r0 = Math.floor(c / 9);
      const c0 = c % 9;
      const x = PAD + c0 * CELL;
      const y = PAD + r0 * CELL;
      const right = x + CELL;
      const bottom = y + CELL;
      const same = (dr, dc) => {
        const r = r0 + dr;
        const col = c0 + dc;
        return r >= 0 && r < 9 && col >= 0 && col < 9 && of[r * 9 + col] === i;
      };
      const from = (side, gone, turn) => (gone ? side + d : turn ? side - d : side);
      const to = (side, gone, turn) => (gone ? side - d : turn ? side + d : side);
      const line = (x0, y0, x1, y1) => {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      };
      if (!same(-1, 0)) line(from(x, !same(0, -1), same(-1, -1)), y + d, to(right, !same(0, 1), same(-1, 1)), y + d);
      if (!same(1, 0)) line(from(x, !same(0, -1), same(1, -1)), bottom - d, to(right, !same(0, 1), same(1, 1)), bottom - d);
      if (!same(0, -1)) line(x + d, from(y, !same(-1, 0), same(-1, -1)), x + d, to(bottom, !same(1, 0), same(1, -1)));
      if (!same(0, 1)) line(right - d, from(y, !same(-1, 0), same(-1, 1)), right - d, to(bottom, !same(1, 0), same(1, 1)));
    }
  };
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  for (const solid of [false, true]) {
    ctx.setLineDash(solid ? [] : [8, 6]);
    ctx.beginPath();
    cages.forEach((cage, i) => cage.solid === solid && outline(cage, i));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const cage of cages) cornerLabel(ctx, cage.head, cage.label);
}

// A cage's clue, or a sum line's sum, in the top left corner of cell c.
function cornerLabel(ctx, c, label) {
  const x = PAD + (c % 9) * CELL + CELL * 0.06;
  const y = PAD + Math.floor(c / 9) * CELL + CELL * 0.27;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  // A long Look and Say clue a little smaller, as on the board.
  ctx.font = `${Math.round(CELL * (label.length > 4 ? 0.2 : 0.24))}px ${FONT}`;
  // A white halo, so the dashed line stops short of the clue.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.strokeText(label, x, y);
  ctx.fillStyle = INK;
  ctx.fillText(label, x, y);
}

// Saves the grid as a PNG through the browser's download. True if it went.
export async function savePuzzleImage(grid, filename = "sudoku.png", variant = null) {
  const canvas = await drawPuzzle(grid, variant);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
