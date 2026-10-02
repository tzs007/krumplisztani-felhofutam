/**
 * Cuts drawn platform art (three large images: left end, single piece, right
 * end, e.g. AI generated) into 1-tile platform sprites: left / mid / right /
 * single, TILE px wide with the walkable top at y = 0 (the rocky underside may
 * hang below the tile, so the sprites are taller than wide).
 *
 * The art needs a repeating middle (the band of framed ornaments): a tile
 * spans `modules` of those repeats, so the mid tile repeats seamlessly and
 * the pieces join where the pattern is in the same phase. The three images
 * may be drawn at slightly different scales; each is measured on its own.
 */
import { readFileSync } from 'node:fs';

import pngjs from 'pngjs';

const { PNG } = pngjs;

function readPng(path) {
  const png = PNG.sync.read(readFileSync(path));
  return keyOutBackground({ width: png.width, height: png.height, data: png.data });
}

/**
 * Art saved without transparency (opaque corners, e.g. on black): the
 * background colour connected to the image border becomes transparent
 * (flood fill, so dark shading inside the art is kept).
 */
function keyOutBackground(img, tolerance = 24) {
  const { width: W, height: H, data } = img;
  const at = (x, y) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  if (!corners.every((i) => data[i + 3] === 255)) return img;
  const bg = data.subarray(corners[0], corners[0] + 3);
  const isBg = (i) =>
    data[i + 3] !== 0 &&
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance;
  const stack = [];
  for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = at(x, y);
    if (!isBg(i)) continue;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return img;
}

const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

/** First / last row that is opaque across at least `share` of the width (stray edge pixels don't count). */
function solidRows(img, share = 0.3) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(img, x, y) > 128) n++;
    if (n > img.width * share) rows.push(y);
  }
  return { top: rows[0], bottom: rows.at(-1) };
}

/** Lowest row with any content (the tips of the rocks). */
function contentBottom(img) {
  for (let y = img.height - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(img, x, y) > 128) n++;
    if (n > 2) return y;
  }
  return img.height - 1;
}

/** Leftmost / rightmost column with real content (a few opaque pixels in it). */
function contentColumns(img) {
  const count = (x) => {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (alphaAt(img, x, y) > 128) n++;
    return n;
  };
  let left = 0;
  while (left < img.width - 1 && count(left) < 20) left++;
  let right = img.width - 1;
  while (right > 0 && count(right) < 20) right--;
  return { left, right };
}

/**
 * Brightness along the ornament band, averaged over its rows; transparent
 * columns are null. The dark separators between the frames make it periodic.
 */
function bandSignal(img, y0, y1) {
  const sig = [];
  for (let x = 0; x < img.width; x++) {
    let s = 0;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 128) continue;
      s += img.data[i] + img.data[i + 1] + img.data[i + 2];
      n++;
    }
    sig.push(n > (y1 - y0) / 2 ? s / n : null);
  }
  return sig;
}

/** Repeat length of the band (autocorrelation peak within [minP, maxP]) over columns [x0, x1]. */
function period(sig, x0, x1, [minP, maxP]) {
  const vals = sig.slice(x0, x1 + 1).filter((v) => v !== null);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let best = { p: minP, score: -Infinity };
  for (let p = minP; p <= maxP; p++) {
    let s = 0;
    let n = 0;
    for (let x = x0; x + p <= x1; x++) {
      if (sig[x] === null || sig[x + p] === null) continue;
      s += (sig[x] - mean) * (sig[x + p] - mean);
      n++;
    }
    if (n > p && s / n > best.score) best = { p, score: s / n };
  }
  return best.p;
}

/**
 * Where a separator (darkest point of the folded band) falls, as a phase in
 * [0, p): folding the band over one period averages out the noise.
 */
function separatorPhase(sig, x0, x1, p) {
  const sum = new Array(p).fill(0);
  const cnt = new Array(p).fill(0);
  for (let x = x0; x <= x1; x++) {
    if (sig[x] === null) continue;
    const k = Math.floor(x % p);
    sum[k] += sig[x];
    cnt[k]++;
  }
  let best = 0;
  for (let k = 0; k < p; k++) if (cnt[k] && sum[k] / cnt[k] < sum[best] / cnt[best]) best = k;
  return best;
}

/** Last row of the ornament band: the gold frame line at its bottom (rows mostly gold). */
function bandBottom(img, top) {
  let last = top;
  for (let y = top; y < Math.min(img.height, top + 700); y++) {
    let op = 0;
    let gold = 0;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 128) continue;
      op++;
      if (img.data[i] > 180 && img.data[i + 1] > 120 && img.data[i + 2] < 90) gold++;
    }
    if (op > 0 && gold > op * 0.5) last = y;
  }
  return last;
}

/** Measures one art image: walkable top, ornament band, repeat length and its phase. */
function measure(img, { periodRange }) {
  const { top, bottom } = solidRows(img);
  const { left, right } = contentColumns(img);
  // the band sits in the lower part of the solid body (below the stone cap)
  const y0 = Math.round(top + (bottom - top) * 0.4);
  const y1 = Math.round(top + (bottom - top) * 0.6);
  const sig = bandSignal(img, y0, y1);
  // measure away from the ends (bevelled caps)
  const x0 = left + Math.round((right - left) * 0.2);
  const x1 = right - Math.round((right - left) * 0.2);
  const p = period(sig, x0, x1, periodRange);
  return {
    img,
    top,
    thickness: bandBottom(img, top) + 1 - top,
    rocks: contentBottom(img),
    left,
    right,
    p,
    phase: separatorPhase(sig, x0, x1, p),
  };
}

/**
 * Area-averages the source window [sx, sx + sw) × [sy, sy + sh) into an out
 * canvas of `ow` × `oh` px (premultiplied colour, hard alpha). Columns outside
 * the image are transparent. Several windows can be drawn side by side into
 * one canvas via `dx`.
 */
function resample(src, { sx, sy, sw, sh }, out, { dx, dw }) {
  const kx = sw / dw;
  const ky = sh / out.height;
  for (let oy = 0; oy < out.height; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = Math.floor(sy + oy * ky); y < Math.floor(sy + (oy + 1) * ky); y++) {
        for (let x = Math.floor(sx + ox * kx); x < Math.floor(sx + (ox + 1) * kx); x++) {
          n++;
          if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
          const i = (y * src.width + x) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          b += src.data[i + 2] * al;
          a += al;
        }
      }
      if (n === 0 || a / n < 0.5) continue;
      const o = (oy * out.width + dx + ox) * 4;
      out.data.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), 255], o);
    }
  }
}

const blank = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });

/** Separators (x ≡ phase mod p) within [from, to]. */
function separators(m, from, to) {
  const xs = [];
  for (let x = from + ((((m.phase - from) % m.p) + m.p) % m.p); x <= to; x += m.p) xs.push(x);
  return xs;
}

/**
 * @param {{ left: string, single: string, right: string }} paths art images
 * @param {{ tile?: number, modules?: number, height?: number, periodRange?: [number, number] }} opts
 *   tile: output width; modules: ornament repeats per mid tile; height: output height (top-aligned)
 * @returns {{ left, mid, right, single, info }} RGBA images of tile × height
 */
export function platformTilesFromArt(paths, { tile = 128, modules = 3, height = 160, periodRange = [170, 270] } = {}) {
  const L = measure(readPng(paths.left), { periodRange });
  const S = measure(readPng(paths.single), { periodRange });
  const R = measure(readPng(paths.right), { periodRange });

  // the mid tile sets the scale: `modules` repeats per tile, so it repeats seamlessly;
  // every other piece is scaled to the same platform thickness (cap + ornament band)
  const midScale = tile / (L.p * modules);
  const thicknessOut = L.thickness * midScale;
  const scaleOf = (m) => thicknessOut / m.thickness;

  /** Draws source columns [x0, x1) of `m` into the out canvas at dx..dx+dw, top-aligned. */
  const put = (out, m, x0, x1, dx, dw) =>
    resample(m.img, { sx: x0, sy: m.top, sw: x1 - x0, sh: height / scaleOf(m) }, out, { dx, dw });

  /**
   * Of the candidate cuts, the one whose piece comes closest to `target` out px;
   * the piece is then fitted to exactly that width (a few % horizontal stretch at most).
   */
  const closest = (cuts, widthOf, target) =>
    cuts.reduce((best, x) => (Math.abs(widthOf(x) - target) < Math.abs(widthOf(best) - target) ? x : best));

  // mid: `modules` repeats of the left image's straight run, from separator to separator
  // (the bevelled end is less than one repeat wide, so the first separator after ~0.8 repeats starts the run)
  const midStart = separators(L, L.left + L.p * 0.8, L.right + 1 - L.p * modules).at(-1);
  if (midStart === undefined) throw new Error(`platform art: the left image has no straight run of ${modules} repeats`);
  const mid = blank(tile, height);
  put(mid, L, midStart, midStart + L.p * modules, 0, tile);

  // left end: from the bevelled end to a separator (joins the mid tile in phase)
  const lCut = closest(separators(L, L.left + L.p, L.right), (x) => (x - L.left) * scaleOf(L), tile);
  const left = blank(tile, height);
  put(left, L, L.left, lCut, 0, tile);

  // right end: from a separator to the bevelled end
  const rCut = closest(separators(R, R.left, R.right - R.p), (x) => (R.right + 1 - x) * scaleOf(R), tile);
  const right = blank(tile, height);
  put(right, R, rCut, R.right + 1, 0, tile);

  // single: both bevelled ends of the single image, cut at separators and joined
  const sLeftCuts = separators(S, S.left + S.p / 2, S.right);
  const sRightCuts = separators(S, S.left, S.right - S.p / 2);
  let best = null;
  for (const a of sLeftCuts) {
    for (const b of sRightCuts) {
      if (b <= a) continue;
      const w = (a - S.left + S.right + 1 - b) * scaleOf(S);
      if (!best || Math.abs(w - tile) < Math.abs(best.w - tile)) best = { a, b, w };
    }
  }
  const single = blank(tile, height);
  const lw = Math.round((tile * (best.a - S.left)) / (best.a - S.left + S.right + 1 - best.b));
  put(single, S, S.left, best.a, 0, lw);
  put(single, S, best.b, S.right + 1, lw, tile - lw);

  const info = (m) => ({ p: m.p, phase: m.phase, top: m.top, thickness: m.thickness, scale: +scaleOf(m).toFixed(4) });
  return { left, mid, right, single, info: { midScale: +midScale.toFixed(4), left: info(L), single: info(S), right: info(R) } };
}

/** Walkable surface: first row that is opaque across most of the piece (tufts sticking up don't count). */
function surfaceRow(img) {
  const counts = [];
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(img, x, y) > 128) n++;
    counts.push(n);
  }
  const widest = Math.max(...counts);
  return counts.findIndex((n) => n > widest * 0.6);
}

/** Crops columns [x0, x1] of an image (full height). */
function cropColumns(img, x0, x1) {
  const width = x1 + 1 - x0;
  const out = { width, height: img.height, data: new Uint8Array(width * img.height * 4) };
  for (let y = 0; y < img.height; y++) {
    out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1 + 1) * 4), y * width * 4);
  }
  return out;
}

/**
 * Splits a strip of pieces laid out left → right with transparent gaps
 * between them (small split-off bits, like a stray leaf, are merged into the
 * nearest piece). Throws unless exactly `count` pieces are found.
 */
export function splitStrip(path, count) {
  const img = readPng(path);
  const filled = [];
  for (let x = 0; x < img.width; x++) {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (alphaAt(img, x, y) > 128) n++;
    filled.push(n > 2);
  }
  let runs = [];
  for (let x = 0; x < img.width; x++) {
    if (!filled[x]) continue;
    const last = runs.at(-1);
    if (last && x - last[1] <= 8) last[1] = x;
    else runs.push([x, x]);
  }
  // merge slivers (< 4% of the width) into the closer neighbour
  const minWidth = img.width * 0.04;
  for (let i = 0; i < runs.length && runs.length > 1; ) {
    const [a, b] = runs[i];
    if (b - a >= minWidth) {
      i++;
      continue;
    }
    const prev = runs[i - 1];
    const next = runs[i + 1];
    const toPrev = !next || (prev && a - prev[1] <= next[0] - b);
    if (toPrev) prev[1] = b;
    else next[0] = a;
    runs.splice(i, 1);
  }
  if (runs.length !== count) throw new Error(`${path}: found ${runs.length} pieces, expected ${count}`);
  return runs.map(([a, b]) => cropColumns(img, a, b));
}

/**
 * Drawn art that already comes as four pieces (left end, seamless mid, right
 * end, single): each becomes a TILE px wide sprite with the walkable surface
 * at y = `headroom` (grass tufts etc. may stick up into that strip; the game
 * reads it as `surfaceY` from animations.json).
 *
 * The mid piece sets the scale (its width = one tile), so the ends join it
 * at the same thickness: the left end is drawn flush right, the right end
 * flush left (their outer, rounded ends may leave a little room). The single
 * piece stands alone: it fills the tile width, but grows at most 25% thicker
 * than the others (narrower art stays centred).
 * The sprite height fits the tallest piece (≥ one tile).
 *
 * @param {{ left, mid, right, single }} sources file paths or images ({ width, height, data })
 * @param {{ tile?: number, headroom?: number }} opts
 */
export function platformTilesFromPieces(sources, { tile = 128, headroom = 16 } = {}) {
  const pieces = Object.fromEntries(
    Object.entries(sources).map(([part, src]) => {
      const img = typeof src === 'string' ? readPng(src) : src;
      return [part, { img, surface: surfaceRow(img), bottom: contentBottom(img), ...contentColumns(img) }];
    }),
  );
  const midScale = tile / (pieces.mid.right + 1 - pieces.mid.left);
  const single = pieces.single;
  const singleScale = Math.min(tile / (single.right + 1 - single.left), midScale * 1.25);
  const scales = { left: midScale, mid: midScale, right: midScale, single: singleScale };
  const tallest = Math.max(
    ...Object.entries(pieces).map(([part, m]) => headroom + (m.bottom + 1 - m.surface) * scales[part]),
  );
  const height = Math.max(tile, Math.ceil(tallest / 16) * 16);

  const draw = (m, scale, align) => {
    const out = blank(tile, height);
    const sw = m.right + 1 - m.left;
    const dw = Math.min(tile, Math.round(sw * scale));
    const dx = align === 'right' ? tile - dw : align === 'left' ? 0 : Math.floor((tile - dw) / 2);
    const s = dw / sw; // = scale unless the piece had to be squeezed into the tile
    resample(m.img, { sx: m.left, sy: m.surface - headroom / s, sw, sh: height / s }, out, { dx, dw });
    return out;
  };

  return {
    left: draw(pieces.left, scales.left, 'right'),
    mid: draw(pieces.mid, scales.mid, 'left'),
    right: draw(pieces.right, scales.right, 'left'),
    single: draw(single, scales.single, 'center'),
  };
}
