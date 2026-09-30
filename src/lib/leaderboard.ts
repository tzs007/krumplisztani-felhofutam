/**
 * Online leaderboard: the global top 10 plus the player's own best.
 *
 * - signed in: their best comes from the server (my_rank)
 * - no account (offline / sign-in failed): their best result stored on this
 *   device is "injected" at the rank it would have (rank_for_score)
 * Inside the top 10 the own row sits in its place, highlighted; outside it's
 * appended after a gap with its real rank (e.g. #3441).
 * Ties: higher score first, then whoever reached it first — same as the server.
 */
import type { GameResult } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

import { getSupabase } from './supabase';

export const BOARD_SIZE = 10;

export type TopEntry = { userId: string; name: string; score: number; playedAt: string };
export type OwnEntry = { name: string; score: number; playedAt: string; rank: number; userId: string | null };
export type BoardRow = { key: string; rank: number; name: string; score: number; isMe: boolean; outside: boolean };
export type Board = { rows: BoardRow[]; gap: boolean };

export function buildBoard(top: TopEntry[], own: OwnEntry | null, size = BOARD_SIZE): Board {
  const rows: BoardRow[] = top.slice(0, size).map((t, i) => ({
    key: t.userId,
    rank: i + 1,
    name: t.name,
    score: t.score,
    isMe: own?.userId != null && t.userId === own.userId,
    outside: false,
  }));
  if (!own || rows.some((r) => r.isMe)) return { rows, gap: false };

  const me: BoardRow = { key: 'me', rank: own.rank, name: own.name, score: own.score, isMe: true, outside: false };
  if (own.rank <= size) {
    // not counted on the server yet (device-only result): slot it in, push the rest down
    const at = Math.max(0, own.rank - 1);
    const merged = [...rows.slice(0, at), me, ...rows.slice(at).map((r) => ({ ...r, rank: r.rank + 1 }))];
    return { rows: merged.slice(0, size), gap: false };
  }
  return { rows: [...rows, { ...me, outside: true }], gap: true };
}

/** Local best as the leaderboard sees it (history is sorted best first). */
export function localBest(history: GameResult[]): GameResult | null {
  return history[0] ?? null;
}

export class OfflineError extends Error {}

/** Fetches the top 10 and the player's own row. Throws OfflineError without backend. */
export async function fetchBoard(best: GameResult | null): Promise<Board> {
  const supabase = getSupabase();
  if (!supabase) throw new OfflineError('no backend');

  const top = await supabase.rpc('top_scores', { limit_count: BOARD_SIZE });
  if (top.error) throw top.error;
  const entries: TopEntry[] = top.data.map((t) => ({
    userId: t.user_id,
    name: t.display_name,
    score: t.best_score,
    playedAt: t.played_at,
  }));

  const { status, userId, displayName } = useAuthStore.getState();
  let own: OwnEntry | null = null;

  if (status === 'signedIn' && userId) {
    const mine = await supabase.rpc('my_rank');
    if (mine.error) throw mine.error;
    const row = mine.data[0];
    if (row) own = { name: row.display_name, score: row.best_score, playedAt: row.played_at, rank: row.rank, userId };
  }

  // no server-side best yet (never signed in, or the upload is still pending): use this device's best
  if (!own && best) {
    const playedAt = new Date(best.playedAt).toISOString();
    const rank = await supabase.rpc('rank_for_score', { p_score: best.score, p_played_at: playedAt });
    if (rank.error) throw rank.error;
    own = { name: displayName ?? 'Te', score: best.score, playedAt, rank: rank.data, userId: null };
  }

  return buildBoard(entries, own);
}
