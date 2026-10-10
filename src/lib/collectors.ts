/**
 * Collectors' ranking: players by how many different Season 1 cards they
 * revealed; on a tie, whoever got there first. Same board shape as the score
 * leaderboard (top 10, the own row highlighted or appended with its rank).
 */
import { useAuthStore } from '@/store/useAuthStore';

import { BOARD_SIZE, buildBoard, OfflineError, type Board, type OwnEntry, type TopEntry } from './leaderboard';
import { getSupabase } from './supabase';

export async function fetchCollectors(): Promise<Board> {
  const supabase = getSupabase();
  if (!supabase) throw new OfflineError('no backend');

  const top = await supabase.rpc('top_collectors', { limit_count: BOARD_SIZE });
  if (top.error) throw top.error;
  const entries: TopEntry[] = top.data.map((t) => ({
    userId: t.user_id,
    name: t.display_name,
    score: t.distinct_cards,
    playedAt: t.reached_at,
  }));

  const { status, userId } = useAuthStore.getState();
  let own: OwnEntry | null = null;
  if (status === 'signedIn' && userId) {
    const mine = await supabase.rpc('my_collector_rank');
    if (mine.error) throw mine.error;
    const row = mine.data[0];
    if (row) own = { name: row.display_name, score: row.distinct_cards, playedAt: row.reached_at, rank: row.rank, userId };
  }
  return buildBoard(entries, own);
}
