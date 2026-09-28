/**
 * Level chunks: hand-authored tile matrices, read TOP → BOTTOM.
 * The generator stacks randomly picked chunks on top of each other forever.
 *
 * Rules (enforced by tests in src/game/__tests__/level.test.ts):
 * - every row is exactly `columns` wide (9)
 * - the vertical gap between consecutive platform rows (also across chunk
 *   boundaries) is at most maxJumpTiles - 1
 * - a pickup must sit directly above a platform tile
 *
 * - a hazard (O) hovers directly above a platform at least 3 tiles wide, so
 *   there is always somewhere safe to land
 *
 * Legend: see tiles.ts ('.' or ' ' empty, '#' '=' 'B' platforms, K X J pickups (C coin: spare), O hazard, P spawn)
 */
export type LevelChunk = {
  id: string;
  /** 0 = widest platforms … maxDifficulty = narrowest. */
  difficulty: number;
  map: string[];
};

export const startChunk: LevelChunk = {
  id: 'start',
  difficulty: 0,
  map: [
    '.........',
    '.........',
    '.####....',
    '.........',
    '.........',
    '....====.',
    '.........',
    '....P....',
    '#########',
  ],
};

export const chunks: LevelChunk[] = [
  // ── difficulty 0: 4-wide platforms ──────────────────────────
  {
    id: 'easy-01',
    difficulty: 0,
    map: [
      '.........',
      '.........',
      '....####.',
      '.........',
      '.........',
      '.====....',
      '.........',
      '...K.....',
      '..####...',
    ],
  },
  {
    id: 'easy-02',
    difficulty: 0,
    map: [
      '.........',
      '.........',
      '####.....',
      '.........',
      '.........',
      '.....BBBB',
      '.........',
      '.........',
      '..####...',
    ],
  },
  {
    id: 'easy-03',
    difficulty: 0,
    map: [
      '.........',
      '.........',
      '.======..',
      '.........',
      '.........',
      '######...',
      '.........',
      '......X..',
      '....####.',
    ],
  },
  {
    id: 'easy-04',
    difficulty: 0,
    map: [
      '.........',
      '.O.......',
      '.####....',
      '.........',
      '.........',
      '....====.',
      '.........',
      '......K..',
      '....####.',
    ],
  },
  // ── difficulty 1: 3-wide platforms ──────────────────────────
  {
    id: 'mid-01',
    difficulty: 1,
    map: [
      '.........',
      '.........',
      '.###.....',
      '.........',
      '.........',
      '.....===.',
      '.........',
      '..K......',
      '.###.....',
    ],
  },
  {
    id: 'mid-02',
    difficulty: 1,
    map: [
      '.........',
      '.........',
      '......BBB',
      '.........',
      '.........',
      '..###....',
      '.........',
      'J........',
      '###......',
    ],
  },
  {
    id: 'mid-03',
    difficulty: 1,
    map: [
      '.........',
      '.........',
      '###...###',
      '.........',
      '.........',
      '...===...',
      '.........',
      '.........',
      '#.......#',
    ],
  },
  {
    id: 'mid-04',
    difficulty: 1,
    map: [
      '.........',
      '.......O.',
      '.....###.',
      '.........',
      '.........',
      '.###.....',
      '.........',
      '.........',
      '...###...',
    ],
  },
  // ── difficulty 2: 2-wide platforms ──────────────────────────
  {
    id: 'hard-01',
    difficulty: 2,
    map: [
      '.........',
      '.........',
      '.##......',
      '.........',
      '.........',
      '.....==..',
      '.........',
      '.X.......',
      '.BB......',
    ],
  },
  {
    id: 'hard-02',
    difficulty: 2,
    map: [
      '.........',
      '.......##',
      '.........',
      '...==....',
      '.........',
      '.........',
      '##.......',
      '.........',
      '.....##..',
    ],
  },
  {
    id: 'hard-03',
    difficulty: 2,
    map: [
      '.........',
      '.........',
      '.##......',
      '.........',
      '.O.......',
      '.###.....',
      '.........',
      '.........',
      '.....##..',
    ],
  },
  // ── difficulty 3: single tiles ──────────────────────────────
  {
    id: 'expert-01',
    difficulty: 3,
    map: [
      '.........',
      '.........',
      '..#......',
      '.........',
      '.........',
      '......=..',
      '.........',
      '...K.....',
      '...B.....',
    ],
  },
  {
    id: 'expert-02',
    difficulty: 3,
    map: [
      '.........',
      '........#',
      '.........',
      '....=....',
      '.........',
      '.........',
      '#........',
      '.........',
      '.....B...',
    ],
  },
];
