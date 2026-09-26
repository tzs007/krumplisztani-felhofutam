import { defaultGameConfig, derivePhysics } from '../config';
import { createRng } from '../engine/random';
import { World, type StepInput } from '../engine/World';
import { chunks, startChunk } from '../level/chunks';
import { parseChunk } from '../level/parser';
import { tiles } from '../level/tiles';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { buildSnapshot, jumpProgress, Op, platformPart, playerScale, playerSpriteKey, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS, spriteAnimations, spriteFrame, spriteIndex } from '../render/sprites';

const DT = 1 / 120;
const idle: StepInput = { dragging: false, dx: 0 };

function makeWorld(start: string[]) {
  return new World({
    config: {
      ...defaultGameConfig,
      camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0 },
      start: { ...defaultGameConfig.start, countdownMs: 0 },
    },
    viewHeight: 18,
    rng: createRng(1),
    chunks: [{ id: 'empty', difficulty: 0, map: Array(9).fill('.........') }],
    startChunk: { id: 'test-start', difficulty: 0, map: start },
  });
}

const playerCommand = (cmds: number[]) => {
  const playerSprites = new Set(SPRITE_KEYS.filter((k) => k.startsWith('player_')).map(spriteIndex));
  for (let i = cmds.length - STRIDE; i >= 0; i -= STRIDE) {
    if ((cmds[i] === Op.sprite || cmds[i] === Op.spriteFlipped) && playerSprites.has(cmds[i + 1])) {
      return { op: cmds[i], key: SPRITE_KEYS[cmds[i + 1]] };
    }
  }
  throw new Error('no player command');
};

describe('sprite registry', () => {
  it('has every edge variant for every platform tile and every pickup sprite', () => {
    for (const def of Object.values(tiles)) {
      if (def.kind === 'platform') {
        for (const part of ['left', 'mid', 'right', 'single']) {
          expect(SPRITE_KEYS).toContain(`${def.spriteKey}_${part}`);
        }
      }
      if (def.kind === 'pickup') expect(SPRITE_KEYS).toContain(def.spriteKey);
    }
  });

  it('rejects unknown keys', () => {
    expect(() => spriteIndex('nope')).toThrow(/Unknown sprite/);
  });
});

describe('platformPart', () => {
  it('picks edge sprites', () => {
    expect(platformPart(0, 1)).toBe('single');
    expect([0, 1, 2, 3].map((i) => platformPart(i, 4))).toEqual(['left', 'mid', 'mid', 'right']);
    expect([0, 1].map((i) => platformPart(i, 2))).toEqual(['left', 'right']);
  });

  it('every authored chunk produces only registered platform sprites', () => {
    for (const chunk of [startChunk, ...chunks]) {
      for (const pl of parseChunk(chunk.map, defaultGameConfig.columns).platforms) {
        for (let i = 0; i < pl.width; i++) {
          expect(() => spriteIndex(`${pl.spriteKey}_${platformPart(i, pl.width)}`)).not.toThrow();
        }
      }
    }
  });
});

describe('player sprite state', () => {
  const FALL = defaultGameConfig.player.fallPoseAfterTiles;
  const key = (w: World) => playerSpriteKey(w.player, w.time, FALL);

  it('keeps the jump animation over the top of a normal hop', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    world.step(DT, idle); // lands on the ground and takes off
    expect(key(world)).toBe('player_jump');
    for (let t = 0; t < 0.6; t += DT) world.step(DT, idle);
    expect(world.player.vy).toBeLessThan(0); // already descending…
    expect(world.player.apexY - world.player.y).toBeLessThan(FALL);
    expect(key(world)).toBe('player_jump'); // …but not far enough to count as a fall
  });

  it('switches to the fall pose only after dropping fallPoseAfterTiles below the apex', () => {
    // spawn high above the ground: a 6-tile drop
    const world = makeWorld([
      '.........', '....P....', '.........', '.........', '.........',
      '.........', '.........', '.........', '#########',
    ]);
    let switchedAtDrop = -1;
    for (let t = 0; t < 2 && switchedAtDrop < 0; t += DT) {
      world.step(DT, idle);
      if (key(world) === 'player_fall') switchedAtDrop = world.player.apexY - world.player.y;
    }
    expect(switchedAtDrop).toBeGreaterThanOrEqual(FALL);
    expect(switchedAtDrop).toBeLessThan(FALL + 0.5);
  });

  it('never shows the fall pose when hopping up to the next platform, and resets on landing', () => {
    // platform top 3 tiles above the ground, like in the level chunks
    const world = makeWorld(['.........', '....#....', '.........', '....P....', '#########']);
    world.step(DT, idle); // take off from the ground
    let landedOnPlatform = false;
    for (let t = 0; t < 1.5 && !landedOnPlatform; t += DT) {
      const events = world.step(DT, idle);
      expect(key(world)).toBe('player_jump');
      landedOnPlatform = events.some((e) => e.type === 'land');
    }
    expect(landedOnPlatform).toBe(true);
    expect(world.player.apexY).toBe(world.player.y);
  });

  it('shows a bonus-specific pose for a while after a pickup', () => {
    const world = makeWorld(['.........', '....C....', '....P....', '#########']);
    let pickedAt = -1;
    for (let t = 0; t < 1 && pickedAt < 0; t += DT) {
      if (world.step(DT, idle).some((e) => e.type === 'pickup')) pickedAt = world.time;
    }
    expect(pickedAt).toBeGreaterThan(0);
    expect(key(world)).toBe('player_bonus_coin');
    for (let t = 0; t < (defaultGameConfig.player.bonusPoseMs + 50) / 1000; t += DT) world.step(DT, idle);
    expect(key(world)).not.toBe('player_bonus_coin');
  });

  it('faces the last drag direction and is mirrored when facing left', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    expect(playerCommand(buildSnapshot(world, 40, 720)).op).toBe(Op.sprite);
    world.step(DT, { dragging: true, dx: -0.5 });
    world.step(DT, { dragging: false, dx: 0 });
    expect(world.player.facing).toBe(-1);
    expect(playerCommand(buildSnapshot(world, 40, 720)).op).toBe(Op.spriteFlipped);
    world.step(DT, { dragging: true, dx: 0.5 });
    expect(playerCommand(buildSnapshot(world, 40, 720)).op).toBe(Op.sprite);
  });
});

describe('effect-specific jump animation', () => {
  it('uses the flaming run while double jump is active, then the normal run again', () => {
    // J above the spawn: picked up on the first hop
    const world = makeWorld(['.........', '....J....', '....P....', '#########']);
    const FALL = defaultGameConfig.player.fallPoseAfterTiles;
    const key = () =>
      playerSpriteKey(world.player, world.time, FALL, world.effects.getActive(world.time).map((e) => e.id));
    for (let t = 0; t < 1 && world.stats.pickups === 0; t += DT) world.step(DT, idle);
    expect(key()).toBe('player_bonus_double_jump'); // pickup pose first
    const risingAfterPose = () => world.time >= world.player.bonusUntil && world.player.vy > 0;
    for (let t = 0; t < 2 && !risingAfterPose(); t += DT) world.step(DT, idle);
    expect(risingAfterPose()).toBe(true);
    expect(key()).toBe('player_jump_double_jump');
    for (let t = 0; t < defaultGameConfig.effects.doubleJumpMs / 1000; t += DT) world.step(DT, idle);
    expect(world.effects.getActive(world.time)).toEqual([]);
    expect(['player_jump', 'player_fall']).toContain(key());
  });

  it('maps effect ids to sprite names and ignores effects without a sprite', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    world.step(DT, idle); // rising
    expect(playerSpriteKey(world.player, world.time, 3, ['doubleJump'])).toBe('player_jump_double_jump');
    expect(playerSpriteKey(world.player, world.time, 3, ['doubleScore'])).toBe('player_jump');
  });
});

describe('collect animation', () => {
  const collectCmds = (world: World) => {
    const cmds = buildSnapshot(world, 40, 720);
    const out: number[] = [];
    for (let i = 0; i < cmds.length; i += STRIDE) {
      if (SPRITE_KEYS[cmds[i + 1]] === 'pickup_coin_collect') out.push(cmds[i + 2]);
    }
    return out;
  };

  it('plays once where the coin was picked up, then disappears', () => {
    const world = makeWorld(['.........', '....C....', '....P....', '#########']);
    for (let t = 0; t < 1 && world.stats.pickups === 0; t += DT) world.step(DT, idle);
    expect(world.pickups).toHaveLength(0);
    expect(collectCmds(world)).toEqual([0]); // first frame right after pickup

    for (let t = 0; t < 0.2; t += DT) world.step(DT, idle);
    expect(collectCmds(world)[0]).toBeGreaterThan(0);

    for (let t = 0; t < 0.5; t += DT) world.step(DT, idle); // 6 frames @ 15fps = 400ms
    expect(collectCmds(world)).toEqual([]);
  });

  it('forgets collected pickups after a while', () => {
    const world = makeWorld(['.........', '....C....', '....P....', '#########']);
    for (let t = 0; t < 1 && world.stats.pickups === 0; t += DT) world.step(DT, idle);
    expect(world.collected).toHaveLength(1);
    for (let t = 0; t < 2; t += DT) world.step(DT, idle);
    expect(world.collected).toHaveLength(0);
  });
});

describe('bonus pose fallback', () => {
  it('uses the generic bonus pose when no specific sprite exists', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    world.player.bonusUntil = 1000;
    world.player.bonusSpriteKey = 'pickup_banana';
    expect(playerSpriteKey(world.player, 0, 3)).toBe('player_bonus');
  });
});

describe('sprite sheets', () => {
  const pngSize = (key: string) => {
    const png = PNG.sync.read(readFileSync(join(__dirname, '../../../assets/sprites', `${key}.png`)));
    return { width: png.width, height: png.height };
  };

  it.each(SPRITE_KEYS.map((k) => [k]))('%s PNG matches its frame count (square frames, ≥128px)', (key) => {
    const frames = spriteAnimations[key]?.frames ?? 1;
    const { width, height } = pngSize(key);
    if (key === 'cloud') return expect([width, height]).toEqual([256, 128]);
    expect(height).toBeGreaterThanOrEqual(128);
    expect(width).toBe(height * frames);
  });

  it('tiles are exactly 128px so they line up on the grid', () => {
    for (const key of SPRITE_KEYS.filter((k) => k.startsWith('platform_') || k.startsWith('pickup_'))) {
      expect(pngSize(key).height).toBe(128);
    }
  });

  it('only describes animations for registered sprites', () => {
    for (const key of Object.keys(spriteAnimations)) expect(SPRITE_KEYS).toContain(key);
  });

  it('loops or holds the last frame', () => {
    expect(spriteFrame('pickup_coin', 0)).toEqual({ frame: 0, frames: 7 });
    expect(spriteFrame('pickup_coin', 250)).toEqual({ frame: 3, frames: 7 }); // 12 fps
    expect(spriteFrame('pickup_coin', 600)).toEqual({ frame: 0, frames: 7 }); // wrapped
    expect(spriteFrame('pickup_coin_collect', 5000)).toEqual({ frame: 5, frames: 6 }); // one-shot holds last
    expect(spriteFrame('player_fall', 5000)).toEqual({ frame: 0, frames: 1 }); // single image
    expect(spriteFrame('pickup_double_jump', 125)).toEqual({ frame: 1, frames: 4 }); // 8 fps
  });
});

describe('velocity-driven jump frames', () => {
  const jumpV = derivePhysics(defaultGameConfig).jumpVelocity;

  it('last frame = landing / going down, the others cover the way up', () => {
    expect(spriteAnimations.player_jump?.mode).toBe('velocity');
    expect(spriteFrame('player_jump', 0, 0)).toEqual({ frame: 0, frames: 2 });
    expect(spriteFrame('player_jump', 99999, 0.9)).toEqual({ frame: 0, frames: 2 }); // time is ignored
    expect(spriteFrame('player_jump', 0, 1)).toEqual({ frame: 1, frames: 2 });
  });

  it('per hop: landing crouch → spread legs all the way up → legs together going down', () => {
    const world = makeWorld(['.........', '....#....', '.........', '....P....', '#########']);
    const phases: string[] = [];
    for (let t = 0; t < 1.5; t += DT) {
      const events = world.step(DT, idle);
      const { frame } = spriteFrame('player_jump', 0, jumpProgress(world.player, world.time, jumpV));
      const phase = frame === 0 ? 'spread' : world.player.vy > 0 ? 'crouch' : 'down';
      if (phases[phases.length - 1] !== phase) phases.push(phase);
      if (events.some((e) => e.type === 'land') && phases.length > 1 && world.player.landedAt > 0.2) break;
    }
    expect(phases.slice(0, 3)).toEqual(['crouch', 'spread', 'down']);
  });

  it('never shows the take-off frame while moving down', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    for (let t = 0; t < 2; t += DT) {
      world.step(DT, idle);
      if (world.player.vy <= 0) {
        expect(spriteFrame('player_jump', 0, jumpProgress(world.player, world.time, jumpV)).frame).toBe(1);
      }
    }
  });

  it('progress is clamped for boosted jumps', () => {
    const p = { vy: jumpV * 1.4, landedAt: -Infinity } as Parameters<typeof jumpProgress>[0];
    expect(jumpProgress(p, 1000, jumpV)).toBe(0);
    expect(jumpProgress({ ...p, vy: 0.01 }, 1000, jumpV)).toBeLessThan(1);
    expect(jumpProgress({ ...p, vy: -5 }, 1000, jumpV)).toBe(1);
  });
});

describe('squash & stretch', () => {
  const jumpV = derivePhysics(defaultGameConfig).jumpVelocity;

  it('squashes right after take-off, stretches while rising, neutral when falling', () => {
    const world = makeWorld(['.........', '....P....', '#########']);
    world.step(DT, idle);
    const squash = playerScale(world.player, world.time, jumpV);
    expect(squash.sx).toBeGreaterThan(1);
    expect(squash.sy).toBeLessThan(1);

    for (let t = 0; t < 0.2; t += DT) world.step(DT, idle);
    const stretch = playerScale(world.player, world.time, jumpV);
    expect(stretch.sy).toBeGreaterThan(1);
    expect(stretch.sx).toBeLessThan(1);

    for (let t = 0; t < 0.4; t += DT) world.step(DT, idle);
    expect(world.player.vy).toBeLessThan(0);
    expect(playerScale(world.player, world.time, jumpV)).toEqual({ sx: 1, sy: 1 });
  });
});

describe('buildSnapshot', () => {
  it('draws a platform run as left/mid/right tiles', () => {
    const world = makeWorld(['.........', '....P....', '..####...']);
    const cmds = buildSnapshot(world, 40, 720);
    const keys: string[] = [];
    for (let i = 0; i < cmds.length; i += STRIDE) {
      if (cmds[i] === Op.sprite && SPRITE_KEYS[cmds[i + 1]].startsWith('platform_')) keys.push(SPRITE_KEYS[cmds[i + 1]]);
    }
    expect(keys).toEqual(['platform_grass_left', 'platform_grass_mid', 'platform_grass_mid', 'platform_grass_right']);
  });
});
