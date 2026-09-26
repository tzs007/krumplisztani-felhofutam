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
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

import { gridFrames, pixelize, pixelizeStrip } from './pixelize.mjs';

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
const add = (name, fn) => {
  fn();
  written.push(name);
};

for (const variant of Object.keys(platformPalettes)) {
  for (const part of ['left', 'mid', 'right', 'single']) {
    const name = `platform_${variant}_${part}`;
    add(name, () => writeSprite(name, GRID, GRID, platformPixel(variant, part)));
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
add('player_fall', () =>
  writeImage('player_fall', existsSync(fallSource) ? pixelize(fallSource, { cell: chick.cell, colors: 16 }) : chick),
);
add('player_bonus', () => writeImage('player_bonus', pixelize(bonusSource('generic'), { cell: chick.cell, colors: 24 })));
for (const type of ['coin', 'double_score', 'double_jump']) {
  const name = `player_bonus_${type}`;
  add(name, () => writeImage(name, pixelize(bonusSource(type), { cell: chick.cell, colors: 24, centerOnCharacter: true })));
}
add('cloud', () => writeSprite('cloud', 32, 16, cloudPixel()));

console.log(`Wrote ${written.length} sprites to ${OUT_DIR}:\n  ${written.join('\n  ')}`);
