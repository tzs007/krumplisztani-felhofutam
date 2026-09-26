import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { World, type GameEvent, type StepInput } from '../engine/World';
import { buildSnapshot, starState, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  start: { ...defaultGameConfig.start, countdownMs: 0 }, // no countdown in physics tests
};
const M = config.milestones;

const makeWorld = (seed = 1) =>
  new World({
    config,
    viewHeight: 18,
    rng: createRng(seed),
    chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
    startChunk: { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] },
  });

const milestones = (events: GameEvent[]) => events.filter((e) => e.type === 'milestone');
const starCmds = (world: World) => {
  const cmds = buildSnapshot(world, 40, 720);
  const out: number[][] = [];
  for (let i = 0; i < cmds.length; i += STRIDE) {
    if (SPRITE_KEYS[cmds[i + 1]] === 'effect_star') out.push(cmds.slice(i, i + STRIDE));
  }
  return out;
};

describe('score milestones', () => {
  it('fires once when the score reaches the first milestone', () => {
    const world = makeWorld();
    world.score = M.every - 1;
    expect(milestones(world.step(DT, idle))).toEqual([{ type: 'milestone', score: M.every }]); // landing +1
    for (let t = 0; t < 2; t += DT) expect(milestones(world.step(DT, idle))).toEqual([]);
  });

  it('does not fire again after dropping below the milestone and climbing back', () => {
    const world = makeWorld();
    world.score = M.every;
    expect(milestones(world.step(DT, idle))).toHaveLength(1);
    world.score = M.every - 1; // e.g. hit by an orange
    world.step(DT, idle);
    world.score = M.every + Math.floor(M.every / 2);
    expect(milestones(world.step(DT, idle))).toEqual([]);
  });

  it('fires again at every further multiple', () => {
    const world = makeWorld();
    world.score = M.every * 2.5; // jumped past two milestones at once
    expect(milestones(world.step(DT, idle)).map((e) => e.type === 'milestone' && e.score)).toEqual([
      M.every,
      M.every * 2,
    ]);
  });
});

describe('star burst', () => {
  it('has 7–10 stars, both small and large', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const world = makeWorld(seed);
      world.score = M.every;
      world.step(DT, idle);
      const [burst] = world.bursts;
      expect(burst.particles.length).toBeGreaterThanOrEqual(M.minStars);
      expect(burst.particles.length).toBeLessThanOrEqual(10);
      const sizes = burst.particles.map((p) => p.size);
      expect(Math.min(...sizes)).toBeLessThanOrEqual(M.smallSize[1]);
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(M.largeSize[0]);
    }
  });

  it('stays where it went off (firework), the player moves on', () => {
    const world = makeWorld();
    world.score = M.every;
    world.step(DT, idle);
    const [burst] = world.bursts;
    const origin = { x: burst.x, y: burst.y };
    expect(origin.x).toBeCloseTo(world.player.x + world.player.w / 2);
    for (let t = 0; t < 0.4; t += DT) world.step(DT, { dragging: true, dx: 0.05 }); // player moves away
    expect(world.player.x + world.player.w / 2).toBeGreaterThan(origin.x + 1);
    expect(world.bursts[0]).toMatchObject(origin); // origin unchanged

    // stars are spread around the fixed origin, not around the player
    const cmds = starCmds(world);
    const meanX = cmds.reduce((sum, c) => sum + c[4] + c[6] / 2, 0) / cmds.length / 40;
    expect(Math.abs(meanX - origin.x)).toBeLessThan(1);
  });

  it('stars fly out around the player, then shrink away and the burst is removed', () => {
    const world = makeWorld();
    world.score = M.every;
    world.step(DT, idle);
    const count = world.bursts[0].particles.length;
    expect(starCmds(world)).toHaveLength(count);

    for (let t = 0; t < 0.3; t += DT) world.step(DT, idle);
    const mid = starCmds(world);
    expect(mid).toHaveLength(count);
    const px = (world.player.x + world.player.w / 2) * 40;
    const spreadX = mid.map((c) => c[4] + c[6] / 2 - px);
    expect(Math.min(...spreadX)).toBeLessThan(-20); // some went left…
    expect(Math.max(...spreadX)).toBeGreaterThan(20); // …some went right

    for (let t = 0; t < (M.lifeMs * 1.3) / 1000; t += DT) world.step(DT, idle);
    expect(starCmds(world)).toEqual([]);
    expect(world.bursts).toEqual([]);
  });

  it('pops in, keeps its size, then shrinks to nothing', () => {
    const star = { vx: 1, vy: 2, size: 0.6, lifeMs: 1000 };
    expect(starState(star, 0, 7)!.size).toBeCloseTo(0.24);
    expect(starState(star, 300, 7)!.size).toBeCloseTo(0.6);
    expect(starState(star, 800, 7)!.size).toBeCloseTo(0.3);
    expect(starState(star, 1000, 7)).toBeNull();
  });
});
