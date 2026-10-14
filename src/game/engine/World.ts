import { derivePhysics, type GameConfig } from '../config';
import type { LevelChunk } from '../level/chunks';
import { addBonus, doubleJumpHeight, doubleScore, psyMode } from './effects/builtins';
import { EffectRegistry, type EffectContext } from './effects/EffectRegistry';
import type { Burst, GameEvent, StarParticle, StepInput } from './entities';
import { createRng, type Rng } from './random';
import { skyAngleFromClock } from '../render/skyOrbit';
import type { RunContext, RunStats, Section, SectionId } from './sections/Section';
import { SideSection } from './sections/SideSection';
import { VerticalSection } from './sections/VerticalSection';

export * from './entities';
export { isFalling, overlapsX, wrap } from './collide';
export { deathScale, platformTheme } from './sections/VerticalSection';
export { easterEggItemDef } from './sections/shared';
export type { RunContext, Section, SectionId } from './sections/Section';

export type WorldOptions = {
  config: GameConfig;
  /** Visible height in tiles (screenHeight / tileSize). */
  viewHeight: number;
  rng?: Rng;
  chunks?: LevelChunk[];
  startChunk?: LevelChunk;
  /** Time of day the run starts at (places the sun / moon); now by default. */
  clock?: Date;
};

/**
 * One run of the game (the "Run"): the clock, score, effects, statistics and
 * milestones shared by every place the chick can be in, plus those places
 * (sections). Only the active section is stepped.
 *
 * For the screen and the tests the run also shows its main (vertical)
 * section directly: `world.player`, `world.platforms`, `world.cameraY` …
 * are the main section's.
 */
export class World implements RunContext {
  readonly config: GameConfig;
  readonly viewHeight: number;
  readonly rng: Rng;
  readonly effects: EffectRegistry;
  readonly physics: { gravity: number; jumpVelocity: number; glideFallSpeed: number };
  /** Game clock in ms; only advances while stepping, so pausing freezes effects too. */
  time = 0;
  score = 0;
  scoreMultiplier = 1;
  jumpMultiplier = 1;
  over = false;
  stats: RunStats = { platforms: 0, pickups: 0, hits: 0, easterEggs: 0, portals: 0 };
  /** Milestones reached so far; picks the platform theme (see config.platformThemes). */
  milestonesReached = 0;
  /** Psy mode (magic mushroom) is on: the main level flies instead of bouncing, looks different. */
  psyActive = false;
  /**
   * Psy mode switching on or off: everything stands still while a swirl grows
   * from the chick (centre in level tiles) until it covers the screen, the mode
   * switches (`switched`), and the swirl shrinks back.
   */
  psySwirl: { to: boolean; startedAt: number; switched: boolean; x: number; y: number } | null = null;
  /** Sun / moon angle (degrees) when the run started, from the real time of day. */
  readonly skyStartAngle: number;
  readonly main: VerticalSection;
  /** The bonus level while the run is in it (or fading in / out of it). */
  bonus: SideSection | null = null;
  active: Section;
  /**
   * Changing sections: everything stands still, the screen fades to black and
   * back; the section switches halfway (`switched`).
   */
  transition: { to: SectionId; startedAt: number; switched: boolean } | null = null;

  /** Next score that triggers a burst; only moves up, so dropping below and back doesn't re-fire. */
  private nextMilestone: number;
  private idCounter = 1;

  constructor({ config, viewHeight, rng = createRng(), chunks, startChunk, clock = new Date() }: WorldOptions) {
    this.config = config;
    this.skyStartAngle = skyAngleFromClock(clock);
    this.viewHeight = viewHeight;
    this.rng = rng;
    this.nextMilestone = config.milestones.every;
    const { gravity, jumpVelocity } = derivePhysics(config);
    // speed reached when the umbrella opens (after falling fallPoseAfterTiles from the apex), scaled down
    const openSpeed = Math.sqrt(2 * gravity * config.player.fallPoseAfterTiles);
    this.physics = { gravity, jumpVelocity, glideFallSpeed: openSpeed * config.player.glideSpeedFactor };

    const ctx: EffectContext = {
      addScore: (n) => (this.score += n),
      setScoreMultiplier: (m) => (this.scoreMultiplier = m),
      setJumpMultiplier: (m) => (this.jumpMultiplier = m),
      setPsy: (on) => this.startPsySwirl(on),
    };
    this.effects = new EffectRegistry(ctx)
      .register(addBonus(config.effects.coinBonus))
      .register(doubleScore(config.effects.doubleScoreMs))
      .register(doubleJumpHeight(config.effects.doubleJumpMs))
      .register(psyMode(config.mushroom.durationMs));

    this.main = new VerticalSection(this, { viewHeight, chunks, startChunk });
    this.active = this.main;
  }

  addScore(points: number) {
    this.score = Math.max(0, this.score + points);
  }

  nextId(): number {
    return this.idCounter++;
  }

  step(dtSeconds: number, input: StepInput): GameEvent[] {
    if (this.over) return [];
    this.time += dtSeconds * 1000;
    if (this.transition) {
      this.stepTransition();
      return [];
    }
    if (this.psySwirl) {
      this.stepPsySwirl();
      return [];
    }
    const events = this.active.step(dtSeconds, input, this);
    if (events.some((e) => e.type === 'gameOver')) {
      this.over = true;
      return events;
    }
    for (const e of events) {
      if (e.type === 'portalEnter') {
        this.stats.portals++;
        this.transition = { to: e.target, startedAt: this.time, switched: false };
      }
      if (e.type === 'portalExit') this.transition = { to: 'main', startedAt: this.time, switched: false };
    }
    this.checkMilestones(events);
    return events;
  }

  /** Sun / moon angle now: the time of day at the start, turning slowly with the game clock. */
  get skyAngle(): number {
    return this.skyStartAngle + (this.time / 1000) * this.config.sky.degPerSecond;
  }

  /** 0 = clear … 1 = black: up during the first half of the transition, down in the second. */
  transitionAlpha(): number {
    if (!this.transition) return 0;
    const k = Math.min(1, (this.time - this.transition.startedAt) / this.config.portals.transitionMs);
    return k < 0.5 ? k * 2 : (1 - k) * 2;
  }

  /** How far along the psy swirl is (0 = just started … 1 = done), or null when there is none. */
  psySwirlProgress(): number | null {
    if (!this.psySwirl) return null;
    return Math.min(1, (this.time - this.psySwirl.startedAt) / this.swirlMs);
  }

  /** How far along the bonus level (0–1) while in it, otherwise null. */
  get bonusProgress(): number | null {
    return this.active === this.bonus && this.bonus ? this.bonus.progress : null;
  }

  private stepTransition() {
    const t = this.transition!;
    const elapsed = this.time - t.startedAt;
    const duration = this.config.portals.transitionMs;
    if (!t.switched && elapsed >= duration / 2) {
      t.switched = true;
      if (t.to === 'bonus') {
        this.bonus = new SideSection(this);
        this.active = this.bonus;
      } else {
        this.active = this.main;
        this.bonus = null;
      }
      this.active.enter(this);
    }
    if (elapsed >= duration) this.transition = null;
  }

  /** The swirl's length; a config without it (or a bad value) switches at once rather than freezing the game. */
  private get swirlMs(): number {
    const ms = this.config.psy.swirlMs;
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  private startPsySwirl(on: boolean) {
    if (on === this.psyActive && !this.psySwirl) return;
    if (this.swirlMs <= 0) {
      this.psyActive = on;
      return;
    }
    const p = this.player;
    this.psySwirl = { to: on, startedAt: this.time, switched: false, x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }

  private stepPsySwirl() {
    const s = this.psySwirl!;
    const elapsed = this.time - s.startedAt;
    const duration = this.swirlMs;
    if (!s.switched && elapsed >= duration / 2) {
      s.switched = true;
      this.psyActive = s.to;
    }
    if (elapsed >= duration) {
      this.psySwirl = null;
      // the psy time starts once the swirl is gone: the frozen time doesn't count
      if (s.to) this.effects.extend('psy', duration);
    }
  }

  private checkMilestones(events: GameEvent[]) {
    const m = this.config.milestones;
    while (this.score >= this.nextMilestone) {
      events.push({ type: 'milestone', score: this.nextMilestone });
      const { x, y, w, h } = this.active.player;
      const burst: Burst = { id: this.nextId(), startedAt: this.time, x: x + w / 2, y: y + h / 2, particles: this.makeStars() };
      this.active.bursts.push(burst);
      this.nextMilestone += m.every;
      this.milestonesReached++;
      this.active.onMilestone(this);
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

  // ── facade: the main (vertical) section ─────────────────────────────

  get player() {
    return this.main.player;
  }
  get platforms() {
    return this.main.platforms;
  }
  get pickups() {
    return this.main.pickups;
  }
  get collected() {
    return this.main.collected;
  }
  get hazards() {
    return this.main.hazards;
  }
  get easterEggs() {
    return this.main.easterEggs;
  }
  get bursts() {
    return this.main.bursts;
  }
  get cameraY() {
    return this.main.cameraY;
  }
  set cameraY(y: number) {
    this.main.cameraY = y;
  }
  get egg() {
    return this.main.egg;
  }
  get started() {
    return this.main.started;
  }
  get launchedAt() {
    return this.main.launchedAt;
  }
  get dying() {
    return this.main.dying;
  }
  get diedAt() {
    return this.main.diedAt;
  }
  get glideFallSpeed() {
    return this.physics.glideFallSpeed;
  }
  get isInvulnerable() {
    return this.main.isInvulnerable;
  }
  get countdownRemainingMs() {
    return this.main.countdownRemainingMs;
  }
  get difficulty() {
    return this.main.difficulty;
  }
}
