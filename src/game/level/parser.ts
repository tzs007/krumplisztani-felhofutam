import type { EffectId } from '../engine/effects/EffectRegistry';
import { DEFAULT_PICKUP_SIZE, getTile, type PlatformVariant } from './tiles';

/** A run of adjacent same-variant platform tiles. `row` is counted upward from the chunk bottom. */
export type ParsedPlatform = { col: number; row: number; width: number; variant: PlatformVariant; spriteKey: string };
export type ParsedPickup = { col: number; row: number; effect: EffectId; spriteKey: string; size: number };
export type ParsedHazard = { col: number; row: number; spriteKey: string; size: number };
export type ParsedChunk = {
  height: number;
  platforms: ParsedPlatform[];
  pickups: ParsedPickup[];
  hazards: ParsedHazard[];
  spawn?: { col: number; row: number };
};

/**
 * Turns a top→bottom string matrix into entities with bottom-up row indices,
 * so rows can be offset directly into world space (y grows upward).
 */
export function parseChunk(map: string[], columns: number): ParsedChunk {
  const height = map.length;
  const platforms: ParsedPlatform[] = [];
  const pickups: ParsedPickup[] = [];
  const hazards: ParsedHazard[] = [];
  let spawn: ParsedChunk['spawn'];

  map.forEach((line, lineIndex) => {
    if (line.length > columns) {
      throw new Error(`Row ${lineIndex} is ${line.length} wide, grid has ${columns} columns`);
    }
    const row = height - 1 - lineIndex;
    const cells = line.padEnd(columns, ' ');
    let run: ParsedPlatform | null = null;

    for (let col = 0; col < columns; col++) {
      const tile = getTile(cells[col]);
      if (tile.kind === 'platform') {
        if (run && run.variant === tile.variant && run.col + run.width === col) {
          run.width++;
        } else {
          run = { col, row, width: 1, variant: tile.variant, spriteKey: tile.spriteKey };
          platforms.push(run);
        }
        continue;
      }
      run = null;
      if (tile.kind === 'pickup') {
        pickups.push({ col, row, effect: tile.effect, spriteKey: tile.spriteKey, size: tile.size ?? DEFAULT_PICKUP_SIZE });
      }
      if (tile.kind === 'hazard') hazards.push({ col, row, spriteKey: tile.spriteKey, size: tile.size });
      if (tile.kind === 'spawn') spawn = { col, row };
    }
  });

  return { height, platforms, pickups, hazards, spawn };
}
