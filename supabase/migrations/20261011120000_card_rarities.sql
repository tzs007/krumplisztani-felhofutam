-- TCG cards: the full rarity ladder (display only, the draw stays uniform).
-- common < uncommon < rare < epic < legendary < mythic < etheric < sacred

alter table public.cards drop constraint cards_rarity_check;

alter table public.cards add constraint cards_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'etheric', 'sacred'));
