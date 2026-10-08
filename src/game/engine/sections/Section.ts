import type { GameConfig } from '../../config';
import type { EffectRegistry } from '../effects/EffectRegistry';
import type { Burst, CollectedPickup, GameEvent, Player, StepInput } from '../entities';
import type { Rng } from '../random';

export type SectionId = 'main' | 'bonus';

export type RunStats = { platforms: number; pickups: number; hits: number; easterEggs: number; portals: number };

/**
 * What a section may use of the run it belongs to: the shared clock, score,
 * effects and statistics. Sections never touch each other, only the run.
 */
export interface RunContext {
  readonly config: GameConfig;
  readonly rng: Rng;
  /** Game clock (ms); the run advances it before stepping the active section. */
  readonly time: number;
  readonly effects: EffectRegistry;
  readonly score: number;
  readonly scoreMultiplier: number;
  readonly jumpMultiplier: number;
  readonly physics: { gravity: number; jumpVelocity: number; glideFallSpeed: number };
  readonly stats: RunStats;
  /** Milestones reached so far (picks the platform theme). */
  readonly milestonesReached: number;
  /** Adds (or with a negative value takes) points; the score never goes below 0. */
  addScore(points: number): void;
  /** Unique entity id across all sections of the run. */
  nextId(): number;
}

/**
 * One place the run can be in: its own level, camera, physics rules and
 * entities. The run steps only the active section.
 */
export interface Section {
  readonly id: SectionId;
  readonly kind: 'vertical' | 'side';
  player: Player;
  /** Milestone fireworks, in this section's coordinates. */
  bursts: Burst[];
  collected: CollectedPickup[];
  step(dt: number, input: StepInput, run: RunContext): GameEvent[];
  /** The section becomes active (entered through a portal, or resumed). */
  enter(run: RunContext): void;
  /** A milestone was reached while this section is active. */
  onMilestone(run: RunContext): void;
}
