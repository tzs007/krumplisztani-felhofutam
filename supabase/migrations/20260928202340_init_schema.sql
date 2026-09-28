-- Initial schema: player profiles, game results and a public leaderboard.
--
-- DRAFT — not applied anywhere yet. Apply with `npx supabase db push` once the
-- hosted project is linked, or `npx supabase start` for the local stack.
--
-- Security model: the app ships the public (publishable) key, so every table
-- has row level security. Players read and write only their own rows; the
-- leaderboard is exposed through a function that returns best scores only.

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth user, created automatically on sign-up.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 2 and 24),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Players read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Players update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, update on public.profiles to authenticated;
-- signed-out users get nothing directly (Supabase grants the anon role table access by default)
revoke all on public.profiles from anon;

-- create the profile when a user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── game results ─────────────────────────────────────────────────────────
-- Mirrors the local GameResult (src/store/useAppStore.ts).
create table public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  score integer not null check (score between 0 and 100000),
  platforms integer not null check (platforms >= 0),
  pickups integer not null check (pickups >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  played_at timestamptz not null default now()
);

create index game_results_user_id_idx on public.game_results (user_id);
create index game_results_score_idx on public.game_results (score desc);

alter table public.game_results enable row level security;

create policy "Players read their own results"
  on public.game_results for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players insert their own results"
  on public.game_results for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- results are append-only: no update / delete policies
grant select, insert on public.game_results to authenticated;
revoke all on public.game_results from anon;

-- ── leaderboard ──────────────────────────────────────────────────────────
-- Best score per player, top `limit_count` (max 100), readable by everyone
-- (also signed out). security definer so it can aggregate across players,
-- but it only returns these columns — never other players' full history.
create function public.top_scores(limit_count integer default 50)
returns table (user_id uuid, display_name text, best_score integer, played_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select best.user_id, best.display_name, best.best_score, best.played_at
  from (
    select distinct on (r.user_id)
      r.user_id, p.display_name, r.score as best_score, r.played_at
    from public.game_results r
    join public.profiles p on p.id = r.user_id
    order by r.user_id, r.score desc, r.played_at asc
  ) best
  order by best.best_score desc, best.played_at asc
  limit least(greatest(limit_count, 1), 100)
$$;

revoke execute on function public.top_scores(integer) from public;
grant execute on function public.top_scores(integer) to anon, authenticated;
