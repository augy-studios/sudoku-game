-- uwuSudoku: a killer daily beside the classic one. Run after 003, in the
-- Supabase SQL editor. Safe to run again.
--
-- Each day has two daily puzzles: the classic one, as before, and a killer
-- one, whose seed is a made killer puzzle's and so starts "K-". Each has a
-- board of its own, and a name can have one of each on a day. The streak
-- counts a day with either, as the days board already reads every daily.
--
-- daily_kind is worked out from the seed, so rows from before are classic
-- without being touched, and the API sets nothing new.

alter table sudoku_games add column if not exists daily_kind text
  generated always as (case when mode = 'daily' then case when seed like 'K-%' then 'killer' else 'classic' end end) stored;
alter table sudoku_leaderboard add column if not exists daily_kind text
  generated always as (case when mode = 'daily' then case when seed like 'K-%' then 'killer' else 'classic' end end) stored;

drop index if exists sudoku_games_daily;
create index if not exists sudoku_games_daily on sudoku_games (daily_date, daily_kind, host_key) where mode = 'daily';
drop index if exists sudoku_lb_daily;
create index if not exists sudoku_lb_daily on sudoku_leaderboard (daily_date, daily_kind, score desc) where daily_date is not null;

-- Each day's daily puzzles, one row per name for each kind. daily_kind goes
-- last, as a replaced view can only add columns at its end.
create or replace view sudoku_leaderboard_daily
with (security_invoker = true) as
select distinct on (daily_date, daily_kind, lower(name))
  daily_date, name, score, elapsed_ms, mistakes, hints, created_at, daily_kind
from sudoku_leaderboard
where mode = 'daily'
order by daily_date, daily_kind, lower(name), score desc, created_at asc;

-- sudoku_submit as in 002, with a daily's checks and rank taken within its
-- kind: daily_done only when the name has that day's puzzle of the same
-- kind, and daily_rank on that kind's board. The return type is 002's.
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
      and l.daily_kind = v_game.daily_kind
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
      and d.daily_kind = v_game.daily_kind
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
