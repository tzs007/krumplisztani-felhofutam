import { defaultGameConfig } from '../config';
import { createRng } from '../engine/random';
import { World, type GameEvent } from '../engine/World';
import { countdownLabel, GO_MS } from '../render/countdown';
import { buildSnapshot, STRIDE } from '../render/snapshot';
import { SPRITE_KEYS } from '../render/sprites';

const DT = 1 / 120;
const config = defaultGameConfig; // real start: 3 s countdown
const makeWorld = () => new World({ config, viewHeight: 18, rng: createRng(1) });

function advance(world: World, ms: number, input = { dragging: false, dx: 0 }) {
  const events: GameEvent[] = [];
  for (let t = 0; t < ms / 1000 - 1e-9; t += DT) events.push(...world.step(DT, input));
  return events;
}

describe('start: egg + countdown', () => {
  it('counts down 3, 2, 1 while the chick sits still in the egg, ignoring input', () => {
    const world = makeWorld();
    const { x, y } = world.player;
    expect(countdownLabel(world)).toBe('3');
    expect(advance(world, 1100, { dragging: true, dx: 0.3 })).toEqual([]);
    expect(countdownLabel(world)).toBe('2');
    advance(world, 1000);
    expect(countdownLabel(world)).toBe('1');
    expect(world.player).toMatchObject({ x, y, vy: 0 });
    expect(world.cameraY).toBe(0);
    expect(world.score).toBe(0);
  });

  it('launches out of the egg after 3 s, shows GO! briefly', () => {
    const world = makeWorld();
    const events = advance(world, config.start.countdownMs + 20);
    expect(events).toContainEqual({ type: 'launch' });
    expect(world.started).toBe(true);
    expect(world.player.vy).toBeGreaterThan(0);
    expect(countdownLabel(world)).toBe('GO!');
    advance(world, GO_MS);
    expect(countdownLabel(world)).toBeNull();
  });

  it('the egg is centred on the start and drawn in front of the chick', () => {
    const world = makeWorld();
    expect(world.egg.x).toBeCloseTo(config.columns / 2);
    expect(world.egg.y).toBeCloseTo(world.player.y - config.start.eggSinkTiles);
    const cmds = buildSnapshot(world, 40, 720);
    const order: string[] = [];
    for (let i = 0; i < cmds.length; i += STRIDE) order.push(SPRITE_KEYS[cmds[i + 1]]);
    const chick = order.findIndex((k) => k.startsWith('player_'));
    const egg = order.indexOf('start_egg');
    expect(chick).toBeGreaterThanOrEqual(0);
    expect(egg).toBeGreaterThan(chick);
  });

  it('the egg stays behind in the level after launch', () => {
    const world = makeWorld();
    const egg = { ...world.egg };
    advance(world, config.start.countdownMs + 2000);
    expect(world.egg).toEqual(egg);
  });
});
