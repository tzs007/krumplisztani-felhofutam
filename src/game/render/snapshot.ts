import { derivePhysics } from '../config';
import type { SideSection } from '../engine/sections/SideSection';
import { deathScale, isFalling, type Player, type StarParticle, type World } from '../engine/World';
import { Color } from '../../theme/colors';
import { skyBodies } from './skyOrbit';
import { animationDurationMs, hasSprite, spriteAnimations, spriteFrame, spriteIndex, type SpriteKey } from './sprites';

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
 *  op 7 = tile           (arg = sprite index, frame;  x, top y, width, _): width fixed, height from the
 *         image (platform art may hang below the tile), top at `top y`
 *  op 8 = see-through fill (arg = palette color, frame slot = opacity × 1000;  x, y, w, h)
 *  op 9 = backdrop with turned colours (as op 5; frame slot = hue in degrees, frames slot =
 *         brightness gain × 1000) — the psy mode's rainbow vision
 *  op 10 = the flying psy chick (arg = sprite index, frame slot = blur sigma in px × 1000;
 *         x, y, w, h): blurred as it moves away
 *  op 11 = psy swirl (arg = sprite index, frame slot = turn in degrees;  centre x, centre y, radius, _):
 *         the swirl art that covers the psy mode switching on and off; its solid part reaches the radius
 */
export const Op = {
  fill: 0,
  stroke: 1,
  line: 2,
  sprite: 3,
  spriteFlipped: 4,
  backdrop: 5,
  imageByWidth: 6,
  tile: 7,
  fillAlpha: 8,
  backdropHue: 9,
  psyPlayer: 10,
  swirl: 11,
} as const;
export const STRIDE = 8;
/** How far the swirl turns while it plays (degrees). */
const SWIRL_TURN_DEG = 720;
/** Sprite px per tile (fixed pixel density of the art). */
const TILE_PX = 128;
/** Platform art may reach this many tiles below the walkable top (for culling). */
const PLATFORM_MAX_HANG = 2;

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
const psyCloudSprite = spriteIndex('psy_cloud');

/**
 * Draw list of the run's active section, plus the fade while changing sections.
 * `tileSize` is the main level's; the bonus level uses its own (zoomed out).
 */
export function buildSnapshot(world: World, tileSize: number, screenHeight: number): number[] {
  const screenWidth = world.config.columns * tileSize;
  const bonus = world.active === world.bonus ? world.bonus : null;
  const out = bonus
    ? snapshotSide(world, bonus, screenWidth, screenHeight)
    : snapshotVertical(world, tileSize, screenHeight);
  // psy mode switching on or off: the swirl grows from the chick until it covers the screen, then shrinks back
  const swirl = world.psySwirl;
  const k = world.psySwirlProgress();
  if (!bonus && swirl && k !== null) {
    const cx = swirl.x * tileSize;
    const cy = screenHeight - (swirl.y - world.cameraY) * tileSize;
    // far enough to reach the farthest corner
    const cover = Math.hypot(Math.max(cx, screenWidth - cx), Math.max(cy, screenHeight - cy)) * 1.05;
    const half = k < 0.5 ? k * 2 : (1 - k) * 2;
    const radius = cover * half * half * (3 - 2 * half);
    out.push(Op.swirl, spriteIndex('swirl'), Math.round(k * SWIRL_TURN_DEG), 1, cx, cy, radius, 0);
  }
  const alpha = world.transitionAlpha();
  if (alpha > 0) out.push(Op.fillAlpha, Color.black, Math.round(alpha * 1000), 1, 0, 0, screenWidth, screenHeight);
  return out;
}

/** The main level: climbing view, wraps around sideways. */
function snapshotVertical(world: World, tileSize: number, screenHeight: number): number[] {
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

  const psy = world.psyActive;
  // backdrop sky: taller than the screen, scrolls down very slowly as the camera climbs;
  // in psy mode the dedicated artwork pulses in brightness (optional hue rotation)
  const bg = world.config.background;
  const bgHeight = screenHeight * bg.heightScreens;
  const bgOffset = backdropOffsetPx(world.cameraY * t, bg.parallax, bgHeight - screenHeight);
  if (psy) {
    const { hueDegPerSecond, pulseGain, pulsePeriodMs } = world.config.psy;
    const hue = ((world.time / 1000) * hueDegPerSecond) % 360;
    const gain = 1 + pulseGain * Math.sin((world.time / pulsePeriodMs) * 2 * Math.PI);
    out.push(Op.backdropHue, spriteIndex('bg_psy'), hue, Math.round(gain * 1000), 0, screenHeight + bgOffset, cols * t, bgHeight);
  } else {
    out.push(Op.backdrop, spriteIndex(bg.spriteKey), 0, 1, 0, screenHeight + bgOffset, cols * t, bgHeight);
  }

  // sun and moon, fixed to the screen, behind the clouds (psy mode: the psy sun)
  const { sun, moon } = skyBodies(world.skyAngle, cols * t, screenHeight, world.config.sky);
  if (sun.visible) {
    sprite(Op.sprite, psy ? 'psy_sun' : 'sun', world.time, sun.x - sun.size / 2, sun.y - sun.size / 2, sun.size, sun.size);
  }
  if (moon.visible && hasSprite('moon')) {
    // registered once moon.png is drawn (see sprites.ts)
    sprite(Op.sprite, 'moon' as SpriteKey, world.time, moon.x - moon.size / 2, moon.y - moon.size / 2, moon.size, moon.size);
  }

  // background clouds (parallax), drawn with the cloud image's own aspect ratio
  const cloudCam = world.cameraY * CLOUD_PARALLAX;
  const firstPeriod = Math.floor(cloudCam / CLOUD_PERIOD) - 1;
  for (let k = firstPeriod; k <= firstPeriod + 3; k++) {
    for (const c of clouds) {
      const bottom = screenHeight - (k * CLOUD_PERIOD + c.y - cloudCam) * t;
      const h = (c.w / 2) * t; // upper bound for culling (clouds are wider than tall)
      if (bottom < 0 || bottom - h > screenHeight) continue;
      out.push(Op.imageByWidth, psy ? psyCloudSprite : cloudSprite, 0, 1, c.x * t, bottom, c.w * t, 0);
    }
  }

  const visible = (bottom: number, top: number) => top >= world.cameraY && bottom <= world.cameraY + world.viewHeight;

  // platforms: one sprite per tile; the sprite's top edge is the walkable surface,
  // drawn art may hang below the tile (height from the image, see Op.tile)
  // (psy mode: the platforms are not there for the flying chick)
  for (const pl of psy ? [] : world.platforms) {
    if (!visible(pl.y - PLATFORM_MAX_HANG, pl.y)) continue;
    const y = sy(pl.y);
    for (let i = 0; i < pl.width; i++) {
      const key = `${pl.spriteKey}_${platformPart(i, pl.width)}` as SpriteKey;
      // art above the walkable surface (surfaceY px of 128 per tile) is drawn above the platform's y
      const lift = ((spriteAnimations[key]?.surfaceY ?? 0) / TILE_PX) * t;
      sprite(Op.tile, key, world.time, ((pl.x + i) % cols) * t, y - lift, t, t);
    }
  }

  // (psy mode: only the cards)
  for (const pk of world.pickups) {
    if (psy && pk.spriteKey !== 'pickup_card') continue;
    if (!visible(pk.y, pk.y + pk.size)) continue;
    const phase = world.time + pickupPhaseMs(pk.id);
    const bob = Math.sin((phase / 1000) * pk.bob.hz * 2 * Math.PI) * pk.bob.tiles;
    sprite(Op.sprite, pk.spriteKey as SpriteKey, phase, pk.x * t, sy(pk.y + pk.size + bob), pk.size * t, pk.size * t);
  }

  // easter egg objects: "ground" stands still on the platform, "hover" bobs like a pickup
  for (const egg of psy ? [] : world.easterEggs) {
    if (!visible(egg.y, egg.y + egg.size)) continue;
    const phase = world.time + pickupPhaseMs(egg.id);
    const bob = egg.placement === 'hover' ? Math.sin((phase / 1000) * BOB_HZ * 2 * Math.PI) * BOB_TILES : 0;
    const x = egg.x * t;
    sprite(Op.sprite, egg.spriteKey as SpriteKey, phase, x, sy(egg.y + egg.size + bob), egg.size * t, egg.size * t);
  }

  for (const h of psy ? [] : world.hazards) {
    if (!visible(h.y, h.y + h.size)) continue;
    sprite(Op.sprite, h.spriteKey as SpriteKey, world.time, h.x * t, sy(h.y + h.size), h.size * t, h.size * t);
  }

  // the magic mushroom, standing on its platform
  for (const m of psy ? [] : world.main.mushrooms) {
    if (!visible(m.y, m.y + m.size)) continue;
    sprite(Op.sprite, m.spriteKey as SpriteKey, world.time, m.x * t, sy(m.y + m.size), m.size * t, m.size * t);
  }

  // the portal to the bonus level, standing on its platform, swirling
  for (const pt of psy ? [] : world.main.portals) {
    if (!visible(pt.y, pt.y + pt.size)) continue;
    sprite(Op.sprite, pt.spriteKey as SpriteKey, world.time, pt.x * t, sy(pt.y + pt.size), pt.size * t, pt.size * t);
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
  if (psy) {
    // flying: the psy chick, growing and shrinking as if it came closer and went away (depth)
    const { zAmplitude, zPeriodMs, farBlur } = world.config.psy;
    const depth = Math.sin((world.time / zPeriodMs) * 2 * Math.PI);
    const z = 2 ** (zAmplitude * depth);
    const size = t * z;
    // out of focus while further than normal: none at normal size, farBlur at the farthest
    const blur = depth < 0 ? -depth * farBlur * t : 0;
    const cx = (p.x + p.w / 2) * t;
    const cy = sy(p.y + p.h / 2);
    const chick = (x: number) =>
      out.push(Op.psyPlayer, spriteIndex('player_psy'), Math.round(blur * 1000), 1, x, cy - size / 2, size, size);
    chick(cx - size / 2);
    if (p.x + p.w > cols) chick(cx - cols * t - size / 2);
  }
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
  if (!blinkOff && !psy) {
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

/** Running on the ground: the jump sheet's two poses alternate this often (ms). */
const RUN_FRAME_MS = 110;
/** Cloud layout of the bonus level (tiles), repeating every SIDE_CLOUD_PERIOD columns. */
const SIDE_CLOUD_PERIOD = 18;
const SIDE_CLOUD_PARALLAX = 0.4;
const sideClouds = [
  { x: 1, y: 9.5, w: 2.6 },
  { x: 7, y: 12, w: 3 },
  { x: 12.5, y: 8, w: 2.2 },
];

/**
 * The bonus level, side view: zoomed out (tile size = screen width /
 * side.viewColumns), the floor along the screen bottom, scrolling with the
 * chick's camera.
 */
function snapshotSide(world: World, bonus: SideSection, screenWidth: number, screenHeight: number): number[] {
  const out: number[] = [];
  const t = screenWidth / bonus.viewColumns;
  const cam = bonus.cameraX;
  const sx = (x: number) => (x - cam) * t;
  const sy = (y: number) => screenHeight - y * t;
  const sprite = (op: number, key: SpriteKey, elapsedMs: number, x: number, y: number, w: number, h: number, progress?: number) => {
    const { frame, frames } = spriteFrame(key, elapsedMs, progress);
    out.push(op, spriteIndex(key), frame, frames, x, y, w, h);
  };
  const visibleX = (x: number, w: number) => x + w >= cam - 1 && x <= cam + bonus.viewColumns + 1;

  // sky, then the small clouds drifting slower than the level
  const bg = world.config.background;
  out.push(Op.backdrop, spriteIndex(bg.spriteKey), 0, 1, 0, screenHeight, screenWidth, screenHeight * bg.heightScreens);
  const cloudCam = cam * SIDE_CLOUD_PARALLAX;
  const first = Math.floor(cloudCam / SIDE_CLOUD_PERIOD) - 1;
  for (let k = first; k <= first + 2; k++) {
    for (const c of sideClouds) {
      const x = (k * SIDE_CLOUD_PERIOD + c.x - cloudCam) * t;
      if (x + c.w * t < 0 || x > screenWidth) continue;
      out.push(Op.imageByWidth, cloudSprite, 0, 1, x, sy(c.y), c.w * t, 0);
    }
  }

  // platforms (the floor is one long run): only the tiles on screen
  for (const pl of bonus.platforms) {
    if (!visibleX(pl.x, pl.width)) continue;
    const from = Math.max(0, Math.floor(cam - pl.x) - 1);
    const to = Math.min(pl.width, Math.ceil(cam + bonus.viewColumns - pl.x) + 1);
    for (let i = from; i < to; i++) {
      const key = `${pl.spriteKey}_${platformPart(i, pl.width)}` as SpriteKey;
      const lift = ((spriteAnimations[key]?.surfaceY ?? 0) / TILE_PX) * t;
      sprite(Op.tile, key, world.time, sx(pl.x + i), sy(pl.y) - lift, t, t);
    }
  }

  for (const pk of bonus.pickups) {
    if (!visibleX(pk.x, pk.size)) continue;
    const phase = world.time + pickupPhaseMs(pk.id);
    const bob = Math.sin((phase / 1000) * pk.bob.hz * 2 * Math.PI) * pk.bob.tiles;
    sprite(Op.sprite, pk.spriteKey as SpriteKey, phase, sx(pk.x), sy(pk.y + pk.size + bob), pk.size * t, pk.size * t);
  }
  for (const h of bonus.hazards) {
    if (!visibleX(h.x, h.size)) continue;
    sprite(Op.sprite, h.spriteKey as SpriteKey, world.time, sx(h.x), sy(h.y + h.size), h.size * t, h.size * t);
  }
  // the hidden meme: "ground" stands still, "hover" bobs like a pickup
  for (const egg of bonus.easterEggs) {
    if (!visibleX(egg.x, egg.size)) continue;
    const phase = world.time + pickupPhaseMs(egg.id);
    const bob = egg.placement === 'hover' ? Math.sin((phase / 1000) * BOB_HZ * 2 * Math.PI) * BOB_TILES : 0;
    sprite(Op.sprite, egg.spriteKey as SpriteKey, phase, sx(egg.x), sy(egg.y + egg.size + bob), egg.size * t, egg.size * t);
  }
  const exit = bonus.exit;
  if (visibleX(exit.x, exit.size)) {
    sprite(Op.sprite, exit.spriteKey as SpriteKey, world.time, sx(exit.x), sy(exit.y + exit.size), exit.size * t, exit.size * t);
  }
  for (const c of bonus.collected) {
    const key = `${c.spriteKey}_collect`;
    if (!hasSprite(key)) continue;
    const elapsed = world.time - c.collectedAt;
    if (elapsed >= animationDurationMs(key)) continue;
    sprite(Op.sprite, key, elapsed, sx(c.x), sy(c.y + c.size), c.size * t, c.size * t);
  }

  // the chick: running poses on the ground, the usual jump / fall / bonus poses in the air
  const p = bonus.player;
  const active = world.effects.getActive(world.time).map((e) => e.id);
  const { hurtPoseMs } = world.config.hazards;
  const key = playerSpriteKey(p, world.time, world.config.player.fallPoseAfterTiles, active, hurtPoseMs);
  const elapsed = playerAnimElapsed(p, world.time, world.config.player.bonusPoseMs);
  const { jumpVelocity } = world.physics;
  const running = bonus.grounded && world.time >= p.bonusUntil && world.time - p.hurtAt >= hurtPoseMs;
  const progress = running
    ? Math.floor(world.time / RUN_FRAME_MS) % 2 === 0
      ? 0
      : 1
    : jumpProgress(p, world.time, jumpVelocity);
  const { sx: scaleX, sy: scaleY } = running ? { sx: 1, sy: 1 } : playerScale(p, world.time, jumpVelocity);
  const w = t * scaleX;
  const h = t * scaleY;
  const sinceHit = world.time - p.hurtAt;
  const invulnerable = sinceHit < world.config.hazards.invulnerableMs;
  if (!(invulnerable && sinceHit >= hurtPoseMs && isBlinkOff(sinceHit))) {
    sprite(Op.sprite, key, elapsed, sx(p.x + p.w / 2) - w / 2, sy(p.y) - h, w, h, progress);
  }

  for (const burst of bonus.bursts) {
    for (const star of burst.particles) {
      const st = starState(star, world.time - burst.startedAt, world.config.milestones.gravity);
      if (!st || st.size <= 0) continue;
      const half = st.size / 2;
      sprite(Op.sprite, 'effect_star', 0, sx(burst.x + st.dx - half), sy(burst.y + st.dy + half), st.size * t, st.size * t);
    }
  }
  return out;
}
