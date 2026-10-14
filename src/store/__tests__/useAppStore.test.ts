import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { insertResult, MAX_HISTORY, selectPendingUploads, useAppStore, type GameResult } from '../useAppStore';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

const result = (score: number, playedAt: number): GameResult => ({
  id: `${playedAt}`,
  score,
  platforms: score,
  pickups: 0,
  durationMs: 1000,
  playedAt,
});

describe('insertResult', () => {
  it('sorts by score, newest first on ties', () => {
    const h = [result(5, 1), result(9, 2), result(5, 3)].reduce<GameResult[]>((acc, r) => insertResult(acc, r), []);
    expect(h.map((r) => r.playedAt)).toEqual([2, 3, 1]);
  });

  it(`keeps at most ${MAX_HISTORY} results`, () => {
    let h: GameResult[] = [];
    for (let i = 0; i < MAX_HISTORY + 10; i++) h = insertResult(h, result(i, i));
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[h.length - 1].score).toBe(10);
  });
});

describe('cap and unuploaded card-earning results', () => {
  beforeEach(() => useAppStore.setState({ history: [], uploadedIds: [] }));

  it('keeps an unuploaded result worth cards even when it ranks below the cap', () => {
    for (let i = 0; i < MAX_HISTORY; i++) {
      useAppStore.getState().addResult({ score: 300, platforms: 1, pickups: 0, durationMs: 1, playedAt: i });
    }
    // all 50 are uploaded; a new 250 ranks 51st
    useAppStore.getState().markUploaded(useAppStore.getState().history.map((r) => r.id));
    const saved = useAppStore
      .getState()
      .addResult({ score: 250, platforms: 1, pickups: 0, durationMs: 1, playedAt: 99 });
    const s = useAppStore.getState();
    expect(s.history).toHaveLength(MAX_HISTORY + 1);
    expect(s.history.map((r) => r.id)).toContain(saved.id);
    expect(selectPendingUploads(s).map((r) => r.id)).toEqual([saved.id]);

    // once uploaded it may be trimmed by the next insert
    s.markUploaded([saved.id]);
    expect(useAppStore.getState().uploadedIds).toContain(saved.id);
    useAppStore.getState().addResult({ score: 10, platforms: 1, pickups: 0, durationMs: 1, playedAt: 100 });
    expect(useAppStore.getState().history).toHaveLength(MAX_HISTORY);
    expect(useAppStore.getState().history.map((r) => r.id)).not.toContain(saved.id);
    expect(useAppStore.getState().uploadedIds).not.toContain(saved.id);
  });

  it('still trims unuploaded results that earn no cards', () => {
    let h: GameResult[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = insertResult(h, result(50, i));
    expect(h).toHaveLength(MAX_HISTORY);
  });
});
