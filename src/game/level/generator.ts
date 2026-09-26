import type { GameConfig } from '../config';
import type { Rng } from '../engine/random';
import { chunks as defaultChunks, startChunk as defaultStart, type LevelChunk } from './chunks';
import { parseChunk, type ParsedChunk } from './parser';

export type PlacedChunk = ParsedChunk & { id: string; baseRow: number };

/**
 * Endless level: stacks randomly chosen chunks upward. The difficulty level
 * grows with climbed rows; the current level is picked most often, easier
 * ones still appear for breathing room.
 */
export class LevelGenerator {
  private parsed = new Map<string, ParsedChunk>();
  /** First free row above everything generated so far. */
  topRow = 0;

  constructor(
    private config: GameConfig,
    private rng: Rng,
    private pool: LevelChunk[] = defaultChunks,
    private start: LevelChunk = defaultStart,
  ) {
    for (const c of [start, ...pool]) this.parsed.set(c.id, parseChunk(c.map, config.columns));
  }

  difficultyAt(row: number): number {
    const { rowsPerDifficulty, maxDifficulty } = this.config.generation;
    return Math.min(maxDifficulty, Math.floor(row / rowsPerDifficulty));
  }

  placeStart(): PlacedChunk {
    return this.place(this.start);
  }

  next(): PlacedChunk {
    return this.place(this.pick(this.difficultyAt(this.topRow)));
  }

  private pick(level: number): LevelChunk {
    const current = this.pool.filter((c) => c.difficulty === level);
    const easier = this.pool.filter((c) => c.difficulty < level);
    const from = easier.length > 0 && this.rng() < 0.25 ? easier : current.length > 0 ? current : this.pool;
    return from[Math.floor(this.rng() * from.length)];
  }

  private place(chunk: LevelChunk): PlacedChunk {
    const parsed = this.parsed.get(chunk.id)!;
    const placed = { ...parsed, id: chunk.id, baseRow: this.topRow };
    this.topRow += parsed.height;
    return placed;
  }
}
