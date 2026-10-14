import { defaultGameConfig, type GameConfig } from '../config';
import type { GameEvent, StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const base: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  easterEggs: { ...defaultGameConfig.easterEggs, chancePerGame: 0 },
  portals: { ...defaultGameConfig.portals, chancePerGame: 0 },
};
const withMushroom = (over: Partial<GameConfig['mushroom']> = {}, cfg: GameConfig = base): GameConfig => ({
  ...cfg,
  mushroom: { ...cfg.mushroom, chancePerGame: 1, chunkRange: [1, 1], ...over },
});

// one wide platform per chunk
const shelf: LevelChunk = { id: 'shelf', difficulty: 0, map: ['.........', '.........', '..#####..'] };
const start: LevelChunk = { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] };
const makeWorld = (config: GameConfig, seed = 1) =>
  new World({ config, viewHeight: 18, rng: createRng(seed), chunks: [shelf], startChunk: start });

function run(world: World, seconds: number) {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...world.step(DT, idle));
  return events;
}

function touchMushroom(world: World) {
  const m = world.main.mushrooms[0];
  world.player.x = m.x;
  world.player.y = m.y;
  world.player.vy = 0;
  return world.step(DT, idle);
}

describe('mushroom placement', () => {
  it('stands on the chosen chunk when the roll hits, and nowhere when it misses', () => {
    const hit = makeWorld(withMushroom());
    expect(hit.main.mushrooms).toHaveLength(1);
    expect(hit.main.mushrooms[0].y).toBeCloseTo(4);
    expect(makeWorld(withMushroom({ chancePerGame: 0 })).main.mushrooms).toHaveLength(0);
  });

  it('never shares a platform with the portal or the easter egg', () => {
    const cfg = withMushroom(
      {},
      {
        ...base,
        portals: { ...base.portals, chancePerGame: 1, chunkRange: [1, 1] },
        easterEggs: { ...base.easterEggs, sections: ['main'], chancePerGame: 1, chunkRange: [1, 1] },
      },
    );
    for (let seed = 1; seed <= 20; seed++) {
      const world = makeWorld(cfg, seed);
      const ys = [...world.main.mushrooms, ...world.main.portals, ...world.main.easterEggs].map((it) =>
        Math.round(it.y),
      );
      expect(new Set(ys).size).toBe(ys.length);
    }
  });
});

describe('mushroom effect', () => {
  it('touching it starts the psy mode for its duration, on the run clock', () => {
    const world = makeWorld(withMushroom({}, { ...base, psy: { ...base.psy, swirlMs: 0 } }));
    const events = touchMushroom(world);
    expect(events).toContainEqual({ type: 'mushroom' });
    expect(world.main.mushrooms).toHaveLength(0);
    expect(world.psyActive).toBe(true);
    expect(world.effects.getActive(world.time).map((e) => e.id)).toContain('psy');
    // not stepping (paused) does not use it up
    const before = world.effects.getActive(world.time).find((e) => e.id === 'psy')!.remainingMs;
    expect(before).toBeGreaterThan(base.mushroom.durationMs - 50);
    run(world, base.mushroom.durationMs / 1000 - 0.1);
    expect(world.psyActive).toBe(true);
    run(world, 0.2);
    expect(world.psyActive).toBe(false);
  });

  it('a swirl covers the switch: the game stands still, the mode switches halfway, the psy time starts after it', () => {
    const swirlMs = base.psy.swirlMs;
    const world = makeWorld(withMushroom());
    touchMushroom(world);
    expect(world.psySwirl).not.toBeNull();
    expect(world.psyActive).toBe(false);
    const y = world.player.y;
    const score = world.score;
    run(world, swirlMs / 2000 - 0.05);
    expect(world.psyActive).toBe(false);
    run(world, 0.1);
    expect(world.psyActive).toBe(true);
    // frozen meanwhile
    expect(world.player.y).toBe(y);
    expect(world.score).toBe(score);
    run(world, swirlMs / 2000);
    expect(world.psySwirl).toBeNull();
    // the full psy time is still ahead
    const left = world.effects.getActive(world.time).find((e) => e.id === 'psy')!.remainingMs;
    expect(left).toBeGreaterThan(base.mushroom.durationMs - 100);
  });

  it('when it wears off, a swirl covers the way back too', () => {
    const swirlMs = base.psy.swirlMs;
    const world = makeWorld(withMushroom());
    touchMushroom(world);
    run(world, swirlMs / 1000 + 0.05);
    run(world, base.mushroom.durationMs / 1000);
    expect(world.psySwirl).not.toBeNull();
    expect(world.psySwirl!.to).toBe(false);
    expect(world.psyActive).toBe(true);
    run(world, swirlMs / 2000 + 0.05);
    expect(world.psyActive).toBe(false);
    run(world, swirlMs / 2000);
    expect(world.psySwirl).toBeNull();
  });
});
