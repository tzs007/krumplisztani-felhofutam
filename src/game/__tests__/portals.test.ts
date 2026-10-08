import { defaultGameConfig, type GameConfig } from '../config';
import type { GameEvent, StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import type { SideSection } from '../engine/sections/SideSection';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const base: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  easterEggs: { ...defaultGameConfig.easterEggs, chancePerGame: 0 },
};
const withPortal = (over: Partial<GameConfig['portals']> = {}, cfg: GameConfig = base): GameConfig => ({
  ...cfg,
  portals: { ...cfg.portals, chancePerGame: 1, chunkRange: [1, 1], ...over },
});

// every chunk: one wide platform; the start chunk has the spawn
const shelf: LevelChunk = { id: 'shelf', difficulty: 0, map: ['.........', '.........', '..#####..'] };
const start: LevelChunk = { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] };

function makeWorld(config: GameConfig, seed = 1) {
  return new World({ config, viewHeight: 18, rng: createRng(seed), chunks: [shelf], startChunk: start });
}

function run(world: World, seconds: number, input: StepInput = idle) {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...world.step(DT, input));
  return events;
}

/** Puts the chick onto the portal of the main level and steps once. */
function touchPortal(world: World) {
  const portal = world.main.portals[0];
  world.player.x = portal.x;
  world.player.y = portal.y;
  world.player.vy = 0;
  return world.step(DT, idle);
}

/** Through the whole transition. */
const transition = (world: World) => run(world, world.config.portals.transitionMs / 1000 + DT);

describe('portal placement', () => {
  it('places exactly one portal in the chosen chunk when the roll hits', () => {
    const world = makeWorld(withPortal());
    run(world, 0.1);
    expect(world.main.portals).toHaveLength(1);
    const p = world.main.portals[0];
    // stands on the first chunk's platform (rows 3..5 above the start chunk's 3 rows)
    expect(p.y).toBeCloseTo(4);
    expect(p.target).toBe('bonus');
  });

  it('places none when the roll misses', () => {
    const world = makeWorld(withPortal({ chancePerGame: 0 }));
    run(world, 0.1);
    expect(world.main.portals).toHaveLength(0);
  });

  it('never shares a tile with the easter egg', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cfg = withPortal({}, { ...base, easterEggs: { ...base.easterEggs, chancePerGame: 1, chunkRange: [1, 1] } });
      const world = makeWorld(cfg, seed);
      const portal = world.main.portals[0];
      const egg = world.main.easterEggs[0];
      if (!portal || !egg) continue;
      const tile = (x: number, size: number, y: number) => `${Math.round(x + size / 2 - 0.5)},${Math.round(y)}`;
      expect(tile(portal.x, portal.size, portal.y)).not.toBe(tile(egg.x, egg.size, egg.y));
    }
  });
});

describe('entering and leaving the bonus level', () => {
  it('enters the bonus level through a transition; the main level stays frozen meanwhile', () => {
    const world = makeWorld(withPortal());
    const events = touchPortal(world);
    expect(events).toContainEqual({ type: 'portalEnter', target: 'bonus' });
    expect(world.main.portals).toHaveLength(0);
    expect(world.transition).not.toBeNull();
    const camera = world.cameraY;
    const { x, y } = world.player;
    transition(world);
    expect(world.transition).toBeNull();
    expect(world.active.kind).toBe('side');
    expect(world.bonusProgress).not.toBeNull();
    run(world, 1);
    expect(world.cameraY).toBe(camera);
    expect(world.player.x).toBe(x);
    expect(world.player.y).toBe(y);
    expect(world.stats.portals).toBe(1);
  });

  it('darkens to black halfway through the transition and back', () => {
    const world = makeWorld(withPortal());
    touchPortal(world);
    const half = world.config.portals.transitionMs / 2;
    run(world, half / 2000);
    expect(world.transitionAlpha()).toBeGreaterThan(0.3);
    expect(world.transitionAlpha()).toBeLessThan(0.7);
    run(world, half / 2000);
    expect(world.transitionAlpha()).toBeGreaterThan(0.9);
    transition(world);
    expect(world.transitionAlpha()).toBe(0);
  });

  it('ignores a tap during the transition (no jump at the start of the bonus level)', () => {
    const world = makeWorld(withPortal());
    touchPortal(world);
    run(world, 0.1, { ...idle, tap: { down: true, pressed: true, released: false } });
    transition(world);
    const bonus = world.active as SideSection;
    expect(bonus.player.vy).toBe(0);
    const events = run(world, 0.3);
    expect(events.filter((e) => e.type === 'bounce')).toHaveLength(0);
  });

  it('comes back onto the portal platform, safe for a moment: no auto scroll, no death, no damage', () => {
    const cfg = withPortal({}, { ...base, camera: { ...base.camera, autoScrollSpeed: 30 } });
    const world = makeWorld(cfg);
    world.score = 1; // auto scroll is on once scoring has started
    const portal = world.main.portals[0];
    touchPortal(world);
    transition(world);
    const bonus = world.active as SideSection;
    bonus.player.x = bonus.exit.x - 0.5;
    const events = run(world, DT * 2);
    expect(events).toContainEqual({ type: 'portalExit' });
    transition(world);
    expect(world.active).toBe(world.main);
    expect(world.player.y).toBeGreaterThanOrEqual(portal.y - 1e-6);
    expect(Math.abs(world.player.x + world.player.w / 2 - (portal.x + portal.size / 2))).toBeLessThan(0.01);
    const camera = world.cameraY;
    run(world, (cfg.portals.returnSafeMs - 100) / 1000);
    expect(world.dying).toBe(false);
    expect(world.isInvulnerable).toBe(true);
    // the camera only followed the bounce, it did not race up at autoScrollSpeed
    expect(world.cameraY - camera).toBeLessThan(cfg.maxJumpTiles);
  });

  it('keeps the score and the running effects across sections (double jump also works in the bonus level)', () => {
    const world = makeWorld(withPortal());
    world.score = 7;
    world.effects.trigger('doubleJump', world.time);
    touchPortal(world);
    transition(world);
    const bonus = world.active as SideSection;
    let top = 0;
    run(world, DT, { ...idle, tap: { down: true, pressed: true, released: false } });
    for (let i = 0; i < 120; i++) {
      run(world, DT, { ...idle, tap: { down: true, pressed: false, released: false } });
      top = Math.max(top, bonus.player.y);
    }
    expect(world.score).toBeGreaterThanOrEqual(7);
    // a doubled jump: √2 × the speed → twice the height
    expect(top - 1).toBeGreaterThan(world.config.maxJumpTiles * 1.5);
  });

  it('fires the milestone in the bonus level too, and rethemes the main level above the chick on return', () => {
    const world = makeWorld(withPortal());
    touchPortal(world);
    transition(world);
    const bonus = world.active as SideSection;
    world.score = world.config.milestones.every;
    run(world, DT);
    expect(bonus.bursts).toHaveLength(1);
    bonus.player.x = bonus.exit.x - 0.5;
    run(world, DT * 2);
    transition(world);
    const theme = world.config.platformThemes.sequence[1];
    const above = world.platforms.filter((p) => p.y > world.player.y + 0.5);
    expect(above.length).toBeGreaterThan(0);
    expect(above.every((p) => p.variant === theme)).toBe(true);
  });
});

describe('review fixes', () => {
  it('comes back safely even when the portal platform had sunk below the screen bottom', () => {
    const world = makeWorld(withPortal());
    const portal = world.main.portals[0];
    touchPortal(world);
    // while away, the camera stood just above the portal's platform (it was nearly off screen)
    world.cameraY = portal.y + 0.6;
    transition(world);
    const bonus = world.active as SideSection;
    bonus.player.x = bonus.exit.x - 0.5;
    run(world, DT * 2);
    transition(world);
    run(world, 1.5);
    expect(world.dying).toBe(false);
    // the return platform is on screen, under the chick
    expect(world.cameraY).toBeLessThan(portal.y);
    expect(world.platforms.some((p) => Math.abs(p.y - portal.y) < 1e-6)).toBe(true);
  });

  it('never puts the portal and the easter egg on the same platform', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const cfg = withPortal({}, { ...base, easterEggs: { ...base.easterEggs, chancePerGame: 1, chunkRange: [1, 1] } });
      const world = makeWorld(cfg, seed);
      const portal = world.main.portals[0];
      const egg = world.main.easterEggs[0];
      if (!portal || !egg) continue;
      // the shelf chunk has one platform per chunk: they must not both be on it
      expect(Math.abs(portal.y - egg.y) < 0.5).toBe(false);
    }
  });
});
