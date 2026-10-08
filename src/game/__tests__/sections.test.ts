import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { World, type StepInput } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  start: { ...defaultGameConfig.start, countdownMs: 0 },
};
const empty: LevelChunk = { id: 'empty', difficulty: 0, map: Array(9).fill('.........') };

function makeWorld() {
  return new World({
    config,
    viewHeight: 18,
    rng: createRng(1),
    chunks: [empty],
    startChunk: { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] },
  });
}

describe('run and sections', () => {
  it('starts in the vertical main section, which the facade shows', () => {
    const world = makeWorld();
    expect(world.main.kind).toBe('vertical');
    expect(world.active).toBe(world.main);
    expect(world.player).toBe(world.main.player);
    expect(world.platforms).toBe(world.main.platforms);
  });

  it('keeps the score on the run: a section adds to it, and it never goes below zero', () => {
    const world = makeWorld();
    world.addScore(3);
    expect(world.score).toBe(3);
    world.addScore(-10);
    expect(world.score).toBe(0);
  });

  it('puts the milestone fireworks into the active section', () => {
    const world = makeWorld();
    world.score = config.milestones.every;
    world.step(DT, idle);
    expect(world.main.bursts).toHaveLength(1);
    expect(world.bursts).toBe(world.main.bursts);
  });

  it('hands out ids from one counter for every section', () => {
    const world = makeWorld();
    const a = world.nextId();
    const b = world.nextId();
    expect(b).toBe(a + 1);
  });
});
