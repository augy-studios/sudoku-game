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
| `solver.js` | The Solver tab's screen: typing a puzzle in, then hints, Check, candidates and Solve. |
| `image.js` | Draws a puzzle to a PNG, for the solver's Save image, cages and all. |
| `variant.js` | Pure. Variant sudoku: killer cages, thermometers, arrows, German Whispers, renban and palindrome lines, Kropki dots, XV marks, Sandwich, Little Killer, Skyscraper and X-Sum clues, a Jigsaw's regions, and the switch rules, what they allow, and a solver for any mix, which the API uses too. |
| `api.js`, `leaderboard.js`, `settings.js` | The API client, and the leaderboard and settings windows, after MRT Station Guesser's. |
| `theme.js`, `icons.js`, `ui.js`, `update-bar.js`, `confetti.js`, `app.js` | Theme, inline SVG icons, modal and storage helpers, the update bar, a solve's confetti, and boot. |

## The game

**Modes.** Solo; the daily puzzle, the same for everyone on a date; or two
devices on one network, one hosting with a six character code, a link or a
QR code, and the other joining. A network game is a **race** (the same
puzzle, each on your own board, with the other player's progress shown
above yours) or **co-op** (one board, both of you on it).

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
in a variant game or replay. The engine tests fail if a rule button, or
any variant `variantName` can name, has no explanation. The rules: Killer, Thermo, Arrow, Whispers (German
Whispers), Renban, Palindrome, Kropki, XV, Sandwich, Little Killer, Skyscrapers,
X-Sums, Jigsaw, Diagonal (both long diagonals hold 1 to 9), Anti-knight (cells a knight's move apart differ), Anti-king (cells
touching at a corner differ) and Windoku (four more 3x3 windows, rows and
columns 2 to 4 and 6 to 8, hold 1 to 9). Diagonals are drawn as faint lines
and windows tinted, on the board and in a saved image; the anti rules have
nothing to draw, so the level chip and the rules line name them. In
variant.js, diagonals and windows are extra houses and the knight's and
king's moves extra pairs of cells that must differ, so one solver handles
every mix, cages included; with no rules it takes the same steps as the
killer solver it grew from. A variant puzzle needs no least number of
clues, and one with anything drawn can have no given digits at all. Its
seed starts with its rules' letters, K, T, A, S, R, O, P, V, B, L, Y, U,
J, D, N, G and W, always in that order, as in `KD-H-...`; a seed with any
before D carries that part in its body too: cages, thermometers, arrows,
whisper lines, renban lines, palindrome lines, dots, XV marks, Sandwich sums, Little Killer
sums, Skyscraper counts, X-Sums or regions (a line as its length, its first
cell and each step's direction; dots, marks, Skyscraper counts and X-Sums
as a list, or every side's or view's value, whichever is shorter; Sandwich
sums as every row's and column's sum or none; Little Killer sums as each
one's first cell, way and sum; regions as which neighbours share one). The
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

**Kropki and XV.** They mark the side two cells share. A white dot's
digits are consecutive and a black dot's are one double the other; an X's
digits add up to 10 and a V's to 5. Sides with no mark may be anything, so
there is no negative rule. The Marks tool puts them down: tap near a side,
or tap a cell and then one beside it, and each tap steps the side on
through the marks of the rules on (white dot, black dot, X, V) and back to
none. The solver keeps each cell of a marked pair to digits some digit the
other cell can be makes a pair with, and a pair that breaks its mark shows
as a clash. Dots are drawn white and black in either theme, and X and V as
letters, on the side, on the board and in a saved image.

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

Three boards: each name's best game, each name's total, and today's daily.
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
| `daily_done` | repeats a day's daily under a name that already has it |
| `same_name` | puts both sides of one race under one name |

The daily's seed comes from `DAILY_SECRET` and the date, so it cannot be
worked out in advance. A second daily ticket from the same browser on the
same day plays without the time bonuses, since it could follow a first look.

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
| `POST /api/game/start` | `client_key, mode, level?, seed?, max_hints?, date?` | `game_id, seed, server_seed, created_at, date` |
| `POST /api/game/finish` | `game_id, client_key, side, log` | `elapsed_ms, server_seed` |
| `POST /api/game/submit` | `game_id, client_key, name, side, log` | `name, score, time_bonus, elapsed_ms, mistakes, hints, rank, best_score, total, games, total_rank, daily_rank` |
| `POST /api/leaderboard/name` | `name` | `name`, cleaned, or a `400` saying why not |
| `GET /api/leaderboard` | `?board=best`, `?board=total`, or `?board=daily&date=YYYY-MM-DD` | `board, entries`, cached 30 s |

`mode` is `solo`, `daily` or `race`. With no `seed`, start picks one at
`level` (`E`, `M`, `H` or `X`); a daily takes the player's `date` instead.
`max_hints` is 0 to 81, or null for no limit. `side` is 0, or 1 for a race's
guest. `log` is the game's moves as `[kind, cell, digit, ms]` arrays; see
`js/record.js`. Errors are `{ error, message? }` with a matching status.
Start and finish are limited to 60 an address per 10 minutes, and submit to
30.

## Environment variables (Vercel)

Documented in `.env.example`. `.vercelignore` keeps every env file out of
deployments, since anything in this directory would otherwise be served.

| Variable | Used for |
| --- | --- |
| `SUPABASE_URL` | The shared uwuapps project. |
| `SUPABASE_SERVICE_KEY` | Service role key. Server side only, never sent to a browser. |
| `DAILY_SECRET` | Picks each day's puzzle. Set it once and leave it. |
