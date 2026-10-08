import { derivePhysics, type GameConfig } from '../config';
import type { LevelChunk } from '../level/chunks';
import { addBonus, doubleJumpHeight, doubleScore } from './effects/builtins';
import { EffectRegistry, type EffectContext } from './effects/EffectRegistry';
import type { Burst, GameEvent, StarParticle, StepInput } from './entities';
import { createRng, type Rng } from './random';
import type { RunContext, RunStats, Section } from './sections/Section';
import { VerticalSection } from './sections/VerticalSection';

export * from './entities';
export { isFalling, overlapsX, wrap } from './collide';
export { deathScale, easterEggItemDef, platformTheme } from './sections/VerticalSection';
export type { RunContext, Section, SectionId } from './sections/Section';

export type WorldOptions = {
  config: GameConfig;
  /** Visible height in tiles (screenHeight / tileSize). */
  viewHeight: number;
  rng?: Rng;
  chunks?: LevelChunk[];
  startChunk?: LevelChunk;
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
  readonly main: VerticalSection;
  active: Section;

  /** Next score that triggers a burst; only moves up, so dropping below and back doesn't re-fire. */
  private nextMilestone: number;
  private idCounter = 1;

  constructor({ config, viewHeight, rng = createRng(), chunks, startChunk }: WorldOptions) {
    this.config = config;
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
    };
    this.effects = new EffectRegistry(ctx)
      .register(addBonus(config.effects.coinBonus))
      .register(doubleScore(config.effects.doubleScoreMs))
      .register(doubleJumpHeight(config.effects.doubleJumpMs));

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
    const events = this.active.step(dtSeconds, input, this);
    if (events.some((e) => e.type === 'gameOver')) {
      this.over = true;
      return events;
    }
    this.checkMilestones(events);
    return events;
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
