import { defaultGameConfig, type GameConfig } from '../config';
import { EffectRegistry, type EffectContext } from '../engine/effects/EffectRegistry';
import { addBonus, doubleJumpHeight, doubleScore } from '../engine/effects/builtins';
import { createRng } from '../engine/random';
import { overlapsX, World, wrap, type StepInput } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const noScroll: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
};

const empty: LevelChunk = { id: 'empty', difficulty: 0, map: Array(9).fill('.........') };

function makeWorld(start: string[], config: GameConfig = noScroll) {
  return new World({
    config,
    viewHeight: 18,
    rng: createRng(1),
    chunks: [empty],
    startChunk: { id: 'test-start', difficulty: 0, map: start },
  });
}

function run(world: World, seconds: number, input: StepInput = idle) {
  const events = [];
  for (let t = 0; t < seconds; t += DT) events.push(...world.step(DT, input));
  return events;
}

describe('wrap & overlap helpers', () => {
  it('wraps both directions', () => {
    expect(wrap(9.5, 9)).toBeCloseTo(0.5);
    expect(wrap(-0.5, 9)).toBeCloseTo(8.5);
  });

  it('detects overlap across the right/left edge', () => {
    expect(overlapsX(8.6, 0.8, 0, 1, 9)).toBe(true);
    expect(overlapsX(4, 0.8, 0, 1, 9)).toBe(false);
  });
});

describe('World physics', () => {
  it('auto-jumps from the ground up to about maxJumpTiles', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    let maxY = world.player.y;
    for (let t = 0; t < 1.2; t += DT) {
      world.step(DT, idle);
      maxY = Math.max(maxY, world.player.y);
    }
    expect(maxY - 1).toBeGreaterThan(defaultGameConfig.maxJumpTiles * 0.95);
    expect(maxY - 1).toBeLessThan(defaultGameConfig.maxJumpTiles * 1.05);
  });

  it('passes through a platform from below and lands on it from above', () => {
    // platform top 3 tiles above the ground, directly over the player
    const world = makeWorld(['.........', '....#....', '.........', '....P....', '#########']);
    const events = run(world, 1.5);
    const lands = events.filter((e) => e.type === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(2);
    // it went through the upper platform and then stood on it (top surface y = 4)
    expect(world.platforms.some((p) => p.y === 4)).toBe(true);
    expect(world.player.y).toBeGreaterThanOrEqual(4 - 1e-6);
  });

  it('scores 1 per NEW platform only', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    const events = run(world, 3);
    const lands = events.filter((e) => e.type === 'land');
    expect(lands).toHaveLength(1);
    expect(world.score).toBe(1);
  });

  it('moves 1:1 with the finger and wraps around the edge', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    const x0 = world.player.x;
    world.step(DT, { dragging: true, dx: 2 });
    expect(world.player.x).toBeCloseTo(x0 + 2);
    world.step(DT, { dragging: true, dx: 9 });
    expect(world.player.x).toBeCloseTo(x0 + 2);
    world.step(DT, { dragging: true, dx: -(x0 + 2) - 0.5 });
    expect(world.player.x).toBeCloseTo(8.5);
  });

  it('glides a little after release, then stops', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    world.step(DT, { dragging: true, dx: 0 });
    const x0 = world.player.x;
    world.step(DT, { dragging: false, dx: 0, releaseVelocity: 5 });
    run(world, 2);
    const travelled = wrap(world.player.x - x0, 9);
    expect(travelled).toBeGreaterThan(0.3);
    expect(travelled).toBeLessThan(1.5);
    expect(world.player.vx).toBe(0);
  });

  it('ends the game when the player falls below the screen', () => {
    // no ground under the spawn
    const world = makeWorld(['.........', '....P....', '.........']);
    const events = run(world, 5);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
    expect(world.over).toBe(true);
    expect(world.step(DT, idle)).toEqual([]);
  });

  it('ends the game when the auto-scrolling screen leaves a standing player behind', () => {
    const config: GameConfig = {
      ...defaultGameConfig,
      camera: { ...defaultGameConfig.camera, autoScrollSpeed: 5 },
    };
    const world = makeWorld(['.........', '....P....', '#########'], config);
    const events = run(world, 10);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('camera never moves down', () => {
    const world = makeWorld(['.........', '....#....', '.........', '....P....', '#########']);
    let cam = world.cameraY;
    for (let t = 0; t < 3; t += DT) {
      world.step(DT, idle);
      expect(world.cameraY).toBeGreaterThanOrEqual(cam);
      cam = world.cameraY;
    }
  });
});

describe('pickups', () => {
  it('coin gives a bonus point on top of the platform point', () => {
    const world = makeWorld(['.........', '....C....', '....P....', '#########']);
    const events = run(world, 1);
    expect(events).toContainEqual({ type: 'pickup', effect: 'bonus' });
    expect(world.score).toBe(1 + defaultGameConfig.effects.coinBonus);
    expect(world.pickups).toHaveLength(0);
  });

  it('double score doubles subsequent platform points', () => {
    // pickup is collected during the first jump; the next new platform scores 2
    const world = makeWorld(['.........', '....#....', '....X....', '....P....', '#########']);
    run(world, 2);
    expect(world.stats.pickups).toBe(1);
    expect(world.score).toBe(1 + 2);
  });
});

describe('EffectRegistry', () => {
  const makeCtx = () => {
    const state = { score: 0, scoreMult: 1, jumpMult: 1 };
    const ctx: EffectContext = {
      addScore: (n) => (state.score += n),
      setScoreMultiplier: (m) => (state.scoreMult = m),
      setJumpMultiplier: (m) => (state.jumpMult = m),
    };
    return { state, ctx };
  };

  it('applies instant and timed effects and expires them', () => {
    const { state, ctx } = makeCtx();
    const reg = new EffectRegistry(ctx).register(addBonus(3)).register(doubleScore(1000)).register(doubleJumpHeight(500));
    reg.trigger('bonus', 0);
    reg.trigger('doubleScore', 0);
    reg.trigger('doubleJump', 0);
    expect(state).toEqual({ score: 3, scoreMult: 2, jumpMult: 2 });
    expect(reg.getActive(0).map((e) => e.id).sort()).toEqual(['doubleJump', 'doubleScore']);

    reg.tick(600);
    expect(state.jumpMult).toBe(1);
    expect(state.scoreMult).toBe(2);
    reg.tick(1000);
    expect(state.scoreMult).toBe(1);
    expect(reg.getActive(1000)).toEqual([]);
  });

  it('re-triggering refreshes the timer', () => {
    const { state, ctx } = makeCtx();
    const reg = new EffectRegistry(ctx).register(doubleScore(1000));
    reg.trigger('doubleScore', 0);
    reg.trigger('doubleScore', 800);
    reg.tick(1500);
    expect(state.scoreMult).toBe(2);
    reg.tick(1800);
    expect(state.scoreMult).toBe(1);
  });

  it('supports custom effects and rejects unknown ids', () => {
    const { state, ctx } = makeCtx();
    const reg = new EffectRegistry(ctx).register({ id: 'jackpot', apply: (c) => c.addScore(100) });
    reg.trigger('jackpot', 0);
    expect(state.score).toBe(100);
    expect(() => reg.trigger('nope', 0)).toThrow(/not registered/);
  });
});
