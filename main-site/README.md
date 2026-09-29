# main-site

What Vercel deploys, served at <https://sudoku.uwuapps.org>. No build step:
the files are served as they are, and `api/` holds the serverless functions.

| Path | What it is |
| --- | --- |
| `index.html` | The only page. Its `<head>` is the template for any page added later. |
| `404.html`, `404.css` | The shared not-found page. |
| `sw.js` | Service worker: the offline shell, and the update bar's waiting worker. |
| `manifest.json` | PWA manifest. |
| `css/theme.css` | The uwuapps theme, verbatim from `uwuapps-theme.md`, time-based mode included. |
| `css/style.css` | Layout, the board, the number pad. Board colours are tokens at the top. |
| `js/` | ES modules, below. |
| `api/` | The leaderboard API, below. |
| `images/` | Manifest screenshots, at the sizes `manifest.json` gives. |

## js

Every file here is precached; `scripts/check-precache.mjs` fails if one is
not. The first five are pure, with no DOM, and the API imports them too, so
the browser and the server always agree on a game.

| File | What it does |
| --- | --- |
| `sudoku.js` | The solver (bitmasks, fewest candidates first) and the seeded puzzle generator. |
| `levels.js` | The four levels: how many clues come out, and what each is worth. |
| `seed.js` | Seeds, the integer random numbers the generator draws from, and a seed's puzzle. |
| `record.js` | The move log: replaying it, undo, checking one from elsewhere, and packing it into a link. |
| `score.js` | Scoring (below). |
| `board.js` | The board on screen: nine boxes of nine cells, selection, arrow keys. |
| `game.js` | The game screen: setup, play, undo, hints, Solve, result, submit, saving. |
| `replay.js` | The instant replay. |
| `net.js` | Pairing over PeerJS, STUN only, from `STUN-p2p-spec.md`. |
| `multiplayer.js` | Network games on top of `net.js`: hosting, joining, race and co-op. |
| `qr.js` | QR encoder for the join link, from uwuPromptr, so it works offline. |
| `steps.js` | Pure too, for the solver: reading a pasted grid, clashes, candidates, and the next step a person can see. |
| `calendar.js` | Pure, for the page and the API: the first daily's date, months laid out in weeks, dates to read, and streaks. |
| `solver.js` | The Solver tab's screen: typing a puzzle in, then hints, Check, candidates and Solve. |
| `image.js` | Draws a puzzle to a PNG, for the solver's Save image, cages and all. |
| `variant.js` | Pure. Variant sudoku: killer, Rellik, lunchbox, Look and Say, Equality, Equal Sum, Same Values, Connected Values and Count Distinct cages, thermometers, arrows, double and pill arrows, German Whispers, renban, palindrome, zipper, between, lockout, entropic, modular, sum, region sum and value indexing lines, Kropki dots, XV marks, Greater Than signs, quads, Counting Circles, Sandwich, Little Killer, Skyscraper, X-Sum, Hidden Skyscraper, Numbered Room and Full Rank clues, Row/Column Indexing marks, a Jigsaw's regions, and the switch rules, what they allow, and a solver for any mix, which the API uses too. |
| `api.js`, `leaderboard.js`, `settings.js` | The API client, with the short codes long made seeds are shared by, and the leaderboard and settings windows, after MRT Station Guesser's. |
| `theme.js`, `icons.js`, `ui.js`, `update-bar.js`, `confetti.js`, `app.js` | Theme, inline SVG icons, modal and storage helpers, the update bar, a solve's confetti, and boot. |

## The game

**Modes.** Solo; the daily puzzles, the same for everyone on a date, a
classic one and a killer one; or two
devices on one network, one hosting with a six character code, a link or a
QR code, and the other joining. A network game is a **race** (the same
puzzle, each on your own board, with the other player's progress shown
above yours) or **co-op** (one board, both of you on it).

**The daily calendar.** Daily shows a month at a time, from Monday, and any
day from the first daily (`DAILY_FIRST` in `calendar.js`, the site's first
day, 23 September 2025) to today can be picked, by tap or with the arrow
keys, Home and End. An old day plays and scores exactly as it would have on
the day: time bonuses, that day's board, and the name's total. A finished
day is tinted with a dot: finished on this device (kept in
`uwusudoku.days`), or on the board under the name in Settings. Runs of
those are the streak, counted to today, or to yesterday while today is
still to play; filling in a missed day mends a run, as the new-game screen
says. The streak shows under the calendar and after a daily goes on the
board.

**Classic or killer.** Each day has two puzzles at the day's level: the
classic one, and a killer one, picked with Classic or Killer over the
calendar (kept in the setup). Either finished keeps the day, and the
streak, going; each has its own board, and a name can have one of each on a
day. The killer is made on the server from the day's secret, as the classic
one is (`killerSeed` in `seed.js`): a full grid, cages of two to four cells
over every cell with no digit twice, then clues taken out while its answer
stays the only one, down to about 19 left at Easy and none or one or two at
Expert. It is sent as a made killer puzzle's seed, `K-...`, so the page
reads it as any made seed, checking its one answer, and a replay link
carries it whole. Tutorial explains its cages over the board, as for any
variant.

**Solver.** The fourth tab is for a puzzle from somewhere else. Type or
paste it in (81 cells, 0 or . for blanks); typing moves on a cell at a time,
so a puzzle goes in row by row, with 0 or . for a blank. Then Help me solve
it checks it with the engine's own solver: clashing digits, too few clues,
no answer or more than one are each said plainly. Then it is solved on the board here.
Hint takes two taps, where to look and then the digit and why, from a
single (one digit fits the cell) or a hidden single (one place left for a
digit in a row, column or box), or from the answer when neither is left.
Hints refuse to build on a wrong digit and mark it instead. Check marks
wrong digits, the candidates can be shown, and Solve fills the rest. Kept
in this browser, never scored, and nothing is sent. Save image downloads the
clues as a PNG.

**Create.** The fifth tab makes a puzzle. The clues go in as in the solver,
and Check it says whether they have exactly one answer: when there are more,
it points at a cell two answers disagree on, where a clue is wanted. A
puzzle that passes is rated (by its blanks, and at least Hard if singles
alone cannot finish it) and gets a seed that carries the whole puzzle, to
copy, play, or save as an image with the clues.

Both open a seed, in the Open a seed box over the rule buttons or through
Paste, while the clues go in: a generated seed's clues, or a made seed's
with its rules and everything drawn on it, every rule switched to what the
seed has (what a rule switched off had drawn is kept for when it comes
back). So a made puzzle can be changed and checked again for a new seed,
or saved as an image, and opening one is undoable.

**Made puzzles.** Their seeds, like `H-FYWQ-75KD-...`, are the puzzle
packed into one number: which cells hold clues as 81 bits, and the clues in
base 9 above them, written in the seed alphabet, never under 12 characters
so never taken for a generated seed. One only parses if its puzzle has
exactly one answer. It plays like any seed, pasted into the new-game Seed
box, which also takes a copied puzzle. Its maker knows the answer, so a
made puzzle never goes on the main boards: played solo it goes on a board of
its own (mode `made`, from migration 002), without time bonuses, and in a
network game it is not scored.

**Variants.** The solver and the maker both have rule buttons over the
board, on or off in any mix, grouped as Cages & regions, Lines, Marks,
Outside the grid and Whole grid (the same groups as
[variants-roadmap.md](../variants-roadmap.md), which lists those still to
build). Each rule is explained in a line or two from `rule-help.js`: as a
tooltip on its button, under the buttons once it is on (what it means, and
while the clues go in, how to draw it), and in a Rules box over the board
in a variant game or replay, while Tutorial is on in the new-game screen's
Solo and Network settings, and the Daily's with Killer picked (it is on to begin with; off, the level chip
still names the rules). The engine tests fail if a rule button, or
any variant `variantName` can name, has no explanation. The rules: Killer, Rellik, Lunchbox, Look and Say, Equality, Equal Sum, Same Values, Connected (Connected Values), Count Distinct, Thermo, Arrow, Double Arrow, Pill Arrow, Whispers (German
Whispers), Renban, Palindrome, Zipper, Between, Lockout, Entropic, Modular, Sum Line, Region Sum (Region Sum Line), Value Indexing, Kropki, XV, Greater Than, Quad, Counting Circles, Sandwich, Little Killer, Skyscrapers,
X-Sums, Hidden Skyscraper, Numbered Room, Full Rank, Row/Col Indexing (Row/Column Indexing), Jigsaw, Diagonal (both long diagonals hold 1 to 9), Anti-knight (cells a knight's move apart differ), Anti-king (cells
touching at a corner differ), Windoku (four more 3x3 windows, rows and
columns 2 to 4 and 6 to 8, hold 1 to 9), Disjoint Groups (the cells in the
same place in each 3x3 box hold 1 to 9), Anti-consecutive (cells sharing a
side are never consecutive), Strict Kropki (every dot is given: cells
sharing a side with no dot are neither consecutive nor a double), Strict
XV (every X and V is given: cells sharing a side with no mark add up to
neither 10 nor 5), Global Entropy (every 2x2 square holds a low, a middle
and a high digit), Global Mod (every 2x2 square holds one each of 1 4 7,
2 5 8 and 3 6 9), Anti-taxicab (a digit X never has another X exactly X
steps away along rows and columns) and Dutch Flatmates (every 5 has a 1
above it or a 9 below it). Diagonals are drawn as faint lines and windows tinted,
on the board and in a saved image; the others have nothing to draw, so the
level chip and the rules line name them. In variant.js, diagonals, windows
and disjoint groups are extra houses, the knight's and king's moves extra
pairs of cells that must differ, the rules about sides barred sides:
each side and the marks' relations its two digits must not keep, narrowed
as a dot is (`barredSides`), and the rules about 2x2 squares the kinds of
entropic and modular lines, each square's cells narrowed to the kinds
they can be while it holds all three (`squareKinds`). Anti-taxicab and
Dutch Flatmates hang on which digit a cell holds, so each narrows cells
its own way: a placed X comes out of the cells X steps away (`TAXICAB`),
and a cell with no 1 possible above it and no 9 below cannot be 5. So one solver handles
every mix, cages included; with no rules it takes the same steps as the
killer solver it grew from. A variant puzzle needs no least number of
clues, and one with anything drawn can have no given digits at all. Its
seed starts with its rules' letters, K, QRC, QLB, QLS, QEC, QES, QSV, QCV, QCD, T, A, QDA, QPA, S, R, O, Z, C, F, QEN, QMO, QSL, QRS, QVX,
P, V, QGT, QQD, QCC, B, L, Y, U, QHS, QNR, QFR, QRX, J, D, N, G, W, QDG, QAC, QSK, QSX, QGE, QGM, QAT and QDF, always in that
order, as in `KD-H-...` or `PQSK-H-...`. Once the single letters ran out, a
new rule's or part's letter became Q and two more: Q is only ever read with the two after it,
so a seed from before reads as it did, and the X in QSX is never taken for
the Expert level. A seed
with any before D carries that part in its body too: cages of each kind, thermometers,
arrows, double arrows, pill arrows, whisper lines, renban lines, palindrome lines, zipper lines,
between lines, lockout lines, entropic lines, modular lines, sum lines, region sum lines, value indexing lines, dots, XV marks, signs, quads, Counting Circles, Sandwich sums, Little Killer
sums, Skyscraper counts, X-Sums, Hidden Skyscraper clues, Numbered Room
clues, Full Rank clues, indexing marks or regions (a line as its length, its first cell and each step's
direction, a sum line with its sum first, and sum and region sum lines'
lengths, up to 27, and value indexing lines', up to 11, in a wider digit; a pill arrow as its pill's size, first cell and way, then its
arrow as a line from the pill cell it starts beside; dots, marks and the clues beside a row or column as a list, or every side's or view's value, whichever is shorter; Counting Circles as a list of cells or a flag for every cell, whichever is shorter; Sandwich
sums as every row's and column's sum or none; indexing marks as a flag for every row and column; Little Killer sums as each
one's first cell, way and sum; regions, and each kind of cage, as which
neighbours share one, a cage's clue after). The
others' carry the clues only.

Some mixes of the switch rules have no grid at all, whatever else is on:
anti-knight with anti-king and either Diagonal or Windoku, and anti-knight
with both Diagonal and Windoku. The engine tests show it, and make a puzzle
with every drawn part at once under each widest mix that does have a grid.

**Thermo.** Digits rise strictly along each thermometer, from its round
bulb. The Thermos tool draws one: tap the bulb, then each next cell, which
must touch the last along a side or at a corner; tapping the last cell
takes it back, and Add thermo keeps it. Tapping a thermometer already drawn
picks it up to change or remove, and tapping its bulb then starts another
from the same bulb. Thermometers may share cells, up to forty
of them, two to nine cells each. The solver squeezes each cell on one
between the least the cell before can be and the most the cell after can
be, which feeds candidates and hints too; digits that do not rise fast
enough (two steps apart need two more) show as clashes. On the board they
are a faint grey line with a bulb, in a saved image a solid one under the
digits.

**Arrow.** The digits along each arrow add up to the digit in its circle,
and may repeat where the rules allow. The Arrows tool draws one as Thermos
draws a thermometer: tap the circle, then each cell along the arrow; Add
arrow keeps it. Arrows may share cells and circles (pick one up, then tap
its circle to start another), up to forty, two to nine cells each counting
the circle. The solver keeps each circle between the least and the most its
arrow can add up to, and each arrow cell between what the circle leaves
with the others at their most and at their least. An arrow past its circle
(or past 9 with the circle empty), or full and adding up to something else,
shows as a clash. On the board and in a saved image, an arrow is a thin
line from a ring round the circle's digit to a head.

**Double Arrow and Pill Arrow.** A double arrow has a circle at each end,
and the digits between add up to the two circles' digits together: 4 5
between a 3 and a 6. A pill arrow's pill is two or three cells side by
side along a row or down a column, its digits read left to right or top to
bottom as a number, and the digits along its arrow add up to that number:
a pill of 1 7 with 9 8 along the arrow. Digits may repeat on either where
the rules allow. The Doubles tool draws a double arrow as Betweens draws a
between line, from one circle to the other, three to nine cells long. The
Pills tool takes the pill's cells first, side by side in a straight line,
Pill of 2 switching it to 3 and back, then the arrow from any cell beside
the pill, up to 27 cells (`PILL_ARROW_MOST`), since a three-digit pill is
111 at least and needs thirteen. Tapping a pill cell of one picked up
starts another arrow from the same pill. Up to forty of each, and they may
share cells. In variant.js both are sums that balance (`scales`): each cell
has a weight, a circle 1, a pill digit 100, 10 or 1 as a number's are, and
a cell between the circles or along the arrow -1, and the weighted digits
add up to 0. The solver squeezes each as an arrow: the least and most the
weighted digits can make must take in 0, and each cell keeps the digits
that leave the others some way to get there. So a pill of two with two
cells of arrow starts with a 1, and a three-digit pill with thirteen starts
1 1. Digits between the circles or along the arrow that go past the most
the circles or the pill could make, or fill it short of the least, show as
a clash, with the circles' or the pill's. On the board and in a saved image, a double arrow is a thin grey
line between rings round both ends' digits, and a pill arrow a box with
round ends round the pill's digits, with a thin arrow from its edge to a
head.

**German Whispers and Renban.** On a whisper line, digits next to each
other differ by at least 5, so no 5 is ever on one. On a renban line, the
digits are a run with no gaps or repeats, in any order: a line of three
might hold 5 3 4. The Whispers and Renbans tools draw them as Thermos draws
a thermometer, from either end, and they may share cells, up to forty of
each, two to nine cells long. The solver keeps each whisper cell to digits
far enough from some digit its neighbours can still be, both ways along the
line, and each renban cell to the runs its line could still be: runs that
hold its placed digits, and whose other digits its empty cells can all
reach. Neighbours on a whisper line less than 5 apart show as a clash, as
do a repeat on a renban line, and a renban line's digits once they spread
wider than it is long. They are drawn as a thick line with no bulb, green
for whispers and purple for renban, on the board and in a saved image.

**Palindrome.** A palindrome line's digits read the same from either end,
so cells the same way in from each end hold the same digit, and a line's
middle cell, if it has one, may be anything. The Palindromes tool draws one
as Whispers does, and they may share cells, up to forty, two to nine cells
long. The solver keeps each such pair of cells to the digits both can
still be, so a digit placed at one end is the only candidate at the other;
a pair whose two cells share a row, column or box can never match. A pair
holding two different digits shows as a clash. A palindrome line is drawn
as a thick blue line, on the board and in a saved image: often grey
elsewhere, but here grey is a thermometer's.

**Zipper.** On a zipper line, each two cells the same way in from either
end add up to the same total, and a line's middle cell, if it has one,
holds that total: 2 5 9 4 7 is one. The Zippers tool draws one as Whispers
does, and they may share cells, up to forty, two to nine cells long. The
solver works out the totals the line could still have, those every pair can
make and the middle cell can be, then keeps each cell to digits that make
one of them with a digit its partner can be, and the middle to the totals.
A full pair off the middle's digit shows as a clash, with the middle; with
the middle empty, full pairs that make different totals, or a total past 9,
do. A zipper line is drawn as a thick pink line.

**Between and Lockout.** Each has a shape round the digit at both ends:
circles for a between line, diamonds for a lockout line. A between line's
other digits lie strictly between its circles' digits, as in 2 5 4 7. A
lockout line's diamonds differ by at least 4 (`LOCKOUT_GAP`, as most
puzzles have it), and its other digits lie outside them, never between or
equal to either, as in 3 8 1 7. The Betweens and Lockouts tools draw them
as Whispers does, from one end's circle or diamond to the other's, and
they may share cells, up to forty, two to nine cells long counting the
ends. The solver tries every pair of digits the ends could hold, keeps
those every other cell on the line can go along with, and keeps each cell
to what those pairs allow. A digit on the wrong side of the ends shows as a
clash with them, as do a digit the same as an end's, ends a lockout line
cannot have, and a between line's ends with no room between. They are drawn
as a thinner line, teal for between and brown for lockout, that stops at the
ring or diamond round each end, on the board and in a saved image.

**Entropic and Modular.** Any three cells in a row along an entropic line
hold one low digit (1 to 3), one middle (4 to 6) and one high (7 to 9), as
in 2 9 5 1 7; along a modular line, one each of 1 4 7, 2 5 8 and 3 6 9, as
in 1 5 9 4 8. So cells three apart along one hold the same kind, and the
line's first three cells set the kinds for the rest. The Entropics and
Modulars tools draw them as Whispers does, three to nine cells long, since
a run of three is what the rule is about, up to forty of each, and they
may share cells. The solver tries the six ways to give the line's three
places, counted in threes, a kind each, keeps those every cell can go along
with, and keeps each cell to its place's kinds in them. Two digits of one
kind in different places, or of different kinds in the same place, show as
a clash. They are drawn as a thick line, gold for entropic and orange for
modular, on the board and in a saved image.

**Sum Line, Region Sum and Value Indexing.** From the Interactive Sudoku
Solver's lines. A sum line cuts into runs of cells one after another, each
adding up to its sum, 1 to 30, shown in its first cell's corner: with 10,
3 7 1 9 is 3 7 and then 1 9. The Sum lines tool draws one as Whispers does,
two to 27 cells, with its sum typed in the bar's box (0 too, from the
keyboard), which stays for the next line. Going along, the solver keeps at
each gap between cells the totals the run there can have reached, starting
again at 0 on the sum, and coming back, those it can still finish; a cell
keeps the digits that link the two. A run past the sum, read from either
end, and a full line's last run left short, show as a clash. A region sum
line adds up to the same total in each box it passes through, a run for
each visit, or with a Jigsaw in each region (`regionRuns`); each run's
digits are different, as its box's are, so the solver keeps the totals
every run can make with some set of different digits its cells can hold,
and each cell to those sets. Full runs with different totals clash, and so
does a run already past the total they agree on. A value indexing line runs
from a dot: the dot's digit, X, turns up again K cells past the second
cell, whose digit is K, so 4 2 7 4. Three to eleven cells; the solver keeps
the Ks whose cell could hold an X, and the Xs those cells could hold. Sum
lines are a dashed olive line, region sum lines an indigo one, and value
indexing lines a thin dashed grey arrow from a faint disc, on the board and
in a saved image. Sum lines here cannot close in a loop, as the other
solver's can.

**Kropki and XV.** They mark the side two cells share. A white dot's
digits are consecutive and a black dot's are one double the other; an X's
digits add up to 10 and a V's to 5. Sides with no mark may be anything,
unless Strict Kropki or Strict XV is on, which says every dot or every X
and V is given. The Marks tool puts them down: tap near a side,
or tap a cell and then one beside it, and each tap steps the side on
through the marks of the rules on (white dot, black dot, X, V) and back to
none. The solver keeps each cell of a marked pair to digits some digit the
other cell can be makes a pair with, and a pair that breaks its mark shows
as a clash. Dots are drawn white and black in either theme, and X and V as
letters, on the side, on the board and in a saved image.

**Greater Than and Quad.** A Greater Than sign sits on the side two cells
share, like a dot, and opens towards the larger digit. It is a mark with a
direction: `gt` when the first cell (left or above) is the larger, `lt`
when it is the smaller, and the Marks tool steps a side through the sign
one way, then the other, after the dots and X and V. It is drawn as a
chevron pointing at the smaller digit. A quad is a circle on the corner
where four cells meet, listing one to four digits those four cells hold
between them, a digit listed twice held twice (four cells round a corner
hold a digit twice at most, across the corner from each other). With Quad
on, a tap in the Marks tool near a cell's corner picks that corner, digits
typed go in its circle, and Erase takes the last off. The solver puts a
digit in every cell left that could take it when there are no more such
cells than it still needs, and once the digits still needed fill the empty
cells, keeps those cells to them; a quad shows as a clash once the digits
it still needs outnumber its empty cells. A quad is drawn as a circle on
the corner, its digits two to a row, on the board and in a saved image.

**Counting Circles.** From the Interactive Sudoku Solver. A digit in a
circle says how many circles hold that digit, so a 3 is in exactly three
of them, and the circles hold 1 to 45 cells (`CIRCLES_MOST`): every digit
d in d circles at most. All the circles on a puzzle count together, as
nearly every puzzle has them; the other solver's sets of circles counted
apart are left out. With Counting Circles on, a tap in the middle of a cell
in the Marks tool puts a circle in or takes it out, and taps near a side or
a corner still mark those; from the keyboard, picking a cell twice does.
The solver tries each set of digits adding up to the number of circles:
one holding every digit placed, none placed more than itself or with too
few circles left for the rest, and one every empty circle can take a digit
of. Each empty circle keeps the digits of those sets; a digit in all of
them that needs every circle able to take it goes in them, and one with its
count placed leaves the rest. A digit in more circles than itself, or with
too few circles left empty to make up its count, shows as a clash. A circle
is a ring round the cell's digit, on the board and in a saved image.

**Sandwich and Little Killer.** Their clues sit outside the grid, so with
either rule on, or a puzzle that has them, the board leaves a margin a cell
wide round the grid (the grid takes the middle 9 of 11), and so does a
saved image. A Sandwich sum, left of a row or above a column, adds up the
digits between that line's 1 and 9, 0 when they sit side by side. A Little
Killer sum, anywhere round the edge, adds up the whole diagonal its small
arrow points along, and digits may repeat on it. The Outside tool puts
them down: tap a spot in the margin (tapping one opens the tool), type the
sum, and Add; Turn switches a spot between a Sandwich sum and each
diagonal it could point along, and a spot holds one clue. The solver tries
each place a sandwich's 1 and 9 could take and keeps what the cells between
could add up to with different digits 2 to 8; a Little Killer diagonal it
squeezes as it does an arrow. A sandwich or diagonal past its sum, or full
at some other sum, shows as a clash. Near its last clues a Little Killer
puzzle can take the checker its whole budget, about a second, to give up
on.

**Skyscrapers and X-Sums.** Their clues go beside a row or column on any
side, in the same margin and with the same Outside tool; where a spot could
take more than one kind, Turn steps through them. A Skyscraper count says
how many digits are seen from that side, each taller than every one
before; it is drawn in a small square. An X-Sum says what the first X
digits from that side add up to, X being the first of them; it is drawn in
a small circle. The solver keeps a Skyscraper view's cells no taller than
the count allows (the cell k places in at most 10 minus the count plus k),
and checks the digits placed from the clue on against it; X-Sums it treats
as a Sandwich, trying each X. Too many seen, or the 9 in with some other
number seen, or an X-Sum past its sum or full at another, show as clashes.

**Hidden Skyscraper and Numbered Room.** Clues beside a row or column too,
on the same spots, Turn stepping through what a spot can take. A Hidden
Skyscraper clue, in a dashed square, is the height of the first digit from
that side lower than one before it, hidden behind it: 1 to 8, as a 9 is
never hidden. The solver tries each place that digit could be, the cells
before it rising as on a thermometer and the last of them taller, and keeps
what those places allow. A Numbered Room clue, in a diamond, is the digit
in the cell the first digit from that side counts to, the first cell
counting as one (so a first 1 points at itself). The clue's digit sits in
one place, so the first digit is one more than how far in that is: the
solver keeps the first cell to digits whose place could hold the clue's,
and a place none points to never holds it. The wrong height hidden first,
or the height seen, and a first digit pointing at some other digit, or the
clue's digit somewhere it does not point, show as clashes.

**Full Rank and Row/Column Indexing.** From the Interactive Sudoku Solver,
on the same Outside tool. Every row and column read from either side is a
nine-digit number, 36 of them, and a Full Rank clue beside one, after a #,
is where it comes among all 36, smallest first. The edge rows and columns
each hold every digit once, so four numbers start with each digit: a rank
of 1 to 4 starts its view with 1, 5 to 8 with 2, and so on (`rankStart`),
and says how many of the other three are smaller (`rankBelow`). As the
other solver has it by default, a clued number ties with none; its option
for other ways with ties is left out. The solver fixes each clue's first
digit, then for every other view that could start with it tells whether its
number is sure to be smaller, sure to be larger, or not yet known, by the
first place their digits could differ. It needs as many smaller as the rank
says could be, and no more sure: when only just enough could be, those
start with the digit and are ordered below it at the first place not yet
matching, and when enough are sure, the rest cannot be. The wrong first
digit, too many smaller or larger once both are filled up to where they
differ, or a tie, shows as a clash. A Row/Column Indexing mark, a small
pointer left of a row or above a column, makes each cell of it say where its
line's number sits: in a marked column, a cell's digit is the column its row
keeps that column's number in, so a 5 in column 1 puts that row's 1 in
column 5; in a marked row, the row its column keeps that row's number in.
It takes no number: pick the spot, Turn to Indexing if another clue can go
there, and Add. Marking columns 1, 5 and 9 makes the 1-5-9 puzzles; the
other solver's marking of single cells is left out. The solver keeps each
marked cell to the places its line's number could be, and takes the number
out of places no digit left points to (`INDEXERS`). A digit pointing at
some other digit, or the number somewhere the cell does not point, shows as
a clash. Marked rows and columns are shaded, darker where two cross.

**Jigsaw.** Nine regions of nine cells take the boxes' place: each holds 1
to 9, and the boxes are no houses. In variant.js a Jigsaw's regions are
houses in the boxes' place, so hints name them ("the region holding row 4,
column 1") and every other rule works with them; the anti rules' extra
pairs are worked out against them too. On the board and in a saved image
the boxes lose their heavy edges and tint, and each region gets a heavy
line round it. The Regions tool cuts them: turning Jigsaw on starts from
the boxes, tapping a cell picks its region, and tapping other cells moves
them into it; Back to boxes starts again. Check says first if a region is
not nine cells, joined edge to edge. Not every way of cutting the grid has
any grid that fits, and the checker can take its whole budget to give up
on one that has none. In a game, a placed digit clears its note from the
cells of its region, not its box (play() in record.js takes the peers to
clear; the API leaves them out, as notes never score).

**Killer.** In Killer, the Cages tool gathers cells (tap them), takes the
sum from the pad, the keyboard or the sum box, and adds the cage; tapping a
cage already drawn picks it up to change or remove. Undo covers cages too.
Clues are optional. Checks, clashes (a digit twice in a cage, or a cage
past its sum), candidates and hints all follow the cages. The solver
(variant.js) narrows each cage to the digit sets that make its sum and that its empty
cells could hold, places forced digits in houses and cages, and otherwise
branches on the cell with fewest candidates. It gives up after a fixed
400,000 steps, well under a second, and says so: a layout with that much
freedom asks the maker for another clue or a smaller cage. The count is
the same on the page and the server, so they always agree. A made killer
puzzle's seed starts with K (`K-H-...`, about 140 characters) and carries
its clues and cages; it plays as a game with the cages drawn, scores on its
own board like any made puzzle, and saves as an image with them. Copy
puzzle is hidden for killer puzzles, since cages do not fit in 81
characters: the seed is how one is shared.

**Rellik, Lunchbox, Look and Say and Equality.** Four more kinds of cage,
each with its own rule button and all drawn with the one Cages tool. With
more than one kind on, the cage bar's kind button (Killer cage, Rellik
cage, Lunchbox, Look and Say cage, Equality cage) says which a new cage is;
tapping a cage picks up its kind with it, and turning the kind before
Change cage turns the cage into that kind. A cell is in one cage at most,
whatever the kinds, and the checker refuses two sharing a cell. The rules
follow the other solver's (sigh/Interactive-Sudoku-Solver):

- A Rellik cage's number, shown after ≠, is a total no digits in it make,
  alone or together. Its digits may repeat.
- A lunchbox is cells side by side along a row or down a column, drawn in
  a solid line. Its digits never repeat, and those between its smallest
  and largest add up to its sum, 0 to 35.
- A Look and Say clue is pairs of a count and a digit, kept as a string
  and shown as 2×3 1×4: exactly two 3s and one 4. A count of 0 rules a
  digit out, and digits it does not name are free.
- An Equality cage, marked =, has two, four, six or eight cells: as many
  odd digits as even, and low (1 to 4) as high (6 to 9), so no 5, and no
  repeats.

In variant.js each narrows its cells as a line does. A Rellik cage takes
out any digit that would make its number with some set of those placed; a
lunchbox is narrowed as a sandwich is, over each two cells and two digits
its smallest and largest could be; a Look and Say cage counts each named
digit placed and the cells that could still take it; an Equality cage
counts each half (low, high, odd, even) the same way. Their seed letters
are QRC, QLB, QLS and QEC, after K, and each kind is written as killer
cages are, with its clue: a sum, a Look and Say clue's pairs, or nothing.

**Equal Sum, Same Values, Connected Values and Count Distinct.** Four more
kinds of cage on the same Cages tool, after the other solver's rules too:

- An Equal Sum cage, marked Σ, is two or more pieces apart from each
  other, cells touching along a side being one piece, of one to nine cells
  each. Every piece adds up to the same total, and digits may repeat.
- A Same Values cage, marked ≡, is pieces the same way, all the same size,
  each holding the same digits in any order, a repeat repeated in each.
  With more than one cage of either kind, each is lettered (ΣA, ΣB), so
  its pieces can be told from another's.
- A Connected Values cage's clue is one to eight digits, shown after ~ as
  ~135: the cells holding any of them join up edge to edge into one group,
  and there is one at least. The other solver's optional size of that
  group is left out.
- A Count Distinct cage's # cell, the first cell tapped when it is drawn,
  holds how many different digits the rest of the cage holds. They may
  repeat.

An Equal Sum cage narrows each piece's cells to the digits that reach a
total every piece can make, as a sum line's runs are narrowed; a Same Values
cage keeps a digit only where every piece has room for it, and counts each
digit across the pieces as a Look and Say cage does; a Connected Values cage
splits the cells that could hold its digits into parts joined edge to edge,
and once one is sure, the other parts lose the digits; a Count Distinct
cage's # cell is kept between the different digits placed and the most the
rest could hold at once. Their seed letters are QES, QSV, QCV and QCD, after
QEC. An Equal Sum or Same Values cage is written as its pieces, each a cage
with no clue, then for each piece which cage it is in; a Connected Values
cage's clue is which digits it names, and a Count Distinct cage's which of
its cells is the # cell.

**Copy puzzle.** On every game, its result and the solver: the puzzle's clues
as 81 characters with . for blanks, which the solver's Paste and most sudoku
apps read.

**Levels.** Easy, Medium, Hard and Expert take out 40, 48, 52 and up to 64
clues. The generator only takes a clue out if the puzzle keeps exactly one
solution, so Expert usually stops at a minimal puzzle short of 64.

**The board.** Pick a cell, then a number, on the pad or the keyboard.
Arrow keys move, Backspace or 0 erases, N switches notes, Ctrl+Z undoes. A
wrong digit shows red straight away. The pad counts how many of each digit
are left. Placing a digit takes it out of the notes in its row, column and
box. The boxes have heavy edges and alternate boxes are tinted, so they can
be told apart at a glance in every theme.

**Seeds.** A seed looks like `H-BXK4-M9TR`, the letter being the level. The
same seed is always the same puzzle. It shows during play and at the end,
where it can be copied; paste one into the new-game screen to play that
puzzle again, and its level comes with it. A made puzzle's longer seed
shows as Copy seed instead.

**Undo.** Unlimited, in every mode. It takes back your last move that still
stands, including a hint. In co-op it only ever takes back your own moves.
A mistake still costs its points after it is undone, and undoing a correct
digit and placing it again does not earn it twice.

**Hints.** As many as you like, and how many are free is chosen before the
game: none, 1, 3, 5, all, or any number from 0 to 81. Each hint past the free
ones costs points, and a hinted cell never earns its own. A hint fills the
selected cell if it needs it, or else the first empty one. The number of free
hints is part of the start ticket, and the API scores with it. **Solve**
fills the board and ends the game; a game finished with Solve is never
ranked.

**Replay.** When a game ends it plays back on the board by itself (a setting
turns this off), with play, pause, a step back or forward, a slider and the
list of moves. Mistakes stay in, ringed in red, and so do undos, notes and
hints, so a player can see where it went wrong. It plays at 0.5x, 1x, 2x or
4x, remembered in this browser.

**Sharing a replay.** Share replay, on any finished game, makes a link such
as `/?r=sE23456789.R_FysATRHlpv...`, through the device's share sheet where
it has one and the clipboard otherwise. The link is the whole game: the
kind of game, the seed without dashes, and every move packed into one
number (record.js): a right digit is only its cell, since the reader has the
answer too. About 40% shorter than the first links,
`/?watch=...&seed=...&game=...`, which still play. Nothing is stored anywhere, and a link opens offline once the site has been
visited. Opening one plays the replay without touching the viewer's own
saved game; Close replay goes back to it, and Play this seed fills in the
new-game screen. A shared replay shows no score, since a link can be edited
and only the leaderboard's scores are checked.

**Scoring.** The score grows as the board fills, and the chip above the
board shows it live.

| | Points |
| --- | --- |
| Each correct digit, the first time that cell is filled | 100 |
| Placed within 3 s of your previous digit | up to +50% of that, shrinking evenly to nothing at 30 s |
| Each wrong digit | minus 60 |
| Each hint past the game's free ones | minus 150 |
| Finishing the board | 1000 |

The total is then scaled by the level: Easy 60%, Medium 100%, Hard 150%,
Expert 220%. Then by the whole game's time: a finished board earns up to
50% more, shrinking evenly to nothing over 15, 25, 40 or 60 minutes by
level. The game's time is the server's, from the start ticket to the moment
the page reports the board finished (`/api/game/finish`), so watching the
replay or typing a name afterwards costs nothing. Only seeds the server
picked earn either time bonus: a pasted seed could have been solved
beforehand, so it scores everything else.

## The leaderboard and anti-cheat

Three boards: each name's best game, each name's total, and a day's daily
(today's, or the day of the daily just played), Classic or Killer.
Solo games, dailies and both sides of a race count. Co-op games and games
finished with Solve do not. Made puzzles have a board each instead, under
Puzzles, where they are listed most played first and found by searching
their seeds; pasting a whole seed opens its board, which can also play it. A game counts only if it started while online:
starting asks `/api/game/start` for a ticket, whose time comes from the
server. Games started offline play the same, and say they are not scored.

On submit the API trusts nothing but the name. It builds the puzzle from the
seed, replays every move and refuses an impossible one, requires a
complete, correct board, and computes the score itself, with the ticket's
number of free hints. It refuses:

| Code | When |
| --- | --- |
| `auto_solved` | the game used Solve |
| `clock` | the moves' times run past the server's own clock for the game |
| `too_fast` | under 0.8 s per blank cell or 20 s in all by the server's clock, or more than five turns under 150 ms apart |

The database then refuses a submission that:

| Code | When |
| --- | --- |
| `not_yours` | comes from a browser other than the one that started the game (or, for a race's guest side, the one that first reported it) |
| `same_device` | is a race's guest side, sent from the host's own browser |
| `overlap` | was played at the same time as another game under the same name |
| `seed_used` | repeats a seed already on the board under that name |
| `daily_done` | repeats a day's daily of one kind under a name that already has it |
| `same_name` | puts both sides of one race under one name |

The daily's seed comes from `DAILY_SECRET` and the date, so it cannot be
worked out in advance. Start takes any date from `DAILY_FIRST` to tomorrow
in UTC, which is today somewhere; the calendar offers up to the player's
own today, and a `kind`, `classic` (the default) or `killer`. A second
daily ticket from the same browser for the same day's puzzle of one kind
plays without the time bonuses, since it could follow a first look. The
kind is read from the seed in the database (`daily_kind`, from
`migrations/004_daily_killer.sql`): a killer's starts `K-`.

What this cannot stop: somebody using a solver in another tab, or faking
the times of each turn. Turn times come from the browser, and the server
can only hold them to running forwards, to a human pace, and to fitting
inside its own clock. It is meant to stop scripted and replayed games, not
to prove who found the digits.

## Network games

Per `STUN-p2p-spec.md`: STUN only, no TURN relay. **Both devices have to be
on the same network**: the same wifi, or one sharing a hotspot with the
other. PeerJS loads from cdnjs only when somebody hosts or joins, and is
never cached. The host sends a snapshot 20 times a second.

In a race each board is its player's own, like a solo game; the guest sends
its progress, and the host holds the match: the puzzle, the start ticket
(both sides of one race share it), and who finished first. In co-op the host
holds the board, the guest sends each move and the host applies it. A
guest that reloads or drops rejoins with the same code, and leaving on
purpose retires it.

## Offline and updates

Everything the page loads is precached, the Jua font included, so the site
opens and plays with no connection. Only the leaderboard, the daily puzzle
and network games need the network. Nothing under `/api/` is ever cached.

A new service worker installs and waits. The update bar offers Reload or Not
now, and nothing reloads until the reader asks. Bump `VERSION` in `sw.js` on
every change to anything in this directory. The old site's Workbox worker,
if a visitor still has it, is replaced the same way, and its cache deleted.

## API

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /api/game/start` | `client_key, mode, level?, seed?, max_hints?, date?, kind?` | `game_id, seed, server_seed, created_at, date, kind` |
| `POST /api/game/finish` | `game_id, client_key, side, log` | `elapsed_ms, server_seed` |
| `POST /api/game/submit` | `game_id, client_key, name, side, log` | `name, score, time_bonus, elapsed_ms, mistakes, hints, rank, best_score, total, games, total_rank, daily_rank` |
| `POST /api/leaderboard/name` | `name` | `name`, cleaned, or a `400` saying why not |
| `GET /api/leaderboard` | `?board=best`, `?board=total`, or `?board=daily&date=YYYY-MM-DD&kind=classic` (or `killer`) | `board, entries`, and a daily's `date, kind`, cached 30 s |
| `GET /api/leaderboard` | `?board=days&name=...` | `board, name, dates`: the days whose daily, of either kind, the name has on the board, oldest first, for the calendar; cached 30 s |
| `GET /api/leaderboard` | `?board=made&seed=...`, or `?board=made&q=...` | `board, seed, code, entries` for one made puzzle's board; `board, q, puzzles` (each with its `code`) for the list or a search, which also matches short codes; cached 30 s |
| `POST /api/seed/shorten` | `seed` | `seed, code`: a made seed longer than 20 characters, checked as any seed is, and its short code, the same one every time |
| `GET /api/seed/lookup` | `?code=H-B7K4Q-M9TRZ` | `seed`, the whole seed the code stands for; cached for good, or a `404` |

`mode` is `solo`, `daily` or `race`. With no `seed`, start picks one at
`level` (`E`, `M`, `H` or `X`); a daily takes the picked day's `date`
instead, from `DAILY_FIRST` to tomorrow in UTC, and its `kind`.
`max_hints` is 0 to 81, or null for no limit. `side` is 0, or 1 for a race's
guest. `log` is the game's moves as `[kind, cell, digit, ms]` arrays; see
`js/record.js`. Errors are `{ error, message? }` with a matching status.
Start and finish are limited to 60 an address per 10 minutes, and submit and
shorten to 30.

**Short seeds.** A made seed carries the whole puzzle, so a big variant's
runs to hundreds of characters. One longer than 20 is shared as a short
code instead: its level and ten seed characters, `H-B7K4Q-M9TRZ`, never
taken for a generated seed (eight) or a made one (twelve or more). The
`sudoku_seed_codes` table (`migrations/003_seed_codes.sql`) holds the whole
seed each code stands for. Create asks for a made puzzle's code as soon as
it checks out, and a game of a long made seed shows its code on the seed
chip and the result; Copy seed copies the code, or the whole seed while
there is no connection. Offline, the whole seed is shown and copied even
for a code this browser knows, since whoever it goes to may need a
connection to open the code; the seed line, the chip and the result swap
back to the code, fetching it if need be, once the connection returns
(`shareCode` in api.js). The seed box on the new-game screen, Create's Open
a seed and Paste, and the made-puzzles search all take a code and look it
up. Everything underneath keeps the whole seed: start tickets, boards,
saved games and replay links. A browser keeps the last 100 codes it has
made or opened (`uwusudoku.seedCodes`), so those open offline too; any other
code needs a connection the first time.

## Environment variables (Vercel)

Documented in `.env.example`. `.vercelignore` keeps every env file out of
deployments, since anything in this directory would otherwise be served.

| Variable | Used for |
| --- | --- |
| `SUPABASE_URL` | The shared uwuapps project. |
| `SUPABASE_SERVICE_KEY` | Service role key. Server side only, never sent to a browser. |
| `DAILY_SECRET` | Picks each day's puzzle. Set it once and leave it. |
