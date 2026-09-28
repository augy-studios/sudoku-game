// A puzzle drawn as a PNG, to save, print or send: the clues on a white
// board whatever the theme, in the app's font, with the site's name under it,
// and a killer puzzle's cages as on screen.

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

export async function drawPuzzle(grid, cages = null) {
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

  if (cages?.length) drawCages(ctx, cages);

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
  ctx.fillText("uwuSudoku  ·  sudoku.uwuapps.org", WIDTH / 2, PAD * 2 + BOARD + 20);
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
export async function savePuzzleImage(grid, filename = "sudoku.png", cages = null) {
  const canvas = await drawPuzzle(grid, cages);
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
