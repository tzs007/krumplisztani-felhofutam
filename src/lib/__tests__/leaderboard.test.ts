import { buildBoard, type OwnEntry, type TopEntry } from '../leaderboard';

const top = (n: number): TopEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    userId: `u${i + 1}`,
    name: `Csibe #${1000 + i}`,
    score: 1000 - i * 10,
    playedAt: '2026-01-01',
  }));
const own = (over: Partial<OwnEntry>): OwnEntry => ({
  name: 'Te',
  score: 0,
  playedAt: '2026-01-01',
  rank: 1,
  userId: null,
  ...over,
});

describe('buildBoard', () => {
  it('signed in and in the top 10: own row highlighted in place, no extra row', () => {
    const board = buildBoard(top(10), own({ userId: 'u3', rank: 3, score: 980 }));
    expect(board.rows).toHaveLength(10);
    expect(board.gap).toBe(false);
    expect(board.rows.filter((r) => r.isMe).map((r) => r.rank)).toEqual([3]);
  });

  it('outside the top 10: appended after a gap, red (outside) with the real rank', () => {
    const board = buildBoard(top(10), own({ userId: 'me', rank: 3441, score: 12 }));
    expect(board.rows).toHaveLength(11);
    expect(board.gap).toBe(true);
    expect(board.rows[10]).toMatchObject({ isMe: true, outside: true, rank: 3441, score: 12 });
  });

  it('device-only result that would be in the top 10: slotted in, the rest pushed down, still 10 rows', () => {
    const board = buildBoard(top(10), own({ rank: 4, score: 975 }));
    expect(board.rows).toHaveLength(10);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(board.rows[3]).toMatchObject({ isMe: true, name: 'Te', score: 975 });
    expect(board.rows[4].name).toBe('Csibe #1003'); // former #4 is now #5
    expect(board.rows.some((r) => r.name === 'Csibe #1009')).toBe(false); // former #10 dropped
  });

  it('short board (few players): device result goes to its rank at the end', () => {
    const board = buildBoard(top(2), own({ rank: 3, score: 1 }));
    expect(board.rows.map((r) => [r.rank, r.isMe])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });

  it('no own result: just the top list', () => {
    expect(buildBoard(top(3), null)).toEqual({ rows: expect.any(Array), gap: false });
    expect(buildBoard(top(3), null).rows.some((r) => r.isMe)).toBe(false);
  });
});
