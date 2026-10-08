import type { GameConfig } from '../../config';
import type { LevelChunk } from '../../level/chunks';
import { parseChunk } from '../../level/parser';
import { sideChunks, sideEnd, sideStart } from '../../level/sideChunks';
import { platformSpriteKey } from '../../level/tiles';
import { fallStep, findLanding, touchesBox } from '../collide';
import type {
  Burst,
  CollectedPickup,
  GameEvent,
  Hazard,
  Pickup,
  Platform,
  Player,
  Portal,
  StepInput,
} from '../entities';
import type { RunContext, Section } from './Section';
import { COLLECTED_TTL_MS } from './VerticalSection';

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
      const width = Math.max(...chunk.map.map((line) => line.length));
      const parsed = parseChunk(chunk.map, width);
      for (const pl of parsed.platforms) {
        this.platforms.push({
          id: run.nextId(),
          x: x + pl.col,
          y: GROUND_Y + pl.row + 1,
          width: pl.width,
          variant: pl.variant,
          spriteKey: pl.spriteKey,
        });
      }
      for (const pk of parsed.pickups) {
        this.pickups.push({
          id: run.nextId(),
          x: x + pk.col + (1 - pk.size) / 2,
          y: GROUND_Y + pk.row + 0.15,
          size: pk.size,
          effect: pk.effect,
          spriteKey: pk.spriteKey,
          bob: pk.bob,
        });
      }
      for (const hz of parsed.hazards) {
        const baseY = GROUND_Y + hz.row + 0.15;
        const id = run.nextId();
        this.hazards.push({
          id,
          x: x + hz.col + (1 - hz.size) / 2,
          y: baseY,
          baseY,
          size: hz.size,
          spriteKey: hz.spriteKey,
          phase: (id * 2.399) % (2 * Math.PI),
        });
      }
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

    const { widthTiles: w, heightTiles: h } = config.player;
    this.player = {
      x: 1,
      y: GROUND_Y,
      w,
      h,
      vx: config.side.runSpeed,
      vy: 0,
      facing: 1,
      bonusUntil: 0,
      bonusSpriteKey: null,
      landedAt: -Infinity,
      apexY: GROUND_Y,
      targetOffset: 0,
      hurtAt: -Infinity,
    };
    this.standingOn = this.platforms[0];
  }

  /** Standing on the floor or a platform (running), not in the air. */
  get grounded(): boolean {
    return this.standingOn !== null;
  }

  /** How far along the level (0 at the start … 1 at the exit). */
  get progress(): number {
    if (this.finished) return 1;
    return Math.min(1, Math.max(0, this.player.x / this.exit.x));
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

    // walked off the edge of the platform it stood on
    if (this.standingOn && !(p.x < this.standingOn.x + this.standingOn.width && p.x + p.w > this.standingOn.x)) {
      this.standingOn = null;
    }
    if (this.standingOn) this.groundedAt = run.time;

    // ── jump: a tap (buffered briefly), while on the ground or just after leaving it ──
    if (tap?.pressed) this.jumpBufferedUntil = run.time + side.jumpBufferMs;
    const canJump = this.standingOn !== null || run.time - this.groundedAt <= side.coyoteMs;
    if (run.time <= this.jumpBufferedUntil && canJump) {
      const from = this.standingOn;
      p.vy = jumpVelocity * Math.sqrt(run.jumpMultiplier);
      p.landedAt = run.time;
      p.apexY = p.y;
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
          p.vy = jumpVelocity * Math.sqrt(run.jumpMultiplier);
          this.standingOn = null;
          this.groundedAt = -Infinity;
          this.jumpBufferedUntil = -Infinity;
          events.push({ type: 'bounce', platformId: landed.id });
        }
      }
    }

    // ── pickups, oranges ──
    this.pickups = this.pickups.filter((pk) => {
      if (!touchesBox(p, pk.x, pk.y, pk.size, null)) return true;
      run.effects.trigger(pk.effect, run.time);
      p.bonusUntil = run.time + this.config.player.bonusPoseMs;
      p.bonusSpriteKey = pk.spriteKey;
      run.stats.pickups++;
      this.collected.push({ ...pk, collectedAt: run.time });
      events.push({ type: 'pickup', effect: pk.effect });
      return false;
    });
    run.effects.tick(run.time);
    const hz = this.config.hazards;
    for (const h of this.hazards) {
      h.y = h.baseY + ((1 - Math.cos((run.time / 1000) * hz.bobHz * 2 * Math.PI + h.phase)) / 2) * hz.bobTiles;
    }
    if (!this.isInvulnerable(run.time)) {
      const hit = this.hazards.find((h) => {
        const box = h.size * hz.hitboxScale;
        const inset = (h.size - box) / 2;
        return touchesBox(p, h.x + inset, h.y + inset, box, null);
      });
      if (hit) {
        run.addScore(-hz.damage);
        p.hurtAt = run.time;
        run.stats.hits++;
        events.push({ type: 'hit', damage: hz.damage });
      }
    }

    // ── the exit ──
    if (!this.finished && touchesBox(p, this.exit.x, this.exit.y, this.exit.size, null)) {
      this.finished = true;
      run.addScore(side.finishBonus);
      events.push({ type: 'portalExit' });
    }

    // ── camera: keeps the chick at followX, within the level ──
    const maxCamera = Math.max(0, this.length - this.viewColumns);
    this.cameraX = Math.min(maxCamera, Math.max(0, p.x - this.viewColumns * side.followX));

    const maxLife = this.config.milestones.lifeMs * 1.2;
    this.bursts = this.bursts.filter((b) => run.time - b.startedAt < maxLife);
    this.collected = this.collected.filter((c) => run.time - c.collectedAt < COLLECTED_TTL_MS);
    return events;
  }
}
