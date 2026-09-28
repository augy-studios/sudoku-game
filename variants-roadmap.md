# Variants still to build

The puzzle types in [sigh/Interactive-Sudoku-Solver](https://github.com/sigh/Interactive-Sudoku-Solver)
(`js/sudoku_constraint.js`) that uwuSudoku does not have yet: 19 of them.
They are grouped as the rule buttons are on the Solver and Create screens,
so each one lands in a group that already exists.

## Every new variant needs an explanation

Each one gets an entry in `main-site/js/rule-help.js`: its name as
`variantName` says it, what it means for someone solving, and how to draw it
in the Solver and Create tools. The site shows these on the rule buttons,
under them, and in a game's Rules box. The engine tests fail until the entry
is there, in the same order as the buttons.

## Seed letters

Each variant has letters at the front of a made puzzle's seed (`seed.js`,
`PARTS` and `RULES`), and the levels take E, M, H and X. The single letters
are all taken but I, which is easily misread, so a new variant's letters are
**Q and two more** that name it and no other. Taken so far: QEN, QMO, QGT,
QQD, QHS, QNR, QDG, QAC, QSK, QSX, QGE, QGM, QAT and QDF. Q is only read with the two after it,
so every seed made before still reads as it did. Put the entry in `PARTS` or
`RULES` where its letters should go.

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
| Double Arrow | The digits between the two end circles add up to the circles' sum. | Arrow |
| Sum Line | The line splits into segments that each add up to a given sum. | Line tool, with a sum |
| Region Sum Line | The line's segment in each box it passes through adds up to the same total. | Line tool, boxes or regions |
| Pill Arrow | Like Arrow, but the total is a two or three-digit number read across a pill of cells. | Arrow |
| Value Indexing | Points from a digit X to the next X; the second cell says how far along it is. | Line tool |

## Marks between cells

| Variant | Rule | Builds on |
|---|---|---|
| Counting Circles | A digit in a circle counts how many circles hold that digit. | New: marks in cells |

## Clues outside the grid

| Variant | Rule | Builds on |
|---|---|---|
| Full Rank | Rows and columns read as numbers and ranked; the clue is that one's place. | Views, and a whole-grid option for ties |
| Row/Column Indexing | A cell's digit says where in its row the cell's own column number sits (or the other way). | New |

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

1. Double Arrow and Pill Arrow: both build on Arrow's circle and sum.
2. Rellik Cage, Lunchbox, Look and Say and Equality Cage: cages with a
   different clue. The Cages tool needs a kind per cage first, so one tool
   can draw them all.
3. Sum Line, Region Sum Line and Value Indexing: lines, the first two with
   a total.
4. Equal Sum, Same Values, Connected Values and Count Distinct: groups of
   cells on the Cages tool, once it has kinds.
5. Counting Circles, Full Rank and Row/Column Indexing: each needs
   something new, marks in cells, a ranking of whole rows, or indexing.
6. The big ones last: Yin-Yang, Chaos Construction and Doppelgänger.
