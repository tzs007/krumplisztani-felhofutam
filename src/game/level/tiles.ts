import type { EffectId } from '../engine/effects/EffectRegistry';

export type PlatformVariant = 'grass' | 'blue' | 'brick' | 'byzantine' | 'emerald' | 'topaz' | 'ruby' | 'planks';

export type TileDef =
  | { kind: 'empty' }
  | { kind: 'spawn' }
  | { kind: 'platform'; variant: PlatformVariant; spriteKey: string }
  /**
   * size: drawn size and hitbox in tiles (default DEFAULT_PICKUP_SIZE), centred on its cell.
   * bob: how it floats up and down (default DEFAULT_PICKUP_BOB), visual only.
   */
  | { kind: 'pickup'; effect: EffectId; spriteKey: string; size?: number; bob?: PickupBob }
  /** Hovers above the platform below it; touching it hurts (see config.hazards). */
  | { kind: 'hazard'; spriteKey: string; size: number }
  /** Takes the player to another section of the run (e.g. the exit of the bonus level). */
  | { kind: 'portal'; spriteKey: string; size: number };

export const DEFAULT_PICKUP_SIZE = 0.6;

/** Sprite family of a platform variant (as in the tile legend below): "platform_<variant>". */
export function platformSpriteKey(variant: PlatformVariant): string {
  return `platform_${variant}`;
}

/** Floating motion of a pickup: amplitude in tiles, frequency in Hz. */
export type PickupBob = { tiles: number; hz: number };
export const DEFAULT_PICKUP_BOB: PickupBob = { tiles: 0.06, hz: 0.8 };

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
  Z: { kind: 'platform', variant: 'byzantine', spriteKey: 'platform_byzantine' },
  // portal: in the bonus level the exit back to the main level
  G: { kind: 'portal', spriteKey: 'portal', size: 1.3 },
  E: { kind: 'platform', variant: 'emerald', spriteKey: 'platform_emerald' },
  T: { kind: 'platform', variant: 'topaz', spriteKey: 'platform_topaz' },
  R: { kind: 'platform', variant: 'ruby', spriteKey: 'platform_ruby' },
  W: { kind: 'platform', variant: 'planks', spriteKey: 'platform_planks' },
  // score card: what the levels use for points now; floats clearly, like it's hovering
  K: { kind: 'pickup', effect: 'bonus', spriteKey: 'pickup_card', size: 1.2, bob: { tiles: 0.15, hz: 0.5 } },
  // coin: kept as a component for later (not placed in the levels at the moment)
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
