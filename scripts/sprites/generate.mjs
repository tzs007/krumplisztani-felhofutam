#!/usr/bin/env node
/**
 * Sprite generator → assets/sprites/<spriteKey>.png (128×128 per frame).
 *
 * - Platforms / pickups / cloud: procedural placeholders on a 16×16 logical
 *   grid, upscaled ×8 (nearest neighbour).
 * - Player: built from the source art in assets/sprite-sources/ (pixelized to
 *   128×128); rising uses the chick_run.png strip, fall / bonus poses use
 *   chick_fall.png / chick_bonus[_<type>].png at the chick_jump scale.
 * - Animated sprites are horizontal sheets; frame counts come from
 *   assets/sprites/animations.json (shared with the game).
 *
 * Replace any PNG by hand later: keep the file name (= spriteKey), 128×128 per
 * frame, and update animations.json if the frame count changes.
 * Run: npm run sprites   (overwrites every generated file!)
 *      npm run sprites -- platform_byzantine   (only sprites whose name starts with an argument)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

import { platformTilesFromArt, platformTilesFromPieces, splitStrip } from './platformArt.mjs';
import { gridCell, gridFrames, pixelize, pixelizeStrip } from './pixelize.mjs';

const { PNG } = pngjs;
const GRID = 16;
const SCALE = 8;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(ROOT, 'assets/sprites');
const SOURCE_DIR = join(ROOT, 'assets/sprite-sources');
const animations = JSON.parse(readFileSync(join(OUT_DIR, 'animations.json'), 'utf8'));
const framesOf = (name) => animations[name]?.frames ?? 1;
/** Keeps only the strip frames listed in animations.json `sourceFrames` (all of them if absent). */
function pickFrames(name, frames) {
  const wanted = animations[name]?.sourceFrames;
  if (!wanted) return frames;
  return wanted.map((i) => {
    if (!frames[i]) throw new Error(`${name}: sourceFrames has ${i}, but the source strip has ${frames.length} frames`);
    return frames[i];
  });
}
/** Frame count to expect in a source strip (unknown when only some frames are picked). */
const stripFramesOf = (name) => (animations[name]?.sourceFrames ? undefined : framesOf(name));

// ── helpers ─────────────────────────────────────────────────────────

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

/**
 * Writes a horizontal sprite sheet. pixel(x, y, frame) → '#rrggbb' | [r,g,b,a] | null
 * on a w×h logical grid, each logical pixel scaled ×scale.
 */
function writeSheet(name, w, h, pixel, scale = SCALE) {
  const frames = framesOf(name);
  const fw = w * scale;
  const png = new PNG({ width: fw * frames, height: h * scale });
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = pixel(x, y, f);
        const rgba = !c ? [0, 0, 0, 0] : typeof c === 'string' ? hex(c) : c;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            png.data.set(rgba, ((y * scale + dy) * png.width + f * fw + x * scale + dx) * 4);
          }
        }
      }
    }
  }
  writeFileSync(join(OUT_DIR, `${name}.png`), PNG.sync.write(png));
}
const writeSprite = (name, w, h, pixel) => writeSheet(name, w, h, (x, y) => pixel(x, y));

// ── platforms: left / mid / right / single, seamless horizontally ───

const platformPalettes = {
  grass: { outline: '#2B4A12', hi: '#A6EA6E', top: '#6CC24A', topDark: '#4E9A2F', body: '#C77B3F', bodyDark: '#9A5A2A', bodyLight: '#E0A060' },
  blue: { outline: '#12275E', hi: '#B5D0FF', top: '#4F8DF5', topDark: '#3668C8', body: '#1F3F8F', bodyDark: '#162E6A', bodyLight: '#3A62C4' },
  brick: { outline: '#3E1209', hi: '#F29A80', top: '#D9573D', topDark: '#A23522', body: '#C8462F', bodyDark: '#7E2A1C', bodyLight: '#E0654C' },
};

function platformBody(variant, p, x, y) {
  if (variant === 'grass') {
    if (y === 4) return x % 4 < 2 ? p.topDark : p.body; // grass drips
    if ((x + y * 3) % 7 === 0) return p.bodyDark;
    if ((x * 3 + y) % 11 === 0) return p.bodyLight;
    return p.body;
  }
  if (variant === 'blue') {
    if (y === 4) return p.topDark;
    if (y === 6) return x % 4 === 1 ? p.hi : p.bodyLight; // rivet stripe
    return p.body;
  }
  // brick
  if (y === 4 || y === 7) return p.bodyDark; // mortar rows
  if ((y === 5 || y === 6) && x % 8 === 3) return p.bodyDark;
  if (y === 8 && x % 8 === 7) return p.bodyDark;
  if (y === 5 && x % 8 === 4) return p.bodyLight;
  return p.body;
}

function platformPixel(variant, part) {
  const p = platformPalettes[variant];
  const leftEdge = part === 'left' || part === 'single';
  const rightEdge = part === 'right' || part === 'single';
  return (x, y) => {
    if (y > 9) return null;
    const edgeX = (leftEdge && x === 0) || (rightEdge && x === GRID - 1);
    if (edgeX && (y === 0 || y === 9)) return null; // rounded corners
    if (y === 0 || y === 9 || edgeX) return p.outline;
    if (y === 1) return p.hi;
    if (y === 2 || y === 3) return y === 3 && x % 5 === 2 ? p.topDark : p.top;
    return platformBody(variant, p, x, y);
  };
}

// ── pickups ─────────────────────────────────────────────────────────

/** Coin spinning around its vertical axis: the disc gets narrower, then widens again. */
function coin(x, y, f) {
  const frames = framesOf('pickup_coin');
  const squeeze = Math.max(0.18, Math.abs(Math.cos((f / frames) * Math.PI)));
  const dx = (x - 7.5) / squeeze;
  const d = Math.hypot(dx, y - 7.5);
  if (d > 6.6) return null;
  if (d > 5.6) return '#9A6B00';
  if (squeeze < 0.5) return Math.abs(dx) < 3 ? '#D9A10F' : '#F7C325'; // edge-on
  if (d > 3.6 && d < 4.4) return '#D9A10F';
  if (Math.abs(dx) <= 1 && y >= 5 && y <= 10) return '#FFF3B0';
  if (x === 5 && y === 4 && f === 0) return '#FFFFFF';
  return '#F7C325';
}

const glyphX = ['X.X', 'X.X', '.X.', 'X.X', 'X.X'];
const glyph2 = ['XXX', '..X', 'XXX', 'X..', 'XXX'];
const glyphAt = (glyph, gx, gy) => (x, y) => glyph[y - gy]?.[x - gx] === 'X';

function roundedBox(fill, outline, extra) {
  return (x, y, f) => {
    if (x < 1 || x > 14 || y < 1 || y > 14) return null;
    const corner = (x === 1 || x === 14) && (y === 1 || y === 14);
    if (corner) return null;
    if (x === 1 || x === 14 || y === 1 || y === 14) return outline;
    return extra(x, y, f) ?? fill;
  };
}

const x2 = [glyphAt(glyphX, 4, 5), glyphAt(glyph2, 9, 5)];
const pulse = ['#FFFFFF', '#FFE3FF', '#F7C325', '#FFE3FF'];
const doubleScore = roundedBox('#A24BE0', '#4B1673', (x, y, f) => {
  const gy = Math.floor((y - 3) / 2) + 5; // glyph pixels are 1×2
  if (y >= 3 && y <= 12 && x2.some((g) => g(x, gy))) return pulse[f % pulse.length];
  if (y === 2) return f % 2 ? '#E0B5FF' : '#C98AF0';
  return null;
});

const chevron = ['..X..', '.XXX.', 'XX.XX', 'X...X'];
const doubleJump = roundedBox('#26D4E0', '#0B5E66', (x, y, f) => {
  // two chevrons scrolling upward inside the box (rows 2..13 wrap)
  const ry = ((y - 2 + f * 1.5 * 2) % 12 + 12) % 12;
  const row = Math.floor(ry) % 6;
  if (row < 4 && chevron[row][x - 5] === 'X') return '#FFFFFF';
  return null;
});

// ── player: pixelized source art ────────────────────────────────────

// The jump pose defines the scale: its content fills 128×128 = 1 tile. Other
// poses reuse its source-px-per-sprite-px, so the chick keeps its size even if
// extras (flames, coin…) make the sprite larger; the renderer draws 128px = 1 tile.
const chick = pixelize(join(SOURCE_DIR, 'chick_jump.png'), { size: 128, colors: 16 });

/** Writes one image or a list of equal-size frames as a horizontal sheet. */
function writeImage(name, imgOrFrames) {
  const frames = Array.isArray(imgOrFrames) ? imgOrFrames : [imgOrFrames];
  if (framesOf(name) !== frames.length) {
    throw new Error(`${name}: source has ${frames.length} frame(s), animations.json says ${framesOf(name)}`);
  }
  const { width, height } = frames[0];
  writeSheet(name, width, height, (x, y, f) => {
    const { data } = frames[f];
    const i = (y * width + x) * 4;
    return data[i + 3] ? Array.from(data.subarray(i, i + 4)) : null;
  }, 1);
}

/** chick_bonus_<type>.png if present, otherwise the shared chick_bonus.png. */
function bonusSource(type) {
  const specific = join(SOURCE_DIR, `chick_bonus_${type}.png`);
  return existsSync(specific) ? specific : join(SOURCE_DIR, 'chick_bonus.png');
}

// ── cloud (32×16 → 256×128) ─────────────────────────────────────────

// ── effects ─────────────────────────────────────────────────────────

/** 5-pointed star (point up) on the 16×16 grid: outline, fill, a highlight on the upper-left arms. */
/** Portal placeholder: oval ring with a dark core; bright arms rotate with the frame (4-frame loop). */
function portalPixel(x, y, f) {
  const dx = (x - 7.5) / 6.2;
  const dy = (y - 8) / 7.6;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > 1) return null;
  if (r > 0.86) return '#2B0F4F'; // outline
  const angle = Math.atan2(dy, dx) + (f * Math.PI) / 2 + r * 4; // spiral arms
  const arm = (Math.cos(angle * 2) + 1) / 2;
  if (r < 0.3) return arm > 0.5 ? '#E8F7FF' : '#B8E9FF'; // bright core
  if (arm > 0.75) return '#5CE1FF';
  if (arm > 0.45) return '#9B5CFF';
  return '#5A2A9E';
}

function starPixel() {
  const cx = 7.5, cy = 8.3, outer = 7.9, inner = 4.0;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const filled = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && inside(x + 0.5, y + 0.5);
  return (x, y) => {
    if (!filled(x, y)) return null;
    const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
    if (edge) return '#9A6B00';
    if (x + y < 13 && (x - 7.5) ** 2 + (y - 7) ** 2 < 10) return '#FFF3B0';
    return y > 9 ? '#F2A900' : '#F7C325';
  };
}

function cloudPixel() {
  const inside = (x, y) =>
    y >= 0 && y < 16 && x >= 0 && x < 32 &&
    (Math.hypot(x - 9, y - 9) < 5 || Math.hypot(x - 16, y - 6.5) < 6 || Math.hypot(x - 23, y - 9) < 5 ||
      (x >= 6 && x <= 26 && y >= 9 && y <= 13));
  return (x, y) => {
    if (!inside(x, y)) return null;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) return '#BFD9F2';
    if (!inside(x, y + 2)) return '#DCEEFF';
    return '#FFFFFF';
  };
}

// ── write everything ────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });
const written = [];
const only = process.argv.slice(2);
const add = (name, fn) => {
  if (only.length > 0 && !only.some((prefix) => name.startsWith(prefix))) return;
  fn();
  written.push(name);
};

const PARTS = ['left', 'mid', 'right', 'single'];
const platformSource = (variant, part) => join(SOURCE_DIR, `platform_${variant}_${part}.png`);
// drawn pieces replace the placeholder: either one strip platform_<variant>.png with the four
// pieces side by side (left, mid, right, single; transparent gaps between) or four files
// platform_<variant>_{left,mid,right,single}.png
const stripSource = (variant) => join(SOURCE_DIR, `platform_${variant}.png`);
function drawnPieces(variant) {
  if (existsSync(stripSource(variant))) {
    const imgs = splitStrip(stripSource(variant), PARTS.length);
    return Object.fromEntries(PARTS.map((part, i) => [part, imgs[i]]));
  }
  if (PARTS.every((part) => existsSync(platformSource(variant, part)))) {
    return Object.fromEntries(PARTS.map((part) => [part, platformSource(variant, part)]));
  }
  return null;
}

// platform themes that only exist as drawn art (no procedural placeholder)
const DRAWN_PLATFORMS = ['emerald', 'topaz', 'ruby', 'planks'];
for (const variant of [...Object.keys(platformPalettes), ...DRAWN_PLATFORMS]) {
  const hasArt = existsSync(stripSource(variant)) || PARTS.every((part) => existsSync(platformSource(variant, part)));
  if (hasArt) {
    let tiles;
    for (const part of PARTS) {
      const name = `platform_${variant}_${part}`;
      if (animations[name]?.surfaceY === undefined) throw new Error(`${name}: drawn pieces need surfaceY in animations.json`);
      add(name, () => {
        tiles ??= platformTilesFromPieces(drawnPieces(variant), { headroom: animations[name].surfaceY });
        writeImage(name, tiles[part]);
      });
    }
    continue;
  }
  if (!platformPalettes[variant]) throw new Error(`platform_${variant}: no art in sprite-sources and no placeholder palette`);
  for (const part of PARTS) {
    const name = `platform_${variant}_${part}`;
    add(name, () => writeSprite(name, GRID, GRID, platformPixel(variant, part)));
  }
}
// drawn platform art: platform_<variant>_{left,single,right}.png in sprite-sources → 1-tile pieces
// (128 wide, walkable top at y = 0, the rocks hang below; see platformArt.mjs)
for (const variant of ['byzantine']) {
  const src = (part) => join(SOURCE_DIR, `platform_${variant}_${part}.png`);
  if (!['left', 'single', 'right'].every((part) => existsSync(src(part)))) continue;
  let tiles;
  for (const part of ['left', 'mid', 'right', 'single']) {
    const name = `platform_${variant}_${part}`;
    add(name, () => {
      tiles ??= platformTilesFromArt({ left: src('left'), single: src('single'), right: src('right') });
      writeImage(name, tiles[part]);
    });
  }
}
// hand-made coin art (25px frames ×5 → 125, padded to 128); procedural placeholder otherwise
const goldSpin = join(SOURCE_DIR, 'gold_spin.png');
const goldCollect = join(SOURCE_DIR, 'gold_collect.png');
add('pickup_coin', () =>
  existsSync(goldSpin)
    ? writeImage('pickup_coin', gridFrames(goldSpin, { frame: 25, scale: 5, pad: 128 }))
    : writeSheet('pickup_coin', GRID, GRID, coin),
);
// hazards: cells of the 16px fruit atlas (Fruit+.png, 38×6 cells), ×6 → 96, padded to 128
const fruits = join(SOURCE_DIR, 'Fruit+.png');
if (existsSync(fruits)) {
  add('hazard_orange', () => writeImage('hazard_orange', gridCell(fruits, { cell: 16, col: 9, row: 1, scale: 6, pad: 128 })));
}
// easter egg item: jack-o'-lantern, pixel_pumpkins.png (4×4 cells of 16px), column 2 / row 3 (1-based);
// ×8 = 128 with no padding, so the pumpkin's bottom is the sprite's bottom (it stands on the platform)
const pumpkins = join(SOURCE_DIR, 'pixel_pumpkins.png');
if (existsSync(pumpkins)) {
  add('easter_pumpkin', () => writeImage('easter_pumpkin', gridCell(pumpkins, { cell: 16, col: 1, row: 2, scale: 8, pad: 128 })));
}
// score card: 4-frame twinkling card strip (card.png), frames split at the transparent gaps
const cardSource = join(SOURCE_DIR, 'card.png');
if (existsSync(cardSource)) {
  add('pickup_card', () =>
    writeImage('pickup_card', pixelizeStrip(cardSource, { size: 128, colors: 24, expectedFrames: framesOf('pickup_card') }).frames),
  );
}
if (existsSync(goldCollect)) {
  add('pickup_coin_collect', () =>
    writeImage('pickup_coin_collect', gridFrames(goldCollect, { frame: 25, scale: 5, pad: 128 })),
  );
}
add('pickup_double_score', () => writeSheet('pickup_double_score', GRID, GRID, doubleScore));
add('pickup_double_jump', () => writeSheet('pickup_double_jump', GRID, GRID, doubleJump));
// rising: run-cycle strip if present (chick_run.png, frames separated by transparent gaps)
const runSource = join(SOURCE_DIR, 'chick_run.png');
const run = existsSync(runSource)
  ? pixelizeStrip(runSource, { size: 128, colors: 16, expectedFrames: stripFramesOf('player_jump') })
  : null;
add('player_jump', () => writeImage('player_jump', run ? pickFrames('player_jump', run.frames) : chick));

// rising while a timed effect is active: chick_run_<effect>.png → player_jump_<effect>, same scale as the run cycle
for (const effect of ['double_jump']) {
  const name = `player_jump_${effect}`;
  const src = join(SOURCE_DIR, `chick_run_${effect}.png`);
  if (!existsSync(src) || !run) continue;
  add(name, () =>
    writeImage(
      name,
      pickFrames(name, pixelizeStrip(src, { cell: run.cell, colors: 24, expectedFrames: stripFramesOf(name) }).frames),
    ),
  );
}
const fallSource = join(SOURCE_DIR, 'chick_fall.png');
/**
 * Source images don't all draw the chick at the same size; this corrects a pose
 * to the jump pose's scale: how big the chick is in that file compared with
 * chick_jump.png (measured by eye size; < 1 = smaller, > 1 = bigger).
 * Files not listed are assumed to match (1).
 */
const SOURCE_SCALE = {
  'chick_fall.png': 0.85,
  'chick_hurt.png': 1,
  'chick_bonus.png': 1.15, // squinting: sized by body width, not eyes
};
const cellFor = (path) => chick.cell * (SOURCE_SCALE[basename(path)] ?? 1);
add('player_fall', () =>
  writeImage(
    'player_fall',
    existsSync(fallSource)
      ? // umbrella above the head: centre on the body (lower 70%) so the chick stays put
        pixelize(fallSource, {
          cell: cellFor(fallSource),
          colors: 20,
          centerOnCharacter: true,
          centerBand: [0.3, 1],
        })
      : chick,
  ),
);
// hazard hit: chick_hurt.png → player_hurt (same scale correction idea as the fall pose)
const hurtSource = join(SOURCE_DIR, 'chick_hurt.png');
if (existsSync(hurtSource)) {
  add('player_hurt', () =>
    writeImage(
      'player_hurt',
      pixelize(hurtSource, { cell: cellFor(hurtSource), colors: 24, centerOnCharacter: true }),
    ),
  );
}
// bonus poses: centre on the body, ignoring what floats above the head (coin, sparkles)
const bonusPose = (src) =>
  pixelize(src, { cell: cellFor(src), colors: 24, centerOnCharacter: true, centerBand: [0.3, 1] });
add('player_bonus', () => writeImage('player_bonus', bonusPose(bonusSource('generic'))));
for (const type of ['card', 'coin', 'double_score', 'double_jump']) {
  const name = `player_bonus_${type}`;
  add(name, () => writeImage(name, bonusPose(bonusSource(type))));
}
// cloud: hand-made art (sprite-sources/cloud.png, any landscape size) if present, else the placeholder
const cloudSource = join(SOURCE_DIR, 'cloud.png');
add('cloud', () =>
  existsSync(cloudSource)
    ? copyFileSync(cloudSource, join(OUT_DIR, 'cloud.png'))
    : writeSprite('cloud', 32, 16, cloudPixel()),
);
// backdrop: used as is (already pixel art, drawn with its own aspect ratio — see config.background)
const skySource = join(SOURCE_DIR, 'sky.png');
if (existsSync(skySource)) add('bg_sky', () => copyFileSync(skySource, join(OUT_DIR, 'bg_sky.png')));
add('effect_star', () => writeSprite('effect_star', GRID, GRID, starPixel()));
// portal: drawn 4-frame strip (sprite-sources/portal.png: stone arch, swirling vortex), frames
// split at the transparent gaps, one ground line; the procedural swirl is the fallback
const portalSource = join(SOURCE_DIR, 'portal.png');
add('portal', () =>
  existsSync(portalSource)
    ? writeImage('portal', pixelizeStrip(portalSource, { size: 128, colors: 32, expectedFrames: framesOf('portal') }).frames)
    : writeSheet('portal', GRID, GRID, portalPixel),
);
// start: cracked egg shell the chick sits in (drawn in front of it); size set in config.start
const eggSource = join(SOURCE_DIR, 'egg_shell.png');
if (existsSync(eggSource)) {
  add('start_egg', () => writeImage('start_egg', pixelize(eggSource, { size: 128, colors: 16 })));
}

console.log(`Wrote ${written.length} sprites to ${OUT_DIR}:\n  ${written.join('\n  ')}`);
