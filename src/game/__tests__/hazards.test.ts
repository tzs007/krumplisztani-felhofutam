import { defaultGameConfig, type GameConfig } from '../config';
import { createRng } from '../engine/random';
import { World, type StepInput } from '../engine/World';
import { buildSnapshot, isBlinkOff, Op, playerSpriteKey, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };
const config: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
};
const HZ = config.hazards;

function makeWorld(start: string[]) {
  return new World({
    config,
    viewHeight: 18,
    rng: createRng(1),
    chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
    startChunk: { id: 'test-start', difficulty: 0, map: start },
  });
}

/** Orange hovering right above the spawn; the ground bounce carries the player through it. */
const orangeAbove = () => makeWorld(['.........', '.........', '....O....', '....P....', '#########']);

function stepUntil(world: World, done: () => boolean, maxSeconds = 3) {
  const events = [];
  for (let t = 0; t < maxSeconds && !done(); t += DT) events.push(...world.step(DT, idle));
  return events;
}

describe('hazards', () => {
  it('hovers up and down between its base and base + bobTiles', () => {
    const world = orangeAbove();
    const [h] = world.hazards;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 1 / HZ.bobHz; t += DT) {
      world.step(DT, idle);
      min = Math.min(min, h.y);
      max = Math.max(max, h.y);
    }
    expect(min).toBeGreaterThanOrEqual(h.baseY - 1e-9);
    expect(max).toBeLessThanOrEqual(h.baseY + HZ.bobTiles + 1e-9);
    expect(max - min).toBeGreaterThan(HZ.bobTiles * 0.9);
  });

  it('costs 1 point on touch and stays in the level', () => {
    const world = orangeAbove();
    world.score = 5;
    const events = stepUntil(world, () => world.stats.hits > 0);
    expect(events).toContainEqual({ type: 'hit', damage: 1 });
    // +1 for landing on the ground first, -1 for the hit
    expect(world.score).toBe(5 + 1 - 1);
    expect(world.hazards).toHaveLength(1);
  });

  it('never drops the score below 0', () => {
    const world = orangeAbove();
    world.score = -1; // cancels the +1 from the first landing
    stepUntil(world, () => world.stats.hits > 0);
    expect(world.score).toBe(0);
  });

  it('is invulnerable for a while after a hit, then can be hurt again', () => {
    const world = orangeAbove();
    stepUntil(world, () => world.stats.hits > 0);
    const hitAt = world.time;
    stepUntil(world, () => world.time - hitAt >= HZ.invulnerableMs * 0.9, 2);
    expect(world.stats.hits).toBe(1); // still overlapping / bouncing through it, but no new hit
    stepUntil(world, () => world.stats.hits > 1, 5);
    expect(world.stats.hits).toBe(2);
    expect(world.time - hitAt).toBeGreaterThanOrEqual(HZ.invulnerableMs);
  });

  it('hurt pose stays solid, then the player blinks until invulnerability ends', () => {
    const world = orangeAbove();
    stepUntil(world, () => world.stats.hits > 0);
    const playerDrawn = () => {
      const cmds = buildSnapshot(world, 40, 720);
      for (let i = 0; i < cmds.length; i += STRIDE) {
        if ((cmds[i] === Op.sprite || cmds[i] === Op.spriteFlipped) && SPRITE_KEYS[cmds[i + 1]].startsWith('player_')) {
          return true;
        }
      }
      return false;
    };
    const hitAt = world.player.hurtAt;
    const during = new Set<boolean>();
    const after = new Set<boolean>();
    for (let t = 0; t < 1.2; t += DT) {
      world.step(DT, idle);
      if (world.stats.hits > 1) break;
      const since = world.time - hitAt;
      if (since < HZ.hurtPoseMs) expect(playerDrawn()).toBe(true); // solid hurt pose
      else if (since < HZ.invulnerableMs) during.add(playerDrawn());
      else after.add(playerDrawn());
    }
    expect(during).toEqual(new Set([true, false])); // blinking
    expect(after.has(false)).toBe(false); // visible again
    expect(isBlinkOff(50)).toBe(false);
    expect(isBlinkOff(150)).toBe(true);
  });

  it('draws the hazard sprite', () => {
    const world = orangeAbove();
    const cmds = buildSnapshot(world, 40, 720);
    const keys: string[] = [];
    for (let i = 0; i < cmds.length; i += STRIDE) keys.push(SPRITE_KEYS[cmds[i + 1]]);
    expect(keys).toContain('hazard_orange');
  });

  it('shows the hurt pose right after a hit, then the normal poses again', () => {
    const world = orangeAbove();
    stepUntil(world, () => world.stats.hits > 0);
    const key = () => playerSpriteKey(world.player, world.time, 1.5, [], HZ.hurtPoseMs);
    expect(key()).toBe('player_hurt');
    const hitAt = world.player.hurtAt;
    stepUntil(world, () => world.time - hitAt >= HZ.hurtPoseMs, 2);
    expect(key()).not.toBe('player_hurt');
  });
});
