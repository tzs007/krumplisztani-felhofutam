import animationsJson from '@/assets/sprites/animations.json';

/**
 * Sprite registry: spriteKey → PNG. The file name IS the key, so a sprite
 * can be replaced by dropping a new PNG (128×128 per frame; cloud: 256×128)
 * into assets/sprites/. Regenerate the placeholders with `npm run sprites`.
 * Animated sprites are horizontal sheets described in animations.json.
 */
export const spriteSources = {
  platform_grass_left: require('@/assets/sprites/platform_grass_left.png'),
  platform_grass_mid: require('@/assets/sprites/platform_grass_mid.png'),
  platform_grass_right: require('@/assets/sprites/platform_grass_right.png'),
  platform_grass_single: require('@/assets/sprites/platform_grass_single.png'),
  platform_blue_left: require('@/assets/sprites/platform_blue_left.png'),
  platform_blue_mid: require('@/assets/sprites/platform_blue_mid.png'),
  platform_blue_right: require('@/assets/sprites/platform_blue_right.png'),
  platform_blue_single: require('@/assets/sprites/platform_blue_single.png'),
  platform_brick_left: require('@/assets/sprites/platform_brick_left.png'),
  platform_brick_mid: require('@/assets/sprites/platform_brick_mid.png'),
  platform_brick_right: require('@/assets/sprites/platform_brick_right.png'),
  platform_brick_single: require('@/assets/sprites/platform_brick_single.png'),
  pickup_coin: require('@/assets/sprites/pickup_coin.png'),
  pickup_coin_collect: require('@/assets/sprites/pickup_coin_collect.png'),
  hazard_orange: require('@/assets/sprites/hazard_orange.png'),
  pickup_double_score: require('@/assets/sprites/pickup_double_score.png'),
  pickup_double_jump: require('@/assets/sprites/pickup_double_jump.png'),
  player_jump: require('@/assets/sprites/player_jump.png'),
  player_jump_double_jump: require('@/assets/sprites/player_jump_double_jump.png'),
  player_fall: require('@/assets/sprites/player_fall.png'),
  player_hurt: require('@/assets/sprites/player_hurt.png'),
  player_bonus: require('@/assets/sprites/player_bonus.png'),
  player_bonus_coin: require('@/assets/sprites/player_bonus_coin.png'),
  player_bonus_double_score: require('@/assets/sprites/player_bonus_double_score.png'),
  player_bonus_double_jump: require('@/assets/sprites/player_bonus_double_jump.png'),
  cloud: require('@/assets/sprites/cloud.png'),
} as const;

export type SpriteKey = keyof typeof spriteSources;

/** Stable order: the draw list references sprites by index into this array. */
export const SPRITE_KEYS = Object.keys(spriteSources) as SpriteKey[];
const indexByKey = new Map(SPRITE_KEYS.map((k, i) => [k, i]));

export function spriteIndex(key: string): number {
  const i = indexByKey.get(key as SpriteKey);
  if (i === undefined) throw new Error(`Unknown sprite "${key}"`);
  return i;
}

export function hasSprite(key: string): key is SpriteKey {
  return indexByKey.has(key as SpriteKey);
}

/** Length of a one-shot animation in ms (Infinity for looping or velocity sheets, 0 for single images). */
export function animationDurationMs(key: SpriteKey): number {
  const anim = spriteAnimations[key];
  if (!anim || anim.frames <= 1) return 0;
  if (anim.mode === 'velocity' || anim.loop) return Infinity;
  return (anim.frames / (anim.fps ?? 10)) * 1000;
}

export type SpriteAnimation = {
  frames: number;
  /** "time" (default) plays at fps; "velocity" picks the frame from the jump progress. */
  mode?: 'time' | 'velocity';
  fps?: number;
  loop?: boolean;
  /** Generator only: which frames of the source strip to keep. */
  sourceFrames?: number[];
};

const { $comment: _, ...animationEntries } = animationsJson;
export const spriteAnimations = animationEntries as Partial<Record<SpriteKey, SpriteAnimation>>;

/**
 * Frame to show.
 * - time mode: `elapsedMs` after the animation started; looping sheets wrap,
 *   one-shot sheets hold their last frame.
 * - velocity mode: the last frame is the landing / going-down pose (progress 1);
 *   the other frames spread over the way up by `progress` 0 (take-off) … <1 (apex).
 * Single images are always frame 0.
 */
export function spriteFrame(
  key: SpriteKey,
  elapsedMs: number,
  progress = 0,
): { frame: number; frames: number } {
  const anim = spriteAnimations[key];
  if (!anim || anim.frames <= 1) return { frame: 0, frames: 1 };
  if (anim.mode === 'velocity') {
    const last = anim.frames - 1;
    const p = Math.min(1, Math.max(0, progress));
    return { frame: p >= 1 ? last : Math.floor(p * last), frames: anim.frames };
  }
  const n = Math.floor((Math.max(0, elapsedMs) / 1000) * (anim.fps ?? 10));
  return { frame: anim.loop ? n % anim.frames : Math.min(n, anim.frames - 1), frames: anim.frames };
}
