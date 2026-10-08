import { defaultGameConfig, type GameConfig } from '../config';
import type { StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import type { SideSection } from '../engine/sections/SideSection';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';
import { buildSnapshot, Op, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';
import { Color } from '../../theme/colors';

const DT = 1 / 120;
const T = 40; // main level tile size (px)
const SCREEN_H = 720;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  easterEggs: { ...defaultGameConfig.easterEggs, chancePerGame: 0 },
  portals: { ...defaultGameConfig.portals, chancePerGame: 1, chunkRange: [1, 1] },
};
const shelf: LevelChunk = { id: 'shelf', difficulty: 0, map: ['.........', '.........', '..#####..'] };
const start: LevelChunk = { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] };

type Cmd = { op: number; key: string; arg: number; frame: number; x: number; y: number; w: number; h: number };
function commands(world: World): Cmd[] {
  const raw = buildSnapshot(world, T, SCREEN_H);
  const out: Cmd[] = [];
  for (let i = 0; i < raw.length; i += STRIDE) {
    out.push({
      op: raw[i],
      arg: raw[i + 1],
      key: SPRITE_KEYS[raw[i + 1]] ?? '',
      frame: raw[i + 2],
      x: raw[i + 4],
      y: raw[i + 5],
      w: raw[i + 6],
      h: raw[i + 7],
    });
  }
  return out;
}

function makeWorld() {
  return new World({ config, viewHeight: SCREEN_H / T, rng: createRng(1), chunks: [shelf], startChunk: start });
}
const run = (world: World, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += DT) world.step(DT, idle);
};
function enterBonus(world: World) {
  const portal = world.main.portals[0];
  world.player.x = portal.x;
  world.player.y = portal.y;
  world.player.vy = 0;
  world.step(DT, idle);
  run(world, config.portals.transitionMs / 1000 + DT);
  return world.active as SideSection;
}

describe('main level: portal', () => {
  it('draws the portal standing on its platform', () => {
    const world = makeWorld();
    const portal = world.main.portals[0];
    const cmd = commands(world).find((c) => c.key === 'portal');
    expect(cmd).toBeDefined();
    expect(cmd!.x).toBeCloseTo(portal.x * T);
    expect(cmd!.w).toBeCloseTo(portal.size * T);
  });
});

describe('bonus level drawing', () => {
  it('uses the zoomed-out tile size and scrolls with the camera', () => {
    const world = makeWorld();
    const bonus = enterBonus(world);
    run(world, 2);
    const ts = (config.columns * T) / config.side.viewColumns;
    const cmds = commands(world);
    // the floor: tiles at screen x = (tile x − cameraX) · ts, top at the ground line
    const floorTiles = cmds.filter((c) => c.op === Op.tile && c.key.startsWith(`platform_${config.side.groundTheme}`));
    expect(floorTiles.length).toBeGreaterThan(config.side.viewColumns - 1);
    for (const c of floorTiles) {
      const tileX = c.x / ts + bonus.cameraX;
      expect(Math.abs(tileX - Math.round(tileX))).toBeLessThan(1e-6);
      expect(c.w).toBeCloseTo(ts);
    }
    // the chick, feet on the floor
    const chick = cmds.find((c) => c.key.startsWith('player_'));
    expect(chick).toBeDefined();
    expect((chick!.x + chick!.w / 2) / ts + bonus.cameraX).toBeCloseTo(bonus.player.x + bonus.player.w / 2, 1);
    expect(chick!.y + chick!.h).toBeCloseTo(SCREEN_H - bonus.player.y * ts, 0);
  });

  it('alternates the running frames while on the ground', () => {
    const world = makeWorld();
    enterBonus(world);
    const frames = new Set<number>();
    for (let i = 0; i < 40; i++) {
      run(world, DT);
      frames.add(commands(world).find((c) => c.key.startsWith('player_'))!.frame);
    }
    expect(frames.size).toBeGreaterThan(1);
  });

  it('draws the exit portal at the end of the level', () => {
    const world = makeWorld();
    const bonus = enterBonus(world);
    bonus.player.x = bonus.exit.x - 3;
    run(world, DT);
    expect(commands(world).some((c) => c.key === 'portal')).toBe(true);
  });
});

describe('transition', () => {
  it('covers the whole screen with see-through black, on top of everything', () => {
    const world = makeWorld();
    const portal = world.main.portals[0];
    world.player.x = portal.x;
    world.player.y = portal.y;
    world.player.vy = 0;
    world.step(DT, idle);
    run(world, config.portals.transitionMs / 4000);
    const cmds = commands(world);
    const last = cmds[cmds.length - 1];
    expect(last.op).toBe(Op.fillAlpha);
    expect(last.arg).toBe(Color.black);
    expect(last.frame / 1000).toBeCloseTo(world.transitionAlpha(), 2);
    expect(last.w).toBe(config.columns * T);
    expect(last.h).toBe(SCREEN_H);
  });
});
