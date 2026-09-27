// The four difficulty levels. Pure data, shared by the page and the API.
//
// blanks   how many clues the generator tries to take out. It stops early
//          when no more can go without a second solution, so Expert is
//          usually a minimal puzzle rather than exactly 64 blanks.
// percent  what the level multiplies every point by
// window   minutes over which the time bonus shrinks to nothing

export const LEVELS = {
  E: { id: "E", name: "Easy", blanks: 40, percent: 60, window: 15 },
  M: { id: "M", name: "Medium", blanks: 48, percent: 100, window: 25 },
  H: { id: "H", name: "Hard", blanks: 52, percent: 150, window: 40 },
  X: { id: "X", name: "Expert", blanks: 64, percent: 220, window: 60 },
};

export const LEVEL_IDS = ["E", "M", "H", "X"];
