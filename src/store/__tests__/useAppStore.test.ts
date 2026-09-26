import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { insertResult, MAX_HISTORY, type GameResult } from '../useAppStore';

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
