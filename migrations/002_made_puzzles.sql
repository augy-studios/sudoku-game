-- uwuSudoku: made puzzles' boards. Run after 001, in the Supabase SQL
-- editor. Safe to run again.
--
-- A made puzzle is one somebody put together in the Create tab. Its seed
-- carries the puzzle itself, and its maker knows the answer, so its games
-- never go on the main boards: each made puzzle has a board of its own
-- instead. They play as mode 'made', which is a solo game of a made seed.

alter table sudoku_games drop constraint if exists sudoku_games_mode_check;
alter table sudoku_games add constraint sudoku_games_mode_check check (mode in ('solo', 'daily', 'race', 'made'));

create index if not exists sudoku_lb_made on sudoku_leaderboard (seed, score desc) where mode = 'made';

-- The main boards, as in 001, without made puzzles.
create or replace view sudoku_leaderboard_best
with (security_invoker = true) as
select distinct on (lower(name)) name, score, mode, level, elapsed_ms, created_at
from sudoku_leaderboard
where mode <> 'made'
order by lower(name), score desc, created_at asc;

create or replace view sudoku_leaderboard_total
with (security_invoker = true) as
select
  (array_agg(name order by created_at desc))[1] as name,
  sum(score)::bigint as total,
  count(*)::int as games,
  max(created_at) as last_at
from sudoku_leaderboard
where mode <> 'made'
group by lower(name);

-- Each made puzzle's board, one row per name.
create or replace view sudoku_leaderboard_made
with (security_invoker = true) as
select distinct on (seed, lower(name))
  seed, name, score, elapsed_ms, mistakes, hints, created_at
from sudoku_leaderboard
where mode = 'made'
order by seed, lower(name), score desc, created_at asc;

-- The made puzzles that have a board, for browsing and search. seed_key is
-- the seed without its dashes, which is what a search matches.
create or replace view sudoku_made_puzzles
with (security_invoker = true) as
select
  seed,
  replace(seed, '-', '') as seed_key,
  min(level) as level,
  count(distinct lower(name))::int as players,
  max(score) as top_score,
  max(created_at) as last_at
from sudoku_leaderboard
where mode = 'made'
group by seed;

-- sudoku_submit as in 001, with two changes: a name's best and total leave
-- made puzzles out, as the boards do, and a made puzzle's game gets its
-- rank on that puzzle's board, seed_rank. The return type changes, so the
-- old one goes first.
drop function if exists sudoku_submit(uuid, smallint, text, text, text, int, int, int, int);

create or replace function sudoku_submit(
  p_game_id uuid,
  p_side smallint,
  p_name text,
  p_client_key text,
  p_log text,
  p_score int,
  p_elapsed_ms int,
  p_mistakes int,
  p_hints int
)
returns table (status text, best_score int, rank bigint, total bigint, games int, total_rank bigint, daily_rank bigint, seed_rank bigint)
language plpgsql
volatile
as $$
#variable_conflict use_column
declare
  v_game sudoku_games%rowtype;
  v_check text;
  v_best int;
  v_best_at timestamptz;
  v_total bigint;
  v_games int;
  v_daily bigint;
  v_seed bigint;
  v_now timestamptz := now();
begin
  select * into v_game from sudoku_games where id = p_game_id for update;

  if not found then
    return query select 'not_found'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  if v_game.created_at < now() - interval '12 hours' then
    return query select 'expired'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  v_check := sudoku_side_check(v_game, p_side, p_client_key);
  if v_check <> 'ok' then
    return query select v_check, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  if exists (select 1 from sudoku_leaderboard l where l.game_id = p_game_id and l.side = p_side) then
    return query select 'already_submitted'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  -- One submission per name at a time, so two sent together cannot both
  -- miss each other in the checks below.
  perform pg_advisory_xact_lock(hashtext('sudoku_submit:' || lower(p_name)));

  if exists (
    select 1 from sudoku_leaderboard l
    where l.game_id = p_game_id and lower(l.name) = lower(p_name)
  ) then
    return query select 'same_name'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name)
      and l.game_id <> p_game_id
      and l.created_at > v_game.created_at
  ) then
    return query select 'overlap'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_game.mode = 'daily' and exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name) and l.mode = 'daily' and l.daily_date = v_game.daily_date
  ) then
    return query select 'daily_done'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_game.mode <> 'daily' and exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name) and l.seed = v_game.seed
  ) then
    return query select 'seed_used'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if p_side = 0 and v_game.log_0 is null then
    update sudoku_games set log_0 = p_log, finished_0 = v_now where id = p_game_id;
  elsif p_side = 1 and v_game.log_1 is null then
    update sudoku_games set log_1 = p_log, finished_1 = v_now where id = p_game_id;
  end if;

  insert into sudoku_leaderboard (name, score, game_id, side, mode, level, seed, daily_date, elapsed_ms, mistakes, hints)
  values (p_name, p_score, p_game_id, p_side, v_game.mode, v_game.level, v_game.seed, v_game.daily_date,
          p_elapsed_ms, p_mistakes, p_hints);

  select l.score, l.created_at into v_best, v_best_at
  from sudoku_leaderboard l
  where lower(l.name) = lower(p_name) and l.mode <> 'made'
  order by l.score desc, l.created_at asc
  limit 1;

  select coalesce(sum(l.score), 0)::bigint, count(*)::int into v_total, v_games
  from sudoku_leaderboard l
  where lower(l.name) = lower(p_name) and l.mode <> 'made';

  if v_game.mode = 'daily' then
    select count(*) + 1 into v_daily
    from sudoku_leaderboard_daily d
    where d.daily_date = v_game.daily_date
      and lower(d.name) <> lower(p_name)
      and (d.score > p_score or (d.score = p_score and d.created_at < v_now));
  end if;

  if v_game.mode = 'made' then
    select count(*) + 1 into v_seed
    from sudoku_leaderboard_made m
    where m.seed = v_game.seed
      and lower(m.name) <> lower(p_name)
      and (m.score > p_score or (m.score = p_score and m.created_at < v_now));
  end if;

  return query
  select
    'ok'::text,
    v_best,
    (
      select count(*) + 1
      from sudoku_leaderboard_best b
      where b.score > v_best or (b.score = v_best and b.created_at < v_best_at)
    ),
    v_total,
    v_games,
    (
      select count(*) + 1
      from sudoku_leaderboard_total t
      where lower(t.name) <> lower(p_name)
        and (
          t.total > v_total
          or (t.total = v_total and t.games < v_games)
          -- This name's total was only just reached, so an equal one got there first.
          or (t.total = v_total and t.games = v_games)
        )
    ),
    v_daily,
    v_seed;
end;
$$;

revoke all on function sudoku_submit(uuid, smallint, text, text, text, int, int, int, int) from public, anon, authenticated;
grant execute on function sudoku_submit(uuid, smallint, text, text, text, int, int, int, int) to service_role;
