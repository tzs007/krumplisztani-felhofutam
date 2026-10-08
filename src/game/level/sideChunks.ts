import type { LevelChunk } from './chunks';

/**
 * Bonus level chunks, read LEFT → RIGHT and TOP → BOTTOM like the main
 * level's, but laid side by side. The ground is not drawn here: the section
 * adds one continuous floor under all of them (so nobody can fall), and the
 * bottom row of a chunk is the row just above that floor.
 *
 * A jump is ~4 tiles high and ~5 tiles long at running speed, so platforms
 * sit at most 3 rows above what the chick can stand on.
 * Legend: see tiles.ts ('#' '=' 'B' platforms, K X J pickups, O orange, G portal).
 * `difficulty` is unused here (all chunks are equal).
 */
export const sideStart: LevelChunk = {
  id: 'side-start',
  difficulty: 0,
  map: ['............'],
};

/** Ends with the exit portal standing on the ground. */
export const sideEnd: LevelChunk = {
  id: 'side-end',
  difficulty: 0,
  map: ['...K.....K...G'],
};

export const sideChunks: LevelChunk[] = [
  {
    id: 'side-cards',
    difficulty: 0,
    map: [
      '..............',
      '..K...K...K...',
    ],
  },
  {
    id: 'side-stairs',
    difficulty: 0,
    map: [
      '.........K....',
      '......###.....',
      '..K...........',
      '.###..........',
    ],
  },
  {
    id: 'side-orange-hop',
    difficulty: 0,
    map: [
      '.....K....',
      '..........',
      '....O.....',
    ],
  },
  {
    id: 'side-bridge',
    difficulty: 0,
    map: [
      '....X.......',
      '............',
      '..########..',
      '............',
    ],
  },
  {
    id: 'side-two-oranges',
    difficulty: 0,
    map: [
      '............',
      '...O....O...',
    ],
  },
  {
    id: 'side-high-card',
    difficulty: 0,
    map: [
      '......K.....',
      '............',
      '....###.....',
      '............',
    ],
  },
  {
    id: 'side-boost',
    difficulty: 0,
    map: [
      '.......J....',
      '............',
    ],
  },
];
