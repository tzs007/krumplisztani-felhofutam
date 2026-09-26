import { derivePhysics, type GameConfig } from '../config';
import { LevelGenerator, type PlacedChunk } from '../level/generator';
import type { LevelChunk } from '../level/chunks';
import type { PlatformVariant } from '../level/tiles';
import { addBonus, doubleJumpHeight, doubleScore } from './effects/builtins';
import { EffectRegistry, type EffectContext, type EffectId } from './effects/EffectRegistry';
import { createRng, type Rng } from './random';

/** World space: tile units, x → right, y → UP. `y` of a platform is its top surface. */
export type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  variant: PlatformVariant;
  spriteKey: string;
};
export type Pickup = { id: number; x: number; y: number; size: number; effect: EffectId; spriteKey: string };
/** A pickup that was just taken, kept briefly so the renderer can play a collect animation in its place. */
export type CollectedPickup = Pickup & { collectedAt: number };
export type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Last horizontal direction: 1 = right, -1 = left. */
  facing: 1 | -1;
  /** Game time (ms) until which the "got a bonus" pose is shown. */
  bonusUntil: number;
  /** spriteKey of the last pickup, so the renderer can show a bonus-specific pose. */
  bonusSpriteKey: string | null;
  /** Game time (ms) of the last take-off; drives jump animations and squash & stretch. */
  landedAt: number;
  /** Highest y reached since the last take-off; how far below it the player is = fall distance. */
  apexY: number;
  /** How far (tiles) the drag target is ahead of the player; the follow spring closes it. */
  targetOffset: number;
};

/**
 * dx: horizontal finger movement since the last step, in tiles.
 * releaseVelocity: finger speed (tiles/s) at the moment of release; starts the glide.
 */
export type StepInput = { dragging: boolean; dx: number; releaseVelocity?: number };

export type GameEvent =
  | { type: 'land'; platformId: number; points: number }
  | { type: 'pickup'; effect: EffectId }
  | { type: 'gameOver' };

export type WorldOptions = {
  config: GameConfig;
  /** Visible height in tiles (screenHeight / tileSize). */
  viewHeight: number;
  rng?: Rng;
  chunks?: LevelChunk[];
  startChunk?: LevelChunk;
};

/** How long a collected pickup is remembered for its collect animation. */
const COLLECTED_TTL_MS = 1500;

export class World {
  readonly config: GameConfig;
  readonly viewHeight: number;
  readonly effects: EffectRegistry;
  player: Player;
  platforms: Platform[] = [];
  pickups: Pickup[] = [];
  collected: CollectedPickup[] = [];
  cameraY = 0;
  /** Game clock in ms; only advances while stepping, so pausing freezes effects too. */
  time = 0;
  score = 0;
  scoreMultiplier = 1;
  jumpMultiplier = 1;
  over = false;
  stats = { platforms: 0, pickups: 0 };

  private readonly gravity: number;
  private readonly jumpVelocity: number;
  private readonly generator: LevelGenerator;
  private readonly visited = new Set<number>();
  private nextId = 1;

  constructor({ config, viewHeight, rng = createRng(), chunks, startChunk }: WorldOptions) {
    this.config = config;
    this.viewHeight = viewHeight;
    ({ gravity: this.gravity, jumpVelocity: this.jumpVelocity } = derivePhysics(config));
    this.generator = new LevelGenerator(config, rng, chunks, startChunk);

    const ctx: EffectContext = {
      addScore: (n) => (this.score += n),
      setScoreMultiplier: (m) => (this.scoreMultiplier = m),
      setJumpMultiplier: (m) => (this.jumpMultiplier = m),
    };
    this.effects = new EffectRegistry(ctx)
      .register(addBonus(config.effects.coinBonus))
      .register(doubleScore(config.effects.doubleScoreMs))
      .register(doubleJumpHeight(config.effects.doubleJumpMs));

    const start = this.generator.placeStart();
    this.addChunk(start);
    const spawn = start.spawn ?? { col: Math.floor(config.columns / 2), row: 1 };
    const { widthTiles: w, heightTiles: h } = config.player;
    const y = start.baseRow + spawn.row;
    this.player = {
      x: spawn.col + (1 - w) / 2,
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      facing: 1,
      bonusUntil: 0,
      bonusSpriteKey: null,
      landedAt: -Infinity,
      apexY: y,
      targetOffset: 0,
    };
    this.fillAhead();
  }

  step(dtSeconds: number, input: StepInput): GameEvent[] {
    if (this.over) return [];
    const events: GameEvent[] = [];
    const dt = dtSeconds;
    const p = this.player;
    const { input: inputCfg, columns } = this.config;
    this.time += dt * 1000;

    // ── horizontal: the finger moves a target 1:1, a damped spring pulls the
    //    player after it (slight lag + tiny overshoot = elastic, not rigid) ──
    p.targetOffset += input.dx * inputCfg.dragSensitivity;
    if (input.dx !== 0) p.facing = input.dx > 0 ? 1 : -1;
    if (!input.dragging && input.releaseVelocity !== undefined) {
      // glide: push the target a little further in the throw direction
      const v = clamp(input.releaseVelocity * inputCfg.dragSensitivity, -inputCfg.maxGlideSpeed, inputCfg.maxGlideSpeed);
      p.targetOffset += v / inputCfg.releaseFriction;
    }
    const w = inputCfg.followFrequency;
    p.vx += (w * w * p.targetOffset - 2 * inputCfg.followDamping * w * p.vx) * dt;
    const move = p.vx * dt;
    p.x += move;
    p.targetOffset -= move;
    if (Math.abs(p.targetOffset) < 1e-3 && Math.abs(p.vx) < 0.01) {
      p.x += p.targetOffset;
      p.targetOffset = 0;
      p.vx = 0;
    }
    p.x = wrap(p.x, columns);

    // ── vertical: gravity + one-way platforms (only when falling onto the top) ──
    const prevY = p.y;
    p.vy -= this.gravity * dt;
    p.y += p.vy * dt;
    p.apexY = Math.max(p.apexY, p.y);
    if (p.vy <= 0) {
      let hit: Platform | null = null;
      for (const pl of this.platforms) {
        if (prevY >= pl.y - 1e-6 && p.y <= pl.y && overlapsX(p.x, p.w, pl.x, pl.width, columns)) {
          if (!hit || pl.y > hit.y) hit = pl;
        }
      }
      if (hit) {
        p.y = hit.y;
        p.vy = this.jumpVelocity * Math.sqrt(this.jumpMultiplier);
        p.landedAt = this.time;
        p.apexY = p.y;
        if (!this.visited.has(hit.id)) {
          this.visited.add(hit.id);
          const points = this.scoreMultiplier;
          this.score += points;
          this.stats.platforms++;
          events.push({ type: 'land', platformId: hit.id, points });
        }
      }
    }

    // ── pickups ──
    this.pickups = this.pickups.filter((pk) => {
      const touching =
        overlapsX(p.x, p.w, pk.x, pk.size, columns) && p.y < pk.y + pk.size && p.y + p.h > pk.y;
      if (!touching) return true;
      this.effects.trigger(pk.effect, this.time);
      p.bonusUntil = this.time + this.config.player.bonusPoseMs;
      p.bonusSpriteKey = pk.spriteKey;
      this.stats.pickups++;
      this.collected.push({ ...pk, collectedAt: this.time });
      events.push({ type: 'pickup', effect: pk.effect });
      return false;
    });
    this.effects.tick(this.time);

    // ── camera: only moves up ──
    const { followRatio, smoothing, autoScrollSpeed } = this.config.camera;
    const target = p.y - this.viewHeight * (1 - followRatio);
    if (target > this.cameraY) {
      this.cameraY += (target - this.cameraY) * (1 - Math.pow(1 - smoothing, dt * 60));
    }
    if (this.score > 0) {
      const level = this.generator.difficultyAt(Math.floor(this.cameraY));
      this.cameraY += (autoScrollSpeed + level * this.config.camera.autoScrollPerDifficulty) * dt;
    }

    this.fillAhead();
    this.cull();

    if (p.y + p.h < this.cameraY) {
      this.over = true;
      events.push({ type: 'gameOver' });
    }
    return events;
  }

  get difficulty(): number {
    return this.generator.difficultyAt(Math.floor(this.cameraY));
  }

  private fillAhead() {
    const needed = this.cameraY + this.viewHeight * (1 + this.config.generation.aheadScreens);
    while (this.generator.topRow < needed) this.addChunk(this.generator.next());
  }

  private cull() {
    this.collected = this.collected.filter((c) => this.time - c.collectedAt < COLLECTED_TTL_MS);
    const limit = this.cameraY - 1;
    this.platforms = this.platforms.filter((pl) => pl.y >= limit);
    this.pickups = this.pickups.filter((pk) => pk.y + pk.size >= limit);
  }

  private addChunk(chunk: PlacedChunk) {
    for (const pl of chunk.platforms) {
      this.platforms.push({
        id: this.nextId++,
        x: pl.col,
        y: chunk.baseRow + pl.row + 1,
        width: pl.width,
        variant: pl.variant,
        spriteKey: pl.spriteKey,
      });
    }
    for (const pk of chunk.pickups) {
      this.pickups.push({
        id: this.nextId++,
        x: pk.col + (1 - pk.size) / 2,
        y: chunk.baseRow + pk.row + 0.15,
        size: pk.size,
        effect: pk.effect,
        spriteKey: pk.spriteKey,
      });
    }
  }
}

export function wrap(x: number, columns: number): number {
  return ((x % columns) + columns) % columns;
}

/** Horizontal overlap on a cylinder: the right edge continues on the left. */
export function overlapsX(ax: number, aw: number, bx: number, bw: number, columns: number): boolean {
  for (const shift of [-columns, 0, columns]) {
    const x = ax + shift;
    if (x < bx + bw && x + aw > bx) return true;
  }
  return false;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
