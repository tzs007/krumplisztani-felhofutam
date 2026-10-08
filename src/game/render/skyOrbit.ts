import type { GameConfig } from '../config';

/**
 * Sun and moon on one circle around the screen's bottom centre, at the two
 * ends of a diameter, turning counter-clockwise. Angle 0° = the right end of
 * the horizon (sunrise), 90° = overhead, 180° = the left end (sunset); the
 * moon is always 180° further.
 */

/** The angle (degrees) for a time of day: 6:00 → 0, 12:00 → 90, 18:00 → 180, 0:00 → 270. */
export function skyAngleFromClock(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return ((((hours - 6) / 24) * 360) % 360 + 360) % 360;
}

export type SkyBody = { x: number; y: number; size: number; visible: boolean };

/** Where the sun and the moon are (screen px, centres) at `angleDeg`, and whether they show at all. */
export function skyBodies(
  angleDeg: number,
  screenWidth: number,
  screenHeight: number,
  sky: GameConfig['sky'],
): { sun: SkyBody; moon: SkyBody } {
  const radius = sky.radiusWidths * screenWidth;
  const size = sky.sizeWidths * screenWidth;
  const at = (deg: number): SkyBody => {
    const a = (deg * Math.PI) / 180;
    const x = screenWidth / 2 + radius * Math.cos(a);
    const y = screenHeight - radius * Math.sin(a);
    const half = size / 2;
    const visible = x + half > 0 && x - half < screenWidth && y - half < screenHeight && y + half > 0;
    return { x, y, size, visible };
  };
  return { sun: at(angleDeg), moon: at(angleDeg + 180) };
}
