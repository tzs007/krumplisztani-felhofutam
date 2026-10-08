import type { PlatformVariant } from "./level/tiles";

/**
 * Central tuning config. All world units are TILES (1 = one grid cell);
 * the renderer converts to pixels via tileSize = screenWidth / columns.
 */
/**
 * The in-level object of an easter egg: any registered sprite.
 * placement "ground": stands on the platform; "hover": floats just above it
 * (bobbing like the coin).
 */
export type EasterEggItemDef = {
  spriteKey: string;
  /** Drawn size and hitbox in tiles. */
  size: number;
  placement: "ground" | "hover";
};

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
  milestones: {
    /** A star burst fires each time the score first reaches a multiple of this. */
    every: number;
    /** Star count per burst: random between min and max (max 10). */
    minStars: number;
    maxStars: number;
    /** Star sizes in tiles: half the stars are small, half large. */
    smallSize: [number, number];
    largeSize: [number, number];
    /** Launch speed range (tiles/s) and the gravity pulling the stars back (tiles/s²). */
    speed: [number, number];
    gravity: number;
    /** Each star lives this long (± 20%), then it has shrunk away. */
    lifeMs: number;
  };
  /**
   * Platform look per milestone: after the n-th milestone everything above
   * the player switches to sequence[n] right away (with the fireworks), and so
   * does the level generated from then on; the platform under the player and
   * those below keep their look. Past the end: start over (loop) or stay on
   * the last one. Empty: the variants authored in the chunks.
   */
  platformThemes: {
    sequence: PlatformVariant[];
    loop: boolean;
  };
  /** Portals in the main level that lead to the bonus level. */
  portals: {
    /** Chance (0–1) that a run has a portal at all; at most one per run. */
    chancePerGame: number;
    /** If it does, it stands in a random level chunk in this range (1 = the first chunk after the start). */
    chunkRange: [number, number];
    /** Drawn size and hitbox (tiles). */
    size: number;
    /** Fade to black and back when changing sections (ms); the switch happens halfway. */
    transitionMs: number;
    /** After coming back: this long without auto scroll and without orange damage (ms). */
    returnSafeMs: number;
  };
  /** Side-scrolling bonus level (reached through a portal). */
  side: {
    /** Visible columns: the bonus level is zoomed out (tile size = screen width / viewColumns). */
    viewColumns: number;
    /** Running speed (tiles/s); the chick runs right by itself. */
    runSpeed: number;
    /** Where the chick stays on screen, as a fraction of the screen width from the left. */
    followX: number;
    /** Middle chunks between the start and the end chunk. */
    chunks: number;
    /** Releasing the tap while still rising multiplies the upward speed by this (shorter hop). */
    jumpCutFactor: number;
    /** A tap this long after running off an edge still jumps. */
    coyoteMs: number;
    /** A tap this long before landing jumps right on landing. */
    jumpBufferMs: number;
    /** Points for reaching the exit portal. */
    finishBonus: number;
    /** Umbrella glide on long falls, like in the main level. */
    glide: boolean;
    /** Look of the ground. */
    groundTheme: PlatformVariant;
  };
  background: {
    /** Backdrop image (not a tile sprite: drawn with its own aspect ratio, sides cropped to fit). */
    spriteKey: string;
    /** Drawn height relative to the screen; the extra part is what the parallax scrolls through. */
    heightScreens: number;
    /**
     * Very slow parallax: backdrop pixels moved per pixel the camera climbs.
     * It starts showing the bottom of the image and stops once the top is reached.
     */
    parallax: number;
  };
  easterEggs: {
    /**
     * Drop rate per game: chance (0–1) that this run hides an easter egg at
     * all. At most one per game; 0.1 ≈ one in every ten games on average.
     */
    chancePerGame: number;
    /**
     * If it drops, it's hidden in a random level chunk in this range (1 = the
     * first chunk after the start), low enough to be reachable in a normal run.
     */
    chunkRange: [number, number];
    /**
     * What stands in the level for an easter egg that doesn't bring its own
     * `item` (see src/game/easterEggs.ts).
     */
    defaultItem: EasterEggItemDef;
  };
  start: {
    /** Countdown before the first hop; the chick waits in the egg meanwhile. 0 = start at once. */
    countdownMs: number;
    /** Egg shell width in tiles, centred on the spawn point, drawn in front of the chick. */
    eggSizeTiles: number;
    /** How far the egg sinks into the ground so the chick's feet are hidden. */
    eggSinkTiles: number;
  };
  death: {
    /**
     * Last hop when the feet touch the screen bottom, relative to a normal
     * jump's take-off speed (height grows with its square: 1.2 ≈ 1.45× a jump).
     */
    jumpFactor: number;
    /** Random sideways speed range (tiles/s) of the death hop; direction is random too. */
    driftSpeed: [number, number];
    /**
     * Falling "towards the viewer": the sprite grows from 1× to zoomMaxScale
     * over zoomDurationMs (ease-in), around its centre.
     */
    zoomMaxScale: number;
    zoomDurationMs: number;
    /** Game over once the (zoomed) sprite is fully below the screen bottom, plus this margin (tiles). */
    exitMarginTiles: number;
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
  camera: {
    followRatio: 0.45,
    smoothing: 0.15,
    autoScrollSpeed: 0.5,
    autoScrollPerDifficulty: 0.25,
  },
  generation: {
    aheadScreens: 1.5,
    rowsPerDifficulty: 40,
    maxDifficulty: 3,
  },
  effects: {
    doubleScoreMs: 5_000,
    doubleJumpMs: 2_500,
    coinBonus: 1,
  },
  milestones: {
    every: 100,
    minStars: 7,
    maxStars: 10,
    smallSize: [0.25, 0.4],
    largeSize: [0.5, 0.75],
    speed: [3, 6],
    gravity: 7,
    lifeMs: 1300,
  },
  platformThemes: {
    // one look per 100 points from the start, then again from the first
    sequence: [
      "grass",
      "planks",
      "brick",
      "byzantine",
      "topaz",
      "emerald",
      "ruby",
    ],
    loop: true,
  },
  portals: {
    chancePerGame: 0.3,
    chunkRange: [4, 20],
    size: 1.3,
    transitionMs: 500,
    returnSafeMs: 2000,
  },
  side: {
    viewColumns: 14,
    runSpeed: 5.5,
    followX: 0.3,
    chunks: 6,
    jumpCutFactor: 0.45,
    coyoteMs: 90,
    jumpBufferMs: 120,
    finishBonus: 10,
    glide: true,
    groundTheme: "grass",
  },
  background: {
    spriteKey: "bg_sky",
    heightScreens: 1.5,
    parallax: 0.05,
  },
  easterEggs: {
    chancePerGame: 0.1,
    chunkRange: [2, 12],
    // 1.125 → the pumpkin looks as big as the coin
    defaultItem: {
      spriteKey: "easter_pumpkin",
      size: 1.125,
      placement: "ground",
    },
  },
  start: {
    countdownMs: 3000,
    eggSizeTiles: 1.5,
    eggSinkTiles: 0.1,
  },
  death: {
    jumpFactor: 1.2,
    driftSpeed: [1.5, 4],
    zoomMaxScale: 3,
    zoomDurationMs: 1200,
    exitMarginTiles: 0.2,
  },
  hazards: {
    damage: 1,
    invulnerableMs: 1000,
    hurtPoseMs: 500,
    bobTiles: 0.35,
    bobHz: 0.5,
    hitboxScale: 0.75,
  },
};

export function derivePhysics(config: GameConfig) {
  const h = config.maxJumpTiles;
  const t = config.jumpTimeToApex;
  return {
    gravity: (2 * h) / (t * t),
    jumpVelocity: (2 * h) / t,
  };
}
