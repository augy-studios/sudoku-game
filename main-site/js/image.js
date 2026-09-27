// A puzzle drawn as a PNG, to save, print or send: the clues on a white
// board whatever the theme, in the app's font, with the site's name under it.

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

export async function drawPuzzle(grid) {
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

// Saves the grid as a PNG through the browser's download. True if it went.
export async function savePuzzleImage(grid, filename = "sudoku.png") {
  const canvas = await drawPuzzle(grid);
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
