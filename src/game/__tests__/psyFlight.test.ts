import { defaultGameConfig, type GameConfig } from '../config';
import type { GameEvent, StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  easterEggs: { ...defaultGameConfig.easterEggs, chancePerGame: 0 },
  portals: { ...defaultGameConfig.portals, chancePerGame: 0 },
  mushroom: { ...defaultGameConfig.mushroom, chancePerGame: 0 },
  // the flight itself: the switch happens at once (the swirl has its own tests)
  psy: { ...defaultGameConfig.psy, swirlMs: 0 },
};

// a platform every 3 rows
const shelf: LevelChunk = { id: 'shelf', difficulty: 0, map: ['.........', '.........', '..#####..'] };
// a card, a ×2 pickup and an orange on one row, right above the start
const items: LevelChunk = { id: 'items', difficulty: 0, map: ['.........', '..K.X.O..', '..#####..'] };
const start: LevelChunk = { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] };

function makeWorld(cfg: GameConfig = config, chunks: LevelChunk[] = [shelf], settleSeconds = 0.2) {
  const world = new World({ config: cfg, viewHeight: 18, rng: createRng(1), chunks, startChunk: start });
  // land once on the start platform, then switch the mushroom mode on
  run(world, settleSeconds);
  world.effects.trigger('psy', world.time);
  return world;
}

function run(world: World, seconds: number, input: StepInput = idle) {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...world.step(DT, input));
  return events;
}

describe('psy flight', () => {
  it('keeps the player visible with older config missing the flight follow settings', () => {
    const psy = { ...config.psy } as Partial<GameConfig['psy']>;
    delete psy.followFrequency;
    delete psy.verticalFollow;
    const world = makeWorld({ ...config, psy: psy as GameConfig['psy'] });
    run(world, 1, { dragging: true, dx: 0.01, dy: -0.01 });
    expect(Number.isFinite(world.player.x)).toBe(true);
    expect(Number.isFinite(world.player.y)).toBe(true);
    expect(world.player.y).toBeGreaterThanOrEqual(world.cameraY + config.psy.minRow);
    expect(world.player.y).toBeLessThan(world.cameraY + world.viewHeight);
  });

  it('rises with the camera and never falls back', () => {
    const world = makeWorld();
    const cam0 = world.cameraY;
    let lowest = Infinity;
    let prevY = world.player.y;
    let fell = false;
    for (let i = 0; i < 360; i++) {
      run(world, DT);
      if (world.player.y < prevY - 1e-6) fell = true;
      prevY = world.player.y;
      lowest = Math.min(lowest, world.player.y - world.cameraY);
    }
    expect(world.cameraY - cam0).toBeCloseTo(config.psy.riseSpeed * 3, 0);
    expect(fell).toBe(false);
    expect(lowest).toBeGreaterThanOrEqual(config.psy.minRow - 0.5);
  });

  it('follows the finger up / down and sideways, and stays on the screen', () => {
    const world = makeWorld();
    // Start above the lower clamp even at high flight speeds, so both drags can be measured.
    run(world, DT, { dragging: true, dx: 0, dy: -6 });
    run(world, 1);
    const rel0 = world.player.y - world.cameraY;
    const x0 = world.player.x;
    // finger 2 tiles up and 1 to the right (screen y grows downwards)
    run(world, DT, { dragging: true, dx: 1, dy: -2 });
    run(world, 0.6, { dragging: true, dx: 0, dy: 0 });
    expect(world.player.y - world.cameraY - rel0).toBeCloseTo(2, 0);
    expect(world.player.x - x0).toBeCloseTo(1, 0);
    // a huge drag up stops below the HUD, a huge drag down above the screen bottom
    run(world, DT, { dragging: true, dx: 0, dy: -100 });
    run(world, 0.6, { dragging: true, dx: 0, dy: 0 });
    // Following a moving camera leaves a speed-dependent steady-state lag.
    const followLag = config.psy.riseSpeed * DT / Math.expm1(config.psy.verticalFollow * DT);
    expect(world.player.y - world.cameraY).toBeCloseTo(world.viewHeight - config.psy.topMargin - followLag, 0);
    run(world, DT, { dragging: true, dx: 0, dy: 100 });
    run(world, 0.6, { dragging: true, dx: 0, dy: 0 });
    expect(world.player.y - world.cameraY).toBeCloseTo(config.psy.minRow, 0);
    expect(world.dying).toBe(false);
  });

  it('scores every platformsPerPoint-th platform it flies past, without touching it', () => {
    const world = makeWorld();
    const score0 = world.score;
    const platforms0 = world.stats.platforms;
    const events = run(world, 3);
    const passed = world.stats.platforms - platforms0;
    // ~12 tiles climbed, a platform every 3 rows
    expect(passed).toBeGreaterThanOrEqual(3);
    expect(world.score - score0).toBe(Math.floor(passed / config.psy.platformsPerPoint));
    expect(events.filter((e) => e.type === 'land')).toHaveLength(world.score - score0);
    expect(events.filter((e) => e.type === 'bounce')).toHaveLength(0);
  });

  it('only the cards can be picked up; oranges do not hurt', () => {
    const world = makeWorld(config, [items]);
    run(world, DT); // enter flight and scatter the cards before targeting them
    const events: GameEvent[] = [];
    // put the chick right onto each item of the row (card, ×2, orange) for one step
    for (const it of [...world.pickups, ...world.hazards]) {
      world.player.x = it.x;
      world.player.y = it.y;
      events.push(...world.step(DT, idle));
    }
    const picked = events.flatMap((e) => (e.type === 'pickup' ? [e.effect] : []));
    // cards (effect "bonus") yes, the ×2 pickup no
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((effect) => effect === 'bonus')).toBe(true);
    expect(world.pickups.some((pk) => pk.effect === 'doubleScore')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('scatters existing and newly generated cards once across the flight width', () => {
    const world = makeWorld(config, [items]);
    const before = new Map(world.pickups.map((pk) => [pk.id, { x: pk.x, y: pk.y }]));
    run(world, DT);
    const cards = world.pickups.filter((pk) => pk.spriteKey === 'pickup_card');
    expect(cards.length).toBeGreaterThan(2);
    expect(new Set(cards.map((pk) => pk.x)).size).toBe(cards.length);
    for (const pk of cards) {
      expect(pk.x).toBeGreaterThanOrEqual(0);
      expect(pk.x + pk.size).toBeLessThanOrEqual(config.columns);
      expect(pk.x).not.toBe(before.get(pk.id)?.x);
    }
    const positions = new Map(world.pickups.map((pk) => [pk.id, { x: pk.x, y: pk.y }]));
    run(world, DT);
    for (const pk of world.pickups) {
      expect({ x: pk.x, y: pk.y }).toEqual(positions.get(pk.id));
      if (pk.spriteKey !== 'pickup_card' && before.has(pk.id)) expect(positions.get(pk.id)).toEqual(before.get(pk.id));
    }
    run(world, 4);
    const generated = world.pickups.filter((pk) => pk.spriteKey === 'pickup_card' && !before.has(pk.id));
    expect(generated.length).toBeGreaterThan(2);
    expect(new Set(generated.map((pk) => pk.x)).size).toBe(generated.length);
    for (const pk of generated) {
      expect(pk.x).toBeGreaterThanOrEqual(0);
      expect(pk.x + pk.size).toBeLessThanOrEqual(config.columns);
    }
  });

  it('when the mushroom wears off: hops off and is safe for a moment, even with fast auto scroll', () => {
    const cfg: GameConfig = { ...config, camera: { ...config.camera, autoScrollSpeed: 20 } };
    // mushroom right at the start: the fast auto scroll would end the run before it otherwise
    const world = makeWorld(cfg, [shelf], 0);
    run(world, cfg.mushroom.durationMs / 1000 + 0.05);
    expect(world.score).toBeGreaterThan(0); // so the auto scroll is on after the flight
    expect(world.psyActive).toBe(false);
    run(world, DT * 2);
    expect(world.player.vy).toBeGreaterThan(0);
    run(world, (cfg.psy.endSafeMs - 100) / 1000);
    expect(world.dying).toBe(false);
  });

  it('a milestone during the flight: fireworks, and the platforms above take the next theme', () => {
    const world = makeWorld();
    world.score = config.milestones.every;
    run(world, DT);
    expect(world.bursts.length).toBe(1);
    const theme = config.platformThemes.sequence[1];
    const above = world.platforms.filter((p) => p.y > world.player.y);
    expect(above.length).toBeGreaterThan(0);
    expect(above.every((p) => p.variant === theme)).toBe(true);
  });
});

describe('review fix: end of the flight', () => {
  // nothing but the start platform: no platform anywhere near the chick when the mushroom wears off
  const empty: LevelChunk = { id: 'empty', difficulty: 0, map: Array(9).fill('.........') };

  it('lands the chick on a platform when the mushroom wears off, even where there is none', () => {
    const world = makeWorld(config, [empty], 0);
    run(world, config.mushroom.durationMs / 1000 + 0.05);
    expect(world.psyActive).toBe(false);
    // well past the safe time: still alive, bouncing on something under it
    const events = run(world, (config.psy.endSafeMs + 3000) / 1000);
    expect(world.dying).toBe(false);
    expect(events.some((e) => e.type === 'bounce')).toBe(true);
    expect(world.player.y).toBeGreaterThan(world.cameraY);
  });
});
