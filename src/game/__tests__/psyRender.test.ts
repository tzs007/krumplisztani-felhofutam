import { defaultGameConfig, type GameConfig } from '../config';
import type { StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import { World } from '../engine/World';
import type { LevelChunk } from '../level/chunks';
import { hueMatrix } from '../render/colorMatrix';
import { buildSnapshot, Op, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';
import { Color } from '../../theme/colors';

const DT = 1 / 120;
const T = 40;
const SCREEN_H = 720;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  easterEggs: { ...defaultGameConfig.easterEggs, chancePerGame: 0 },
  portals: { ...defaultGameConfig.portals, chancePerGame: 0 },
  mushroom: { ...defaultGameConfig.mushroom, chancePerGame: 1, chunkRange: [1, 1] },
};
const items: LevelChunk = { id: 'items', difficulty: 0, map: ['.........', '..K.X.O..', '..#####..'] };
const start: LevelChunk = { id: 'start', difficulty: 0, map: ['.........', '....P....', '#########'] };

type Cmd = { op: number; key: string; arg: number; frame: number; frames: number; w: number; h: number };
function commands(world: World): Cmd[] {
  const raw = buildSnapshot(world, T, SCREEN_H);
  const out: Cmd[] = [];
  for (let i = 0; i < raw.length; i += STRIDE) {
    out.push({ op: raw[i], arg: raw[i + 1], key: SPRITE_KEYS[raw[i + 1]] ?? '', frame: raw[i + 2], frames: raw[i + 3], w: raw[i + 6], h: raw[i + 7] });
  }
  return out;
}
const run = (world: World, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += DT) world.step(DT, idle);
};
const makeWorld = () => new World({ config, viewHeight: SCREEN_H / T, rng: createRng(1), chunks: [items], startChunk: start });

describe('normal look', () => {
  it('draws the mushroom on its platform', () => {
    const world = makeWorld();
    expect(commands(world).some((c) => c.key === 'pickup_mushroom')).toBe(true);
  });
});

describe('psy look', () => {
  const psyWorld = () => {
    const world = makeWorld();
    world.effects.trigger('psy', world.time);
    run(world, 1);
    return world;
  };

  it('hides the platforms, oranges and everything but the cards', () => {
    const cmds = commands(psyWorld());
    expect(cmds.some((c) => c.op === Op.tile)).toBe(false);
    expect(cmds.some((c) => c.key === 'hazard_orange')).toBe(false);
    expect(cmds.some((c) => c.key === 'pickup_double_score')).toBe(false);
    expect(cmds.some((c) => c.key === 'pickup_mushroom')).toBe(false);
    expect(cmds.some((c) => c.key === 'pickup_card')).toBe(true);
  });

  it('swaps the chick and the clouds', () => {
    const cmds = commands(psyWorld());
    expect(cmds.some((c) => c.key === 'player_psy')).toBe(true);
    expect(cmds.some((c) => c.key === 'cloud')).toBe(false);
    expect(cmds.some((c) => c.key === 'psy_cloud')).toBe(true);
  });

  it('pulses the psychedelic backdrop brightness while preserving its colours', () => {
    const world = psyWorld();
    const bg1 = commands(world)[0];
    run(world, 0.5);
    const bg2 = commands(world)[0];
    expect(bg1.op).toBe(Op.backdropHue);
    expect(bg1.key).toBe('bg_psy');
    expect(bg1.frame).toBeCloseTo(config.psy.hueDegPerSecond, 5);
    expect(bg2.frame).toBeCloseTo(config.psy.hueDegPerSecond * 1.5, 5);
    expect(bg2.frames).not.toBe(bg1.frames);
    expect(bg1.frames / 1000).toBeGreaterThanOrEqual(1 - config.psy.pulseGain);
    expect(bg2.frames / 1000).toBeLessThanOrEqual(1 + config.psy.pulseGain);
  });

  it('the chick grows and shrinks (depth)', () => {
    const world = psyWorld();
    const sizes = new Set<number>();
    for (let i = 0; i < 30; i++) {
      run(world, 0.1);
      sizes.add(Math.round(commands(world).find((c) => c.key === 'player_psy')!.w));
    }
    expect(Math.max(...sizes)).toBeCloseTo(Math.round(T * 2 ** config.psy.zAmplitude), 0);
    expect(Math.min(...sizes)).toBeCloseTo(Math.round(T * 2 ** -config.psy.zAmplitude), 0);
  });

  it('flashes white when the mode switches', () => {
    const world = makeWorld();
    world.effects.trigger('psy', world.time);
    run(world, DT * 2);
    const last = commands(world).at(-1)!;
    expect(last.op).toBe(Op.fillAlpha);
    expect(last.arg).toBe(Color.white);
    expect(last.frame).toBeGreaterThan(300);
    run(world, config.psy.flashMs / 1000);
    expect(commands(world).at(-1)!.op).not.toBe(Op.fillAlpha);
  });
});

describe('hueMatrix', () => {
  it('is the identity at 0° and gain 1, and scales the colours with the gain', () => {
    const id = hueMatrix(0, 1);
    const expected = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    id.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));
    const bright = hueMatrix(0, 1.2);
    expect(bright[0]).toBeCloseTo(1.2, 5);
    expect(bright[18]).toBeCloseTo(1, 5); // alpha untouched
  });

  it('turns red towards green at 120°', () => {
    const m = hueMatrix(120, 1);
    // pure red in → mostly green out
    const r = m[0];
    const g = m[5];
    expect(g).toBeGreaterThan(r);
  });
});
