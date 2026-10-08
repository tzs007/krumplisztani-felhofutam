import type { EasterEggItemDef } from '../config';
import type { PlatformVariant } from '../level/tiles';
import type { EffectId } from './effects/EffectRegistry';

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
 * Touch as a button (side section): `down` = finger on the screen now;
 * `pressed` / `released` = it went down / up since the previous step.
 */
export type TapState = { down: boolean; pressed: boolean; released: boolean };

/**
 * dx: horizontal finger movement since the last step, in tiles.
 * dy: vertical finger movement (tiles, screen direction: positive = down); used while flying.
 * releaseVelocity: finger speed (tiles/s) at the moment of release; starts the glide.
 * tap: the same touch read as a button (used by the side section).
 */
export type StepInput = { dragging: boolean; dx: number; dy?: number; releaseVelocity?: number; tap?: TapState };

/** The magic mushroom standing on a platform of the main level. */
export type Mushroom = { id: number; x: number; y: number; size: number; spriteKey: string };

/** A portal in a section; touching it moves the run to `target`. */
export type Portal = { id: number; x: number; y: number; size: number; spriteKey: string; target: 'main' | 'bonus' };

export type GameEvent =
  /** First landing on a platform: it scores. */
  | { type: 'land'; platformId: number; points: number }
  /** Every take-off from a platform (also one landed on before). */
  | { type: 'bounce'; platformId: number }
  | { type: 'pickup'; effect: EffectId }
  | { type: 'hit'; damage: number }
  | { type: 'milestone'; score: number }
  /** Feet reached the screen bottom: the death hop starts; gameOver follows once off screen. */
  | { type: 'death' }
  /** Countdown finished: the chick hops out of the egg. */
  | { type: 'launch' }
  /** Found a hidden meme; the game shows it (and pauses) */
  | { type: 'easterEgg'; eggId: string }
  /** Picked up the magic mushroom: the psy mode starts. */
  | { type: 'mushroom' }
  /** Touched a portal in the main level: off to the bonus level. */
  | { type: 'portalEnter'; target: 'bonus' }
  /** Reached the exit portal of the bonus level: back to the main level. */
  | { type: 'portalExit' }
  | { type: 'gameOver' };

