# Variants still to build

The puzzle types in [sigh/Interactive-Sudoku-Solver](https://github.com/sigh/Interactive-Sudoku-Solver)
(`js/sudoku_constraint.js`) that uwuSudoku does not have yet: none.
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
QVX, QCC, QFR, QRX, QCS, QCX, QDW, QNT, QCT, QCH, QCA, QCO, QYY and QDP. Q is only read with the two after it,
so every seed made before still reads as it did. Put the entry in `PARTS` or
`RULES` where its letters should go.

## Also worth knowing

- **Equal Sum** and **Same Values** pieces are told apart by not touching,
  so two pieces side by side cannot be drawn; the other solver's segments
  can. **Connected Values** leaves out the other solver's optional size of
  the group.
- **Chaos Arrow** takes the arms from its own cell along its row and
  column, and **Chaos Count** the nine cells round its own: the other
  solver also lets either name any cells. Puzzles that lean on Counting
  Circles with a Chaos Count in every circle and no givens, such as its
  "Let there be chaos", are still past the checker's budget.
- **Yin-Yang** gives shades only by circles: the other solver can also
  tie the shading to the digits with its general tools, which uwuSudoku
  leaves out, so here the two are solved apart.
- **Doppelgänger** is refused with the rules a 0 means nothing to: Chaos
  Construction and its clues, Entropic lines, Global Entropy, Global Mod,
  Anti-taxicab, Dutch Flatmates, Full Rank and its tie rules, and
  Row/Column Indexing. Quads, Look and Say, Connected Values and Hidden
  Skyscraper clues name digits 1 to 9 only, never its 0.
- **Dutch Whispers** turns every whisper line Dutch, so a puzzle with both
  kinds of line, or the other solver's other differences, cannot be drawn.
- A new kind of cage is one more entry in `CAGES` in `solver.js` and
  `CAGE_LISTS` in `variant.js`; one in pieces sets `split` there.
- A clue outside the grid with no number sets `key: null` in `OUTSIDE` in
  `solver.js`, as Row/Column Indexing does.
- More of a part in a list of its own, as Counting Circles' sets and single
  indexing cells are, takes a letter of its own in `PARTS` (`with` if it
  only comes with the first), `also` in `rule-help.js`, and an entry in
  `EXTRAS` in `solver.js`. An option on a part is a switch rule, as Dutch
  Whispers is, `replaces` naming the rule it changes.
- Not counted here: the other solver's general tools (Sum, All Different,
  Contain, Regex and NFA lines, custom pairs, Given, No Boxes, Region Size,
  Region Same Values, Replicate and the Or/And containers). They are for
  building puzzles by hand, not named puzzle types.

Equal Sum and Same Values pieces side by side are left out: the seed would
need to say where pieces meet, for puzzles that rarely have them.
