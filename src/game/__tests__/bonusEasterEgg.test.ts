import { defaultGameConfig, type GameConfig } from '../config';
import { easterEggs } from '../easterEggs';
import type { GameEvent, StepInput } from '../engine/entities';
import { createRng } from '../engine/random';
import { GROUND_Y, SideSection } from '../engine/sections/SideSection';
import { World } from '../engine/World';
import { buildSnapshot, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const DT = 1 / 120;
const config: GameConfig = {
  ...defaultGameConfig,
  start: { ...defaultGameConfig.start, countdownMs: 0 },
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
};

function bonusLevel(seed: number) {
  const world = new World({ config, viewHeight: 20, rng: createRng(seed) });
  const side = new SideSection(world);
  side.enter(world);
  return { world, side };
}

describe('easter egg in the bonus level', () => {
  it('every bonus level hides exactly one, on a raised platform, clear of other items', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { side } = bonusLevel(seed);
      expect(side.easterEggs).toHaveLength(1);
      const egg = side.easterEggs[0];
      expect(easterEggs.map((e) => e.id)).toContain(egg.eggId);
      // stands on a platform tile above the floor, before the exit
      const under = side.platforms.find(
        (p) => p.y > GROUND_Y && egg.x + egg.size / 2 > p.x && egg.x + egg.size / 2 < p.x + p.width && egg.y >= p.y && egg.y < p.y + 0.5,
      );
      expect(under).toBeDefined();
      expect(egg.x + egg.size).toBeLessThan(side.exit.x);
      // nothing else on that tile
      const tile = Math.floor(egg.x + egg.size / 2);
      const crowded = [...side.pickups, ...side.hazards].some(
        (it) => Math.floor(it.x + it.size / 2) === tile && Math.abs(it.y - egg.y) < 1,
      );
      expect(crowded).toBe(false);
    }
  });

  it('touching it reports the meme (the game shows it and pauses)', () => {
    const { world, side } = bonusLevel(3);
    const egg = side.easterEggs[0];
    side.player.x = egg.x;
    side.player.y = egg.y;
    world.time += DT * 1000;
    const input: StepInput = { dragging: false, dx: 0 };
    const events: GameEvent[] = side.step(DT, input, world);
    expect(events).toContainEqual({ type: 'easterEgg', eggId: egg.eggId });
    expect(side.easterEggs).toHaveLength(0);
    expect(world.stats.easterEggs).toBe(1);
  });

  it('is drawn in the bonus level', () => {
    const { world, side } = bonusLevel(3);
    world.bonus = side;
    world.active = side;
    side.cameraX = Math.max(0, side.easterEggs[0].x - 3);
    const cmds = buildSnapshot(world, 40, 720);
    const keys: string[] = [];
    for (let i = 0; i < cmds.length; i += STRIDE) keys.push(SPRITE_KEYS[cmds[i + 1]]);
    expect(keys).toContain(side.easterEggs[0].spriteKey);
  });
});

describe('easter egg in the main level', () => {
  it('no longer appears there by default, even with a 100% chance', () => {
    const cfg: GameConfig = { ...config, easterEggs: { ...config.easterEggs, chancePerGame: 1, chunkRange: [1, 3] } };
    for (let seed = 1; seed <= 10; seed++) {
      const world = new World({ config: cfg, viewHeight: 400, rng: createRng(seed) });
      expect(world.main.easterEggs).toHaveLength(0);
    }
  });
});
