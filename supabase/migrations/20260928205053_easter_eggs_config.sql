-- Easter egg (meme) content and remote game settings, editable from the
-- Supabase dashboard without an app release.
--
-- Read by everyone (also signed out); written only from the dashboard /
-- service role. The app caches the last fetch and falls back to its bundled
-- defaults (src/game/easterEggs.ts) when offline or not configured.

-- ── easter eggs ─────────────────────────────────────────────────────────
-- Columns mirror the EasterEgg type in src/game/easterEggs.ts:
--   card  : title, description, heading, continue_label, image_url, image_aspect_ratio
--   level : item_sprite_key, item_size, item_placement (null → app default: pumpkin)
create table public.easter_eggs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 500),
  heading text check (char_length(heading) between 1 and 60),
  continue_label text check (char_length(continue_label) between 1 and 30),
  -- public URL, e.g. from the "memes" storage bucket below
  image_url text check (image_url ~ '^https://'),
  image_aspect_ratio real check (image_aspect_ratio > 0),
  -- must be a sprite key the app knows (unknown ones fall back to the default item)
  item_sprite_key text,
  item_size real check (item_size between 0.3 and 3),
  item_placement text check (item_placement in ('ground', 'hover')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.easter_eggs enable row level security;

create policy "Everyone reads enabled easter eggs"
  on public.easter_eggs for select to anon, authenticated
  using (enabled);

-- read-only for the app: no write privileges at all (dashboard / service role only)
revoke insert, update, delete, truncate on public.easter_eggs from anon, authenticated;
grant select on public.easter_eggs to anon, authenticated;

-- ── app config ──────────────────────────────────────────────────────────
-- Small key → JSON settings the game reads at start-up.
--   easter_eggs: { "chancePerGame": 0–1, "chunkRange": [from, to] }
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "Everyone reads app config"
  on public.app_config for select to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

-- keep updated_at current on dashboard edits
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger easter_eggs_touch before update on public.easter_eggs
  for each row execute function public.touch_updated_at();
create trigger app_config_touch before update on public.app_config
  for each row execute function public.touch_updated_at();

-- ── storage: meme images ───────────────────────────────────────────────
-- Public bucket; upload from the dashboard and put the public URL into
-- easter_eggs.image_url.
insert into storage.buckets (id, name, public)
values ('memes', 'memes', true)
on conflict (id) do nothing;

create policy "Everyone reads meme images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'memes');

-- ── initial content (same as the app's bundled defaults) ───────────────
insert into public.easter_eggs (id, title, description) values
  ('placeholder-1', 'Az első rejtett mém', 'Ide kerül majd a mém leírása. Ritkán bukkan fel, szerencséd volt!'),
  ('placeholder-2', 'A második rejtett mém', 'Ez is csak egy helyőrző. A valódi tartalom hamarosan érkezik.')
on conflict (id) do nothing;

insert into public.app_config (key, value) values
  ('easter_eggs', '{"chancePerGame": 0.1, "chunkRange": [2, 12]}')
on conflict (key) do nothing;
