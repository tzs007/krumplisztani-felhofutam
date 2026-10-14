import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { World } from '../engine/World';
import { skyAngleFromClock, skyBodies } from '../render/skyOrbit';
import { buildSnapshot, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const W = 360;
const H = 720;
const sky = defaultGameConfig.sky;
const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m);

describe('sky angle from the clock', () => {
  it('rises in the east at 6, is overhead at noon, sets in the west at 18, is underneath at midnight', () => {
    expect(skyAngleFromClock(at(6))).toBeCloseTo(0);
    expect(skyAngleFromClock(at(12))).toBeCloseTo(90);
    expect(skyAngleFromClock(at(18))).toBeCloseTo(180);
    expect(skyAngleFromClock(at(0))).toBeCloseTo(270);
    expect(skyAngleFromClock(at(9, 30))).toBeCloseTo(52.5);
  });
});

describe('sky bodies on the circle around the screen bottom centre', () => {
  it('noon: the sun high in the middle; the moon underneath, out of sight', () => {
    const { sun, moon } = skyBodies(90, W, H, sky);
    expect(sun.x).toBeCloseTo(W / 2);
    expect(sun.y).toBeLessThan(H * 0.85);
    expect(sun.size).toBeCloseTo(W * sky.sizeWidths);
    expect(sun.visible).toBe(true);
    expect(moon.visible).toBe(false);
  });

  it('morning on the right, evening on the left (counter-clockwise)', () => {
    expect(skyBodies(45, W, H, sky).sun.x).toBeGreaterThan(W / 2);
    expect(skyBodies(135, W, H, sky).sun.x).toBeLessThan(W / 2);
  });

  it('night: the sun is below the screen, the moon up in its place', () => {
    const { sun, moon } = skyBodies(270, W, H, sky);
    expect(sun.visible).toBe(false);
    expect(moon.visible).toBe(true);
    expect(moon.x).toBeCloseTo(W / 2);
  });
});

describe('sky in the main level', () => {
  const config: GameConfig = {
    ...defaultGameConfig,
    start: { ...defaultGameConfig.start, countdownMs: 0 },
    mushroom: { ...defaultGameConfig.mushroom, chancePerGame: 0 },
    // psy mode switches at once (no swirl)
    psy: { ...defaultGameConfig.psy, swirlMs: 0 },
  };
  const sunCmd = (world: World) => {
    const raw = buildSnapshot(world, W / config.columns, H);
    for (let i = 0; i < raw.length; i += STRIDE) {
      const key = SPRITE_KEYS[raw[i + 1]];
      if (key === 'sun' || key === 'psy_sun') return { key, x: raw[i + 4], index: i / STRIDE };
    }
    return null;
  };

  it('draws the sun behind the clouds by day, turning slowly; nothing by night (no moon art yet)', () => {
    const world = new World({ config, viewHeight: H / (W / config.columns), rng: createRng(1), clock: at(12) });
    const first = sunCmd(world)!;
    expect(first.key).toBe('sun');
    expect(first.index).toBe(1); // right after the backdrop
    for (let i = 0; i < 1200; i++) world.step(1 / 120, { dragging: false, dx: 0 });
    // 10 s later it has moved to the left (counter-clockwise)
    expect(sunCmd(world)!.x).toBeLessThan(first.x);
    const night = new World({ config, viewHeight: 18, rng: createRng(1), clock: at(0) });
    expect(sunCmd(night)).toBeNull();
  });

  it('shows the psy sun in psy mode, same size', () => {
    const world = new World({ config, viewHeight: H / (W / config.columns), rng: createRng(1), clock: at(12) });
    world.effects.trigger('psy', world.time);
    expect(sunCmd(world)!.key).toBe('psy_sun');
  });
});
