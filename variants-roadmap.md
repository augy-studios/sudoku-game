# Variants still to build

The puzzle types in [sigh/Interactive-Sudoku-Solver](https://github.com/sigh/Interactive-Sudoku-Solver)
(`js/sudoku_constraint.js`) that uwuSudoku does not have yet: 3 of them.
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
QQD, QHS, QNR, QDG, QAC, QSK, QSX, QGE, QGM, QAT, QDF, QDA, QPA, QRC, QLB, QLS, QEC, QES, QSV, QCV, QCD, QSL, QRS,
QVX, QCC, QFR and QRX. Q is only read with the two after it,
so every seed made before still reads as it did. Put the entry in `PARTS` or
`RULES` where its letters should go.

## Big ones

| Variant | Rule | Why it is big |
|---|---|---|
| Yin-Yang | Every cell is shaded or not; each shade joins up, and no 2×2 is all one shade. | A shading layer on top of the digits |
| Chaos Construction | Jigsaw regions are worked out while solving, not given. | Regions become unknowns |
| Doppelgänger | Each row, column and box holds 0 and all but one of 1–9, never missing the same digit twice. | Needs a 0 digit |

## Also worth knowing

- **Dutch Whispers** is German Whispers with a difference of 4. It could be
  an option on the Whispers line rather than a new variant.
- A **sum line** cannot close in a loop yet, as the other solver's can.
- **Equal Sum** and **Same Values** pieces are told apart by not touching,
  so two pieces side by side cannot be drawn; the other solver's segments
  can. **Connected Values** leaves out the other solver's optional size of
  the group.
- **Counting Circles** counts all of a puzzle's circles together; the other
  solver's separate sets of circles, each counted apart, are left out.
- **Full Rank** keeps the other solver's default for ties, a clued row or
  column tying with none; its Full Rank Ties option (no ties anywhere, or
  ties allowed for clued ones too) is left out.
- **Row/Column Indexing** marks whole rows and columns, which is how 1-5-9
  puzzles have it; the other solver can mark single cells.
- A new kind of cage is one more entry in `CAGES` in `solver.js` and
  `CAGE_LISTS` in `variant.js`; one in pieces sets `split` there.
- A clue outside the grid with no number sets `key: null` in `OUTSIDE` in
  `solver.js`, as Row/Column Indexing does.
- Not counted here: the other solver's general tools (Sum, All Different,
  Contain, Regex and NFA lines, custom pairs, Given, No Boxes, Region Size,
  Region Same Values, Replicate and the Or/And containers). They are for
  building puzzles by hand, not named puzzle types.

## Suggested order

1. Dutch Whispers and the Full Rank ties option: small, each a switch and
   a seed letter. Whispers already has the check; the gap becomes 4 or 5.
   No ties anywhere is a whole-grid rule, like Strict Kropki.
2. Counting Circles in separate sets, and single-cell indexing: the
   narrowing already works per set and per cell, so the work is a way to
   mark them.
3. Sum lines that close in a loop: a flag on the line, and runs that wrap
   round the end.
4. The big ones last: Yin-Yang, Chaos Construction and Doppelgänger.

Equal Sum and Same Values pieces side by side are left out: the seed would
need to say where pieces meet, for puzzles that rarely have them.
