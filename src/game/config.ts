/**
 * Central tuning config. All world units are TILES (1 = one grid cell);
 * the renderer converts to pixels via tileSize = screenWidth / columns.
 */
export type GameConfig = {
  /** Grid width in tiles. Every level chunk row must be exactly this wide. */
  columns: number;
  /** Jump apex height in tiles ("one platform distance"). */
  maxJumpTiles: number;
  /** Seconds from take-off to apex; together with maxJumpTiles derives gravity + jump velocity. */
  jumpTimeToApex: number;
  player: {
    widthTiles: number;
    heightTiles: number;
    /** How long the "got a bonus" sprite is shown after a pickup. */
    bonusPoseMs: number;
    /**
     * The falling sprite only shows after dropping this far below the jump's
     * highest point (half a platform spacing). A normal hop to the next
     * platform drops ~1 tile, so it never looks like a fall.
     */
    fallPoseAfterTiles: number;
    /**
     * Umbrella glide: once the falling pose shows, the fall speed eases to this
     * fraction of the speed the player had when the umbrella opened
     * (1 = no glide). Slower fall = more time to steer.
     */
    glideSpeedFactor: number;
    /** How quickly (1/s) the umbrella brakes to the glide speed. */
    glideDrag: number;
  };
  input: {
    /** 1 = the character ends up exactly as far as the finger moved. */
    dragSensitivity: number;
    /**
     * Elastic follow: the finger moves a target, a spring pulls the character
     * after it. Higher frequency (rad/s) = snappier, lower = more lag.
     */
    followFrequency: number;
    /** Spring damping ratio: 1 = no overshoot, below 1 = a little elastic overshoot. */
    followDamping: number;
    /** Glide after release: extra distance = release speed / releaseFriction (tiles). */
    releaseFriction: number;
    /** Cap for the release speed in tiles/s. */
    maxGlideSpeed: number;
  };
  camera: {
    /** Player is kept at this fraction of the screen height measured from the top. */
    followRatio: number;
    /** 0..1 per 60fps frame; higher = snappier. */
    smoothing: number;
    /**
     * Tiles/s the screen keeps rising once the player has scored, so standing
     * still eventually drops the player off the bottom. 0 disables it.
     */
    autoScrollSpeed: number;
    autoScrollPerDifficulty: number;
  };
  generation: {
    /** How many screens of level to keep generated above the camera. */
    aheadScreens: number;
    /** Climbed rows needed to unlock the next difficulty level. */
    rowsPerDifficulty: number;
    maxDifficulty: number;
  };
  effects: {
    doubleScoreMs: number;
    doubleJumpMs: number;
    coinBonus: number;
  };
  hazards: {
    /** Points lost per hit (score never goes below 0). */
    damage: number;
    /** After a hit the player can't be hurt again for this long (and blinks). */
    invulnerableMs: number;
    /** How long the hurt sprite (player_hurt) is shown after a hit, if it exists. */
    hurtPoseMs: number;
    /** Hover: the hazard floats between its base and base + bobTiles above the platform. */
    bobTiles: number;
    bobHz: number;
    /** Hitbox size relative to the drawn size (< 1 = forgiving). */
    hitboxScale: number;
  };
};

export const defaultGameConfig: GameConfig = {
  columns: 9,
  maxJumpTiles: 4,
  jumpTimeToApex: 0.45,
  player: {
    widthTiles: 0.9,
    heightTiles: 0.9,
    bonusPoseMs: 600,
    fallPoseAfterTiles: 1.5,
    glideSpeedFactor: 1 / 3,
    glideDrag: 12,
  },
  input: {
    dragSensitivity: 1,
    followFrequency: 16,
    followDamping: 0.7,
    releaseFriction: 7,
    maxGlideSpeed: 14,
  },
  camera: { followRatio: 0.45, smoothing: 0.15, autoScrollSpeed: 0.5, autoScrollPerDifficulty: 0.25 },
  generation: { aheadScreens: 1.5, rowsPerDifficulty: 40, maxDifficulty: 3 },
  effects: { doubleScoreMs: 10_000, doubleJumpMs: 5_000, coinBonus: 1 },
  hazards: { damage: 1, invulnerableMs: 1000, hurtPoseMs: 500, bobTiles: 0.35, bobHz: 0.5, hitboxScale: 0.75 },
};

export function derivePhysics(config: GameConfig) {
  const h = config.maxJumpTiles;
  const t = config.jumpTimeToApex;
  return {
    gravity: (2 * h) / (t * t),
    jumpVelocity: (2 * h) / t,
  };
}
