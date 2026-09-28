// A puzzle drawn as a PNG, to save, print or send: the clues on a white
// board whatever the theme, in the app's font, with the site's name under it,
// and a variant puzzle's cages, thermometers, arrows, German Whispers and
// renban lines, diagonals and windows as on screen.

import { variantName } from "./variant.js";

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
const DIAGONAL_INK = "rgba(29, 106, 58, 0.3)";

// variant: { cages, thermos, arrows, whispers, renbans, rules }
// (variant.js), or nothing for a classic puzzle.
export async function drawPuzzle(grid, variant = null) {
  const cages = variant?.cages ?? [];
  const rules = variant?.rules ?? 0;
  const thermos = variant?.thermos ?? [];
  const arrows = variant?.arrows ?? [];
  const whispers = variant?.whispers ?? [];
  const renbans = variant?.renbans ?? [];
  // The font may not have been needed yet on this page; the canvas only uses
  // it once it has loaded.
  try {
    await document.fonts.load(`${Math.round(CELL * 0.6)}px Jua`);
  } catch {
    // Falls back to the system font.
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Alternate boxes tinted, as on the board.
  ctx.fillStyle = BOX_ALT;
  for (let b = 0; b < 9; b++) {
    if ((Math.floor(b / 3) + (b % 3)) % 2 === 1) ctx.fillRect(PAD + (b % 3) * CELL * 3, PAD + Math.floor(b / 3) * CELL * 3, CELL * 3, CELL * 3);
  }

  // Windoku's windows, rows and columns 2 to 4 and 6 to 8.
  if (rules & 8) {
    ctx.fillStyle = WINDOW_TINT;
    for (const r of [1, 5]) for (const c of [1, 5]) ctx.fillRect(PAD + c * CELL, PAD + r * CELL, CELL * 3, CELL * 3);
  }

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
  line(6, BOX_LINE, 3);

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
  // German Whispers and renban lines, under everything else: solid, through
  // the cells' middles.
  for (const [lines, colour] of [
    [whispers, WHISPER_GREEN],
    [renbans, RENBAN_PURPLE],
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
  // As on the board: a ring round the circle, a line from its edge, a head.
  for (const a of arrows) {
    const ring = CELL * 0.4;
    const h = CELL * 0.2;
    const [x0, y0] = at(a[0]);
    const [x1, y1] = at(a[1]);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [ex, ey] = at(a.at(-1));
    const [fx, fy] = at(a.at(-2));
    const n = Math.hypot(ex - fx, ey - fy);
    const ux = (ex - fx) / n;
    const uy = (ey - fy) / n;
    ctx.strokeStyle = ARROW_GREY;
    ctx.lineWidth = CELL * 0.05;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(x0, y0, ring, 0, Math.PI * 2);
    ctx.moveTo(x0 + ((x1 - x0) / len) * ring, y0 + ((y1 - y0) / len) * ring);
    a.slice(1).forEach((c) => ctx.lineTo(...at(c)));
    ctx.moveTo(ex - ux * h - uy * h, ey - uy * h + ux * h);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - ux * h + uy * h, ey - uy * h - ux * h);
    ctx.stroke();
  }
  if (cages.length) drawCages(ctx, cages);

  ctx.fillStyle = INK;
  ctx.font = `${Math.round(CELL * 0.6)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c < 81; c++) {
    if (!grid[c]) continue;
    ctx.fillText(String(grid[c]), PAD + ((c % 9) + 0.5) * CELL, PAD + (Math.floor(c / 9) + 0.54) * CELL);
  }

  ctx.fillStyle = CAPTION;
  ctx.font = `30px ${FONT}`;
  const name = variantName({ cages, thermos, arrows, whispers, renbans, rules });
  ctx.fillText(`${name ? `${name}  ·  ` : ""}uwuSudoku  ·  sudoku.uwuapps.org`, WIDTH / 2, PAD * 2 + BOARD + 20);
  return canvas;
}

// Dashed lines just inside each cage, and its sum in its first cell's
// corner, with the same corner rules as the board (board.js).
function drawCages(ctx, cages) {
  const of = new Array(81).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((c) => (of[c] = i)));
  const d = CELL * 0.1;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  for (const [i, cage] of cages.entries()) {
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
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `${Math.round(CELL * 0.24)}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  for (const cage of cages) {
    const c = Math.min(...cage.cells);
    const x = PAD + (c % 9) * CELL + CELL * 0.06;
    const y = PAD + Math.floor(c / 9) * CELL + CELL * 0.27;
    // A white halo, so the dashed line stops short of the sum.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.strokeText(String(cage.sum), x, y);
    ctx.fillStyle = INK;
    ctx.fillText(String(cage.sum), x, y);
  }
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
