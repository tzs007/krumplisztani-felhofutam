import type { GameConfig } from '../../config';
import { getEasterEggs } from '../../easterEggs';
import type { LevelChunk } from '../../level/chunks';
import { LevelGenerator, type PlacedChunk } from '../../level/generator';
import { platformSpriteKey, type PlatformVariant } from '../../level/tiles';
import { fallStep, findLanding, overlapsX, touchesBox, wrap } from '../collide';
import type { Rng } from '../random';
import type {
  Burst,
  CollectedPickup,
  EasterEggItem,
  GameEvent,
  Hazard,
  Pickup,
  Mushroom,
  Platform,
  Player,
  Portal,
  StepInput,
} from '../entities';
import type { RunContext, Section } from './Section';
import { clamp } from '../../math';
import {
  collectEasterEggs,
  collectPickups,
  createPlayer,
  cullEffects,
  easterEggItemDef,
  hazardFrom,
  HOVER_LIFT,
  pickupFrom,
  platformFrom,
  stepHazards,
  takeOff,
} from './shared';

/** Platform theme after `milestones` milestones (null = as authored in the chunks). */
export function platformTheme(
  milestones: number,
  { sequence, loop }: GameConfig['platformThemes'],
): PlatformVariant | null {
  if (sequence.length === 0) return null;
  const i = loop ? milestones % sequence.length : Math.min(milestones, sequence.length - 1);
  return sequence[i];
}

/**
 * Death zoom: sprite size (in tiles, 1 = normal) `sinceDeathMs` into the death
 * sequence. Ease-in, so it swells slowly at first and fast at the end, like
 * falling towards the viewer.
 */
export function deathScale(sinceDeathMs: number, config: GameConfig): number {
  const { zoomMaxScale, zoomDurationMs } = config.death;
  const k = clamp(sinceDeathMs / zoomDurationMs, 0, 1);
  return 1 + (zoomMaxScale - 1) * k * k;
}

/** Coming back from the bonus level: the return platform is at least this far above the screen bottom. */
const RETURN_MARGIN_TILES = 3;

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
  /** At most one: the magic mushroom (starts the psy mode). */
  mushrooms: Mushroom[] = [];
  cameraY = 0;
  /** False during the start countdown: the chick sits in the egg, nothing moves. */
  started: boolean;
  /** Game time (ms) of the hop out of the egg. */
  launchedAt = -Infinity;
  /** Egg shell at the start: `x` = centre, `y` = bottom (tiles). Stays in the level. */
  egg: { x: number; y: number; size: number };
  /** Flying (psy mode): no gravity, no platforms, the finger steers up and down too. */
  flying = false;
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
  /** Chunk number that holds this run's mushroom; -1 = none this run. */
  private mushroomChunk: number;
  /** Where the chick went through the portal: it comes back here, onto `platform`. */
  private returnPoint: { x: number; y: number; platform: Platform | null } | null = null;
  /** Until this time (ms) after coming back: no auto scroll, no orange damage. */
  private safeUntil = -Infinity;
  /** While flying: where the finger wants the chick, in tiles above the screen bottom. */
  private flightRow = 0;
  /** Platforms flown past in this flight: only every platformsPerPoint-th one scores. */
  private flightPassed = 0;
  /** Set while stepping: the run this section belongs to. */
  private run: RunContext;

  constructor(run: RunContext, { viewHeight, chunks, startChunk }: VerticalSectionOptions) {
    const { config, rng } = run;
    this.run = run;
    this.config = config;
    this.viewHeight = viewHeight;
    // drop rate: one roll per game, at most one easter egg
    this.easterEggIds = getEasterEggs().map((e) => e.id);
    this.easterEggChunk = rollChunk(
      rng,
      config.easterEggs,
      config.easterEggs.sections.includes('main') && this.easterEggIds.length > 0,
    );
    // portal and mushroom: one roll per run as well
    this.portalChunk = rollChunk(rng, config.portals);
    this.mushroomChunk = rollChunk(rng, config.mushroom);
    this.generator = new LevelGenerator(config, rng, chunks, startChunk);

    const start = this.generator.placeStart();
    this.addChunk(start, false);
    const spawn = start.spawn ?? { col: Math.floor(config.columns / 2), row: 1 };
    const w = config.player.widthTiles;
    const y = start.baseRow + spawn.row;
    this.player = createPlayer(config, spawn.col + (1 - w) / 2, y);
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
    // the portal's platform may have sunk to (or below) the screen bottom meanwhile:
    // bring it back and lower the camera so the chick comes back on screen
    if (back.platform && !this.platforms.includes(back.platform)) this.platforms.push(back.platform);
    this.cameraY = Math.min(this.cameraY, back.y - RETURN_MARGIN_TILES);
    const p = this.player;
    p.x = wrap(back.x - p.w / 2, this.config.columns);
    p.y = back.y;
    p.vx = 0;
    p.targetOffset = 0;
    takeOff(p, run.physics.jumpVelocity, run.time);
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
      takeOff(this.player, run.physics.jumpVelocity, run.time);
      return [{ type: 'launch' }];
    }
    if (run.psyActive) return this.stepFlight(dt, input, run);
    if (this.flying) this.endFlight(run);
    const events: GameEvent[] = [];
    const p = this.player;
    const { columns } = this.config;
    const { gravity, jumpVelocity, glideFallSpeed } = run.physics;

    this.steer(dt, input);

    // ── vertical: gravity + one-way platforms (only when falling onto the top) ──
    const prevY = p.y;
    // umbrella open on a real fall: eases toward the glide speed instead of accelerating
    fallStep(p, dt, gravity, glideFallSpeed, this.config.player);
    const landed = findLanding(p, prevY, this.platforms, columns);
    if (landed) {
      p.y = landed.y;
      takeOff(p, jumpVelocity * Math.sqrt(run.jumpMultiplier), run.time);
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
    this.pickups = collectPickups(this.pickups, this.collected, p, run, columns, events);
    this.easterEggs = collectEasterEggs(this.easterEggs, p, run, columns, events);
    const shroom = this.mushrooms.find((m) => touchesBox(p, m.x, m.y, m.size, columns));
    if (shroom) {
      this.mushrooms = [];
      run.effects.trigger('psy', run.time);
      events.push({ type: 'mushroom' });
    }
    const portal = this.portals.find((pt) => touchesBox(p, pt.x, pt.y, pt.size, columns));
    if (portal) {
      this.portals = [];
      const cx = portal.x + portal.size / 2;
      const platform =
        this.platforms.find((pl) => Math.abs(pl.y - portal.y) < 1e-6 && cx >= pl.x && cx <= pl.x + pl.width) ?? null;
      this.returnPoint = { x: cx, y: portal.y, platform };
      events.push({ type: 'portalEnter', target: 'bonus' });
      return events;
    }
    run.effects.tick(run.time);

    stepHazards(this.hazards, p, run, columns, this.isInvulnerable, events);

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

    // feet on the screen bottom line: start the death sequence (not right after coming back)
    if (p.y <= this.cameraY && run.time >= this.safeUntil) {
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
   * Horizontal: the finger moves a target 1:1, a damped spring pulls the
   * player after it (slight lag + tiny overshoot = elastic, not rigid).
   */
  private steer(dt: number, input: StepInput) {
    const p = this.player;
    const inputCfg = this.config.input;
    p.targetOffset += input.dx * inputCfg.dragSensitivity;
    if (input.dx !== 0) p.facing = input.dx > 0 ? 1 : -1;
    if (!input.dragging && input.releaseVelocity !== undefined) {
      // glide: push the target a little further in the throw direction
      const v = clamp(
        input.releaseVelocity * inputCfg.dragSensitivity,
        -inputCfg.maxGlideSpeed,
        inputCfg.maxGlideSpeed,
      );
      p.targetOffset += v / inputCfg.releaseFriction;
    }
    const w = this.flying ? (this.config.psy.followFrequency ?? 7) : inputCfg.followFrequency;
    p.vx += (w * w * p.targetOffset - 2 * inputCfg.followDamping * w * p.vx) * dt;
    const move = p.vx * dt;
    p.x += move;
    p.targetOffset -= move;
    if (Math.abs(p.targetOffset) < 1e-3 && Math.abs(p.vx) < 0.01) {
      p.x += p.targetOffset;
      p.targetOffset = 0;
      p.vx = 0;
    }
    p.x = wrap(p.x, this.config.columns);
  }

  /**
   * Psy mode: the camera climbs steadily and the chick flies along, steered
   * by the finger in both directions (kept on screen). Platforms are not
   * there for it (it scores each one it passes); only cards can be taken;
   * oranges, the meme, the portal and the mushroom are out of reach; no death.
   */
  private stepFlight(dt: number, input: StepInput, run: RunContext): GameEvent[] {
    const events: GameEvent[] = [];
    const p = this.player;
    const psy = this.config.psy;
    const top = this.viewHeight - psy.topMargin;
    if (!this.flying) {
      this.flying = true;
      this.flightRow = clamp(p.y - this.cameraY, psy.minRow, top);
      this.flightPassed = 0;
      for (const pk of this.pickups) this.scatterFlightCard(pk);
    }
    this.steer(dt, input);

    // up / down: the finger moves the wanted height 1:1 (screen down = lower)
    this.flightRow = clamp(this.flightRow - (input.dy ?? 0) * this.config.input.dragSensitivity, psy.minRow, top);
    this.cameraY += psy.riseSpeed * dt;
    const prevY = p.y;
    // eases toward the wanted height (both ways), never below minRow above the screen bottom
    const target = this.cameraY + this.flightRow;
    p.y = Math.max(
      prevY + (target - prevY) * (1 - Math.exp(-(psy.verticalFollow ?? 6) * dt)),
      this.cameraY + psy.minRow,
    );
    p.vy = (p.y - prevY) / dt;
    p.apexY = p.y;

    // platforms passed on the way up: the flight is much faster than climbing,
    // so only every platformsPerPoint-th one scores (about the normal pace)
    for (const pl of this.platforms) {
      if (pl.y > prevY && pl.y <= p.y && !this.visited.has(pl.id)) {
        this.visited.add(pl.id);
        run.stats.platforms++;
        this.flightPassed++;
        if (this.flightPassed % psy.platformsPerPoint !== 0) continue;
        run.addScore(run.scoreMultiplier);
        events.push({ type: 'land', platformId: pl.id, points: run.scoreMultiplier });
      }
    }

    // only the cards
    this.pickups = collectPickups(this.pickups, this.collected, p, run, this.config.columns, events, isCard);
    run.effects.tick(run.time);
    this.fillAhead();
    this.cull();
    return events;
  }

  /**
   * The mushroom wore off: the chick lands on the nearest platform under it
   * on screen (within a jump) — or, if there is none, on a small rescue
   * platform that appears under it (no points) — hops off it, and is safe for
   * a moment (no auto scroll, no death).
   */
  private endFlight(run: RunContext) {
    this.flying = false;
    const p = this.player;
    const { columns, maxJumpTiles } = this.config;
    const under = this.platforms
      .filter(
        (pl) =>
          pl.y <= p.y &&
          p.y - pl.y <= maxJumpTiles &&
          pl.y >= this.cameraY + this.config.psy.minRow &&
          overlapsX(p.x, p.w, pl.x, pl.width, columns),
      )
      .sort((a, b) => b.y - a.y)[0];
    let ground = under;
    if (!ground) {
      const theme = platformTheme(run.milestonesReached, this.config.platformThemes) ?? 'grass';
      ground = {
        id: run.nextId(),
        x: Math.floor(p.x + p.w / 2) - 1,
        y: Math.max(this.cameraY + this.config.psy.minRow, p.y - 1),
        width: 3,
        variant: theme,
        spriteKey: platformSpriteKey(theme),
      };
      this.platforms.push(ground);
      this.visited.add(ground.id); // no points for the rescue platform
    }
    p.y = ground.y;
    takeOff(p, run.physics.jumpVelocity * Math.sqrt(run.jumpMultiplier), run.time);
    this.safeUntil = run.time + this.config.psy.endSafeMs;
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
  private freeSpots(chunk: PlacedChunk): { col: number; row: number; platform: PlacedChunk['platforms'][number] }[] {
    const taken = new Set([...chunk.pickups, ...chunk.hazards].map((it) => `${it.col},${it.row}`));
    return chunk.platforms.flatMap((pl) =>
      Array.from({ length: pl.width }, (_, i) => ({ col: pl.col + i, row: pl.row, platform: pl })).filter(
        (s) => !taken.has(`${s.col},${s.row + 1}`) && !this.usedPlatforms.has(platformKey(chunk, pl)),
      ),
    );
  }

  /** Platforms that already hold the easter egg or the portal (one thing per platform). */
  private readonly usedPlatforms = new Set<string>();

  /**
   * Picks a random free platform tile of the chunk and reserves its platform;
   * returns its level position (x = tile's left edge, y = platform top), or null if there is none.
   */
  private takeFreeSpot(chunk: PlacedChunk): { x: number; y: number } | null {
    const spots = this.freeSpots(chunk);
    if (spots.length === 0) return null;
    const spot = spots[Math.floor(this.run.rng() * spots.length)];
    this.usedPlatforms.add(platformKey(chunk, spot.platform));
    return { x: spot.col, y: chunk.baseRow + spot.row + 1 };
  }

  /** Puts this game's easter egg object on a free platform tile of the chunk; false if there is none. */
  private hideEasterEgg(chunk: PlacedChunk): boolean {
    const spot = this.takeFreeSpot(chunk);
    if (!spot) return false;
    const eggId = this.easterEggIds[Math.floor(this.run.rng() * this.easterEggIds.length)];
    const { spriteKey, size, placement } = easterEggItemDef(eggId, this.config);
    this.easterEggs.push({
      id: this.run.nextId(),
      x: spot.x + (1 - size) / 2,
      y: spot.y + (placement === 'hover' ? HOVER_LIFT : 0),
      size,
      spriteKey,
      placement,
      eggId,
    });
    return true;
  }

  /** Puts this run's portal on a free platform tile of the chunk; false if there is none. */
  private placePortal(chunk: PlacedChunk): boolean {
    const spot = this.takeFreeSpot(chunk);
    if (!spot) return false;
    const size = this.config.portals.size;
    this.portals.push({
      id: this.run.nextId(),
      x: spot.x + (1 - size) / 2,
      y: spot.y,
      size,
      spriteKey: 'portal',
      target: 'bonus',
    });
    return true;
  }

  /** Puts this run's mushroom on a free platform tile of the chunk; false if there is none. */
  private placeMushroom(chunk: PlacedChunk): boolean {
    const spot = this.takeFreeSpot(chunk);
    if (!spot) return false;
    const size = this.config.mushroom.size;
    this.mushrooms.push({
      id: this.run.nextId(),
      x: spot.x + (1 - size) / 2,
      y: spot.y,
      size,
      spriteKey: 'pickup_mushroom',
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

  /** Scatter each card once, so flying requires steering rather than following a fixed lane. */
  private scatterFlightCard(pk: Pickup) {
    if (pk.spriteKey !== 'pickup_card') return;
    pk.x = this.run.rng() * Math.max(0, this.config.columns - pk.size);
    pk.y += (this.run.rng() - 0.5) * 1.5;
  }

  private cull() {
    cullEffects(this, this.run.time, this.config);
    const limit = this.cameraY - 1;
    this.platforms = this.platforms.filter((pl) => pl.y >= limit);
    this.pickups = this.pickups.filter((pk) => pk.y + pk.size >= limit);
    this.hazards = this.hazards.filter((h) => h.baseY + h.size >= limit);
    this.easterEggs = this.easterEggs.filter((e) => e.y + e.size >= limit);
    this.portals = this.portals.filter((pt) => pt.y + pt.size >= limit);
    this.mushrooms = this.mushrooms.filter((m) => m.y + m.size >= limit);
  }

  private addChunk(chunk: PlacedChunk, mayHideEasterEgg: boolean) {
    const theme = platformTheme(this.run.milestonesReached, this.config.platformThemes);
    for (const pl of chunk.platforms) this.platforms.push(platformFrom(pl, this.run.nextId(), 0, chunk.baseRow, theme));
    for (const pk of chunk.pickups) {
      const pickup = pickupFrom(pk, this.run.nextId(), 0, chunk.baseRow);
      if (this.flying) this.scatterFlightCard(pickup);
      this.pickups.push(pickup);
    }
    if (mayHideEasterEgg) {
      this.chunksPlaced++;
      if (this.chunksPlaced === this.easterEggChunk && !this.hideEasterEgg(chunk)) {
        this.easterEggChunk++; // no free tile here: try the next chunk
      }
      if (this.chunksPlaced === this.portalChunk && !this.placePortal(chunk)) {
        this.portalChunk++;
      }
      if (this.chunksPlaced === this.mushroomChunk && !this.placeMushroom(chunk)) {
        this.mushroomChunk++;
      }
    }
    for (const hz of chunk.hazards) this.hazards.push(hazardFrom(hz, this.run.nextId(), 0, chunk.baseRow));
  }
}

/** Identity of a chunk platform in the level (chunk position + run start). */
function platformKey(chunk: PlacedChunk, pl: PlacedChunk['platforms'][number]): string {
  return `${chunk.baseRow + pl.row}:${pl.col}`;
}

const isCard = (pk: Pickup) => pk.spriteKey === 'pickup_card';

/**
 * One roll per run: the chunk number (after the start) that holds the thing,
 * or -1 for none this run. A disabled roll draws no random numbers.
 */
function rollChunk(
  rng: Rng,
  { chancePerGame, chunkRange }: { chancePerGame: number; chunkRange: [number, number] },
  enabled = true,
): number {
  return enabled && rng() < chancePerGame
    ? chunkRange[0] + Math.floor(rng() * (chunkRange[1] - chunkRange[0] + 1))
    : -1;
}
