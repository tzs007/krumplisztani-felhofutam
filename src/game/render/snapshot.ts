import { derivePhysics } from '../config';
import type { Player, World } from '../engine/World';
import { animationDurationMs, hasSprite, spriteFrame, spriteIndex, type SpriteKey } from './sprites';

/**
 * Flat, serialisable draw list handed to the UI-thread renderer every frame.
 * Each command is 8 numbers: [op, arg, frame, frames, a, b, c, d] in SCREEN pixels.
 *  op 0 = fill rect      (arg = palette color;  x, y, w, h)
 *  op 1 = stroke rect    (arg = palette color;  x, y, w, h)
 *  op 2 = line           (arg = palette color;  x1, y1, x2, y2)
 *  op 3 = sprite         (arg = sprite index, frame of `frames` in the sheet;  x, y, w, h)
 *  op 4 = sprite, mirrored horizontally
 */
export const Op = { fill: 0, stroke: 1, line: 2, sprite: 3, spriteFlipped: 4 } as const;
export const STRIDE = 8;

export type PlatformPart = 'left' | 'mid' | 'right' | 'single';

/** Which edge sprite a tile of a platform run uses. */
export function platformPart(index: number, width: number): PlatformPart {
  if (width === 1) return 'single';
  if (index === 0) return 'left';
  if (index === width - 1) return 'right';
  return 'mid';
}

/** Effect id → sprite suffix: doubleJump → double_jump. */
const effectSuffix = (id: string) => id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * - Right after a pickup: the item's pose (pickup_coin → player_bonus_coin),
 *   or the generic player_bonus.
 * - Falling pose only after a real drop (≥ fallPoseAfterTiles below the jump's
 *   apex); the top of a normal hop keeps the jump animation.
 * - Jumping while a timed effect is active uses player_jump_<effect> when it
 *   exists (doubleJump → player_jump_double_jump).
 */
export function playerSpriteKey(
  player: Player,
  time: number,
  fallPoseAfterTiles: number,
  activeEffects: readonly string[] = [],
): SpriteKey {
  if (time < player.bonusUntil) {
    const specific = player.bonusSpriteKey?.replace(/^pickup_/, 'player_bonus_');
    return specific && hasSprite(specific) ? specific : 'player_bonus';
  }
  const fallen = player.apexY - player.y;
  if (player.vy <= 0 && fallen >= fallPoseAfterTiles) return 'player_fall';
  for (const id of activeEffects) {
    const key = `player_jump_${effectSuffix(id)}`;
    if (hasSprite(key)) return key;
  }
  return 'player_jump';
}

/** Milliseconds since the current player animation started. */
export function playerAnimElapsed(player: Player, time: number, bonusPoseMs: number): number {
  if (time < player.bonusUntil) return time - (player.bonusUntil - bonusPoseMs);
  return time - player.landedAt;
}

const SQUASH_MS = 120;
const SQUASH = 0.12;
const STRETCH = 0.06;

/**
 * Procedural squash & stretch (no extra frames needed): wide and flat right
 * after take-off, then tall and thin while rising fast. Area stays ~constant.
 */
export function playerScale(player: Player, time: number, jumpVelocity: number): { sx: number; sy: number } {
  const since = time - player.landedAt;
  if (since >= 0 && since < SQUASH_MS) {
    const k = 1 - since / SQUASH_MS;
    return { sx: 1 + SQUASH * k, sy: 1 - SQUASH * k };
  }
  if (player.vy > 0) {
    const s = STRETCH * Math.min(1, player.vy / jumpVelocity);
    return { sx: 1 - s, sy: 1 + s };
  }
  return { sx: 1, sy: 1 };
}

/**
 * Drives velocity-mode animations: 0 at take-off (full upward speed) … just
 * under 1 near the apex; exactly 1 = landing / going down (the last frame).
 * The landing squash counts as "landing", so the take-off pose appears only
 * once the player is actually moving up — not at the moment of touching down.
 * A boosted jump starts faster, so it stays on the first frame a bit longer.
 */
export function jumpProgress(player: Player, time: number, jumpVelocity: number): number {
  const since = time - player.landedAt;
  if ((since >= 0 && since < SQUASH_MS) || player.vy <= 0) return 1;
  return Math.min(0.999, 1 - Math.min(1, player.vy / jumpVelocity));
}

/** Cloud layout in tiles, repeating every CLOUD_PERIOD rows, drawn with parallax. */
const CLOUD_PERIOD = 24;
const CLOUD_PARALLAX = 0.3;
const clouds = [
  { x: 0.4, y: 3, w: 2.4 },
  { x: 5.6, y: 8, w: 2.8 },
  { x: 2.6, y: 14, w: 1.8 },
  { x: 6.2, y: 19, w: 2.2 },
];

/** Pickups gently float up and down; the per-id phase keeps them out of sync. */
const BOB_TILES = 0.06;
const BOB_HZ = 0.8;
const pickupPhaseMs = (id: number) => id * 137;

const cloudSprite = spriteIndex('cloud');

export function buildSnapshot(world: World, tileSize: number, screenHeight: number): number[] {
  const out: number[] = [];
  const cols = world.config.columns;
  const t = tileSize;
  // world y (up) → screen y (down)
  const sy = (y: number) => screenHeight - (y - world.cameraY) * t;
  const sprite = (
    op: number,
    key: SpriteKey,
    elapsedMs: number,
    x: number,
    y: number,
    w: number,
    h: number,
    progress?: number,
  ) => {
    const { frame, frames } = spriteFrame(key, elapsedMs, progress);
    out.push(op, spriteIndex(key), frame, frames, x, y, w, h);
  };

  // background clouds (parallax), 2:1 sprite
  const cloudCam = world.cameraY * CLOUD_PARALLAX;
  const firstPeriod = Math.floor(cloudCam / CLOUD_PERIOD) - 1;
  for (let k = firstPeriod; k <= firstPeriod + 3; k++) {
    for (const c of clouds) {
      const bottom = screenHeight - (k * CLOUD_PERIOD + c.y - cloudCam) * t;
      const h = (c.w / 2) * t;
      if (bottom < 0 || bottom - h > screenHeight) continue;
      out.push(Op.sprite, cloudSprite, 0, 1, c.x * t, bottom - h, c.w * t, h);
    }
  }

  const visible = (bottom: number, top: number) => top >= world.cameraY && bottom <= world.cameraY + world.viewHeight;

  // platforms: one sprite per tile; the sprite's top edge is the walkable surface
  for (const pl of world.platforms) {
    if (!visible(pl.y - 1, pl.y)) continue;
    const y = sy(pl.y);
    for (let i = 0; i < pl.width; i++) {
      const key = `${pl.spriteKey}_${platformPart(i, pl.width)}` as SpriteKey;
      sprite(Op.sprite, key, world.time, ((pl.x + i) % cols) * t, y, t, t);
    }
  }

  for (const pk of world.pickups) {
    if (!visible(pk.y, pk.y + pk.size)) continue;
    const phase = world.time + pickupPhaseMs(pk.id);
    const bob = Math.sin((phase / 1000) * BOB_HZ * 2 * Math.PI) * BOB_TILES;
    sprite(Op.sprite, pk.spriteKey as SpriteKey, phase, pk.x * t, sy(pk.y + pk.size + bob), pk.size * t, pk.size * t);
  }

  // collect animations (<pickup>_collect) play once where the pickup was taken
  for (const c of world.collected) {
    const key = `${c.spriteKey}_collect`;
    if (!hasSprite(key)) continue;
    const elapsed = world.time - c.collectedAt;
    if (elapsed >= animationDurationMs(key)) continue;
    sprite(Op.sprite, key, elapsed, c.x * t, sy(c.y + c.size), c.size * t, c.size * t);
  }

  // player: 1-tile sprite centred on the hitbox, feet on the hitbox bottom,
  // squashed/stretched around the feet; drawn twice while crossing the edge
  const p = world.player;
  const op = p.facing < 0 ? Op.spriteFlipped : Op.sprite;
  const active = world.effects.getActive(world.time).map((e) => e.id);
  const key = playerSpriteKey(p, world.time, world.config.player.fallPoseAfterTiles, active);
  const elapsed = playerAnimElapsed(p, world.time, world.config.player.bonusPoseMs);
  const { jumpVelocity } = derivePhysics(world.config);
  const { sx, sy: sY } = playerScale(p, world.time, jumpVelocity);
  const progress = jumpProgress(p, world.time, jumpVelocity);
  const w = t * sx;
  const h = t * sY;
  const drawPlayer = (px: number) =>
    sprite(op, key, elapsed, (px + p.w / 2) * t - w / 2, sy(p.y) - h, w, h, progress);
  drawPlayer(p.x);
  if (p.x + p.w > cols) drawPlayer(p.x - cols);

  return out;
}
