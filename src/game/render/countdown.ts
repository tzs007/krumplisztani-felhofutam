import type { World } from '../engine/World';

/** How long "GO!" stays up after the chick hops out of the egg. */
export const GO_MS = 700;

/** HUD text for the start: "3", "2", "1", then "GO!" briefly, otherwise null. */
export function countdownLabel(world: World): string | null {
  if (!world.started) return String(Math.max(1, Math.ceil(world.countdownRemainingMs / 1000)));
  if (world.time - world.launchedAt < GO_MS) return 'GO!';
  return null;
}
