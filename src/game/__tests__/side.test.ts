import { defaultGameConfig, type GameConfig } from '../config';
import type { GameEvent, StepInput, TapState } from '../engine/entities';
import { createRng } from '../engine/random';
import { SideSection } from '../engine/sections/SideSection';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
};
const none: TapState = { down: false, pressed: false, released: false };

// a flat stretch, a card one tile above the ground at x = 14, an orange on the ground at x = 26,
// the exit portal at the very end (x = 39)
const start: LevelChunk = { id: 'side-start', difficulty: 0, map: ['..........'] };
const middle: LevelChunk = {
  id: 'side-mid',
  difficulty: 0,
  map: ['..........', '....K.....', '..........'],
};
const orange: LevelChunk = { id: 'side-orange', difficulty: 0, map: ['......O...'] };
const end: LevelChunk = { id: 'side-end', difficulty: 0, map: ['.........G'] };

function setup(chunks: LevelChunk[] = [middle, orange], cfg: GameConfig = config) {
  const world = new World({ config: cfg, viewHeight: 18, rng: createRng(7) });
  const side = new SideSection(world, { start, chunks, end, chunkCount: chunks.length, shuffle: false });
  side.enter(world);
  return { world, side };
}

/** Steps the side section on the run's clock; `tapAt(i)` gives the tap state for step i. */
function run(world: World, side: SideSection, seconds: number, tapAt: (i: number) => TapState = () => none) {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    world.time += DT * 1000;
    const input: StepInput = { dragging: false, dx: 0, tap: tapAt(i) };
    events.push(...side.step(DT, input, world));
  }
  return events;
}

/** Press on step `at`, hold for `holdSteps`, then release. */
const press =
  (at: number, holdSteps: number) =>
  (i: number): TapState => ({
    down: i >= at && i < at + holdSteps,
    pressed: i === at,
    released: i === at + holdSteps,
  });

describe('side section: level', () => {
  it('lays the chunks out left to right on a continuous ground', () => {
    const { side } = setup();
    expect(side.length).toBe(40);
    const ground = side.platforms.find((p) => p.y === 1)!;
    expect(ground.x).toBe(0);
    expect(ground.width).toBe(40);
    expect(side.exit.x).toBeGreaterThan(38);
  });
});

describe('side section: running', () => {
  it('runs right by itself and the camera follows, never past the end', () => {
    const { world, side } = setup();
    const x0 = side.player.x;
    run(world, side, 1);
    expect(side.player.x - x0).toBeCloseTo(config.side.runSpeed, 1);
    expect(side.cameraX).toBeGreaterThan(0);
    run(world, side, 20);
    expect(side.cameraX).toBeLessThanOrEqual(side.length - config.side.viewColumns);
    expect(side.player.x + side.player.w).toBeLessThanOrEqual(side.length + 1e-6);
  });

  it('cannot fall: stays on the ground to the end without any input', () => {
    const { world, side } = setup([middle, middle, middle]);
    let lowest = Infinity;
    for (let s = 0; s < 12; s++) {
      run(world, side, 0.5);
      lowest = Math.min(lowest, side.player.y);
    }
    expect(lowest).toBeGreaterThanOrEqual(1 - 1e-6);
  });
});

describe('side section: jumping', () => {
  it('stands on the ground without bouncing by itself', () => {
    const { world, side } = setup();
    const events = run(world, side, 1);
    expect(events.filter((e) => e.type === 'bounce')).toHaveLength(0);
    expect(side.player.y).toBeCloseTo(1);
  });

  it('jumps on a tap; holding longer jumps higher than a short tap', () => {
    const highest = (holdSteps: number) => {
      const { world, side } = setup();
      let top = 0;
      const tap = press(10, holdSteps);
      for (let i = 0; i < 150; i++) {
        const events = run(world, side, DT, () => tap(i));
        if (i === 10) expect(events.some((e) => e.type === 'bounce')).toBe(true);
        top = Math.max(top, side.player.y);
      }
      return top - 1;
    };
    const short = highest(3);
    const long = highest(80);
    expect(long).toBeGreaterThan(config.maxJumpTiles * 0.9);
    expect(short).toBeLessThan(long * 0.6);
  });

  it('a finger kept down does not jump again after landing', () => {
    const { world, side } = setup();
    const events = run(world, side, 3, (i) => ({ down: i >= 10, pressed: i === 10, released: false }));
    expect(events.filter((e) => e.type === 'bounce')).toHaveLength(1);
  });

  it('a tap just before landing still jumps (jump buffer)', () => {
    const { world, side } = setup();
    run(world, side, 0.2, press(0, 2));
    // falling back down: press a few steps before touching the ground
    let pressedAt = -1;
    let bounces = 0;
    for (let i = 0; i < 200; i++) {
      const nearGround = side.player.vy < 0 && side.player.y < 1.3 && pressedAt < 0;
      if (nearGround) pressedAt = i;
      const events = run(world, side, DT, () => ({ down: false, pressed: i === pressedAt, released: false }));
      bounces += events.filter((e) => e.type === 'bounce').length;
    }
    expect(pressedAt).toBeGreaterThan(0);
    expect(bounces).toBe(1);
  });

  it('a tap just after running off a platform edge still jumps (coyote time)', () => {
    // a ledge 2 tiles up from x = 13 to 19: jump onto it, run off its right end, tap right after
    const ledge: LevelChunk = { id: 'ledge', difficulty: 0, map: ['...######.', '..........'] };
    const { world, side } = setup([ledge, orange]);
    let jumped = false;
    run(world, side, 3, (i) => {
      const pressNow = !jumped && side.player.x > 10.5;
      if (pressNow) jumped = true;
      return { down: pressNow, pressed: pressNow, released: false };
    });
    expect(side.player.y).toBeCloseTo(3); // standing on the ledge
    let offAt = -1;
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      if (offAt < 0 && side.player.y < 3) offAt = i;
      const tapNow = offAt >= 0 && i === offAt + 2;
      const events = run(world, side, DT, () => ({ down: tapNow, pressed: tapNow, released: false }));
      if (events.some((e) => e.type === 'bounce')) bounced = true;
    }
    expect(offAt).toBeGreaterThanOrEqual(0);
    expect(bounced).toBe(true);
  });
});

describe('side section: pickups, oranges, exit', () => {
  it('scores the card with a jump, loses a point on the orange', () => {
    const { world, side } = setup([middle, orange]);
    world.score = 5;
    // jump just before the card (x = 14, 1–2 tiles up) so the chick rises through it;
    // no jump at the orange (x = 26)
    const events = run(world, side, 6, () => {
      const x = side.player.x;
      const pressNow = x > 13 && x < 13.05;
      return { down: pressNow, pressed: pressNow, released: false };
    });
    expect(events.some((e) => e.type === 'pickup')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(world.score).toBe(5 + config.effects.coinBonus - config.hazards.damage);
  });

  it('reports the exit portal once, with the finish bonus', () => {
    const { world, side } = setup([middle]);
    const events = run(world, side, 12);
    expect(events.filter((e) => e.type === 'portalExit')).toHaveLength(1);
    expect(world.score).toBe(config.side.finishBonus);
    expect(side.progress).toBe(1);
  });
});

describe('side section: the real chunks', () => {
  it('builds a level with the exit at the end, every item within one jump of something to stand on', () => {
    const world = new World({ config, viewHeight: 18, rng: createRng(3) });
    const side = new SideSection(world, { shuffle: false, chunkCount: 7 });
    expect(side.exit.x).toBeGreaterThan(side.length - 2);
    // what the chick can stand on below x (the floor counts)
    const standTop = (x: number, w: number, below: number) =>
      Math.max(...side.platforms.filter((p) => p.y < below && p.x < x + w && p.x + p.width > x).map((p) => p.y));
    for (const pk of side.pickups) {
      expect(pk.y - standTop(pk.x, pk.size, pk.y)).toBeLessThanOrEqual(config.maxJumpTiles);
    }
    for (const pl of side.platforms) {
      if (pl.y === 1) continue;
      expect(pl.y - standTop(pl.x, pl.width, pl.y)).toBeLessThanOrEqual(config.maxJumpTiles - 0.5);
    }
  });
});
