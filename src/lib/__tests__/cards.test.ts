import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCardsStore } from '@/store/useCardsStore';

import { claimCards, revealCard, syncCards } from '../cards';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

const cardRow = (n: number) => ({
  id: `card-${n}`,
  number: n,
  name: `Kártya #${n}`,
  description: 'x',
  rarity: 'common' as const,
  image_url: null,
  landing_url: null,
  season: 1,
  serial_label: 'Season 1/432',
  enabled: true,
  created_at: '',
  updated_at: '',
});
const userCardRow = (id: number, n: number, revealed_at: string | null = null) => ({
  id,
  user_id: 'u1',
  card_id: `card-${n}`,
  game_result_id: 10,
  slot: 1,
  drawn_at: '',
  revealed_at,
});

// minimal fake Supabase client
const mockState = {
  available: true,
  signedIn: true,
  calls: [] as { fn: string; args: unknown }[],
  open: { data: [] as ReturnType<typeof userCardRow>[] | null, error: null as null | { code: string } },
  revealError: null as null | { code: string },
  cardRows: [cardRow(1), cardRow(2)],
  userCardRows: [] as ReturnType<typeof userCardRow>[],
};
jest.mock('../supabase', () => ({
  getSupabase: () =>
    mockState.available
      ? {
          rpc: async (fn: string, args: unknown) => {
            mockState.calls.push({ fn, args });
            if (fn === 'open_cards') return mockState.open;
            return { data: null, error: mockState.revealError };
          },
          from: (table: string) => ({
            select: () => ({
              eq: () => ({ order: async () => ({ data: table === 'cards' ? mockState.cardRows : [], error: null }) }),
              order: async () => ({ data: mockState.userCardRows, error: null }),
            }),
          }),
        }
      : null,
}));
jest.mock('../auth', () => ({
  ensureSignedIn: async () => (mockState.signedIn ? 'signedIn' : 'offline'),
}));
const mockSyncResults = jest.fn(async () => 0);
jest.mock('../resultsSync', () => ({ syncResults: () => mockSyncResults() }));

const result = (id: string) => ({ id, score: 250, platforms: 1, pickups: 0, durationMs: 1, playedAt: 1 });

beforeEach(() => {
  Object.assign(mockState, {
    available: true,
    signedIn: true,
    calls: [],
    open: { data: [], error: null },
    revealError: null,
    userCardRows: [],
  });
  useAuthStore.setState({ status: 'signedIn', userId: 'u1' });
  useAppStore.setState({ history: [result('r1')], uploadedIds: ['r1'] });
  useCardsStore.setState({ catalog: [], owned: [], pendingClaims: ['r1'], pendingReveals: [] });
  mockSyncResults.mockImplementation(async () => 0);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('claimCards', () => {
  it('stores the drawn cards, loads the collection and clears the claim', async () => {
    mockState.open = { data: [userCardRow(7, 1), userCardRow(8, 2)], error: null };
    const res = await claimCards('r1');
    expect(res.status).toBe('ok');
    expect(res.cards.map((c) => c.id)).toEqual([7, 8]);
    expect(mockState.calls).toContainEqual({ fn: 'open_cards', args: { p_client_id: 'r1' } });
    const s = useCardsStore.getState();
    expect(s.owned.map((o) => o.id)).toEqual([7, 8]);
    expect(s.catalog.map((c) => c.id)).toEqual(['card-1', 'card-2']);
    expect(s.pendingClaims).toEqual([]);
  });

  it('keeps the claim when offline', async () => {
    mockState.signedIn = false;
    await expect(claimCards('r1')).resolves.toEqual({ status: 'offline', cards: [] });
    expect(useCardsStore.getState().pendingClaims).toEqual(['r1']);
  });

  it('keeps the claim while the result still waits for upload', async () => {
    useAppStore.setState({ uploadedIds: [] });
    mockState.open = { data: null, error: { code: 'P0002' } };
    await expect(claimCards('r1')).resolves.toMatchObject({ status: 'offline' });
    expect(useCardsStore.getState().pendingClaims).toEqual(['r1']);
  });

  it('keeps the claim when the upload finished while open_cards ran (pending before the call)', async () => {
    useAppStore.setState({ uploadedIds: [] });
    // the upload is still in flight when open_cards is sent, and lands before the error is handled
    mockState.open = {
      get data() {
        useAppStore.getState().markUploaded(['r1']);
        return null;
      },
      error: { code: 'P0002' },
    };
    await expect(claimCards('r1')).resolves.toMatchObject({ status: 'offline' });
    expect(useAppStore.getState().uploadedIds).toContain('r1');
    expect(useCardsStore.getState().pendingClaims).toEqual(['r1']);
  });

  it('opens the claim of a result that ranks below the history cap', async () => {
    useAppStore.setState({ history: [], uploadedIds: [] });
    for (let i = 0; i < 50; i++) {
      useAppStore.getState().addResult({ score: 300, platforms: 1, pickups: 0, durationMs: 1, playedAt: i });
    }
    useAppStore.getState().markUploaded(useAppStore.getState().history.map((r) => r.id));
    const saved = useAppStore
      .getState()
      .addResult({ score: 250, platforms: 1, pickups: 0, durationMs: 1, playedAt: 99 });
    useCardsStore.setState({ pendingClaims: [saved.id] });
    mockState.open = { data: null, error: { code: 'P0002' } };
    await expect(claimCards(saved.id)).resolves.toMatchObject({ status: 'offline' });
    expect(useCardsStore.getState().pendingClaims).toEqual([saved.id]);
  });

  it("drops a claim whose result can never be opened (e.g. another account's)", async () => {
    mockState.open = { data: null, error: { code: 'P0002' } };
    await expect(claimCards('r1')).resolves.toMatchObject({ status: 'error' });
    expect(useCardsStore.getState().pendingClaims).toEqual([]);
  });

  it('does not wait forever for a hung result upload', async () => {
    jest.useFakeTimers();
    try {
      useAppStore.setState({ uploadedIds: [] });
      mockSyncResults.mockImplementation(() => new Promise<number>(() => {}));
      mockState.open = { data: null, error: { code: 'P0002' } };
      const promise = claimCards('r1');
      await jest.advanceTimersByTimeAsync(5000);
      await expect(promise).resolves.toEqual({ status: 'offline', cards: [] });
      expect(useCardsStore.getState().pendingClaims).toEqual(['r1']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the claim on other server errors', async () => {
    mockState.open = { data: null, error: { code: '500' } };
    await expect(claimCards('r1')).resolves.toMatchObject({ status: 'error' });
    expect(useCardsStore.getState().pendingClaims).toEqual(['r1']);
  });
});

describe('revealCard', () => {
  beforeEach(() => {
    useCardsStore.setState({ owned: [{ id: 7, cardId: 'card-1', gameResultId: 10, slot: 1, revealedAt: null }] });
  });

  it('reveals locally and on the server', async () => {
    await revealCard(7);
    expect(mockState.calls).toContainEqual({ fn: 'reveal_card', args: { p_user_card_id: 7 } });
    const s = useCardsStore.getState();
    expect(s.owned[0].revealedAt).not.toBeNull();
    expect(s.pendingReveals).toEqual([]);
  });

  it('keeps the reveal queued when the server call fails', async () => {
    mockState.revealError = { code: '500' };
    await revealCard(7);
    expect(useCardsStore.getState().pendingReveals).toEqual([7]);
    expect(useCardsStore.getState().owned[0].revealedAt).not.toBeNull();
  });
});

describe('syncCards', () => {
  it('opens queued games, sends queued reveals, then takes the server list', async () => {
    mockState.open = { data: [userCardRow(7, 1)], error: null };
    mockState.revealError = { code: '500' };
    useCardsStore.setState({ owned: [{ id: 3, cardId: 'card-2', gameResultId: 9, slot: 1, revealedAt: null }] });
    await revealCard(3); // fails: stays queued
    mockState.revealError = null;
    mockState.userCardRows = [userCardRow(3, 2), userCardRow(7, 1)];

    await expect(syncCards()).resolves.toBe('ok');

    expect(mockState.calls.filter((c) => c.fn === 'reveal_card')).toHaveLength(2);
    const s = useCardsStore.getState();
    expect(s.pendingClaims).toEqual([]);
    expect(s.pendingReveals).toEqual([]);
    expect(s.owned.map((o) => o.id)).toEqual([3, 7]);
  });

  it('server wins: a card missing on the server disappears locally', async () => {
    useCardsStore.setState({
      pendingClaims: [],
      owned: [{ id: 99, cardId: 'card-1', gameResultId: 1, slot: 1, revealedAt: 't' }],
    });
    await syncCards();
    expect(useCardsStore.getState().owned).toEqual([]);
  });

  it('keeps a local reveal that has not reached the server yet', async () => {
    useCardsStore.setState({
      pendingClaims: [],
      pendingReveals: [3],
      owned: [{ id: 3, cardId: 'card-2', gameResultId: 9, slot: 1, revealedAt: 'local' }],
    });
    mockState.revealError = { code: '500' };
    mockState.userCardRows = [userCardRow(3, 2, null)];
    await syncCards();
    const s = useCardsStore.getState();
    expect(s.owned[0].revealedAt).not.toBeNull();
    expect(s.pendingReveals).toEqual([3]);
  });

  it('reports offline without a backend', async () => {
    mockState.available = false;
    await expect(syncCards()).resolves.toBe('offline');
  });
});
