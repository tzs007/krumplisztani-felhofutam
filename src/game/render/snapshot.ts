import { derivePhysics } from '../config';
import { deathScale, isFalling, type Player, type StarParticle, type World } from '../engine/World';
import { animationDurationMs, hasSprite, spriteFrame, spriteIndex, type SpriteKey } from './sprites';

/**
 * Flat, serialisable draw list handed to the UI-thread renderer every frame.
 * Each command is 8 numbers: [op, arg, frame, frames, a, b, c, d] in SCREEN pixels.
 *  op 0 = fill rect      (arg = palette color;  x, y, w, h)
 *  op 1 = stroke rect    (arg = palette color;  x, y, w, h)
 *  op 2 = line           (arg = palette color;  x1, y1, x2, y2)
 *  op 3 = sprite         (arg = sprite index, frame of `frames` in the sheet;  x, y, w, h)
 *  op 4 = sprite, mirrored horizontally
 *  op 5 = backdrop       (arg = sprite index;  _, bottom y, canvas width, height): the image is
 *         scaled to `height` keeping its aspect ratio, centred horizontally, bottom at `bottom y`
 *  op 6 = image by width (arg = sprite index;  x, bottom y, width, _): the whole image at `width`,
 *         height from its own aspect ratio, bottom at `bottom y` (for free-size art like clouds)
 */
export const Op = { fill: 0, stroke: 1, line: 2, sprite: 3, spriteFlipped: 4, backdrop: 5, imageByWidth: 6 } as const;
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
 * - Right after a hazard hit: player_hurt.
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
  hurtPoseMs = 0,
): SpriteKey {
  // hurt pose wins over everything
  if (time - player.hurtAt < hurtPoseMs) return 'player_hurt';
  if (time < player.bonusUntil) {
    const specific = player.bonusSpriteKey?.replace(/^pickup_/, 'player_bonus_');
    return specific && hasSprite(specific) ? specific : 'player_bonus';
  }
  if (isFalling(player, fallPoseAfterTiles)) return 'player_fall';
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

const STAR_POP_MS = 80;
const STAR_SHRINK_FROM = 0.6;

/**
 * Where a burst star is `elapsedMs` after the burst, relative to the burst
 * origin (tiles, y up), and its drawn size; null once it has shrunk away.
 * Pops in quickly, flies out, is pulled back by gravity, shrinks at the end.
 */
export function starState(
  star: StarParticle,
  elapsedMs: number,
  gravity: number,
): { dx: number; dy: number; size: number } | null {
  if (elapsedMs < 0 || elapsedMs >= star.lifeMs) return null;
  const t = elapsedMs / 1000;
  const life = elapsedMs / star.lifeMs;
  const pop = Math.min(1, 0.4 + (0.6 * elapsedMs) / STAR_POP_MS);
  const shrink = life < STAR_SHRINK_FROM ? 1 : 1 - (life - STAR_SHRINK_FROM) / (1 - STAR_SHRINK_FROM);
  return { dx: star.vx * t, dy: star.vy * t - 0.5 * gravity * t * t, size: star.size * pop * shrink };
}

const BLINK_MS = 100;
/** Invulnerability blink: hidden every other BLINK_MS. */
export function isBlinkOff(sinceHitMs: number): boolean {
  return Math.floor(sinceHitMs / BLINK_MS) % 2 === 1;
}

/**
 * Backdrop scroll in screen px: 0 at the start (image bottom on the screen
 * bottom), growing very slowly as the camera climbs, capped when the image
 * top reaches the screen top.
 */
export function backdropOffsetPx(cameraPx: number, parallax: number, maxScrollPx: number): number {
  return Math.min(maxScrollPx, Math.max(0, cameraPx * parallax));
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

  // backdrop sky: taller than the screen, scrolls down very slowly as the camera climbs
  const bg = world.config.background;
  const bgHeight = screenHeight * bg.heightScreens;
  const bgOffset = backdropOffsetPx(world.cameraY * t, bg.parallax, bgHeight - screenHeight);
  out.push(Op.backdrop, spriteIndex(bg.spriteKey), 0, 1, 0, screenHeight + bgOffset, cols * t, bgHeight);

  // background clouds (parallax), drawn with the cloud image's own aspect ratio
  const cloudCam = world.cameraY * CLOUD_PARALLAX;
  const firstPeriod = Math.floor(cloudCam / CLOUD_PERIOD) - 1;
  for (let k = firstPeriod; k <= firstPeriod + 3; k++) {
    for (const c of clouds) {
      const bottom = screenHeight - (k * CLOUD_PERIOD + c.y - cloudCam) * t;
      const h = (c.w / 2) * t; // upper bound for culling (clouds are wider than tall)
      if (bottom < 0 || bottom - h > screenHeight) continue;
      out.push(Op.imageByWidth, cloudSprite, 0, 1, c.x * t, bottom, c.w * t, 0);
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
    const bob = Math.sin((phase / 1000) * pk.bob.hz * 2 * Math.PI) * pk.bob.tiles;
    sprite(Op.sprite, pk.spriteKey as SpriteKey, phase, pk.x * t, sy(pk.y + pk.size + bob), pk.size * t, pk.size * t);
  }

  // easter egg objects: "ground" stands still on the platform, "hover" bobs like a pickup
  for (const egg of world.easterEggs) {
    if (!visible(egg.y, egg.y + egg.size)) continue;
    const phase = world.time + pickupPhaseMs(egg.id);
    const bob = egg.placement === 'hover' ? Math.sin((phase / 1000) * BOB_HZ * 2 * Math.PI) * BOB_TILES : 0;
    const x = egg.x * t;
    sprite(Op.sprite, egg.spriteKey as SpriteKey, phase, x, sy(egg.y + egg.size + bob), egg.size * t, egg.size * t);
  }

  for (const h of world.hazards) {
    if (!visible(h.y, h.y + h.size)) continue;
    sprite(Op.sprite, h.spriteKey as SpriteKey, world.time, h.x * t, sy(h.y + h.size), h.size * t, h.size * t);
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
  const { hurtPoseMs } = world.config.hazards;
  // dying: skeleton (hurt) pose all the way down, no squash/stretch
  const key = world.dying
    ? 'player_hurt'
    : playerSpriteKey(p, world.time, world.config.player.fallPoseAfterTiles, active, hurtPoseMs);
  const elapsed = playerAnimElapsed(p, world.time, world.config.player.bonusPoseMs);
  const { jumpVelocity } = derivePhysics(world.config);
  const { sx, sy: sY } = world.dying ? { sx: 1, sy: 1 } : playerScale(p, world.time, jumpVelocity);
  const progress = jumpProgress(p, world.time, jumpVelocity);
  const w = t * sx;
  const h = t * sY;
  // dying: zoom towards the viewer around the sprite's centre; otherwise feet on the hitbox bottom
  const zoom = world.dying ? deathScale(world.time - world.diedAt, world.config) : 1;
  const drawPlayer = (px: number) =>
    world.dying
      ? sprite(
          op,
          key,
          elapsed,
          (px + p.w / 2) * t - (w * zoom) / 2,
          sy(p.y + p.h / 2) - (h * zoom) / 2,
          w * zoom,
          h * zoom,
          progress,
        )
      : sprite(op, key, elapsed, (px + p.w / 2) * t - w / 2, sy(p.y) - h, w, h, progress);
  // after a hit: the hurt pose stays solid, then the player blinks for the rest of the invulnerability;
  // the death sequence blinks the same way until the player has fallen out
  const sinceHit = world.time - p.hurtAt;
  const sinceDeath = world.time - world.diedAt;
  const blinkOff = world.dying
    ? sinceDeath >= hurtPoseMs && isBlinkOff(sinceDeath)
    : world.isInvulnerable && sinceHit >= hurtPoseMs && isBlinkOff(sinceHit);
  if (!blinkOff) {
    drawPlayer(p.x);
    if (p.x + p.w > cols) drawPlayer(p.x - cols);
  }

  // start egg shell, in front of the chick so it looks like it sits inside
  const egg = world.egg;
  if (visible(egg.y, egg.y + egg.size)) {
    const x = (egg.x - egg.size / 2) * t;
    sprite(Op.sprite, 'start_egg', 0, x, sy(egg.y + egg.size), egg.size * t, egg.size * t);
  }

  // milestone star bursts: fireworks fixed where they went off, drawn on top
  for (const burst of world.bursts) {
    for (const star of burst.particles) {
      const st = starState(star, world.time - burst.startedAt, world.config.milestones.gravity);
      if (!st || st.size <= 0) continue;
      const half = st.size / 2;
      const x = burst.x + st.dx - half;
      sprite(Op.sprite, 'effect_star', 0, x * t, sy(burst.y + st.dy + half), st.size * t, st.size * t);
    }
  }

  return out;
}
