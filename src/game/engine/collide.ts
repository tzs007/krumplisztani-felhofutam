import type { GameConfig } from '../config';
import type { Platform, Player } from './entities';

/**
 * Movement and collision rules shared by the level sections. `columns`
 * set = the level wraps around horizontally (vertical section: a cylinder);
 * null = a plain strip (side section).
 */

/**
 * Really falling (not just the top of a normal hop): moving down and at least
 * `fallPoseAfterTiles` below the jump's apex. Drives the umbrella pose and glide.
 */
export function isFalling(player: Player, fallPoseAfterTiles: number): boolean {
  return player.vy <= 0 && player.apexY - player.y >= fallPoseAfterTiles;
}

export function wrap(x: number, columns: number): number {
  return ((x % columns) + columns) % columns;
}

/** Horizontal overlap on a cylinder: the right edge continues on the left. */
export function overlapsX(ax: number, aw: number, bx: number, bw: number, columns: number): boolean {
  for (const shift of [-columns, 0, columns]) {
    const x = ax + shift;
    if (x < bx + bw && x + aw > bx) return true;
  }
  return false;
}

function overlapsAxis(ax: number, aw: number, bx: number, bw: number, columns: number | null): boolean {
  return columns === null ? ax < bx + bw && ax + aw > bx : overlapsX(ax, aw, bx, bw, columns);
}

/** Player hitbox against a size×size box whose bottom-left corner is (x, y). */
export function touchesBox(p: Player, x: number, y: number, size: number, columns: number | null): boolean {
  return overlapsAxis(p.x, p.w, x, size, columns) && p.y < y + size && p.y + p.h > y;
}

/**
 * One-way platforms: the platform whose top the feet crossed going down
 * between `prevY` and now (the highest of them), or null.
 */
export function findLanding(p: Player, prevY: number, platforms: Platform[], columns: number | null): Platform | null {
  if (p.vy > 0) return null;
  let hit: Platform | null = null;
  for (const pl of platforms) {
    if (prevY >= pl.y - 1e-6 && p.y <= pl.y && overlapsAxis(p.x, p.w, pl.x, pl.width, columns)) {
      if (!hit || pl.y > hit.y) hit = pl;
    }
  }
  return hit;
}

/**
 * Gravity for one step; with `glideFallSpeed` the umbrella opens on a real
 * fall and the fall speed eases toward it instead of accelerating (brakes if
 * faster, never overshoots). Updates y and the apex.
 */
export function fallStep(
  p: Player,
  dt: number,
  gravity: number,
  glideFallSpeed: number | null,
  cfg: GameConfig['player'],
): void {
  if (
    glideFallSpeed !== null &&
    isFalling(p, cfg.fallPoseAfterTiles) &&
    p.vy - gravity * dt < -glideFallSpeed
  ) {
    p.vy = -glideFallSpeed + (p.vy + glideFallSpeed) * Math.exp(-cfg.glideDrag * dt);
  } else {
    p.vy -= gravity * dt;
  }
  p.y += p.vy * dt;
  p.apexY = Math.max(p.apexY, p.y);
}
