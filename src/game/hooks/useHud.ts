import { useRef, useState } from 'react';

import type { ActiveEffect } from '../engine/effects/EffectRegistry';
import type { World } from '../engine/World';

export type HudState = {
  score: number;
  effects: ActiveEffect[];
  bonusProgress: number | null;
};

const EMPTY: HudState = { score: 0, effects: [], bonusProgress: null };
const HUD_INTERVAL_MS = 200;

/**
 * Score, effects and bonus progress for the HUD. `update` is called every
 * frame but re-renders at most every HUD_INTERVAL_MS, and only when something changed.
 */
export function useHud() {
  const [hud, setHud] = useState<HudState>(EMPTY);
  const updatedAt = useRef(0);

  const update = (world: World) => {
    const now = Date.now();
    if (now - updatedAt.current < HUD_INTERVAL_MS) return;
    updatedAt.current = now;
    const effects = world.effects.getActive(world.time);
    const bonusProgress = world.bonusProgress;
    setHud((prev) =>
      prev.score === world.score &&
      prev.effects.length === 0 &&
      effects.length === 0 &&
      prev.bonusProgress === bonusProgress
        ? prev
        : { score: world.score, effects, bonusProgress },
    );
  };

  return { hud, update, reset: () => setHud(EMPTY) };
}
