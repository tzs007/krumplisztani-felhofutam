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
  player: { widthTiles: number; heightTiles: number };
  input: {
    /** 1 = the character moves exactly as far as the finger. */
    dragSensitivity: number;
    /** Exponential decay (1/s) of the horizontal glide after the finger is released. */
    releaseFriction: number;
    /** Cap for the glide speed in tiles/s. */
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
};

export const defaultGameConfig: GameConfig = {
  columns: 9,
  maxJumpTiles: 4,
  jumpTimeToApex: 0.45,
  player: { widthTiles: 0.8, heightTiles: 0.8 },
  input: { dragSensitivity: 1, releaseFriction: 7, maxGlideSpeed: 14 },
  camera: { followRatio: 0.45, smoothing: 0.15, autoScrollSpeed: 0.5, autoScrollPerDifficulty: 0.25 },
  generation: { aheadScreens: 1.5, rowsPerDifficulty: 40, maxDifficulty: 3 },
  effects: { doubleScoreMs: 10_000, doubleJumpMs: 5_000, coinBonus: 1 },
};

export function derivePhysics(config: GameConfig) {
  const h = config.maxJumpTiles;
  const t = config.jumpTimeToApex;
  return {
    gravity: (2 * h) / (t * t),
    jumpVelocity: (2 * h) / t,
  };
}
