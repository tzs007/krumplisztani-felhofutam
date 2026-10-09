-- TCG cards: draw limits, retry safety and who may touch which rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- two players (the sign-up trigger creates their profiles) and their uploaded results
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'a@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'b@example.com');

insert into public.game_results (user_id, client_id, score, platforms, pickups, duration_ms) values
  ('00000000-0000-0000-0000-000000000001', 'low', 99, 0, 0, 0),
  ('00000000-0000-0000-0000-000000000001', 'mid', 250, 0, 0, 0),
  ('00000000-0000-0000-0000-000000000001', 'high', 1000, 0, 0, 0),
  ('00000000-0000-0000-0000-000000000002', 'other', 500, 0, 0, 0);

-- act as player 1
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.open_cards('low')), 0, 'under 100 points: no card');
select is((select count(*)::int from public.open_cards('mid')), 2, '250 points: 2 cards');
select is((select count(*)::int from public.open_cards('high')), 3, '1000 points: capped at 3');

select results_eq(
  $$ select id, card_id from public.open_cards('mid') order by slot $$,
  $$ select uc.id, uc.card_id from public.user_cards uc
     join public.game_results r on r.id = uc.game_result_id
     where r.client_id = 'mid' order by uc.slot $$,
  'calling again returns the same cards'
);
select is((select count(*)::int from public.user_cards), 5, 'a retry draws nothing new');

select throws_ok(
  $$ select public.open_cards('other') $$,
  'P0002', null, 'another player''s result can''t be opened'
);
select throws_ok(
  $$ insert into public.user_cards (user_id, card_id, game_result_id, slot)
     select '00000000-0000-0000-0000-000000000001', 'card-01', r.id, 3
     from public.game_results r where r.client_id = 'mid' $$,
  '42501', null, 'the app can''t insert cards'
);

-- reveal slot 1 of the "mid" game
select public.reveal_card(uc.id)
from public.user_cards uc join public.game_results r on r.id = uc.game_result_id
where r.client_id = 'mid' and uc.slot = 1;

select is(
  (select count(*)::int from public.user_cards where revealed_at is not null), 1,
  'reveal_card reveals the own card'
);

-- player 2 tries to reveal every card id
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.reveal_card(g) from generate_series(1, 100) g;

reset role;
select is(
  (select count(*)::int from public.user_cards where revealed_at is not null), 1,
  'nobody can reveal someone else''s card'
);

select is(
  (select distinct_cards from public.top_collectors(10) where user_id = '00000000-0000-0000-0000-000000000001'),
  1, 'the collectors ranking counts revealed distinct cards'
);

select * from finish();
rollback;
