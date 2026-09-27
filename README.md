# uwuSudoku

Sudoku from Easy to Expert, alone, on today's daily puzzle, or with someone
on the same network, racing on the same puzzle or solving one board
together. Every game has a seed that can be copied and played again, ends
with an instant replay that can be shared as a link, and can go on a
leaderboard.

Live at <https://sudoku.uwuapps.org>. A PWA: once opened, it plays offline.

## What runs where

| Part | Runs on |
| --- | --- |
| `main-site/`, the PWA and its leaderboard API (`main-site/api/`) | Vercel, root directory `main-site` |
| Database, `sudoku_*` tables | The shared uwuapps Supabase project |
| Network games | Browser to browser over WebRTC. PeerJS's public broker introduces the two devices; nothing of ours is in between |

There is nothing on the VPS.

## Layout

```text
README.md
migrations/      SQL to run in the Supabase SQL editor, in number order
scripts/         pre-deploy checks and the engine tests
main-site/       the site Vercel deploys, including api/
```

The `uwuapps-*.md`, `update-bar-spec.md` and `STUN-p2p-spec.md` files at the
root are the specs this is built to. `main-site/README.md` covers the app
itself.

## First setup

1. Run every file in `migrations/`, in number order, in the Supabase SQL
   editor of the shared uwuapps project. Each is safe to run again. Never
   edit one that has been run; a change is a new numbered file.
   `001` drops the old site's `sudoku_scores` table: its scores were
   whatever the browser sent, so none carry over.
2. On the Vercel project (root directory `main-site`), set the variables in
   `main-site/.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and
   `DAILY_SECRET`.
3. Add the domain `sudoku.uwuapps.org` to the Vercel project.
4. Deploy.

Without the Supabase variables the site still works in full; the API answers
`not_configured` and every game says it is not scored. Without
`DAILY_SECRET` the daily puzzle says it is not set up yet.

## Before every deploy

1. Bump `VERSION` in `main-site/sw.js`. Without it, returning visitors keep
   the previous build and never see the update bar.
2. Run the checks, from the repo root, with Node 20 or later and nothing to
   install:

```text
node scripts/check-sw.mjs          # the worker only activates when asked
node scripts/check-precache.mjs    # everything the app loads works offline
node scripts/check-theme.mjs       # pre-paint script matches js/theme.js
node scripts/test-engine.mjs       # puzzles, the move log, replays, scores
node scripts/test-verify.mjs       # the API's game check, without a database
```

**If you change `js/sudoku.js`, `js/seed.js`, `js/levels.js`,
`js/record.js` or `js/score.js`,** seeds can start making different
puzzles, and games played on the old build stop verifying: the API replays
every game with the code it has now. `test-engine.mjs` pins two seeds'
puzzles so this cannot happen by accident. Deploy such changes when a few
failed submissions from open tabs are acceptable, and know that every seed
and replay link already shared changes with them.

## Still to do by hand

- Retake `main-site/images/screenshot_1.png` (1080 by 2340) and
  `screenshot_2.png` (1920 by 1080). They show the old site, and the
  manifest offers them to install prompts.
