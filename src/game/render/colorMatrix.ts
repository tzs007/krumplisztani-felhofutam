/**
 * 4×5 colour matrix (Skia's ColorFilter.MakeMatrix layout, row-major):
 * turns the hue by `degrees` around the colour wheel (luminance kept, as in
 * SVG feColorMatrix hueRotate) and multiplies the colours by `gain`
 * (brightness pulse). Alpha is left alone.
 */
export function hueMatrix(degrees: number, gain: number): number[] {
  'worklet'; // runs inside the canvas's UI-thread drawing
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rows = [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
  return [
    ...rows.flatMap((r) => [...r.map((v) => v * gain), 0, 0]),
    0, 0, 0, 1, 0,
  ];
}
