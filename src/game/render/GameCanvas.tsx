import {
  Canvas,
  createPicture,
  FilterMode,
  MipmapMode,
  PaintStyle,
  Picture,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { Color, palette } from '@/theme/colors';

import { STRIDE } from './snapshot';

type Props = {
  width: number;
  height: number;
  /** Draw list produced by buildSnapshot, updated from the game loop every frame. */
  commands: SharedValue<number[]>;
  /** Decoded sprites in SPRITE_KEYS order; null entries draw a magenta placeholder. */
  sprites: (SkImage | null)[];
};

const colors = palette.map((c) => Skia.Color(c));
/** Fixed pixel density: this many px of frame height = the size the snapshot asked for. */
const BASE_FRAME_PX = 128;

/**
 * Records the draw list into an SkPicture on the UI thread, so a frame never
 * goes through React reconciliation. Sprites use nearest-neighbour sampling
 * to keep pixel art crisp at any tile size; animated sprites pick their frame
 * out of a horizontal sheet.
 */
export function GameCanvas({ width, height, commands, sprites }: Props) {
  const picture = useDerivedValue(() => {
    const cmds = commands.value;
    return createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(false);
      paint.setColor(colors[Color.sky]);
      canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);

      for (let i = 0; i < cmds.length; i += STRIDE) {
        const op = cmds[i];
        const arg = cmds[i + 1];
        const frame = cmds[i + 2];
        const frames = cmds[i + 3];
        let x = cmds[i + 4];
        let y = cmds[i + 5];
        let w = cmds[i + 6];
        let h = cmds[i + 7];

        if (op === 3 || op === 4) {
          const img = sprites[arg];
          if (!img) {
            paint.setStyle(PaintStyle.Fill);
            paint.setColor(colors[Color.missing]);
            canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
            continue;
          }
          // sheets are horizontal strips of equal-width frames
          const fw = img.width() / frames;
          const src = Skia.XYWHRect(frame * fw, 0, fw, img.height());
          // frames taller than 128px (e.g. a pose with flames around the character)
          // grow around the bottom centre, so the character itself keeps its size
          const k = img.height() / BASE_FRAME_PX;
          if (k !== 1) {
            x += (w - w * k) / 2;
            y += h - h * k;
            w *= k;
            h *= k;
          }
          if (op === 4) {
            canvas.save();
            canvas.translate(x + w, y);
            canvas.scale(-1, 1);
            canvas.drawImageRectOptions(img, src, Skia.XYWHRect(0, 0, w, h), FilterMode.Nearest, MipmapMode.None);
            canvas.restore();
          } else {
            canvas.drawImageRectOptions(img, src, Skia.XYWHRect(x, y, w, h), FilterMode.Nearest, MipmapMode.None);
          }
          continue;
        }

        paint.setColor(colors[arg]);
        paint.setStrokeWidth(2);
        if (op === 2) {
          paint.setStyle(PaintStyle.Stroke);
          canvas.drawLine(x, y, w, h, paint);
        } else {
          paint.setStyle(op === 1 ? PaintStyle.Stroke : PaintStyle.Fill);
          canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
        }
      }
    }, { width, height });
  }, [sprites]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
