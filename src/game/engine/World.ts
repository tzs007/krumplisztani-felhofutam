import { derivePhysics, type EasterEggItemDef, type GameConfig } from '../config';
import { LevelGenerator, type PlacedChunk } from '../level/generator';
import type { LevelChunk } from '../level/chunks';
import type { PlatformVariant } from '../level/tiles';
import { addBonus, doubleJumpHeight, doubleScore } from './effects/builtins';
import { EffectRegistry, type EffectContext, type EffectId } from './effects/EffectRegistry';
import { createRng, type Rng } from './random';
import { easterEggs as easterEggContent } from '../easterEggs';

const easterEggIds = easterEggContent.map((e) => e.id);
/** How far a "hover" item floats above its platform (like pickups). */
const HOVER_LIFT = 0.15;

/** The in-level object of an easter egg: its own `item` fields over the config default. */
export function easterEggItemDef(eggId: string, config: GameConfig): EasterEggItemDef {
  const own = easterEggContent.find((e) => e.id === eggId)?.item;
  return { ...config.easterEggs.defaultItem, ...own };
}

/** World space: tile units, x → right, y → UP. `y` of a platform is its top surface. */
export type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  variant: PlatformVariant;
  spriteKey: string;
};
export type Pickup = {
  id: number;
  x: number;
  y: number;
  size: number;
  effect: EffectId;
  spriteKey: string;
  /** Visual float (tiles / Hz); the hitbox stays at `y`. */
  bob: { tiles: number; hz: number };
};
/**
 * Hovering obstacle: `baseY` is its lowest point (just above the platform),
 * `y` bobs between baseY and baseY + bobTiles. Touching it costs points.
 */
export type Hazard = { id: number; x: number; y: number; baseY: number; size: number; spriteKey: string; phase: number };
/** One star of a milestone burst, relative to the burst origin (tiles, y up). */
export type StarParticle = { vx: number; vy: number; size: number; lifeMs: number };
/**
 * Star explosion like a firework: it stays where the player was when it went
 * off (world space), the player flies on. Positions are computed from time.
 */
export type Burst = { id: number; startedAt: number; x: number; y: number; particles: StarParticle[] };

/**
 * Hidden meme in the level: whatever sprite the meme defines. `y` is the
 * bottom of its box (platform top for "ground", a bit above for "hover").
 */
export type EasterEggItem = {
  id: number;
  x: number;
  y: number;
  size: number;
  spriteKey: string;
  placement: EasterEggItemDef['placement'];
  eggId: string;
};

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
  /** Game time (ms) of the last hazard hit; drives invulnerability, blinking and the hurt pose. */
  hurtAt: number;
};

/**
 * dx: horizontal finger movement since the last step, in tiles.
 * releaseVelocity: finger speed (tiles/s) at the moment of release; starts the glide.
 */
export type StepInput = { dragging: boolean; dx: number; releaseVelocity?: number };

export type GameEvent =
  | { type: 'land'; platformId: number; points: number }
  | { type: 'pickup'; effect: EffectId }
  | { type: 'hit'; damage: number }
  | { type: 'milestone'; score: number }
  /** Feet reached the screen bottom: the death hop starts; gameOver follows once off screen. */
  | { type: 'death' }
  /** Countdown finished: the chick hops out of the egg. */
  | { type: 'launch' }
  /** Found a hidden meme; the game shows it (and pauses) */
  | { type: 'easterEgg'; eggId: string }
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
  hazards: Hazard[] = [];
  bursts: Burst[] = [];
  easterEggs: EasterEggItem[] = [];
  cameraY = 0;
  /** Game clock in ms; only advances while stepping, so pausing freezes effects too. */
  time = 0;
  score = 0;
  scoreMultiplier = 1;
  jumpMultiplier = 1;
  over = false;
  /** False during the start countdown: the chick sits in the egg, nothing moves. */
  started: boolean;
  /** Game time (ms) of the hop out of the egg. */
  launchedAt = -Infinity;
  /** Egg shell at the start: `x` = centre, `y` = bottom (tiles). Stays in the level. */
  egg: { x: number; y: number; size: number };
  /** Death sequence running (hurt pose, last hop, falling out); gameplay is frozen. */
  dying = false;
  diedAt = -Infinity;
  stats = { platforms: 0, pickups: 0, hits: 0, easterEggs: 0 };

  private readonly gravity: number;
  private readonly jumpVelocity: number;
  /** Terminal fall speed under the umbrella (tiles/s). */
  readonly glideFallSpeed: number;
  private readonly generator: LevelGenerator;
  private readonly visited = new Set<number>();
  private readonly rng: Rng;
  /** Chunk number (after the start) that hides this game's easter egg; -1 = none this game. */
  private easterEggChunk: number;
  private chunksPlaced = 0;
  /** Next score that triggers a burst; only moves up, so dropping below and back doesn't re-fire. */
  private nextMilestone: number;
  private nextId = 1;

  constructor({ config, viewHeight, rng = createRng(), chunks, startChunk }: WorldOptions) {
    this.config = config;
    this.viewHeight = viewHeight;
    this.rng = rng;
    // drop rate: one roll per game, at most one easter egg
    const { chancePerGame, chunkRange } = config.easterEggs;
    this.easterEggChunk =
      easterEggIds.length > 0 && rng() < chancePerGame
        ? chunkRange[0] + Math.floor(rng() * (chunkRange[1] - chunkRange[0] + 1))
        : -1;
    this.nextMilestone = config.milestones.every;
    ({ gravity: this.gravity, jumpVelocity: this.jumpVelocity } = derivePhysics(config));
    // speed reached when the umbrella opens (after falling fallPoseAfterTiles from the apex), scaled down
    const openSpeed = Math.sqrt(2 * this.gravity * config.player.fallPoseAfterTiles);
    this.glideFallSpeed = openSpeed * config.player.glideSpeedFactor;
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
    this.addChunk(start, false);
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
      hurtAt: -Infinity,
    };
    const { eggSizeTiles, eggSinkTiles, countdownMs } = config.start;
    // no countdown: play from the first step (the chick drops onto the ground and bounces)
    this.started = countdownMs <= 0;
    this.egg = { x: this.player.x + w / 2, y: y - eggSinkTiles, size: eggSizeTiles };
    this.fillAhead();
  }

  /** Ms left of the start countdown (0 once the chick has launched). */
  get countdownRemainingMs(): number {
    return this.started ? 0 : Math.max(0, this.config.start.countdownMs - this.time);
  }

  step(dtSeconds: number, input: StepInput): GameEvent[] {
    if (this.over) return [];
    if (this.dying) return this.stepDying(dtSeconds);
    if (!this.started) {
      // countdown: the chick waits in the egg; input is ignored
      this.time += dtSeconds * 1000;
      if (this.time < this.config.start.countdownMs) return [];
      this.started = true;
      this.launchedAt = this.time;
      const p = this.player;
      p.vy = this.jumpVelocity;
      p.landedAt = this.time;
      p.apexY = p.y;
      return [{ type: 'launch' }];
    }
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
    const glide = this.glideFallSpeed;
    if (isFalling(p, this.config.player.fallPoseAfterTiles) && p.vy - this.gravity * dt < -glide) {
      // umbrella open: instead of accelerating, ease toward the glide speed
      // (brakes if faster, never overshoots it)
      p.vy = -glide + (p.vy + glide) * Math.exp(-this.config.player.glideDrag * dt);
    } else {
      p.vy -= this.gravity * dt;
    }
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
    this.easterEggs = this.easterEggs.filter((egg) => {
      const touching =
        overlapsX(p.x, p.w, egg.x, egg.size, columns) && p.y < egg.y + egg.size && p.y + p.h > egg.y;
      if (!touching) return true;
      this.stats.easterEggs++;
      events.push({ type: 'easterEgg', eggId: egg.eggId });
      return false;
    });
    this.effects.tick(this.time);

    // ── hazards: hover up and down; touching one costs points (then brief invulnerability) ──
    const hz = this.config.hazards;
    for (const h of this.hazards) {
      h.y = h.baseY + ((1 - Math.cos((this.time / 1000) * hz.bobHz * 2 * Math.PI + h.phase)) / 2) * hz.bobTiles;
    }
    if (!this.isInvulnerable) {
      const hit = this.hazards.find((h) => {
        const box = h.size * hz.hitboxScale;
        const inset = (h.size - box) / 2;
        return (
          overlapsX(p.x, p.w, h.x + inset, box, columns) && p.y < h.y + inset + box && p.y + p.h > h.y + inset
        );
      });
      if (hit) {
        this.score = Math.max(0, this.score - hz.damage);
        p.hurtAt = this.time;
        this.stats.hits++;
        events.push({ type: 'hit', damage: hz.damage });
      }
    }

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

    this.checkMilestones(events);
    this.fillAhead();
    this.cull();

    // feet on the screen bottom line: start the death sequence
    if (p.y <= this.cameraY) {
      this.dying = true;
      this.diedAt = this.time;
      p.y = this.cameraY;
      // last hop: high, along a random sideways arc
      const { jumpFactor, driftSpeed } = this.config.death;
      const drift = driftSpeed[0] + this.rng() * (driftSpeed[1] - driftSpeed[0]);
      const dir = this.rng() < 0.5 ? -1 : 1;
      p.vy = this.jumpVelocity * jumpFactor;
      p.vx = drift * dir;
      p.facing = dir;
      p.targetOffset = 0;
      events.push({ type: 'death' });
    }
    return events;
  }

  /**
   * Death sequence: one last high hop along a random sideways arc, then down
   * (no umbrella, no platforms, no input, camera frozen) until off screen → gameOver.
   */
  private stepDying(dt: number): GameEvent[] {
    const p = this.player;
    this.time += dt * 1000;
    p.vy -= this.gravity * dt;
    p.y += p.vy * dt;
    p.x = wrap(p.x + p.vx * dt, this.config.columns);
    // gone once even the zoomed sprite (centred on the player) is below the screen
    const halfSprite = deathScale(this.time - this.diedAt, this.config) / 2;
    if (p.y + p.h / 2 + halfSprite + this.config.death.exitMarginTiles < this.cameraY) {
      this.over = true;
      return [{ type: 'gameOver' }];
    }
    return [];
  }

  get isInvulnerable(): boolean {
    return this.time - this.player.hurtAt < this.config.hazards.invulnerableMs;
  }

  get difficulty(): number {
    return this.generator.difficultyAt(Math.floor(this.cameraY));
  }

  /** Puts this game's easter egg object on a free platform tile of the chunk; false if there is none. */
  private hideEasterEgg(chunk: PlacedChunk): boolean {
    // free = platform tiles with nothing (pickup/hazard) standing above them
    const taken = new Set([...chunk.pickups, ...chunk.hazards].map((it) => `${it.col},${it.row}`));
    const spots = chunk.platforms.flatMap((pl) =>
      Array.from({ length: pl.width }, (_, i) => ({ col: pl.col + i, row: pl.row })).filter(
        (s) => !taken.has(`${s.col},${s.row + 1}`),
      ),
    );
    if (spots.length === 0) return false;
    const spot = spots[Math.floor(this.rng() * spots.length)];
    const eggId = easterEggIds[Math.floor(this.rng() * easterEggIds.length)];
    const { spriteKey, size, placement } = easterEggItemDef(eggId, this.config);
    this.easterEggs.push({
      id: this.nextId++,
      x: spot.col + (1 - size) / 2,
      y: chunk.baseRow + spot.row + 1 + (placement === 'hover' ? HOVER_LIFT : 0),
      size,
      spriteKey,
      placement,
      eggId,
    });
    return true;
  }

  private checkMilestones(events: GameEvent[]) {
    const m = this.config.milestones;
    while (this.score >= this.nextMilestone) {
      events.push({ type: 'milestone', score: this.nextMilestone });
      const { x, y, w, h } = this.player;
      this.bursts.push({
        id: this.nextId++,
        startedAt: this.time,
        x: x + w / 2,
        y: y + h / 2,
        particles: this.makeStars(),
      });
      this.nextMilestone += m.every;
    }
  }

  /** 7–10 stars flying out all around, alternating small and large, slightly biased upward. */
  private makeStars(): StarParticle[] {
    const m = this.config.milestones;
    const range = ([a, b]: [number, number]) => a + this.rng() * (b - a);
    const count = Math.min(10, m.minStars + Math.floor(this.rng() * (m.maxStars - m.minStars + 1)));
    const offset = this.rng() * Math.PI * 2;
    return Array.from({ length: count }, (_, i) => {
      const angle = offset + (i / count) * Math.PI * 2 + (this.rng() - 0.5) * 0.5;
      const speed = range(m.speed);
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 1.5,
        size: range(i % 2 === 0 ? m.largeSize : m.smallSize),
        lifeMs: m.lifeMs * (0.8 + this.rng() * 0.4),
      };
    });
  }

  private fillAhead() {
    const needed = this.cameraY + this.viewHeight * (1 + this.config.generation.aheadScreens);
    while (this.generator.topRow < needed) this.addChunk(this.generator.next(), true);
  }

  private cull() {
    const maxLife = this.config.milestones.lifeMs * 1.2;
    this.bursts = this.bursts.filter((b) => this.time - b.startedAt < maxLife);
    this.collected = this.collected.filter((c) => this.time - c.collectedAt < COLLECTED_TTL_MS);
    const limit = this.cameraY - 1;
    this.platforms = this.platforms.filter((pl) => pl.y >= limit);
    this.pickups = this.pickups.filter((pk) => pk.y + pk.size >= limit);
    this.hazards = this.hazards.filter((h) => h.baseY + h.size >= limit);
    this.easterEggs = this.easterEggs.filter((e) => e.y + e.size >= limit);
  }

  private addChunk(chunk: PlacedChunk, mayHideEasterEgg: boolean) {
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
        bob: pk.bob,
      });
    }
    if (mayHideEasterEgg) {
      this.chunksPlaced++;
      if (this.chunksPlaced === this.easterEggChunk && !this.hideEasterEgg(chunk)) {
        this.easterEggChunk++; // no free tile here: try the next chunk
      }
    }
    for (const hz of chunk.hazards) {
      const baseY = chunk.baseRow + hz.row + 0.15;
      this.hazards.push({
        id: this.nextId,
        x: hz.col + (1 - hz.size) / 2,
        y: baseY,
        baseY,
        size: hz.size,
        spriteKey: hz.spriteKey,
        // out of sync with each other, deterministic per id
        phase: (this.nextId++ * 2.399) % (2 * Math.PI),
      });
    }
  }
}

/**
 * Death zoom: sprite size (in tiles, 1 = normal) `sinceDeathMs` into the death
 * sequence. Ease-in, so it swells slowly at first and fast at the end, like
 * falling towards the viewer.
 */
export function deathScale(sinceDeathMs: number, config: GameConfig): number {
  const { zoomMaxScale, zoomDurationMs } = config.death;
  const k = Math.min(1, Math.max(0, sinceDeathMs / zoomDurationMs));
  return 1 + (zoomMaxScale - 1) * k * k;
}

/**
 * Really falling (not just the top of a normal hop): moving down and at least
 * `fallPoseAfterTiles` below the jump's apex. Drives the umbrella pose and glide.
 */
export function isFalling(player: Player, fallPoseAfterTiles: number): boolean {
  return player.vy <= 0 && player.apexY - player.y >= fallPoseAfterTiles;
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
