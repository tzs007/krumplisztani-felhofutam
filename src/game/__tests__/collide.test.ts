import { defaultGameConfig } from '../config';
import { fallStep, findLanding, touchesBox } from '../engine/collide';
import type { Platform, Player } from '../engine/entities';

const player = (over: Partial<Player> = {}): Player => ({
  x: 0,
  y: 0,
  w: 0.9,
  h: 0.9,
  vx: 0,
  vy: 0,
  facing: 1,
  bonusUntil: 0,
  bonusSpriteKey: null,
  landedAt: -Infinity,
  apexY: 0,
  targetOffset: 0,
  hurtAt: -Infinity,
  ...over,
});
const platform = (x: number, y: number, width: number, id = 1): Platform => ({
  id,
  x,
  y,
  width,
  variant: 'grass',
  spriteKey: 'platform_grass',
});

describe('touchesBox', () => {
  it('detects overlap of the player box with a square box', () => {
    expect(touchesBox(player({ x: 2, y: 3 }), 2.5, 3.5, 1, 9)).toBe(true);
    expect(touchesBox(player({ x: 2, y: 3 }), 4, 3, 1, 9)).toBe(false);
    expect(touchesBox(player({ x: 2, y: 3 }), 2, 5, 1, 9)).toBe(false);
  });

  it('wraps around the screen edge only when columns are given', () => {
    // player across the right edge (8.6 … 9.5), box at the left edge (0 … 1)
    expect(touchesBox(player({ x: 8.6, y: 0 }), 0, 0, 1, 9)).toBe(true);
    expect(touchesBox(player({ x: 8.6, y: 0 }), 0, 0, 1, null)).toBe(false);
  });
});

describe('findLanding', () => {
  it('lands only when falling through the top surface, on the highest platform crossed', () => {
    const low = platform(0, 2, 3, 1);
    const high = platform(0, 2.5, 3, 2);
    // fell from 3 to 2: crossed both tops → the higher one
    expect(findLanding(player({ x: 1, y: 2, vy: -5 }), 3, [low, high], 9)).toBe(high);
    // going up through the platform: no landing
    expect(findLanding(player({ x: 1, y: 2.4, vy: 5 }), 1.9, [low], 9)).toBeNull();
    // beside the platform: no landing
    expect(findLanding(player({ x: 5, y: 2, vy: -5 }), 3, [low], 9)).toBeNull();
  });
});

describe('fallStep', () => {
  const cfg = defaultGameConfig.player;

  it('applies gravity', () => {
    const p = player({ y: 10, vy: 0, apexY: 10 });
    fallStep(p, 0.1, 20, null, cfg);
    expect(p.vy).toBeCloseTo(-2);
    expect(p.y).toBeCloseTo(10 - 0.2);
  });

  it('under the umbrella brakes a fast fall down to the glide speed', () => {
    // well below the apex (umbrella open) and falling fast
    const p = player({ y: 0, vy: -20, apexY: 10 });
    for (let i = 0; i < 120; i++) fallStep(p, 1 / 120, 20, 3, cfg);
    expect(p.vy).toBeCloseTo(-3, 2);
  });

  it('without glide keeps accelerating', () => {
    const p = player({ y: 0, vy: -20, apexY: 10 });
    fallStep(p, 0.1, 20, null, cfg);
    expect(p.vy).toBeCloseTo(-22);
  });
});
