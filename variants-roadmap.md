# Variants still to build

The puzzle types in [sigh/Interactive-Sudoku-Solver](https://github.com/sigh/Interactive-Sudoku-Solver)
(`js/sudoku_constraint.js`) that uwuSudoku does not have yet: 36 of them.
They are grouped as the rule buttons are on the Solver and Create screens,
so each one lands in a group that already exists.

**Built so far (18):** Killer, Jigsaw · Thermo, Arrow, German Whispers,
Renban, Palindrome · Kropki, XV · Sandwich, Little Killer, Skyscrapers,
X-Sums · Diagonal, Anti-knight, Anti-king, Windoku.

## Before building many more: seed letters

Each variant gets one letter at the front of a made puzzle's seed
(`seed.js`, `PARTS` and `RULES`), and the levels take E, M, H and X. Only
**C, F, I, Q and Z** are left, five letters for 36 variants. The seed
format needs a way to name more than 26 parts before many of these go in:
for example a two-character code after a marker letter, read only when the
marker is there, so every seed made so far still reads as it did.

## Cages and regions

| Variant | Rule | Builds on |
|---|---|---|
| Rellik Cage | No set of one or more digits in the cage adds up to its clue. | Cages tool |
| Equality Cage | As many odd digits as even, and as many low (1–4) as high (6–9); no 5, no repeats. | Cages tool, no sum |
| Lunchbox | The digits between the cage's smallest and largest add up to the clue; no repeats. | Cages tool |
| Look and Say | The clue reads as (count, digit) pairs: 23 means exactly two 3s in the cells. | Cages tool |
| Equal Sum | Each segment of the group adds up to the same total. | Cages tool |
| Same Values | The cells split into sets of equal size, each holding the same digits. | Cages tool |
| Connected Values | The group's cells holding any of the given digits join up edge to edge. | Cages tool |
| Count Distinct | The first cell's digit counts how many different digits the rest hold. | Cages tool |

## Lines

| Variant | Rule | Builds on |
|---|---|---|
| Zipper | Pairs of cells the same way in from each end add up to the same total; on an odd line, that total is the middle digit. | Palindrome, almost as is |
| Between | Digits on the line lie strictly between the two circle digits at its ends. | Line tool, circles at both ends |
| Lockout | Digits on the line lie outside the two diamond digits at its ends, which differ by at least a set amount (usually 4). | Line tool, diamonds at both ends |
| Entropic | Every run of three cells has one of 1–3, one of 4–6 and one of 7–9. | Line tool |
| Modular | Every run of three cells has one of 147, one of 258 and one of 369. | Line tool |
| Double Arrow | The digits between the two end circles add up to the circles' sum. | Arrow |
| Sum Line | The line splits into segments that each add up to a given sum. | Line tool, with a sum |
| Region Sum Line | The line's segment in each box it passes through adds up to the same total. | Line tool, boxes or regions |
| Pill Arrow | Like Arrow, but the total is a two or three-digit number read across a pill of cells. | Arrow |
| Value Indexing | Points from a digit X to the next X; the second cell says how far along it is. | Line tool |

## Marks between cells

| Variant | Rule | Builds on |
|---|---|---|
| Greater Than | A sign between two cells that share a side: the digit it opens to is the larger. | Marks tool, a mark with a direction |
| Quad | A circle where four cells meet, listing digits that must appear in those four. | Marks tool, on a corner |
| Counting Circles | A digit in a circle counts how many circles hold that digit. | New: marks in cells |

## Clues outside the grid

| Variant | Rule | Builds on |
|---|---|---|
| Hidden Skyscraper | The clue is the first building hidden from view, looking in from that side. | Skyscrapers' views |
| Numbered Room | The first digit from the clue's side, X, puts the clue's digit X cells in. | X-Sums' views |
| Full Rank | Rows and columns read as numbers and ranked; the clue is that one's place. | Views, and a whole-grid option for ties |
| Row/Column Indexing | A cell's digit says where in its row the cell's own column number sits (or the other way). | New |

## Whole-grid rules

| Variant | Rule | Builds on |
|---|---|---|
| Disjoint Groups | The cells in the same spot of every box hold 1 to 9. | Windoku's extra houses; the cheapest of all |
| Strict Kropki | Cells with no dot between them are never consecutive or one double the other. | Kropki; the README says there is no negative rule yet |
| Strict XV | Cells with no mark between them never add up to 10 or 5. | XV, as above |
| Anti-consecutive | Cells that share a side never hold consecutive digits. | New kind of pair check, not just "differ" |
| Global Entropy | Every 2×2 square has one of 1–3, one of 4–6 and one of 7–9. | New |
| Global Mod | Every 2×2 square has one of 147, one of 258 and one of 369. | New |
| Anti-taxicab | A digit X never has another X exactly X steps away along rows and columns. | New |
| Dutch Flatmates | Every 5 has a 1 directly above it or a 9 directly below it. | New |

## Big ones

| Variant | Rule | Why it is big |
|---|---|---|
| Yin-Yang | Every cell is shaded or not; each shade joins up, and no 2×2 is all one shade. | A shading layer on top of the digits |
| Chaos Construction | Jigsaw regions are worked out while solving, not given. | Regions become unknowns |
| Doppelgänger | Each row, column and box holds 0 and all but one of 1–9, never missing the same digit twice. | Needs a 0 digit |

## Also worth knowing

- **Dutch Whispers** is German Whispers with a difference of 4. It could be
  an option on the Whispers line rather than a new variant.
- Not counted here: the other solver's general tools (Sum, All Different,
  Contain, Regex and NFA lines, custom pairs, Given, No Boxes, Region Size,
  Region Same Values, Replicate and the Or/And containers). They are for
  building puzzles by hand, not named puzzle types.

## Suggested order

1. Zipper, Between and Lockout: lines, and the end circles and diamonds share one drawing change.
2. Disjoint Groups, Anti-consecutive, Strict Kropki and Strict XV: whole-grid switches.
3. Entropic and Modular lines.
4. Greater Than and Quad: marks.
5. Hidden Skyscraper and Numbered Room: both reuse the views Skyscrapers and X-Sums use.

The seed letters need sorting out by the second batch at the latest.
