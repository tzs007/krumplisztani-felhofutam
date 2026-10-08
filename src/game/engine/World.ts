import { derivePhysics, type EasterEggItemDef, type GameConfig } from '../config';
import { fallStep, findLanding, touchesBox, wrap } from './collide';
import type {
  Burst,
  CollectedPickup,
  EasterEggItem,
  GameEvent,
  Hazard,
  Pickup,
  Platform,
  Player,
  StarParticle,
  StepInput,
} from './entities';
import { LevelGenerator, type PlacedChunk } from '../level/generator';
import type { LevelChunk } from '../level/chunks';
import { platformSpriteKey, type PlatformVariant } from '../level/tiles';
import { addBonus, doubleJumpHeight, doubleScore } from './effects/builtins';
import { EffectRegistry, type EffectContext } from './effects/EffectRegistry';
import { createRng, type Rng } from './random';
import { getEasterEggs } from '../easterEggs';

/** Platform theme after `milestones` milestones (null = as authored in the chunks). */
export function platformTheme(milestones: number, { sequence, loop }: GameConfig['platformThemes']): PlatformVariant | null {
  if (sequence.length === 0) return null;
  const i = loop ? milestones % sequence.length : Math.min(milestones, sequence.length - 1);
  return sequence[i];
}

export * from './entities';
export { isFalling, overlapsX, wrap } from './collide';

/** How far a "hover" item floats above its platform (like pickups). */
const HOVER_LIFT = 0.15;

/** The in-level object of an easter egg: its own `item` fields over the config default. */
export function easterEggItemDef(eggId: string, config: GameConfig): EasterEggItemDef {
  const own = getEasterEggs().find((e) => e.id === eggId)?.item;
  return { ...config.easterEggs.defaultItem, ...own };
}

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
  /** Easter egg ids available to this game (content snapshot taken at start). */
  private readonly easterEggIds: string[];
  /** Chunk number (after the start) that hides this game's easter egg; -1 = none this game. */
  private easterEggChunk: number;
  private chunksPlaced = 0;
  /** Next score that triggers a burst; only moves up, so dropping below and back doesn't re-fire. */
  private nextMilestone: number;
  /** Milestones reached so far; picks the platform theme (see config.platformThemes). */
  private milestonesReached = 0;
  private nextId = 1;

  constructor({ config, viewHeight, rng = createRng(), chunks, startChunk }: WorldOptions) {
    this.config = config;
    this.viewHeight = viewHeight;
    this.rng = rng;
    // drop rate: one roll per game, at most one easter egg
    this.easterEggIds = getEasterEggs().map((e) => e.id);
    const { chancePerGame, chunkRange } = config.easterEggs;
    this.easterEggChunk =
      this.easterEggIds.length > 0 && rng() < chancePerGame
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
    // umbrella open on a real fall: eases toward the glide speed instead of accelerating
    fallStep(p, dt, this.gravity, this.glideFallSpeed, this.config.player);
    {
      const hit = findLanding(p, prevY, this.platforms, columns);
      if (hit) {
        p.y = hit.y;
        p.vy = this.jumpVelocity * Math.sqrt(this.jumpMultiplier);
        p.landedAt = this.time;
        p.apexY = p.y;
        events.push({ type: 'bounce', platformId: hit.id });
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
      if (!touchesBox(p, pk.x, pk.y, pk.size, columns)) return true;
      this.effects.trigger(pk.effect, this.time);
      p.bonusUntil = this.time + this.config.player.bonusPoseMs;
      p.bonusSpriteKey = pk.spriteKey;
      this.stats.pickups++;
      this.collected.push({ ...pk, collectedAt: this.time });
      events.push({ type: 'pickup', effect: pk.effect });
      return false;
    });
    this.easterEggs = this.easterEggs.filter((egg) => {
      if (!touchesBox(p, egg.x, egg.y, egg.size, columns)) return true;
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
        return touchesBox(p, h.x + inset, h.y + inset, box, columns);
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
    const eggId = this.easterEggIds[Math.floor(this.rng() * this.easterEggIds.length)];
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
      this.milestonesReached++;
      this.rethemeAbove(this.player.y);
    }
  }

  /** Everything whose top is above `y` (the player's feet) takes the current theme. */
  private rethemeAbove(y: number) {
    const theme = platformTheme(this.milestonesReached, this.config.platformThemes);
    if (!theme) return;
    for (const pl of this.platforms) {
      if (pl.y > y) {
        pl.variant = theme;
        pl.spriteKey = platformSpriteKey(theme);
      }
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
    const theme = platformTheme(this.milestonesReached, this.config.platformThemes);
    for (const pl of chunk.platforms) {
      this.platforms.push({
        id: this.nextId++,
        x: pl.col,
        y: chunk.baseRow + pl.row + 1,
        width: pl.width,
        variant: theme ?? pl.variant,
        spriteKey: theme ? platformSpriteKey(theme) : pl.spriteKey,
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


function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
