-- TCG cards (Season 1): a 30-card collection, cards drawn per game on the
-- server, and a collectors' ranking.
--
-- - cards: content, read by everyone, edited from the dashboard only
-- - user_cards: what each player drew; written only by the functions below,
--   so the app can neither insert nor choose a card
-- - a game earns least(3, score / 100) cards; open_cards draws them once and
--   returns the same cards on every later call (safe to retry)

-- ── cards ───────────────────────────────────────────────────────────────
create table public.cards (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  number integer not null unique check (number between 1 and 999),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 500),
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'legendary')),
  -- public URL, e.g. from the "cards" storage bucket below
  image_url text check (image_url ~ '^https://'),
  -- the webshop page of the real card (e.g. https://krumplisztan.hu/kartyak/<md5>)
  landing_url text check (landing_url ~ '^https://'),
  season integer not null default 1 check (season >= 1),
  -- display only (print run), e.g. "Season 1/432"
  serial_label text not null default 'Season 1/432' check (char_length(serial_label) between 1 and 40),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "Everyone reads enabled cards"
  on public.cards for select to anon, authenticated
  using (enabled);

revoke insert, update, delete, truncate on public.cards from anon, authenticated;
grant select on public.cards to anon, authenticated;

create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();

-- card art: public bucket, upload from the dashboard and put the URL into cards.image_url
insert into storage.buckets (id, name, public)
values ('cards', 'cards', true)
on conflict (id) do nothing;

create policy "Everyone reads card images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'cards');

-- ── user cards ──────────────────────────────────────────────────────────
create table public.user_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null references public.cards (id),
  -- the game that earned the card (US-6 game_session_id)
  game_result_id bigint not null references public.game_results (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  drawn_at timestamptz not null default now(),
  revealed_at timestamptz,
  unique (game_result_id, slot)
);

create index user_cards_user_id_idx on public.user_cards (user_id);

alter table public.user_cards enable row level security;

create policy "Players read their own cards"
  on public.user_cards for select to authenticated
  using ((select auth.uid()) = user_id);

-- read-only for the app: every write goes through open_cards / reveal_card
revoke all on public.user_cards from anon;
revoke insert, update, delete, truncate on public.user_cards from authenticated;
grant select on public.user_cards to authenticated;

-- ── drawing ─────────────────────────────────────────────────────────────
-- Draws the cards the caller's uploaded result (by its device id) earned and
-- returns all cards of that game. Raises no_data_found (P0002) while the
-- result isn't on the server (not uploaded yet, or another player's).
create function public.open_cards(p_client_id text)
returns setof public.user_cards
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result_id bigint;
  result_score integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select r.id, r.score into result_id, result_score
  from public.game_results r
  where r.user_id = me and r.client_id = p_client_id;

  if result_id is null then
    raise exception 'result % is not uploaded', p_client_id using errcode = 'P0002';
  end if;

  -- one uniformly random enabled card per missing slot; filled slots stay as they are
  for s in 1..least(3, result_score / 100) loop
    insert into public.user_cards (user_id, card_id, game_result_id, slot)
    select me, c.id, result_id, s
    from public.cards c
    where c.enabled
    order by random()
    limit 1
    on conflict (game_result_id, slot) do nothing;
  end loop;

  return query
    select * from public.user_cards uc where uc.game_result_id = result_id order by uc.slot;
end;
$$;

revoke execute on function public.open_cards(text) from public, anon;
grant execute on function public.open_cards(text) to authenticated;

-- marks one of the caller's cards revealed (flipped); no-op for anyone else's
create function public.reveal_card(p_user_card_id bigint)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.user_cards
  set revealed_at = now()
  where id = p_user_card_id
    and user_id = (select auth.uid())
    and revealed_at is null
$$;

revoke execute on function public.reveal_card(bigint) from public, anon;
grant execute on function public.reveal_card(bigint) to authenticated;

-- ── collectors' ranking ─────────────────────────────────────────────────
-- each player's distinct revealed cards, and when they revealed the newest one
create function public.collector_counts()
returns table (user_id uuid, distinct_cards integer, reached_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.user_id, count(*)::integer, max(f.first_at)
  from (
    select uc.user_id, uc.card_id, min(uc.revealed_at) as first_at
    from public.user_cards uc
    where uc.revealed_at is not null
    group by uc.user_id, uc.card_id
  ) f
  group by f.user_id
$$;

revoke execute on function public.collector_counts() from public, anon, authenticated;

-- most distinct cards first, then who got there first (max 100 rows)
create function public.top_collectors(limit_count integer default 10)
returns table (user_id uuid, display_name text, distinct_cards integer, reached_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, p.display_name, c.distinct_cards, c.reached_at
  from public.collector_counts() c
  join public.profiles p on p.id = c.user_id
  order by c.distinct_cards desc, c.reached_at asc
  limit least(greatest(limit_count, 1), 100)
$$;

revoke execute on function public.top_collectors(integer) from public;
grant execute on function public.top_collectors(integer) to anon, authenticated;

-- the signed-in player's row in the ranking (no row before their first reveal)
create function public.my_collector_rank()
returns table (display_name text, distinct_cards integer, reached_at timestamptz, rank bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, me.distinct_cards, me.reached_at,
    (select count(*) + 1 from public.collector_counts() o
      where o.distinct_cards > me.distinct_cards
         or (o.distinct_cards = me.distinct_cards and o.reached_at < me.reached_at)) as rank
  from public.collector_counts() me
  join public.profiles p on p.id = me.user_id
  where me.user_id = (select auth.uid())
$$;

revoke execute on function public.my_collector_rank() from public, anon;
grant execute on function public.my_collector_rank() to authenticated;

-- ── initial content: 30 placeholders, replaced from the dashboard ──────
insert into public.cards (id, number, name, description, rarity)
select
  'card-' || lpad(n::text, 2, '0'),
  n,
  'Kártya #' || n,
  'Helyőrző kártya. A valódi tartalom hamarosan érkezik.',
  case when n > 27 then 'legendary' when n > 20 then 'rare' else 'common' end
from generate_series(1, 30) n
on conflict (id) do nothing;
