import type { EffectId } from '../engine/effects/EffectRegistry';

export type PlatformVariant = 'grass' | 'blue' | 'brick';

export type TileDef =
  | { kind: 'empty' }
  | { kind: 'spawn' }
  | { kind: 'platform'; variant: PlatformVariant; spriteKey: string }
  /** size: drawn size and hitbox in tiles (default DEFAULT_PICKUP_SIZE), centred on its cell. */
  | { kind: 'pickup'; effect: EffectId; spriteKey: string; size?: number };

export const DEFAULT_PICKUP_SIZE = 0.6;

/**
 * Tile legend for level matrices. Add a char here to introduce a new tile;
 * `spriteKey` is what a future sprite atlas will be looked up by.
 */
export const tiles: Record<string, TileDef> = {
  ' ': { kind: 'empty' },
  '.': { kind: 'empty' },
  P: { kind: 'spawn' },
  '#': { kind: 'platform', variant: 'grass', spriteKey: 'platform_grass' },
  '=': { kind: 'platform', variant: 'blue', spriteKey: 'platform_blue' },
  B: { kind: 'platform', variant: 'brick', spriteKey: 'platform_brick' },
  C: { kind: 'pickup', effect: 'bonus', spriteKey: 'pickup_coin', size: 1.2 },
  X: { kind: 'pickup', effect: 'doubleScore', spriteKey: 'pickup_double_score' },
  J: { kind: 'pickup', effect: 'doubleJump', spriteKey: 'pickup_double_jump' },
};

export function getTile(char: string): TileDef {
  const def = tiles[char];
  if (!def) throw new Error(`Unknown tile char "${char}"`);
  return def;
}
