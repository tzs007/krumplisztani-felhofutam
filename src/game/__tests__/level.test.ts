import { defaultGameConfig } from '../config';
import { createRng } from '../engine/random';
import { chunks, startChunk } from '../level/chunks';
import { LevelGenerator } from '../level/generator';
import { parseChunk } from '../level/parser';
import { tiles } from '../level/tiles';

const { columns, maxJumpTiles } = defaultGameConfig;
const MAX_GAP = maxJumpTiles - 1;

describe('parseChunk', () => {
  it('merges adjacent same-variant tiles and uses bottom-up rows', () => {
    const parsed = parseChunk(['..C......', '.###==...', '....P....', '#########'], columns);
    expect(parsed.height).toBe(4);
    expect(parsed.platforms).toEqual([
      expect.objectContaining({ col: 1, row: 2, width: 3, variant: 'grass' }),
      expect.objectContaining({ col: 4, row: 2, width: 2, variant: 'blue' }),
      expect.objectContaining({ col: 0, row: 0, width: 9, variant: 'grass' }),
    ]);
    expect(parsed.pickups).toEqual([expect.objectContaining({ col: 2, row: 3, effect: 'bonus' })]);
    expect(parsed.spawn).toEqual({ col: 4, row: 1 });
  });

  it('pads short rows and rejects too wide ones', () => {
    expect(parseChunk(['#'], columns).platforms[0].width).toBe(1);
    expect(() => parseChunk(['##########'], columns)).toThrow(/columns/);
  });

  it('rejects unknown tile chars', () => {
    expect(() => parseChunk(['?'], columns)).toThrow(/Unknown tile/);
  });
});

describe('authored chunks', () => {
  const all = [startChunk, ...chunks];

  it.each(all.map((c) => [c.id, c] as const))('%s uses only known tiles and fits the grid', (_, chunk) => {
    for (const row of chunk.map) {
      expect(row.length).toBe(columns);
      for (const ch of row) expect(tiles[ch]).toBeDefined();
    }
  });

  it.each(all.map((c) => [c.id, c] as const))('%s has pickups resting on platforms', (_, chunk) => {
    const parsed = parseChunk(chunk.map, columns);
    for (const pk of parsed.pickups) {
      const below = parsed.platforms.find((p) => p.row === pk.row - 1 && pk.col >= p.col && pk.col < p.col + p.width);
      expect(below).toBeDefined();
    }
  });

  it('keeps every platform reachable, also across chunk boundaries', () => {
    const gen = new LevelGenerator(defaultGameConfig, createRng(42));
    const rows = new Set<number>();
    for (const placed of [gen.placeStart(), ...Array.from({ length: 200 }, () => gen.next())]) {
      for (const p of placed.platforms) rows.add(placed.baseRow + p.row);
    }
    const sorted = [...rows].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeLessThanOrEqual(MAX_GAP);
    }
  });
});

describe('LevelGenerator', () => {
  it('raises difficulty with height and caps it', () => {
    const gen = new LevelGenerator(defaultGameConfig, createRng(1));
    const { rowsPerDifficulty, maxDifficulty } = defaultGameConfig.generation;
    expect(gen.difficultyAt(0)).toBe(0);
    expect(gen.difficultyAt(rowsPerDifficulty)).toBe(1);
    expect(gen.difficultyAt(rowsPerDifficulty * 100)).toBe(maxDifficulty);
  });

  it('never picks chunks harder than the current level and gets narrower higher up', () => {
    const gen = new LevelGenerator(defaultGameConfig, createRng(7));
    gen.placeStart();
    const byId = new Map(chunks.map((c) => [c.id, c]));
    const widthsLow: number[] = [];
    const widthsHigh: number[] = [];
    for (let i = 0; i < 300; i++) {
      const level = gen.difficultyAt(gen.topRow);
      const placed = gen.next();
      expect(byId.get(placed.id)!.difficulty).toBeLessThanOrEqual(level);
      const widths = placed.platforms.map((p) => p.width);
      (level === 0 ? widthsLow : widthsHigh).push(...widths);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(widthsHigh)).toBeLessThan(avg(widthsLow));
  });

  it('is random between runs but reproducible with the same seed', () => {
    const seq = (seed: number) => {
      const gen = new LevelGenerator(defaultGameConfig, createRng(seed));
      return Array.from({ length: 20 }, () => gen.next().id).join();
    };
    expect(seq(3)).toBe(seq(3));
    expect(seq(3)).not.toBe(seq(4));
  });
});
