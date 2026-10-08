import type { EasterEggItemDef, GameConfig } from '../../config';
import { getEasterEggs } from '../../easterEggs';
import type { LevelChunk } from '../../level/chunks';
import { LevelGenerator, type PlacedChunk } from '../../level/generator';
import { platformSpriteKey, type PlatformVariant } from '../../level/tiles';
import { fallStep, findLanding, touchesBox, wrap } from '../collide';
import type {
  Burst,
  CollectedPickup,
  EasterEggItem,
  GameEvent,
  Hazard,
  Pickup,
  Platform,
  Player,
  Portal,
  StepInput,
} from '../entities';
import type { RunContext, Section } from './Section';

/** Platform theme after `milestones` milestones (null = as authored in the chunks). */
export function platformTheme(milestones: number, { sequence, loop }: GameConfig['platformThemes']): PlatformVariant | null {
  if (sequence.length === 0) return null;
  const i = loop ? milestones % sequence.length : Math.min(milestones, sequence.length - 1);
  return sequence[i];
}

/** The in-level object of an easter egg: its own `item` fields over the config default. */
export function easterEggItemDef(eggId: string, config: GameConfig): EasterEggItemDef {
  const own = getEasterEggs().find((e) => e.id === eggId)?.item;
  return { ...config.easterEggs.defaultItem, ...own };
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

/** How far a "hover" item floats above its platform (like pickups). */
const HOVER_LIFT = 0.15;
/** How long a collected pickup is remembered for its collect animation. */
export const COLLECTED_TTL_MS = 1500;

export type VerticalSectionOptions = {
  /** Visible height in tiles (screenHeight / tileSize). */
  viewHeight: number;
  chunks?: LevelChunk[];
  startChunk?: LevelChunk;
};

/**
 * The main level: endless, climbing up. The screen wraps around sideways,
 * the chick bounces on one-way platforms by itself and is steered by
 * dragging; the camera only moves up (and slowly by itself once scoring
 * starts); the screen bottom is death.
 */
export class VerticalSection implements Section {
  readonly id = 'main' as const;
  readonly kind = 'vertical' as const;
  readonly viewHeight: number;
  player: Player;
  platforms: Platform[] = [];
  pickups: Pickup[] = [];
  collected: CollectedPickup[] = [];
  hazards: Hazard[] = [];
  bursts: Burst[] = [];
  easterEggs: EasterEggItem[] = [];
  /** At most one: the way to the bonus level (single use). */
  portals: Portal[] = [];
  cameraY = 0;
  /** False during the start countdown: the chick sits in the egg, nothing moves. */
  started: boolean;
  /** Game time (ms) of the hop out of the egg. */
  launchedAt = -Infinity;
  /** Egg shell at the start: `x` = centre, `y` = bottom (tiles). Stays in the level. */
  egg: { x: number; y: number; size: number };
  /** Death sequence running (hurt pose, last hop, falling out); gameplay is frozen. */
  dying = false;
  diedAt = -Infinity;

  private readonly config: GameConfig;
  private readonly generator: LevelGenerator;
  private readonly visited = new Set<number>();
  /** Easter egg ids available to this game (content snapshot taken at start). */
  private readonly easterEggIds: string[];
  /** Chunk number (after the start) that hides this game's easter egg; -1 = none this game. */
  private easterEggChunk: number;
  private chunksPlaced = 0;
  /** Chunk number that holds this run's portal; -1 = none this run. */
  private portalChunk: number;
  /** Where the chick went through the portal: it comes back here. */
  private returnPoint: { x: number; y: number } | null = null;
  /** Until this time (ms) after coming back: no auto scroll, no orange damage. */
  private safeUntil = -Infinity;
  /** Set while stepping: the run this section belongs to. */
  private run: RunContext;

  constructor(run: RunContext, { viewHeight, chunks, startChunk }: VerticalSectionOptions) {
    const { config, rng } = run;
    this.run = run;
    this.config = config;
    this.viewHeight = viewHeight;
    // drop rate: one roll per game, at most one easter egg
    this.easterEggIds = getEasterEggs().map((e) => e.id);
    const { chancePerGame, chunkRange } = config.easterEggs;
    this.easterEggChunk =
      this.easterEggIds.length > 0 && rng() < chancePerGame
        ? chunkRange[0] + Math.floor(rng() * (chunkRange[1] - chunkRange[0] + 1))
        : -1;
    // portal: one roll per run as well
    const portals = config.portals;
    this.portalChunk =
      rng() < portals.chancePerGame
        ? portals.chunkRange[0] + Math.floor(rng() * (portals.chunkRange[1] - portals.chunkRange[0] + 1))
        : -1;
    this.generator = new LevelGenerator(config, rng, chunks, startChunk);

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
    return this.started ? 0 : Math.max(0, this.config.start.countdownMs - this.run.time);
  }

  get isInvulnerable(): boolean {
    return this.run.time < this.safeUntil || this.run.time - this.player.hurtAt < this.config.hazards.invulnerableMs;
  }

  get difficulty(): number {
    return this.generator.difficultyAt(Math.floor(this.cameraY));
  }

  /**
   * Back from the bonus level: on the portal's platform, hopping off it,
   * briefly safe; what is above the chick takes the current platform theme
   * (milestones may have passed meanwhile).
   */
  enter(run: RunContext) {
    this.run = run;
    const back = this.returnPoint;
    if (!back) return;
    this.returnPoint = null;
    const p = this.player;
    p.x = wrap(back.x - p.w / 2, this.config.columns);
    p.y = back.y;
    p.vx = 0;
    p.targetOffset = 0;
    p.vy = run.physics.jumpVelocity;
    p.landedAt = run.time;
    p.apexY = p.y;
    // counted from when the screen has cleared (this runs halfway through the fade)
    const { returnSafeMs, transitionMs } = this.config.portals;
    this.safeUntil = run.time + transitionMs / 2 + returnSafeMs;
    this.rethemeAbove(run, p.y);
  }

  /** Everything above the chick's feet takes the theme of the milestone just reached. */
  onMilestone(run: RunContext) {
    this.rethemeAbove(run, this.player.y);
  }

  /** The run's clock has already advanced by `dt`. */
  step(dt: number, input: StepInput, run: RunContext): GameEvent[] {
    this.run = run;
    if (this.dying) return this.stepDying(dt);
    if (!this.started) {
      // countdown: the chick waits in the egg; input is ignored
      if (run.time < this.config.start.countdownMs) return [];
      this.started = true;
      this.launchedAt = run.time;
      const p = this.player;
      p.vy = run.physics.jumpVelocity;
      p.landedAt = run.time;
      p.apexY = p.y;
      return [{ type: 'launch' }];
    }
    const events: GameEvent[] = [];
    const p = this.player;
    const { input: inputCfg, columns } = this.config;
    const { gravity, jumpVelocity, glideFallSpeed } = run.physics;

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
    fallStep(p, dt, gravity, glideFallSpeed, this.config.player);
    const landed = findLanding(p, prevY, this.platforms, columns);
    if (landed) {
      p.y = landed.y;
      p.vy = jumpVelocity * Math.sqrt(run.jumpMultiplier);
      p.landedAt = run.time;
      p.apexY = p.y;
      events.push({ type: 'bounce', platformId: landed.id });
      if (!this.visited.has(landed.id)) {
        this.visited.add(landed.id);
        const points = run.scoreMultiplier;
        run.addScore(points);
        run.stats.platforms++;
        events.push({ type: 'land', platformId: landed.id, points });
      }
    }

    // ── pickups ──
    this.pickups = this.pickups.filter((pk) => {
      if (!touchesBox(p, pk.x, pk.y, pk.size, columns)) return true;
      run.effects.trigger(pk.effect, run.time);
      p.bonusUntil = run.time + this.config.player.bonusPoseMs;
      p.bonusSpriteKey = pk.spriteKey;
      run.stats.pickups++;
      this.collected.push({ ...pk, collectedAt: run.time });
      events.push({ type: 'pickup', effect: pk.effect });
      return false;
    });
    this.easterEggs = this.easterEggs.filter((egg) => {
      if (!touchesBox(p, egg.x, egg.y, egg.size, columns)) return true;
      run.stats.easterEggs++;
      events.push({ type: 'easterEgg', eggId: egg.eggId });
      return false;
    });
    const portal = this.portals.find((pt) => touchesBox(p, pt.x, pt.y, pt.size, columns));
    if (portal) {
      this.portals = [];
      this.returnPoint = { x: portal.x + portal.size / 2, y: portal.y };
      events.push({ type: 'portalEnter', target: 'bonus' });
      return events;
    }
    run.effects.tick(run.time);

    // ── hazards: hover up and down; touching one costs points (then brief invulnerability) ──
    const hz = this.config.hazards;
    for (const h of this.hazards) {
      h.y = h.baseY + ((1 - Math.cos((run.time / 1000) * hz.bobHz * 2 * Math.PI + h.phase)) / 2) * hz.bobTiles;
    }
    if (!this.isInvulnerable) {
      const hit = this.hazards.find((h) => {
        const box = h.size * hz.hitboxScale;
        const inset = (h.size - box) / 2;
        return touchesBox(p, h.x + inset, h.y + inset, box, columns);
      });
      if (hit) {
        run.addScore(-hz.damage);
        p.hurtAt = run.time;
        run.stats.hits++;
        events.push({ type: 'hit', damage: hz.damage });
      }
    }

    // ── camera: only moves up ──
    const { followRatio, smoothing, autoScrollSpeed } = this.config.camera;
    const target = p.y - this.viewHeight * (1 - followRatio);
    if (target > this.cameraY) {
      this.cameraY += (target - this.cameraY) * (1 - Math.pow(1 - smoothing, dt * 60));
    }
    if (run.score > 0 && run.time >= this.safeUntil) {
      const level = this.generator.difficultyAt(Math.floor(this.cameraY));
      this.cameraY += (autoScrollSpeed + level * this.config.camera.autoScrollPerDifficulty) * dt;
    }

    this.fillAhead();
    this.cull();

    // feet on the screen bottom line: start the death sequence
    if (p.y <= this.cameraY) {
      this.dying = true;
      this.diedAt = run.time;
      p.y = this.cameraY;
      // last hop: high, along a random sideways arc
      const { jumpFactor, driftSpeed } = this.config.death;
      const drift = driftSpeed[0] + run.rng() * (driftSpeed[1] - driftSpeed[0]);
      const dir = run.rng() < 0.5 ? -1 : 1;
      p.vy = jumpVelocity * jumpFactor;
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
    p.vy -= this.run.physics.gravity * dt;
    p.y += p.vy * dt;
    p.x = wrap(p.x + p.vx * dt, this.config.columns);
    // gone once even the zoomed sprite (centred on the player) is below the screen
    const halfSprite = deathScale(this.run.time - this.diedAt, this.config) / 2;
    if (p.y + p.h / 2 + halfSprite + this.config.death.exitMarginTiles < this.cameraY) {
      return [{ type: 'gameOver' }];
    }
    return [];
  }

  /**
   * Free platform tiles of a chunk: nothing (pickup, orange) standing above
   * them, and not used by the easter egg or the portal already.
   */
  private freeSpots(chunk: PlacedChunk): { col: number; row: number }[] {
    const taken = new Set([...chunk.pickups, ...chunk.hazards].map((it) => `${it.col},${it.row}`));
    return chunk.platforms.flatMap((pl) =>
      Array.from({ length: pl.width }, (_, i) => ({ col: pl.col + i, row: pl.row })).filter(
        (s) => !taken.has(`${s.col},${s.row + 1}`) && !this.usedSpots.has(`${s.col},${chunk.baseRow + s.row}`),
      ),
    );
  }

  /** Tiles (absolute rows) that already hold the easter egg or the portal. */
  private readonly usedSpots = new Set<string>();

  /** Puts this game's easter egg object on a free platform tile of the chunk; false if there is none. */
  private hideEasterEgg(chunk: PlacedChunk): boolean {
    const spots = this.freeSpots(chunk);
    if (spots.length === 0) return false;
    const { rng } = this.run;
    const spot = spots[Math.floor(rng() * spots.length)];
    this.usedSpots.add(`${spot.col},${chunk.baseRow + spot.row}`);
    const eggId = this.easterEggIds[Math.floor(rng() * this.easterEggIds.length)];
    const { spriteKey, size, placement } = easterEggItemDef(eggId, this.config);
    this.easterEggs.push({
      id: this.run.nextId(),
      x: spot.col + (1 - size) / 2,
      y: chunk.baseRow + spot.row + 1 + (placement === 'hover' ? HOVER_LIFT : 0),
      size,
      spriteKey,
      placement,
      eggId,
    });
    return true;
  }

  /** Puts this run's portal on a free platform tile of the chunk; false if there is none. */
  private placePortal(chunk: PlacedChunk): boolean {
    const spots = this.freeSpots(chunk);
    if (spots.length === 0) return false;
    const spot = spots[Math.floor(this.run.rng() * spots.length)];
    this.usedSpots.add(`${spot.col},${chunk.baseRow + spot.row}`);
    const size = this.config.portals.size;
    this.portals.push({
      id: this.run.nextId(),
      x: spot.col + (1 - size) / 2,
      y: chunk.baseRow + spot.row + 1,
      size,
      spriteKey: 'portal',
      target: 'bonus',
    });
    return true;
  }

  /** Everything whose top is above `y` (the player's feet) takes the current theme. */
  private rethemeAbove(run: RunContext, y: number) {
    const theme = platformTheme(run.milestonesReached, this.config.platformThemes);
    if (!theme) return;
    for (const pl of this.platforms) {
      if (pl.y > y) {
        pl.variant = theme;
        pl.spriteKey = platformSpriteKey(theme);
      }
    }
  }

  private fillAhead() {
    const needed = this.cameraY + this.viewHeight * (1 + this.config.generation.aheadScreens);
    while (this.generator.topRow < needed) this.addChunk(this.generator.next(), true);
  }

  private cull() {
    const { time } = this.run;
    const maxLife = this.config.milestones.lifeMs * 1.2;
    this.bursts = this.bursts.filter((b) => time - b.startedAt < maxLife);
    this.collected = this.collected.filter((c) => time - c.collectedAt < COLLECTED_TTL_MS);
    const limit = this.cameraY - 1;
    this.platforms = this.platforms.filter((pl) => pl.y >= limit);
    this.pickups = this.pickups.filter((pk) => pk.y + pk.size >= limit);
    this.hazards = this.hazards.filter((h) => h.baseY + h.size >= limit);
    this.easterEggs = this.easterEggs.filter((e) => e.y + e.size >= limit);
    this.portals = this.portals.filter((pt) => pt.y + pt.size >= limit);
  }

  private addChunk(chunk: PlacedChunk, mayHideEasterEgg: boolean) {
    const theme = platformTheme(this.run.milestonesReached, this.config.platformThemes);
    for (const pl of chunk.platforms) {
      this.platforms.push({
        id: this.run.nextId(),
        x: pl.col,
        y: chunk.baseRow + pl.row + 1,
        width: pl.width,
        variant: theme ?? pl.variant,
        spriteKey: theme ? platformSpriteKey(theme) : pl.spriteKey,
      });
    }
    for (const pk of chunk.pickups) {
      this.pickups.push({
        id: this.run.nextId(),
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
      if (this.chunksPlaced === this.portalChunk && !this.placePortal(chunk)) {
        this.portalChunk++;
      }
    }
    for (const hz of chunk.hazards) {
      const baseY = chunk.baseRow + hz.row + 0.15;
      const id = this.run.nextId();
      this.hazards.push({
        id,
        x: hz.col + (1 - hz.size) / 2,
        y: baseY,
        baseY,
        size: hz.size,
        spriteKey: hz.spriteKey,
        // out of sync with each other, deterministic per id
        phase: (id * 2.399) % (2 * Math.PI),
      });
    }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
