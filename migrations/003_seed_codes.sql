-- uwuSudoku: short codes for long made seeds. Run after 002, in the Supabase
-- SQL editor. Safe to run again.
--
-- A made puzzle's seed carries the whole puzzle, so a big one runs to
-- hundreds of characters. One longer than 20 is shared as a short code
-- instead, "H-B7K4Q-M9TRZ": its level and ten seed characters. This table
-- is what each code stands for. The seed stays the puzzle's name everywhere
-- else: games, boards and replays all keep the whole seed.

create table if not exists sudoku_seed_codes (
  code text primary key check (code ~ '^[BCDFGHJKLMNPQRSTVWXYZ2-9]{10}$'),
                                        -- the ten characters, no level
  seed text not null unique,            -- the whole seed, canonical form
  created_at timestamptz not null default now()
);

alter table sudoku_seed_codes enable row level security;

-- The made puzzles that have a board, as in 002, with each one's short code
-- if it has one, so the list can show it and a search can find it.
create or replace view sudoku_made_puzzles
with (security_invoker = true) as
select
  l.seed,
  replace(l.seed, '-', '') as seed_key,
  min(l.level) as level,
  count(distinct lower(l.name))::int as players,
  max(l.score) as top_score,
  max(l.created_at) as last_at,
  c.code
from sudoku_leaderboard l
left join sudoku_seed_codes c on c.seed = l.seed
where l.mode = 'made'
group by l.seed, c.code;
