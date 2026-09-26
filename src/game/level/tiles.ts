import type { EffectId } from '../engine/effects/EffectRegistry';

export type PlatformVariant = 'grass' | 'blue' | 'brick';

export type TileDef =
  | { kind: 'empty' }
  | { kind: 'spawn' }
  | { kind: 'platform'; variant: PlatformVariant; spriteKey: string }
  /** size: drawn size and hitbox in tiles (default DEFAULT_PICKUP_SIZE), centred on its cell. */
  | { kind: 'pickup'; effect: EffectId; spriteKey: string; size?: number }
  /** Hovers above the platform below it; touching it hurts (see config.hazards). */
  | { kind: 'hazard'; spriteKey: string; size: number };

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
  // 0.96: the boxed icons fill 87.5% of their sprite, the coin 70% of its 1.2 → same visible size (~0.84 tile)
  X: { kind: 'pickup', effect: 'doubleScore', spriteKey: 'pickup_double_score', size: 0.96 },
  J: { kind: 'pickup', effect: 'doubleJump', spriteKey: 'pickup_double_jump', size: 0.96 },
  O: { kind: 'hazard', spriteKey: 'hazard_orange', size: 1.2 },
};

export function getTile(char: string): TileDef {
  const def = tiles[char];
  if (!def) throw new Error(`Unknown tile char "${char}"`);
  return def;
}
