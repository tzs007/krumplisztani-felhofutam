-- Player names, result upload from devices, and leaderboard ranks.
--
-- - every new player (anonymous too) gets a unique generated name "Csibe #1234",
--   which they may later change freely (2–24 chars)
-- - results are uploaded from the device with a client_id, so re-sending the
--   same result (offline queue, first sign-in upload) never duplicates it
-- - ranking everywhere: best score desc, then who reached it first
--   (played_at asc); a player's "best" is their highest score, earliest if tied

-- ── generated names ─────────────────────────────────────────────────────
-- Generated names are unique; custom names may repeat (a custom name that
-- looks like a generated one must still be unique).
create unique index profiles_generated_name_key
  on public.profiles (display_name)
  where display_name ~ '^Csibe #[0-9]+$';

create function public.generate_player_name()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  digits integer := 4;
  candidate text;
begin
  loop
    -- 20 tries per length, then one more digit (#1000–#9999 → #10000–#99999 …)
    for attempt in 1..20 loop
      candidate := 'Csibe #' || (10 ^ (digits - 1) + floor(random() * 9 * 10 ^ (digits - 1)))::bigint;
      if not exists (select 1 from public.profiles where display_name = candidate) then
        return candidate;
      end if;
    end loop;
    digits := digits + 1;
  end loop;
end;
$$;

-- sign-up trigger: now also names the player (retries if another sign-up took the name meanwhile)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  loop
    begin
      insert into public.profiles (id, display_name) values (new.id, public.generate_player_name());
      return new;
    exception when unique_violation then
      -- lost a race for the same name: draw again
    end;
  end loop;
end;
$$;

-- name everyone who signed up before this migration
update public.profiles set display_name = public.generate_player_name() where display_name is null;

-- names are required from now on; trim + length for custom ones
alter table public.profiles
  alter column display_name set not null,
  drop constraint if exists profiles_display_name_check,
  add constraint profiles_display_name_check
    check (display_name = btrim(display_name) and char_length(display_name) between 2 and 24);

-- ── result upload ───────────────────────────────────────────────────────
-- client_id: the result's id on the device; played_at: when it was played
-- there (may be in the past for the offline queue, never in the future).
alter table public.game_results
  add column client_id text check (char_length(client_id) between 1 and 64),
  add constraint game_results_played_at_check check (played_at <= now() + interval '5 minutes');

create unique index game_results_user_client_key on public.game_results (user_id, client_id);

-- ── ranks ───────────────────────────────────────────────────────────────
-- each player's best result: highest score, the earliest one on a tie
create function public.player_bests()
returns table (user_id uuid, best_score integer, played_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (r.user_id) r.user_id, r.score, r.played_at
  from public.game_results r
  order by r.user_id, r.score desc, r.played_at asc
$$;

revoke execute on function public.player_bests() from public, anon, authenticated;

-- top_scores: same ordering, now built on player_bests
create or replace function public.top_scores(limit_count integer default 50)
returns table (user_id uuid, display_name text, best_score integer, played_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.user_id, p.display_name, b.best_score, b.played_at
  from public.player_bests() b
  join public.profiles p on p.id = b.user_id
  order by b.best_score desc, b.played_at asc
  limit least(greatest(limit_count, 1), 100)
$$;

-- where a result would rank (1-based) among all players' bests — for showing
-- a device-only (signed-out) result against the online leaderboard
create function public.rank_for_score(p_score integer, p_played_at timestamptz default now())
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) + 1
  from public.player_bests() b
  where b.best_score > p_score
     or (b.best_score = p_score and b.played_at < p_played_at)
$$;

revoke execute on function public.rank_for_score(integer, timestamptz) from public;
grant execute on function public.rank_for_score(integer, timestamptz) to anon, authenticated;

-- the signed-in player's name, best result and rank (no row if they have no results yet)
create function public.my_rank()
returns table (display_name text, best_score integer, played_at timestamptz, rank bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, me.best_score, me.played_at,
    (select count(*) + 1 from public.player_bests() b
      where b.best_score > me.best_score
         or (b.best_score = me.best_score and b.played_at < me.played_at)) as rank
  from public.player_bests() me
  join public.profiles p on p.id = me.user_id
  where me.user_id = (select auth.uid())
$$;

revoke execute on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;
