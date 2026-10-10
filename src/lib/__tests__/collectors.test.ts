import { useAuthStore } from '@/store/useAuthStore';

import { fetchCollectors } from '../collectors';
import { OfflineError } from '../leaderboard';

const mockState = {
  available: true,
  top: [] as { user_id: string; display_name: string; distinct_cards: number; reached_at: string }[],
  mine: [] as { display_name: string; distinct_cards: number; reached_at: string; rank: number }[],
};
jest.mock('../supabase', () => ({
  getSupabase: () =>
    mockState.available
      ? {
          rpc: async (fn: string) => ({ data: fn === 'top_collectors' ? mockState.top : mockState.mine, error: null }),
        }
      : null,
}));

const top = (n: number, cards: number) => ({
  user_id: `u${n}`,
  display_name: `Csibe #${n}`,
  distinct_cards: cards,
  reached_at: '2026-10-10T10:00:00Z',
});

beforeEach(() => {
  mockState.available = true;
  mockState.top = [top(1, 23), top(2, 12)];
  mockState.mine = [];
  useAuthStore.setState({ status: 'signedIn', userId: 'u9' });
});

describe('fetchCollectors', () => {
  it('ranks players by distinct cards', async () => {
    const board = await fetchCollectors();
    expect(board.rows.map((r) => [r.rank, r.name, r.score])).toEqual([
      [1, 'Csibe #1', 23],
      [2, 'Csibe #2', 12],
    ]);
  });

  it('appends the own row when outside the top list', async () => {
    mockState.mine = [{ display_name: 'Én', distinct_cards: 3, reached_at: '2026-10-10T10:00:00Z', rank: 41 }];
    const board = await fetchCollectors();
    expect(board.gap).toBe(true);
    expect(board.rows.at(-1)).toMatchObject({ rank: 41, name: 'Én', score: 3, isMe: true });
  });

  it('highlights the own row inside the top list', async () => {
    useAuthStore.setState({ status: 'signedIn', userId: 'u2' });
    mockState.mine = [{ display_name: 'Csibe #2', distinct_cards: 12, reached_at: '2026-10-10T10:00:00Z', rank: 2 }];
    const board = await fetchCollectors();
    expect(board.rows[1]).toMatchObject({ isMe: true, rank: 2 });
    expect(board.gap).toBe(false);
  });

  it('throws OfflineError without a backend', async () => {
    mockState.available = false;
    await expect(fetchCollectors()).rejects.toBeInstanceOf(OfflineError);
  });
});
