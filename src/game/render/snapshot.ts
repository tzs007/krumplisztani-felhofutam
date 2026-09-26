import { Color } from '@/theme/colors';

import type { World } from '../engine/World';
import type { PlatformVariant } from '../level/tiles';

/**
 * Flat, serialisable draw list handed to the UI-thread renderer every frame.
 * Each command is 6 numbers: [op, color, a, b, c, d] in SCREEN pixels.
 *  op 0 = fill rect (x, y, w, h)
 *  op 1 = stroke rect (x, y, w, h)
 *  op 2 = line (x1, y1, x2, y2)
 * Every tile is its own command so each can later become a sprite.
 */
export const Op = { fill: 0, stroke: 1, line: 2 } as const;
export const STRIDE = 6;

const platformColors: Record<PlatformVariant, [top: number, body: number]> = {
  grass: [Color.grassTop, Color.grassBody],
  blue: [Color.blueTop, Color.blueBody],
  brick: [Color.brickTop, Color.brickBody],
};

const pickupColors: Record<string, number> = {
  bonus: Color.coin,
  doubleScore: Color.doubleScore,
  doubleJump: Color.doubleJump,
};

/** Cloud layout in tiles, repeating every CLOUD_PERIOD rows, drawn with parallax. */
const CLOUD_PERIOD = 24;
const CLOUD_PARALLAX = 0.3;
const clouds = [
  { x: 0.5, y: 3, w: 2.2 },
  { x: 5.8, y: 8, w: 2.6 },
  { x: 2.6, y: 14, w: 1.6 },
  { x: 6.4, y: 19, w: 2 },
];

export function buildSnapshot(world: World, tileSize: number, screenHeight: number): number[] {
  const out: number[] = [];
  const cols = world.config.columns;
  const t = tileSize;
  // world y (up) → screen y (down)
  const sy = (y: number) => screenHeight - (y - world.cameraY) * t;
  const push = (op: number, color: number, a: number, b: number, c: number, d: number) =>
    out.push(op, color, a, b, c, d);

  // background clouds (parallax)
  const cloudCam = world.cameraY * CLOUD_PARALLAX;
  const firstPeriod = Math.floor(cloudCam / CLOUD_PERIOD) - 1;
  for (let k = firstPeriod; k <= firstPeriod + 3; k++) {
    for (const c of clouds) {
      const y = screenHeight - (k * CLOUD_PERIOD + c.y - cloudCam) * t;
      if (y < -t || y > screenHeight + t) continue;
      push(Op.fill, Color.cloud, c.x * t, y - 0.6 * t, c.w * t, 0.6 * t);
      push(Op.fill, Color.cloud, (c.x + c.w * 0.25) * t, y - 0.95 * t, c.w * 0.5 * t, 0.4 * t);
      push(Op.fill, Color.cloudShade, c.x * t, y - 0.15 * t, c.w * t, 0.15 * t);
    }
  }

  const visible = (bottom: number, top: number) => top >= world.cameraY && bottom <= world.cameraY + world.viewHeight;

  // platforms: one square per tile, top stripe + body
  for (const pl of world.platforms) {
    if (!visible(pl.y - 1, pl.y)) continue;
    const [top, body] = platformColors[pl.variant];
    const y = sy(pl.y);
    for (let i = 0; i < pl.width; i++) {
      const x = ((pl.x + i) % cols) * t;
      push(Op.fill, body, x, y, t, t * 0.55);
      push(Op.fill, top, x, y, t, t * 0.25);
    }
  }

  for (const pk of world.pickups) {
    if (!visible(pk.y, pk.y + pk.size)) continue;
    push(Op.fill, pickupColors[pk.effect] ?? Color.coin, pk.x * t, sy(pk.y + pk.size), pk.size * t, pk.size * t);
  }

  // player: square with an image placeholder (frame + diagonals); drawn twice while crossing the edge
  const p = world.player;
  const drawPlayer = (px: number) => {
    const x = px * t;
    const y = sy(p.y + p.h);
    const w = p.w * t;
    const h = p.h * t;
    const inset = w * 0.18;
    push(Op.fill, Color.player, x, y, w, h);
    push(Op.stroke, Color.cloud, x + inset, y + inset, w - 2 * inset, h - 2 * inset);
    push(Op.line, Color.playerLines, x + inset, y + inset, x + w - inset, y + h - inset);
    push(Op.line, Color.playerLines, x + w - inset, y + inset, x + inset, y + h - inset);
  };
  drawPlayer(p.x);
  if (p.x + p.w > cols) drawPlayer(p.x - cols);

  return out;
}
