import { defaultGameConfig, type GameConfig } from '../config';
import { easterEggs, getEasterEgg } from '../easterEggs';
import { createRng } from '../engine/random';
import { easterEggItemDef, World, type GameEvent } from '../engine/World';
import { hasSprite } from '../render/sprites';

const DT = 1 / 120;
const withChance = (chancePerGame: number): GameConfig => ({
  ...defaultGameConfig,
  camera: {
    ...defaultGameConfig.camera,
    autoScrollSpeed: 0,
    autoScrollPerDifficulty: 0,
  },
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  // these tests cover the main level's easter egg (off by default: bonus level only)
  easterEggs: { ...defaultGameConfig.easterEggs, sections: ['main'], chancePerGame },
});

/** A tall view generates many chunks at once (the real level chunks). */
const bigWorld = (chance: number, seed = 1) =>
  new World({
    config: withChance(chance),
    viewHeight: 400,
    rng: createRng(seed),
  });

describe('easter egg content', () => {
  it('has unique ids and a title + description for each', () => {
    const ids = easterEggs.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of easterEggs) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(getEasterEgg(e.id)).toBe(e);
    }
  });
});

describe('easter egg in-level object (abstract)', () => {
  it('every meme resolves to a registered sprite with a size and placement', () => {
    for (const e of easterEggs) {
      const item = easterEggItemDef(e.id, defaultGameConfig);
      expect(hasSprite(item.spriteKey)).toBe(true);
      expect(item.size).toBeGreaterThan(0);
      expect(['ground', 'hover']).toContain(item.placement);
    }
  });

  it('falls back to the config default (the pumpkin)', () => {
    expect(easterEggItemDef('placeholder-1', defaultGameConfig)).toEqual(defaultGameConfig.easterEggs.defaultItem);
  });

  it('a meme can bring its own object; the world uses it', () => {
    const meme = easterEggs[0];
    const original = meme.item;
    meme.item = { spriteKey: 'pickup_coin', size: 0.8, placement: 'hover' };
    try {
      expect(easterEggItemDef(meme.id, defaultGameConfig)).toEqual({
        spriteKey: 'pickup_coin',
        size: 0.8,
        placement: 'hover',
      });
      // only this meme in the draw → the object must be the coin, hovering
      for (let seed = 1; seed <= 30; seed++) {
        const [egg] = bigWorld(1, seed).easterEggs;
        if (egg.eggId !== meme.id) continue;
        expect(egg).toMatchObject({ spriteKey: 'pickup_coin', size: 0.8, placement: 'hover' });
        expect(egg.y % 1).toBeCloseTo(0.15); // lifted above the platform top
      }
    } finally {
      meme.item = original;
    }
  });

  it('partial item overrides keep the other defaults', () => {
    const meme = easterEggs[0];
    const original = meme.item;
    meme.item = { size: 2 };
    try {
      expect(easterEggItemDef(meme.id, defaultGameConfig)).toEqual({
        ...defaultGameConfig.easterEggs.defaultItem,
        size: 2,
      });
    } finally {
      meme.item = original;
    }
  });
});

describe('easter egg drop rate', () => {
  const CHUNK_ROWS = 9;
  const { chunkRange } = defaultGameConfig.easterEggs;

  it('never appears with chance 0', () => {
    expect(bigWorld(0).easterEggs).toEqual([]);
  });

  it('with chance 1: exactly one per game, never more', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = bigWorld(1, seed);
      expect(world.easterEggs).toHaveLength(1);
      expect(easterEggs.map((e) => e.id)).toContain(world.easterEggs[0].eggId);
    }
  });

  it('the default 10% means about one game in ten has it (never more than one)', () => {
    const games = 2000;
    let withEgg = 0;
    for (let seed = 1; seed <= games; seed++) {
      const n = bigWorld(defaultGameConfig.easterEggs.chancePerGame, seed).easterEggs.length;
      expect(n).toBeLessThanOrEqual(1);
      withEgg += n;
    }
    expect(withEgg / games).toBeGreaterThan(0.08);
    expect(withEgg / games).toBeLessThan(0.12);
  });

  it('is hidden in the reachable chunk range, never in the start chunk', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const [egg] = bigWorld(1, seed).easterEggs;
      const chunk = Math.floor((egg.y - 1) / CHUNK_ROWS); // 0 = start chunk
      expect(chunk).toBeGreaterThanOrEqual(chunkRange[0]);
      // +1: moves on to the next chunk if the drawn one had no free tile
      expect(chunk).toBeLessThanOrEqual(chunkRange[1] + 1);
    }
  });

  it('pumpkins stand on a free platform tile', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = bigWorld(1, seed);
      for (const egg of world.easterEggs) {
        const col = Math.round(egg.x + egg.size / 2 - 0.5);
        const platform = world.platforms.find((p) => p.y === egg.y && col >= p.x && col < p.x + p.width);
        expect(platform).toBeDefined();
        const busy = [...world.pickups, ...world.hazards].some(
          (it) => Math.round(it.x + it.size / 2 - 0.5) === col && Math.floor(it.y) === egg.y,
        );
        expect(busy).toBe(false);
      }
    }
  });
});

describe('finding an easter egg', () => {
  it('touching the pumpkin fires an easterEgg event and removes it; it does not hover', () => {
    const world = new World({
      config: withChance(0),
      viewHeight: 18,
      rng: createRng(1),
      chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
      startChunk: {
        id: 'start',
        difficulty: 0,
        map: ['.........', '....P....', '#########'],
      },
    });
    // pumpkin on the ground right where the player lands
    world.easterEggs.push({
      id: 999,
      x: 3.95,
      y: 1,
      size: 1.125,
      spriteKey: 'easter_pumpkin',
      placement: 'ground',
      eggId: 'placeholder-1',
    });
    const y0 = world.easterEggs[0].y;
    const events: GameEvent[] = [];
    for (let t = 0; t < 0.5 && world.easterEggs.length > 0; t += DT) {
      expect(world.easterEggs[0].y).toBe(y0);
      events.push(...world.step(DT, { dragging: false, dx: 0 }));
    }
    expect(events).toContainEqual({
      type: 'easterEgg',
      eggId: 'placeholder-1',
    });
    expect(world.easterEggs).toEqual([]);
    expect(world.stats.easterEggs).toBe(1);
  });
});
