import type { GameConfig } from '../../config';
import { getEasterEggs } from '../../easterEggs';
import type { LevelChunk } from '../../level/chunks';
import { parseChunk } from '../../level/parser';
import { sideChunks, sideEnd, sideStart } from '../../level/sideChunks';
import { platformSpriteKey } from '../../level/tiles';
import { clamp } from '../../math';
import { fallStep, findLanding, touchesBox } from '../collide';
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

/** Top of the floor that runs under the whole bonus level. */
export const GROUND_Y = 1;

export type SideSectionOptions = {
  start?: LevelChunk;
  end?: LevelChunk;
  /** Pool of middle chunks. */
  chunks?: LevelChunk[];
  /** How many middle chunks (default config.side.chunks). */
  chunkCount?: number;
  /** Random order (default); false = the pool in order, for tests. */
  shuffle?: boolean;
};

/**
 * The bonus level, side view: a fixed-length strip that scrolls right to
 * left while the chick runs right by itself. A tap jumps (holding longer
 * jumps higher); one continuous floor means nobody can fall, there is no
 * death. Cards and bonuses score, oranges cost a point, the exit portal at
 * the end gives a finish bonus and takes the run back to the main level.
 */
export class SideSection implements Section {
  readonly id = 'bonus' as const;
  readonly kind = 'side' as const;
  player: Player;
  platforms: Platform[] = [];
  pickups: Pickup[] = [];
  collected: CollectedPickup[] = [];
  hazards: Hazard[] = [];
  bursts: Burst[] = [];
  /** The hidden meme of this bonus level (one, if easter eggs hide in the bonus level). */
  easterEggs: EasterEggItem[] = [];
  exit: Portal;
  /** Level length in tiles. */
  readonly length: number;
  /** Left edge of the view (tiles). */
  cameraX = 0;
  readonly viewColumns: number;
  /** The exit was reached (portalExit sent). */
  finished = false;

  private readonly config: GameConfig;
  /** Platform the chick stands on, null while in the air. */
  private standingOn: Platform | null = null;
  /** Last time (ms) the chick stood on something: a tap shortly after leaving an edge still jumps. */
  private groundedAt = -Infinity;
  /** A tap waits until this time (ms) for the chick to touch down. */
  private jumpBufferedUntil = -Infinity;

  constructor(run: RunContext, { start = sideStart, end = sideEnd, chunks = sideChunks, chunkCount, shuffle = true }: SideSectionOptions = {}) {
    const { config, rng } = run;
    this.config = config;
    this.viewColumns = config.side.viewColumns;

    const count = chunkCount ?? config.side.chunks;
    const middle = Array.from({ length: count }, (_, i) =>
      shuffle ? chunks[Math.floor(rng() * chunks.length)] : chunks[i % chunks.length],
    );
    let x = 0;
    let exit: Portal | null = null;
    for (const chunk of [start, ...middle, end]) {
      const width = chunkWidth(chunk);
      const parsed = parseChunk(chunk.map, width);
      for (const pl of parsed.platforms) this.platforms.push(platformFrom(pl, run.nextId(), x, GROUND_Y));
      for (const pk of parsed.pickups) this.pickups.push(pickupFrom(pk, run.nextId(), x, GROUND_Y));
      for (const hz of parsed.hazards) this.hazards.push(hazardFrom(hz, run.nextId(), x, GROUND_Y));
      for (const pt of parsed.portals) {
        exit = {
          id: run.nextId(),
          x: x + pt.col + (1 - pt.size) / 2,
          y: GROUND_Y + pt.row,
          size: pt.size,
          spriteKey: pt.spriteKey,
          target: 'main',
        };
      }
      x += width;
    }
    if (!exit) throw new Error('Bonus level: the end chunk needs an exit portal (G)');
    this.exit = exit;
    this.length = x;
    // the floor: one platform under everything
    const ground = config.side.groundTheme;
    this.platforms.unshift({ id: run.nextId(), x: 0, y: GROUND_Y, width: x, variant: ground, spriteKey: platformSpriteKey(ground) });

    this.player = createPlayer(config, 1, GROUND_Y, config.side.runSpeed);
    this.standingOn = this.platforms[0];
    // the meme hides between the start chunk and the end chunk
    if (config.easterEggs.sections.includes('bonus')) this.hideEasterEgg(run, chunkWidth(start), x - chunkWidth(end));
  }

  /**
   * One meme per bonus level: on a free tile of a raised platform (a jump to
   * reach it), else on the floor; never at the start, never by the exit,
   * never where a card or an orange already is.
   */
  private hideEasterEgg(run: RunContext, startX: number, endX: number) {
    const ids = getEasterEggs().map((e) => e.id);
    if (ids.length === 0) return;
    const taken = new Set(
      [...this.pickups, ...this.hazards].map((it) => `${Math.floor(it.x + it.size / 2)},${Math.round(it.y - 0.15)}`),
    );
    const spots = (raised: boolean) =>
      this.platforms
        .filter((pl) => (raised ? pl.y > GROUND_Y : pl.y === GROUND_Y))
        .flatMap((pl) => Array.from({ length: pl.width }, (_, i) => ({ x: pl.x + i, y: pl.y })))
        .filter((s) => s.x >= startX && s.x < endX && !taken.has(`${s.x},${s.y}`));
    const raised = spots(true);
    const candidates = raised.length > 0 ? raised : spots(false);
    if (candidates.length === 0) return;
    const spot = candidates[Math.floor(run.rng() * candidates.length)];
    const eggId = ids[Math.floor(run.rng() * ids.length)];
    const { spriteKey, size, placement } = easterEggItemDef(eggId, this.config);
    this.easterEggs.push({
      id: run.nextId(),
      x: spot.x + (1 - size) / 2,
      y: spot.y + (placement === 'hover' ? HOVER_LIFT : 0),
      size,
      spriteKey,
      placement,
      eggId,
    });
  }

  /** Standing on the floor or a platform (running), not in the air. */
  get grounded(): boolean {
    return this.standingOn !== null;
  }

  /** How far along the level (0 at the start … 1 at the exit). */
  get progress(): number {
    if (this.finished) return 1;
    return clamp(this.player.x / this.exit.x, 0, 1);
  }

  isInvulnerable(time: number): boolean {
    return time - this.player.hurtAt < this.config.hazards.invulnerableMs;
  }

  enter(run: RunContext) {
    this.groundedAt = run.time;
    this.jumpBufferedUntil = -Infinity;
  }

  onMilestone() {
    // the platform themes belong to the main level
  }

  step(dt: number, input: StepInput, run: RunContext): GameEvent[] {
    const events: GameEvent[] = [];
    const p = this.player;
    const side = this.config.side;
    const tap = input.tap;
    const { gravity, jumpVelocity, glideFallSpeed } = run.physics;

    // ── run right, up to the end of the strip ──
    p.x = Math.min(this.length - p.w, p.x + side.runSpeed * dt);

    // walked off the edge of the platform it stood on (or was put somewhere else)
    const support = this.standingOn;
    if (support && (Math.abs(p.y - support.y) > 1e-6 || !(p.x < support.x + support.width && p.x + p.w > support.x))) {
      this.standingOn = null;
    }
    if (this.standingOn) this.groundedAt = run.time;

    // ── jump: a tap (buffered briefly), while on the ground or just after leaving it ──
    if (tap?.pressed) this.jumpBufferedUntil = run.time + side.jumpBufferMs;
    const canJump = this.standingOn !== null || run.time - this.groundedAt <= side.coyoteMs;
    if (run.time <= this.jumpBufferedUntil && canJump) {
      const from = this.standingOn;
      takeOff(p, jumpVelocity * Math.sqrt(run.jumpMultiplier), run.time);
      this.standingOn = null;
      this.groundedAt = -Infinity;
      this.jumpBufferedUntil = -Infinity;
      events.push({ type: 'bounce', platformId: from?.id ?? -1 });
    }
    // letting go while still rising: a shorter hop
    if (tap?.released && p.vy > 0) p.vy *= side.jumpCutFactor;

    // ── vertical: stand, or fall onto a platform (one-way, from above) ──
    if (this.standingOn) {
      p.y = this.standingOn.y;
      p.vy = 0;
    } else {
      const prevY = p.y;
      fallStep(p, dt, gravity, side.glide ? glideFallSpeed : null, this.config.player);
      const landed = findLanding(p, prevY, this.platforms, null);
      if (landed) {
        p.y = landed.y;
        p.vy = 0;
        p.apexY = p.y;
        p.landedAt = run.time;
        this.standingOn = landed;
        this.groundedAt = run.time;
        // a tap just before touching down jumps right away
        if (run.time <= this.jumpBufferedUntil) {
          takeOff(p, jumpVelocity * Math.sqrt(run.jumpMultiplier), run.time);
          this.standingOn = null;
          this.groundedAt = -Infinity;
          this.jumpBufferedUntil = -Infinity;
          events.push({ type: 'bounce', platformId: landed.id });
        }
      }
    }

    // ── pickups, oranges ──
    this.pickups = collectPickups(this.pickups, this.collected, p, run, null, events);
    this.easterEggs = collectEasterEggs(this.easterEggs, p, run, null, events);
    run.effects.tick(run.time);
    stepHazards(this.hazards, p, run, null, this.isInvulnerable(run.time), events);

    // ── the exit ──
    if (!this.finished && touchesBox(p, this.exit.x, this.exit.y, this.exit.size, null)) {
      this.finished = true;
      run.addScore(side.finishBonus);
      events.push({ type: 'portalExit' });
    }

    // ── camera: keeps the chick at followX, within the level ──
    const maxCamera = Math.max(0, this.length - this.viewColumns);
    this.cameraX = clamp(p.x - this.viewColumns * side.followX, 0, maxCamera);

    cullEffects(this, run.time, this.config);
    return events;
  }
}

/** Width (columns) of a chunk. */
function chunkWidth(chunk: LevelChunk): number {
  return Math.max(...chunk.map.map((line) => line.length));
}
