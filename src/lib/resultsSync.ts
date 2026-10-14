/**
 * Uploads the results stored on this device that aren't on the server yet:
 * the offline queue, and — on the first sign-in — every earlier result.
 * Each result carries its device id as client_id, so a retry never
 * duplicates it (unique per player on the server).
 */
import { useAppStore, selectPendingUploads, type GameResult } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

import { ensureSignedIn } from './auth';
import { onForeground } from './onForeground';
import { singleFlight } from './singleFlight';
import { getSupabase } from './supabase';

export function toRow(r: GameResult, userId: string) {
  return {
    user_id: userId,
    client_id: r.id,
    score: r.score,
    platforms: r.platforms,
    pickups: r.pickups,
    duration_ms: Math.round(r.durationMs),
    played_at: new Date(r.playedAt).toISOString(),
  };
}

/** Uploads pending results; resolves with how many were sent (0 when offline). Never throws. */
export const syncResults = singleFlight(upload);

async function upload(): Promise<number> {
  const supabase = getSupabase();
  const { status, userId } = useAuthStore.getState();
  if (!supabase || status !== 'signedIn' || !userId) return 0;

  const pending = selectPendingUploads(useAppStore.getState());
  if (pending.length === 0) return 0;

  const { error } = await supabase.from('game_results').upsert(
    pending.map((r) => toRow(r, userId)),
    { onConflict: 'user_id,client_id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('Result upload failed, will retry later', error);
    return 0;
  }
  useAppStore.getState().markUploaded(pending.map((r) => r.id));
  return pending.length;
}

/** Signs in if needed (retrying a failed sign-in), then uploads what's pending. Never throws. */
export async function connectAndSync(): Promise<number> {
  return (await ensureSignedIn()) === 'signedIn' ? syncResults() : 0;
}

let watchingForeground = false;

/** Also retries whenever the app comes back to the foreground (e.g. network is back). */
export function startBackgroundSync() {
  connectAndSync();
  if (watchingForeground) return;
  watchingForeground = true;
  onForeground(connectAndSync);
}
