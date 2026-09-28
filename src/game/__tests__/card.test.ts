import { defaultGameConfig, type GameConfig } from "../config";
import { createRng } from "../engine/random";
import { World, type GameEvent } from "../engine/World";
import { chunks, startChunk } from "../level/chunks";
import { parseChunk } from "../level/parser";
import { DEFAULT_PICKUP_BOB, tiles } from "../level/tiles";
import { buildSnapshot, STRIDE } from "../render/snapshot";
import { SPRITE_KEYS, spriteAnimations } from "../render/sprites";

const DT = 1 / 120;
const config: GameConfig = {
  ...defaultGameConfig,
  camera: { ...defaultGameConfig.camera, autoScrollSpeed: 0, autoScrollPerDifficulty: 0 },
  start: { ...defaultGameConfig.start, countdownMs: 0 },
};
const makeWorld = (start: string[]) =>
  new World({
    config,
    viewHeight: 18,
    rng: createRng(1),
    chunks: [{ id: "empty", difficulty: 0, map: Array(9).fill(".........") }],
    startChunk: { id: "start", difficulty: 0, map: start },
  });

describe("score card", () => {
  it("is a 4-frame looping pickup that floats more than the default", () => {
    const card = tiles.K;
    expect(card).toMatchObject({ kind: "pickup", effect: "bonus", spriteKey: "pickup_card" });
    expect(spriteAnimations.pickup_card).toMatchObject({ frames: 4, loop: true });
    if (card.kind !== "pickup") throw new Error("K must be a pickup");
    expect(card.bob!.tiles).toBeGreaterThan(DEFAULT_PICKUP_BOB.tiles);
  });

  it("replaced the coin in the levels; the coin stays available as a tile", () => {
    const all = [startChunk, ...chunks].map((c) => c.map.join(""));
    expect(all.join("")).toContain("K");
    expect(all.join("")).not.toContain("C");
    expect(tiles.C).toMatchObject({ kind: "pickup", spriteKey: "pickup_coin" });
  });

  it("gives a point when collected", () => {
    const world = makeWorld([".........", "....K....", "....P....", "#########"]);
    const events: GameEvent[] = [];
    for (let t = 0; t < 1 && world.stats.pickups === 0; t += DT) events.push(...world.step(DT, { dragging: false, dx: 0 }));
    expect(events).toContainEqual({ type: "pickup", effect: "bonus" });
    expect(world.score).toBe(1 + defaultGameConfig.effects.coinBonus); // landing + card
  });

  it("floats up and down by its own amplitude in the draw list", () => {
    const world = makeWorld([".........", ".......K.", "....P....", "#########"]);
    const parsed = parseChunk([".......K."], 9).pickups[0];
    expect(parsed.bob).toEqual(tiles.K.kind === "pickup" ? tiles.K.bob : null);
    const ys: number[] = [];
    for (let t = 0; t < 1 / parsed.bob.hz; t += DT * 4) {
      for (let i = 0; i < 4; i++) world.step(DT, { dragging: false, dx: 0 });
      const cmds = buildSnapshot(world, 40, 720);
      for (let i = 0; i < cmds.length; i += STRIDE) {
        if (SPRITE_KEYS[cmds[i + 1]] === "pickup_card") ys.push(cmds[i + 5] + world.cameraY * 40);
      }
    }
    const swing = (Math.max(...ys) - Math.min(...ys)) / 40; // tiles, camera-compensated
    expect(swing).toBeGreaterThan(parsed.bob.tiles * 1.8);
    expect(swing).toBeLessThan(parsed.bob.tiles * 2.2);
  });
});
