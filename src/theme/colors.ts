/**
 * Game palette (Skia canvas) for non-sprite draw commands. Indices are
 * referenced by the render snapshot, so append new colors at the end.
 */
export const palette = [
  '#2081DC', // 0 sky (= top colour of the bg_sky backdrop, so the sky continues above it)
  '#FF00FF', // 1 missing sprite marker
  '#000000', // 2 black (section transitions)
  '#FFFFFF', // 3 white (psy mode flash)
] as const;

export const Color = {
  sky: 0,
  missing: 1,
  black: 2,
  white: 3,
} as const;
