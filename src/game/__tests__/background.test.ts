import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { World } from '../engine/World';
import { backdropOffsetPx, buildSnapshot, Op, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
};
const T = 40;
const SCREEN_H = 720;

const backdrop = (world: World) => {
  const cmds = buildSnapshot(world, T, SCREEN_H);
  for (let i = 0; i < cmds.length; i += STRIDE) {
    if (cmds[i] === Op.backdrop)
      return { index: i, key: SPRITE_KEYS[cmds[i + 1]], bottom: cmds[i + 5], width: cmds[i + 6], height: cmds[i + 7] };
  }
  throw new Error('no backdrop');
};

describe('sky backdrop', () => {
  it('is drawn first, 1.5× the screen height, bottom on the screen bottom at the start', () => {
    const world = new World({ config, viewHeight: SCREEN_H / T, rng: createRng(1) });
    const bg = backdrop(world);
    expect(bg.index).toBe(0); // behind everything, incl. the small clouds
    expect(bg.key).toBe('bg_sky');
    expect(bg.height).toBeCloseTo(SCREEN_H * config.background.heightScreens);
    expect(bg.width).toBe(config.columns * T);
    expect(bg.bottom).toBeCloseTo(SCREEN_H);
  });

  it('scrolls down very slowly as the camera climbs, and stops at the image top', () => {
    const max = SCREEN_H * (config.background.heightScreens - 1);
    const p = config.background.parallax;
    expect(backdropOffsetPx(0, p, max)).toBe(0);
    expect(backdropOffsetPx(1000, p, max)).toBeCloseTo(1000 * p);
    expect(backdropOffsetPx(1000, p, max)).toBeLessThan(1000 * 0.3); // much slower than the small clouds
    expect(backdropOffsetPx(1e9, p, max)).toBe(max);

    const world = new World({ config, viewHeight: SCREEN_H / T, rng: createRng(1) });
    world.cameraY = 50; // climbed 50 tiles
    expect(backdrop(world).bottom).toBeCloseTo(SCREEN_H + 50 * T * p);
  });
});
