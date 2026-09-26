/**
 * Turns a large, soft-edged "pixel art style" image (e.g. AI generated) into a
 * clean sprite: crop to content, area-average down, hard alpha, and quantize
 * with k-means so noise disappears.
 */
import { readFileSync } from 'node:fs';

import pngjs from 'pngjs';

const { PNG } = pngjs;
const ALPHA_ON = 128;

function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

/** Blue/cyan effect pixels (flames, sparkles) — ignored when centring on the character. */
const isEffectPixel = (r, g, b) => b > r + 40;

/** Alpha centroid x of character (non-effect) pixels in rows [y0, y1) and columns [x0, x1]. */
function characterCentroidX(src, x0, x1, y0, y1) {
  const { width: W, data } = src;
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > ALPHA_ON && !isEffectPixel(data[i], data[i + 1], data[i + 2])) { sum += x; n++; }
    }
  }
  return sum / n + 0.5;
}

/** Bounding box of opaque pixels inside [x0, x1] (inclusive columns). */
function bbox(src, x0 = 0, x1 = src.width - 1) {
  const { width: W, height: H, data } = src;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * W + x) * 4 + 3] > ALPHA_ON) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Area-averages a size×size square of `src` (premultiplied) with hard alpha.
 * The square's bottom edge sits at `bottom`, horizontally centred on `centerX`.
 * Only pixels within columns [clipX0, clipX1] are sampled (keeps neighbours in a strip out).
 */
function sample(src, { size, cell, centerX, bottom, clipX0 = 0, clipX1 = src.width - 1, alphaThreshold = 0.5 }) {
  const { width: W, height: H, data } = src;
  const side = size * cell;
  const cropX = centerX - side / 2;
  const cropY = bottom + 1 - side;
  const out = new Uint8Array(size * size * 4);
  const opaque = [];
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const x0 = Math.floor(cropX + tx * cell), x1 = Math.ceil(cropX + (tx + 1) * cell);
      const y0 = Math.floor(cropY + ty * cell), y1 = Math.ceil(cropY + (ty + 1) * cell);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          n++;
          if (x < clipX0 || x > clipX1 || y < 0 || y >= H) continue;
          const i = (y * W + x) * 4;
          const al = data[i + 3] / 255;
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
        }
      }
      if (n === 0 || a / n < alphaThreshold) continue;
      const o = (ty * size + tx) * 4;
      out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = 255;
      opaque.push(o);
    }
  }
  return { width: size, height: size, data: out, opaque };
}

/**
 * Single pose. Either `size` (output edge in px) or `cell` (source px per
 * output px) is used: pass the `cell` of a reference pose to keep the
 * character the same size across poses whose source images have a different crop.
 * @returns {{ width: number, height: number, data: Uint8Array, cell: number }} RGBA, 0/255 alpha
 */
export function pixelize(
  path,
  { size, cell: fixedCell, colors = 16, alphaThreshold = 0.5, centerOnCharacter = false } = {},
) {
  const src = readPng(path);
  const box = bbox(src);
  // centerOnCharacter: centre on the chick itself, not on flames/effects around it,
  // and grow the square so nothing on the wider side gets cut off
  const centerX = centerOnCharacter
    ? characterCentroidX(src, box.minX, box.maxX, box.minY, box.maxY + 1)
    : (box.minX + box.maxX + 1) / 2;
  const content = Math.max(2 * Math.max(centerX - box.minX, box.maxX + 1 - centerX), box.h);
  if (!size) size = Math.ceil(content / fixedCell);
  const cell = fixedCell ?? content / size;
  // square crop, content bottom = sprite bottom (feet on the ground)
  const img = sample(src, { size, cell, centerX, bottom: box.maxY, alphaThreshold });
  quantize([img], colors);
  return { width: img.width, height: img.height, data: img.data, cell };
}

/**
 * Animation strip: frames laid out left→right, separated by transparent
 * columns (need not be an even grid; small split-off bits are merged back).
 * All frames share one scale (`size`: the largest frame fills it, or `cell`
 * to match another animation), one ground line, one palette, and are centred
 * on the body (centroid of the upper 60% of non-blue pixels, so swinging legs
 * and flames don't shift it).
 * @returns {{ frames: {width, height, data}[], cell: number }}
 */
export function pixelizeStrip(
  path,
  { size, cell: fixedCell, colors = 16, expectedFrames, alphaThreshold = 0.5 } = {},
) {
  const src = readPng(path);
  const { width: W, height: H, data } = src;

  const used = new Array(W).fill(false);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) if (data[(y * W + x) * 4 + 3] > ALPHA_ON) { used[x] = true; break; }
  }
  const segments = [];
  for (let x = 0, start = -1; x <= W; x++) {
    const on = x < W && used[x];
    if (on && start < 0) start = x;
    if (!on && start >= 0) { segments.push([start, x - 1]); start = -1; }
  }
  // small segments (a flame tip or a speck split off by a thin gap) join their nearest neighbour
  const widths = segments.map(([a, b]) => b - a + 1).sort((p, q) => p - q);
  const minFrameWidth = widths[Math.floor(widths.length / 2)] * 0.2;
  const frames = segments.map((sg) => [...sg]);
  for (let i = 0; i < frames.length; ) {
    const [a, b] = frames[i];
    if (b - a + 1 >= minFrameWidth || frames.length === 1) { i++; continue; }
    const gapL = i > 0 ? a - frames[i - 1][1] : Infinity;
    const gapR = i < frames.length - 1 ? frames[i + 1][0] - b : Infinity;
    if (gapL <= gapR) frames[i - 1][1] = b;
    else frames[i + 1][0] = a;
    frames.splice(i, 1);
  }
  if (expectedFrames && frames.length !== expectedFrames) {
    throw new Error(`${path}: found ${frames.length} frames, expected ${expectedFrames}`);
  }

  const boxes = frames.map(([a, b]) => bbox(src, a, b));
  const ground = Math.max(...boxes.map((bx) => bx.maxY));
  // centre on the character's head/body (upper 60%), ignoring legs and blue effects
  const centers = boxes.map((bx, i) =>
    characterCentroidX(src, frames[i][0], frames[i][1], bx.minY, Math.round(bx.minY + bx.h * 0.6)),
  );
  // square that fits every frame around its centre on the shared ground line
  const content = Math.max(
    ...boxes.map((bx, i) => Math.max(2 * Math.max(centers[i] - bx.minX, bx.maxX + 1 - centers[i]), ground + 1 - bx.minY)),
  );
  if (!size) size = Math.ceil(content / fixedCell);
  const cell = fixedCell ?? content / size;

  const imgs = frames.map(([a, b], i) =>
    sample(src, { size, cell, centerX: centers[i], bottom: ground, clipX0: a, clipX1: b, alphaThreshold }),
  );
  quantize(imgs, colors);
  return { frames: imgs.map(({ width, height, data: d }) => ({ width, height, data: d })), cell };
}

/** In-place k-means palette reduction over all images together (farthest-point init, deterministic). */
function quantize(imgs, k) {
  const refs = imgs.flatMap((img) => img.opaque.map((o) => [img.data, o]));
  const pts = refs.map(([d, o]) => [d[o], d[o + 1], d[o + 2]]);
  if (pts.length === 0) return;
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // farthest-point init on a subsample keeps big strips fast
  const stride = Math.max(1, Math.floor(pts.length / 4000));
  const sampleSet = pts.filter((_, i) => i % stride === 0);
  const centers = [sampleSet[0]];
  while (centers.length < k && centers.length < sampleSet.length) {
    let best = sampleSet[0], bestD = -1;
    for (const p of sampleSet) {
      const d = Math.min(...centers.map((c) => dist(p, c)));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push(best);
  }
  const assign = new Array(pts.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    pts.forEach((p, i) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, ci) => { const d = dist(p, c); if (d < bd) { bd = d; bi = ci; } });
      assign[i] = bi;
    });
    const sums = centers.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => { const s = sums[assign[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    sums.forEach((s, ci) => { if (s[3]) centers[ci] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  refs.forEach(([d, o], i) => {
    const c = centers[assign[i]];
    d[o] = Math.round(c[0]); d[o + 1] = Math.round(c[1]); d[o + 2] = Math.round(c[2]);
  });
}

/**
 * Hand-made pixel art laid out on an even grid (e.g. a Piskel/Aseprite export):
 * square frames of `frame` px side by side. Each frame is upscaled by the
 * integer `scale` (nearest neighbour, stays crisp) and centred on a transparent
 * `pad`×`pad` canvas so it matches the 128px = 1 tile convention.
 * @returns {{ width: number, height: number, data: Uint8Array }[]}
 */
export function gridFrames(path, { frame, scale, pad = frame * scale }) {
  const src = readPng(path);
  if (src.height !== frame || src.width % frame !== 0) {
    throw new Error(`${path}: ${src.width}×${src.height} is not a strip of ${frame}px frames`);
  }
  const size = frame * scale;
  if (pad < size) throw new Error(`${path}: pad ${pad} < scaled frame ${size}`);
  const off = Math.floor((pad - size) / 2);
  const frames = [];
  for (let f = 0; f < src.width / frame; f++) {
    const data = new Uint8Array(pad * pad * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = (Math.floor(y / scale) * src.width + f * frame + Math.floor(x / scale)) * 4;
        if (src.data[s + 3] < ALPHA_ON) continue;
        data.set(src.data.subarray(s, s + 3), ((off + y) * pad + off + x) * 4);
        data[((off + y) * pad + off + x) * 4 + 3] = 255;
      }
    }
    frames.push({ width: pad, height: pad, data });
  }
  return frames;
}
