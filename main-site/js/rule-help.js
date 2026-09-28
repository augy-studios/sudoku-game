// What each variant rule means, and how to put it on a puzzle, in a line
// or two each: under the rule buttons in the Solver and Create screens, on
// the buttons as a tooltip, and in a variant game's Rules box. Pure, with no
// DOM. Keyed as the rule buttons' data-rule is, in the buttons' order.
//
// Every rule button has to have an entry: the engine tests check each
// data-rule in index.html against this, and each name against variantName.
//
// name  as variantName (variant.js) says it.
// list  the variant's list that holds the drawn part, or none for a switch
//       rule (RULES in variant.js, whose key is the same as this one's).
// rule  what it means, for someone solving.
// draw  how to put it on, for someone typing a puzzle in or making one.

import { RULES } from "./variant.js";

export const RULE_HELP = {
  killer: {
    name: "Killer",
    list: "cages",
    rule: "The digits in each dashed cage add up to the number in its corner, and never repeat within the cage.",
    draw: "Tap Cages, then the cells of a cage, type its sum, and tap Add cage.",
  },
  jigsaw: {
    name: "Jigsaw",
    list: "regions",
    rule: "Nine odd-shaped regions, outlined in heavy lines, take the place of the 3×3 boxes. Each holds 1 to 9 once.",
    draw: "Tap Regions, tap a cell to pick its region, then tap cells to move them into it, until every region has nine cells joined edge to edge.",
  },
  thermo: {
    name: "Thermo",
    list: "thermos",
    rule: "Digits rise along each grey thermometer, starting from its round bulb.",
    draw: "Tap Thermos, then the bulb and each next cell in order, and tap Add thermo.",
  },
  arrow: {
    name: "Arrow",
    list: "arrows",
    rule: "The digits along each arrow add up to the digit in its circle. They may repeat if nothing else stops them.",
    draw: "Tap Arrows, then the circle and each cell along the arrow, and tap Add arrow.",
  },
  whisper: {
    name: "German Whispers",
    list: "whispers",
    rule: "Digits next to each other on a green line differ by at least 5, so a 5 never goes on one.",
    draw: "Tap Whispers, then each cell along the line from one end, and tap Add whisper.",
  },
  renban: {
    name: "Renban",
    list: "renbans",
    rule: "The digits on a purple line are a run with no gaps or repeats, in any order, like 5 3 4.",
    draw: "Tap Renbans, then each cell along the line from one end, and tap Add renban.",
  },
  palindrome: {
    name: "Palindrome",
    list: "palindromes",
    rule: "The digits on a blue line read the same from either end, like 3 7 1 7 3.",
    draw: "Tap Palindromes, then each cell along the line from one end, and tap Add palindrome.",
  },
  kropki: {
    name: "Kropki",
    list: "dots",
    rule: "Digits either side of a white dot are consecutive, like 4 and 5. Either side of a black dot, one is double the other, like 3 and 6. Sides with no dot can be anything.",
    draw: "Tap Marks, then tap near the side between two cells. Each tap steps it on to the next mark, then back to none.",
  },
  xv: {
    name: "XV",
    list: "xvs",
    rule: "Digits either side of an X add up to 10, and either side of a V add up to 5. Sides with no mark can be anything.",
    draw: "Tap Marks, then tap near the side between two cells. Each tap steps it on to the next mark, then back to none.",
  },
  sandwich: {
    name: "Sandwich",
    list: "sandwiches",
    rule: "A number left of a row or above a column is the sum of the digits between that row's or column's 1 and its 9.",
    draw: "Tap Outside, then a spot left of a row or above a column, type the sum, and tap Add.",
  },
  little: {
    name: "Little Killer",
    list: "littles",
    rule: "A number outside the grid with a small arrow is the sum of the digits along the diagonal the arrow points down. They may repeat.",
    draw: "Tap Outside, then a spot round the edge, type the sum, and tap Add. Turn changes which way its arrow points.",
  },
  skyscraper: {
    name: "Skyscrapers",
    list: "skyscrapers",
    rule: "Digits are buildings that high, and taller ones hide shorter ones behind them. A number beside a row or column counts the buildings seen from that side.",
    draw: "Tap Outside, then a spot beside a row or column, type the count, and tap Add.",
  },
  xsum: {
    name: "X-Sums",
    list: "xsums",
    rule: "A number beside a row or column is the sum of the first X digits from that side, where X is the first digit itself.",
    draw: "Tap Outside, then a spot beside a row or column, type the sum, and tap Add.",
  },
  diagonal: {
    name: "Diagonal",
    rule: "Both long diagonals, drawn as faint lines, hold 1 to 9 once, like a row.",
    draw: "Nothing to draw: turning it on is all.",
  },
  antiknight: {
    name: "Anti-knight",
    rule: "Two cells a chess knight's move apart never hold the same digit.",
    draw: "Nothing to draw: turning it on is all.",
  },
  antiking: {
    name: "Anti-king",
    rule: "Two cells touching at a corner never hold the same digit.",
    draw: "Nothing to draw: turning it on is all.",
  },
  windoku: {
    name: "Windoku",
    rule: "Four more tinted 3×3 windows, in rows and columns 2 to 4 and 6 to 8, each hold 1 to 9 once.",
    draw: "Nothing to draw: turning it on is all.",
  },
};

// The rules a variant uses, as keys of RULE_HELP in its order: those whose
// part it has, and its switch rules. variant: as variant.js has it, or a
// made seed.
export function rulesOf(variant) {
  if (!variant) return [];
  return Object.entries(RULE_HELP)
    .filter(([key, h]) => (h.list ? variant[h.list]?.length : (variant.rules ?? 0) & (RULES.find((r) => r.key === key)?.bit ?? 0)))
    .map(([key]) => key);
}
