-- uwuSudoku (sudoku.uwuapps.org) schema, in the shared uwuapps Supabase
-- project. Paste into the Supabase SQL editor and run once. Safe to run
-- again: everything is "if exists", "if not exists" or "or replace".
--
-- Access model: only the Vercel functions touch these tables, with the
-- service role key. RLS is on with no policies, so an anon key reads nothing.
--
-- The rules of sudoku are not in here. The API replays every submitted game
-- from its seed with the same code the browser plays with, recomputes its
-- score, and only then calls sudoku_submit, which does the checks that need
-- the database.

-- The old site's daily scores. They were whatever the browser sent, with
-- points per entry the player could set, so none of them carry over.
drop table if exists sudoku_scores;

-- One row per game that could go on the leaderboard: a solo game, a daily,
-- or a network race, started while online. The row is the start ticket;
-- created_at is the server's clock, which a browser cannot move. A race has
-- two sides: 0 the host, 1 the guest, each solving the same puzzle.
create table if not exists sudoku_games (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('solo', 'daily', 'race')),
  seed text not null,                   -- "H-BXK4-M9TR", canonical form
  level text not null check (level in ('E', 'M', 'H', 'X')),
  daily_date date,                      -- the player's date, for a daily
  server_seed boolean not null default false,
                                        -- the server picked the seed, so
                                        -- nobody could have solved it first;
                                        -- only these earn the time bonuses
  max_hints int check (max_hints between 0 and 81),
                                        -- null for no limit
  host_key text not null,               -- the client_key that started it
  guest_key text,                       -- a race's guest, once it reports
  created_at timestamptz not null default now(),
  -- Each side's log when its board was finished, and the server's time then.
  log_0 text,
  finished_0 timestamptz,
  log_1 text,
  finished_1 timestamptz,
  check ((mode = 'daily') = (daily_date is not null))
);

create index if not exists sudoku_games_created on sudoku_games (created_at);
create index if not exists sudoku_games_daily on sudoku_games (daily_date, host_key) where mode = 'daily';

create table if not exists sudoku_leaderboard (
  id bigserial primary key,
  name text not null,
  score int not null check (score >= 0),
  game_id uuid not null references sudoku_games(id) on delete cascade,
  side smallint not null check (side in (0, 1)),
  mode text not null,
  level text not null,
  seed text not null,
  daily_date date,
  elapsed_ms int not null,
  mistakes int not null,
  hints int not null,
  created_at timestamptz not null default now(),
  unique (game_id, side)
);

create index if not exists sudoku_lb_name on sudoku_leaderboard (lower(name), score desc);
create index if not exists sudoku_lb_daily on sudoku_leaderboard (daily_date, score desc) where daily_date is not null;

-- Each name's best game. The earliest of an equal top score wins, and the
-- casing shown is the one attached to that score.
create or replace view sudoku_leaderboard_best
with (security_invoker = true) as
select distinct on (lower(name)) name, score, mode, level, elapsed_ms, created_at
from sudoku_leaderboard
order by lower(name), score desc, created_at asc;

-- Every submitted game added up per name. The casing shown is the most
-- recent one.
create or replace view sudoku_leaderboard_total
with (security_invoker = true) as
select
  (array_agg(name order by created_at desc))[1] as name,
  sum(score)::bigint as total,
  count(*)::int as games,
  max(created_at) as last_at
from sudoku_leaderboard
group by lower(name);

-- Each day's daily puzzle, one row per name.
create or replace view sudoku_leaderboard_daily
with (security_invoker = true) as
select distinct on (daily_date, lower(name))
  daily_date, name, score, elapsed_ms, mistakes, hints, created_at
from sudoku_leaderboard
where mode = 'daily'
order by daily_date, lower(name), score desc, created_at asc;

-- Fixed window counters for rate limiting by (hashed) IP. There are no
-- accounts to limit against, and Vercel functions share no memory.
create table if not exists sudoku_rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits int not null
);

alter table sudoku_games enable row level security;
alter table sudoku_leaderboard enable row level security;
alter table sudoku_rate_limits enable row level security;

-- True while the bucket is under its limit. One statement, so concurrent
-- hits cannot both read the old count.
create or replace function sudoku_hit(p_bucket text, p_window_seconds int, p_max int)
returns boolean
language sql
volatile
as $$
  insert into sudoku_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start end,
    hits = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else r.hits + 1 end
  returning hits <= p_max;
$$;

-- Whose side this is. Side 0 only from the browser that started the game.
-- Side 1 (a race's guest) never from that browser, and, once a browser has
-- reported it, only from that one. Returns 'ok', 'not_yours' or
-- 'same_device', and claims side 1 for the browser on its first report.
create or replace function sudoku_side_check(p_game sudoku_games, p_side smallint, p_client_key text)
returns text
language plpgsql
volatile
as $$
begin
  if p_side = 0 then
    return case when p_client_key = p_game.host_key then 'ok' else 'not_yours' end;
  end if;
  if p_game.mode <> 'race' then
    return 'not_yours';
  end if;
  if p_client_key = p_game.host_key then
    return 'same_device';
  end if;
  if p_game.guest_key is null then
    update sudoku_games set guest_key = p_client_key where id = p_game.id;
    return 'ok';
  end if;
  return case when p_client_key = p_game.guest_key then 'ok' else 'not_yours' end;
end;
$$;

-- Records when a side's board was finished: its log, and the server's time.
-- The API has replayed the log first. Sent again with a different log, it
-- records the new ending; once the side is on the leaderboard it is fixed.
--
--   not_found, expired, not_yours, same_device   as for sudoku_submit
--   mismatch   the side is on the board with a different log
create or replace function sudoku_finish(p_game_id uuid, p_side smallint, p_client_key text, p_log text)
returns table (status text, created_at timestamptz, finished_at timestamptz)
language plpgsql
volatile
as $$
#variable_conflict use_column
declare
  v_game sudoku_games%rowtype;
  v_check text;
  v_log text;
  v_finished timestamptz;
begin
  select * into v_game from sudoku_games where id = p_game_id for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_game.created_at < now() - interval '12 hours' then
    return query select 'expired'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  v_check := sudoku_side_check(v_game, p_side, p_client_key);
  if v_check <> 'ok' then
    return query select v_check, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_log := case when p_side = 0 then v_game.log_0 else v_game.log_1 end;
  v_finished := case when p_side = 0 then v_game.finished_0 else v_game.finished_1 end;

  if exists (select 1 from sudoku_leaderboard l where l.game_id = p_game_id and l.side = p_side) then
    if v_log is distinct from p_log then
      return query select 'mismatch'::text, null::timestamptz, null::timestamptz;
      return;
    end if;
  elsif v_log is distinct from p_log then
    v_finished := now();
    if p_side = 0 then
      update sudoku_games set log_0 = p_log, finished_0 = v_finished where id = p_game_id;
    else
      update sudoku_games set log_1 = p_log, finished_1 = v_finished where id = p_game_id;
    end if;
  end if;

  return query select 'ok'::text, v_game.created_at, v_finished;
end;
$$;

-- Puts one side of a verified game on the board. The API has already
-- replayed the log, checked the hint limit and the times, and computed the
-- score; this checks what only the database can:
--
--   not_found          no such game
--   expired            started more than 12 hours ago
--   not_yours          sent from a browser other than the side's own
--   same_device        a race's guest side sent from the host's browser:
--                      one person playing both sides
--   already_submitted  this side of this game is already on the board
--   same_name          both sides of one race under one name
--   overlap            played while another game on the board under this
--                      name was also being played
--   seed_used          this name already has this seed on the board, so a
--                      memorised puzzle cannot be farmed
--   daily_done         this name already has this day's daily on the board
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
returns table (status text, best_score int, rank bigint, total bigint, games int, total_rank bigint, daily_rank bigint)
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
  v_now timestamptz := now();
begin
  select * into v_game from sudoku_games where id = p_game_id for update;

  if not found then
    return query select 'not_found'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;
  if v_game.created_at < now() - interval '12 hours' then
    return query select 'expired'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;
  v_check := sudoku_side_check(v_game, p_side, p_client_key);
  if v_check <> 'ok' then
    return query select v_check, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;
  if exists (select 1 from sudoku_leaderboard l where l.game_id = p_game_id and l.side = p_side) then
    return query select 'already_submitted'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;

  -- One submission per name at a time, so two sent together cannot both
  -- miss each other in the checks below.
  perform pg_advisory_xact_lock(hashtext('sudoku_submit:' || lower(p_name)));

  if exists (
    select 1 from sudoku_leaderboard l
    where l.game_id = p_game_id and lower(l.name) = lower(p_name)
  ) then
    return query select 'same_name'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;

  if exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name)
      and l.game_id <> p_game_id
      and l.created_at > v_game.created_at
  ) then
    return query select 'overlap'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;

  if v_game.mode = 'daily' and exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name) and l.mode = 'daily' and l.daily_date = v_game.daily_date
  ) then
    return query select 'daily_done'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
    return;
  end if;

  if v_game.mode <> 'daily' and exists (
    select 1 from sudoku_leaderboard l
    where lower(l.name) = lower(p_name) and l.seed = v_game.seed
  ) then
    return query select 'seed_used'::text, null::int, null::bigint, null::bigint, null::int, null::bigint, null::bigint;
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
  where lower(l.name) = lower(p_name)
  order by l.score desc, l.created_at asc
  limit 1;

  select sum(l.score)::bigint, count(*)::int into v_total, v_games
  from sudoku_leaderboard l
  where lower(l.name) = lower(p_name);

  if v_game.mode = 'daily' then
    select count(*) + 1 into v_daily
    from sudoku_leaderboard_daily d
    where d.daily_date = v_game.daily_date
      and lower(d.name) <> lower(p_name)
      and (d.score > p_score or (d.score = p_score and d.created_at < v_now));
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
    v_daily;
end;
$$;

-- Housekeeping, called now and then by /api/game/start: old counters, and
-- games nobody submitted that are past any use.
create or replace function sudoku_prune()
returns void
language sql
volatile
as $$
  delete from sudoku_rate_limits where window_start < now() - interval '1 day';
  delete from sudoku_games g
  where g.created_at < now() - interval '2 days'
    and not exists (select 1 from sudoku_leaderboard l where l.game_id = g.id);
$$;

-- Service role only.
revoke all on function sudoku_hit(text, int, int) from public, anon, authenticated;
revoke all on function sudoku_side_check(sudoku_games, smallint, text) from public, anon, authenticated;
revoke all on function sudoku_finish(uuid, smallint, text, text) from public, anon, authenticated;
revoke all on function sudoku_submit(uuid, smallint, text, text, text, int, int, int, int) from public, anon, authenticated;
revoke all on function sudoku_prune() from public, anon, authenticated;
grant execute on function sudoku_hit(text, int, int) to service_role;
grant execute on function sudoku_side_check(sudoku_games, smallint, text) to service_role;
grant execute on function sudoku_finish(uuid, smallint, text, text) to service_role;
grant execute on function sudoku_submit(uuid, smallint, text, text, text, int, int, int, int) to service_role;
grant execute on function sudoku_prune() to service_role;
