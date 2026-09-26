import type { EffectId } from '../engine/effects/EffectRegistry';

export type PlatformVariant = 'grass' | 'blue' | 'brick';

export type TileDef =
  | { kind: 'empty' }
  | { kind: 'spawn' }
  | { kind: 'platform'; variant: PlatformVariant; spriteKey: string }
  | { kind: 'pickup'; effect: EffectId; spriteKey: string };

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
  C: { kind: 'pickup', effect: 'bonus', spriteKey: 'pickup_coin' },
  X: { kind: 'pickup', effect: 'doubleScore', spriteKey: 'pickup_double_score' },
  J: { kind: 'pickup', effect: 'doubleJump', spriteKey: 'pickup_double_jump' },
};

export function getTile(char: string): TileDef {
  const def = tiles[char];
  if (!def) throw new Error(`Unknown tile char "${char}"`);
  return def;
}
