/**
 * Season 1 cards: drawing them for a game, revealing them, and keeping the
 * device's copy of the collection in step with the server.
 *
 * The server draws every card (open_cards), so the app can neither pick nor
 * invent one. Games that earned cards while offline wait in pendingClaims,
 * reveals made offline in pendingReveals; both are retried on the next sync.
 * The server's list always replaces the device's (only a reveal not sent yet
 * is kept). Nothing here throws or blocks the game.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { selectPendingUploads, useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCardsStore } from '@/store/useCardsStore';

import { ensureSignedIn } from './auth';
import { rowToCard, rowToOwned, type OwnedCard } from './cardRules';
import type { Database } from './database.types';
import { syncResults } from './resultsSync';
import { getSupabase } from './supabase';
import { withTimeout } from './withTimeout';

const TIMEOUT_MS = 5000;
/** Postgres no_data_found: open_cards didn't find the result on the server. */
const RESULT_NOT_FOUND = 'P0002';

export type CardSyncStatus = 'ok' | 'offline' | 'error';
export type ClaimResult = { status: CardSyncStatus; cards: OwnedCard[] };

async function loadCatalog(supabase: SupabaseClient<Database>) {
  const { data, error } = await withTimeout(
    supabase.from('cards').select('*').eq('enabled', true).order('number'),
    TIMEOUT_MS,
  );
  if (error) throw error;
  useCardsStore.getState().setCatalog(data.map(rowToCard));
}

/** Draws (or fetches the already drawn) cards of one game, uploading its result first. */
export async function claimCards(clientId: string): Promise<ClaimResult> {
  const supabase = getSupabase();
  if (!supabase || (await ensureSignedIn()) !== 'signedIn') return { status: 'offline', cards: [] };
  try {
    const isPending = () => selectPendingUploads(useAppStore.getState()).some((r) => r.id === clientId);
    // a hung upload must not hold up the game: on timeout the result stays pending and the claim is retried
    await withTimeout(syncResults(), TIMEOUT_MS).catch(() => {});
    const pendingBeforeOpen = isPending();
    const { data, error } = await withTimeout(supabase.rpc('open_cards', { p_client_id: clientId }), TIMEOUT_MS);
    if (error) {
      if (error.code !== RESULT_NOT_FOUND) throw error;
      // still waiting for upload (or an in-flight upload finished meanwhile) → try again later;
      // otherwise it can never be opened (e.g. another account's)
      if (pendingBeforeOpen || isPending()) return { status: 'offline', cards: [] };
      useCardsStore.getState().removeClaim(clientId);
      return { status: 'error', cards: [] };
    }
    const cards = data.map(rowToOwned);
    const store = useCardsStore.getState();
    store.addDrawn(cards);
    store.removeClaim(clientId);
    if (cards.some((c) => !store.catalog.some((k) => k.id === c.cardId))) {
      await loadCatalog(supabase).catch((e) => console.warn('Card list download failed', e));
    }
    return { status: 'ok', cards };
  } catch (e) {
    console.warn('Opening cards failed, will retry later', e);
    return { status: 'error', cards: [] };
  }
}

async function sendReveals(ids: number[]) {
  const supabase = getSupabase();
  if (!supabase || useAuthStore.getState().status !== 'signedIn' || ids.length === 0) return;
  const done: number[] = [];
  for (const id of ids) {
    try {
      const { error } = await withTimeout(supabase.rpc('reveal_card', { p_user_card_id: id }), TIMEOUT_MS);
      if (!error) done.push(id);
    } catch {
      // offline: retried on the next sync
    }
  }
  useCardsStore.getState().confirmReveals(done);
}

/** Flips a card: revealed on this device at once, on the server as soon as possible. */
export async function revealCard(userCardId: number): Promise<void> {
  useCardsStore.getState().revealLocal(userCardId);
  await sendReveals([userCardId]);
}

let running: Promise<CardSyncStatus> | null = null;

/** Opens queued games, sends queued reveals, then takes the server's collection. */
export function syncCards(): Promise<CardSyncStatus> {
  running ??= sync().finally(() => {
    running = null;
  });
  return running;
}

async function sync(): Promise<CardSyncStatus> {
  const supabase = getSupabase();
  if (!supabase || (await ensureSignedIn()) !== 'signedIn') return 'offline';
  for (const clientId of useCardsStore.getState().pendingClaims) await claimCards(clientId);
  await sendReveals(useCardsStore.getState().pendingReveals);
  try {
    const [, owned] = await Promise.all([
      loadCatalog(supabase),
      withTimeout(supabase.from('user_cards').select('*').order('id'), TIMEOUT_MS),
    ]);
    if (owned.error) throw owned.error;
    useCardsStore.getState().setOwned(owned.data.map(rowToOwned));
    return 'ok';
  } catch (e) {
    console.warn('Card sync failed, showing the cached collection', e);
    return 'error';
  }
}

let watchingForeground = false;

/** Syncs now and whenever the app comes back to the foreground. */
export function startCardSync() {
  syncCards();
  if (watchingForeground) return;
  watchingForeground = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') syncCards();
  });
}
