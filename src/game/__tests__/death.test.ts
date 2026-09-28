import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { deathScale, World, type GameEvent, type StepInput } from '../engine/World';
import { buildSnapshot, Op, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  start: { ...defaultGameConfig.start, countdownMs: 0 }, // no countdown in physics tests
};

/** No ground under the spawn: the player drops straight to the screen bottom. */
const makeWorld = () =>
  new World({
    config,
    viewHeight: 18,
    rng: createRng(1),
    chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
    startChunk: { id: 'start', difficulty: 0, map: ['.........', '....P....', '.........'] },
  });

function runUntil(world: World, stop: (e: GameEvent[]) => boolean, seconds = 5, input = idle) {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const events = world.step(DT, input);
    all.push(...events);
    if (stop(events)) break;
  }
  return all;
}

const playerCmd = (world: World) => {
  const cmds = buildSnapshot(world, 40, 720);
  for (let i = 0; i < cmds.length; i += STRIDE) {
    const key = SPRITE_KEYS[cmds[i + 1]];
    if ((cmds[i] === Op.sprite || cmds[i] === Op.spriteFlipped) && key.startsWith('player_')) return key;
  }
  return null;
};

describe('death sequence', () => {
  it('starts when the feet touch the screen bottom, with a last hop', () => {
    const world = makeWorld();
    const events = runUntil(world, (e) => e.some((x) => x.type === 'death'));
    expect(events).toContainEqual({ type: 'death' });
    expect(events).not.toContainEqual({ type: 'gameOver' });
    expect(world.dying).toBe(true);
    expect(world.player.y).toBe(world.cameraY); // feet exactly on the bottom line
    expect(world.player.vy).toBeGreaterThan(0); // the last hop
  });

  it('shows the skeleton all the way down (no umbrella) and blinks after the first moment', () => {
    const world = makeWorld();
    runUntil(world, (e) => e.some((x) => x.type === 'death'));
    const seen = new Set<string | null>();
    runUntil(world, (e) => {
      seen.add(playerCmd(world));
      return e.some((x) => x.type === 'gameOver');
    });
    expect(seen).toEqual(new Set(['player_hurt', null])); // skeleton, or hidden while blinking
  });

  it('ignores input and platforms, keeps the camera still, then game over once off screen', () => {
    const world = makeWorld();
    runUntil(world, (e) => e.some((x) => x.type === 'death'));
    const camera = world.cameraY;
    // same seed without input → the arc must end at the same x
    const reference = makeWorld();
    runUntil(reference, (e) => e.some((x) => x.type === 'death'));
    runUntil(reference, (e) => e.some((x) => x.type === 'gameOver'));
    // a platform right under the death hop must not catch the player
    world.platforms.push({ id: 999, x: 0, y: camera + 0.5, width: 9, variant: 'grass', spriteKey: 'platform_grass' });
    const events = runUntil(world, (e) => e.some((x) => x.type === 'gameOver'), 5, { dragging: true, dx: 0.5 });
    expect(events).toContainEqual({ type: 'gameOver' });
    expect(events.filter((e) => e.type === 'land')).toEqual([]);
    expect(world.cameraY).toBe(camera);
    expect(world.player.x).toBeCloseTo(reference.player.x, 9);
    // even the zoomed sprite is fully below the screen
    const half = deathScale(world.time - world.diedAt, config) / 2;
    expect(world.player.y + world.player.h / 2 + half).toBeLessThan(camera);
    expect(world.over).toBe(true);
  });

  it('hops about twice as high as a normal jump', () => {
    const world = makeWorld();
    runUntil(world, (e) => e.some((x) => x.type === 'death'));
    const start = world.player.y;
    let peak = start;
    runUntil(world, (e) => {
      peak = Math.max(peak, world.player.y);
      return e.some((x) => x.type === 'gameOver');
    });
    const normal = config.maxJumpTiles; // a normal hop's height
    expect(peak - start).toBeGreaterThan(normal * 1.3);
    expect(peak - start).toBeLessThan(normal * 1.6);
  });

  it('flies along a random sideways arc and faces where it flies', () => {
    const directions = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const world = new World({
        config,
        viewHeight: 18,
        rng: createRng(seed),
        chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
        startChunk: { id: 'start', difficulty: 0, map: ['.........', '....P....', '.........'] },
      });
      runUntil(world, (e) => e.some((x) => x.type === 'death'));
      const { vx, facing } = world.player;
      expect(Math.abs(vx)).toBeGreaterThanOrEqual(config.death.driftSpeed[0]);
      expect(Math.abs(vx)).toBeLessThanOrEqual(config.death.driftSpeed[1]);
      expect(Math.sign(vx)).toBe(facing);
      directions.add(Math.sign(vx));
      const x0 = world.player.x;
      world.step(0.1, idle);
      expect(world.player.x).not.toBeCloseTo(x0, 3); // it drifts sideways
    }
    expect(directions).toEqual(new Set([-1, 1])); // both directions happen
  });

  it('the hop takes a moment: game over comes well after the death starts', () => {
    const world = makeWorld();
    runUntil(world, (e) => e.some((x) => x.type === 'death'));
    const diedAt = world.time;
    runUntil(world, (e) => e.some((x) => x.type === 'gameOver'));
    expect(world.time - diedAt).toBeGreaterThan(500);
  });

  it('zooms towards the viewer: 1× at the start, growing faster and faster, capped', () => {
    const { zoomMaxScale, zoomDurationMs } = config.death;
    expect(deathScale(0, config)).toBe(1);
    const a = deathScale(zoomDurationMs * 0.25, config) - 1;
    const b = deathScale(zoomDurationMs * 0.5, config) - deathScale(zoomDurationMs * 0.25, config);
    expect(b).toBeGreaterThan(a); // ease-in
    expect(deathScale(zoomDurationMs, config)).toBeCloseTo(zoomMaxScale);
    expect(deathScale(zoomDurationMs * 5, config)).toBeCloseTo(zoomMaxScale);
  });

  it('draws the dying chick bigger and bigger, centred on the player', () => {
    const world = makeWorld();
    runUntil(world, (e) => e.some((x) => x.type === 'death'));
    const sizes: number[] = [];
    runUntil(world, (e) => {
      const cmds = buildSnapshot(world, 40, 720);
      for (let i = 0; i < cmds.length; i += STRIDE) {
        if (SPRITE_KEYS[cmds[i + 1]] === 'player_hurt') {
          sizes.push(cmds[i + 6]);
          const centreX = (cmds[i + 4] + cmds[i + 6] / 2) / 40;
          expect(centreX).toBeCloseTo(world.player.x + world.player.w / 2, 5);
        }
      }
      return e.some((x) => x.type === 'gameOver');
    });
    expect(sizes[0]).toBeCloseTo(40, 0);
    expect(Math.max(...sizes)).toBeGreaterThan(40 * 2);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1] - 1e-9);
  });
});
