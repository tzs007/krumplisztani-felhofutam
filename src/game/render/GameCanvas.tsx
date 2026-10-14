import {
  Canvas,
  createPicture,
  FilterMode,
  MipmapMode,
  PaintStyle,
  Picture,
  Skia,
  TileMode,
  useAnimatedImageValue,
  type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { Color, palette } from '@/theme/colors';

import { hueMatrix } from './colorMatrix';
import { Op, STRIDE } from './snapshot';

type Props = {
  width: number;
  height: number;
  /** Draw list produced by buildSnapshot, updated from the game loop every frame. */
  commands: SharedValue<number[]>;
  /** Decoded sprites in SPRITE_KEYS order; null entries draw a magenta placeholder. */
  sprites: (SkImage | null)[];
};

const colors = palette.map((c) => Skia.Color(c));
/** The swirl art is solid out to this part of its half size: drawn so that part reaches the given radius. */
const SWIRL_SOLID = 0.5;
/** Fixed pixel density: this many px of frame height = the size the snapshot asked for. */
const BASE_FRAME_PX = 128;
const nyanCatSource = require('@/assets/sprite-sources/nyan-cat-rainbow.gif');
// Fixed bounds across all 24 frames: cat + rainbow, excluding distant sparkles.
const NYAN_CROP = { x: 0, y: 90, width: 240, height: 130 };
// Anchor the cat body rather than the middle of its trailing rainbow.
const NYAN_BODY = { x: 180, y: 160 };

/**
 * Records the draw list into an SkPicture on the UI thread, so a frame never
 * goes through React reconciliation. Sprites use nearest-neighbour sampling
 * to keep pixel art crisp at any tile size; animated sprites pick their frame
 * out of a horizontal sheet.
 */
export function GameCanvas({ width, height, commands, sprites }: Props) {
  // GIF playback uses its own clock; movement and zoom still come from the game snapshot.
  const nyanFrame = useAnimatedImageValue(nyanCatSource);
  const picture = useDerivedValue(() => {
    const cmds = commands.value;
    const nyanImage = nyanFrame.value;
    return createPicture(
      (canvas) => {
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

          if (op === 8) {
            // see-through fill (section fade): opacity travels in the frame slot (× 1000)
            paint.setStyle(PaintStyle.Fill);
            paint.setColor(colors[arg]);
            paint.setAlphaf(frame / 1000);
            canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
            paint.setAlphaf(1);
            continue;
          }

          if (op === Op.swirl) {
            // the swirl art around centre (x, y), turned by `frame` degrees; its solid part reaches radius w
            const img = sprites[arg];
            if (!img || w <= 0) continue;
            const half = w / SWIRL_SOLID;
            canvas.save();
            canvas.translate(x, y);
            canvas.rotate(frame, 0, 0);
            const src = Skia.XYWHRect(0, 0, img.width(), img.height());
            canvas.drawImageRectOptions(
              img,
              src,
              Skia.XYWHRect(-half, -half, 2 * half, 2 * half),
              FilterMode.Nearest,
              MipmapMode.None,
            );
            canvas.restore();
            continue;
          }

          if (op === 9) {
            // psy backdrop: like op 5, drawn through a hue-turning, brightness-pulsing colour matrix
            const img = sprites[arg];
            if (!img) continue;
            const bw = (h * img.width()) / img.height();
            const huePaint = Skia.Paint();
            huePaint.setColorFilter(Skia.ColorFilter.MakeMatrix(hueMatrix(frame, frames / 1000)));
            const src = Skia.XYWHRect(0, 0, img.width(), img.height());
            canvas.drawImageRectOptions(
              img,
              src,
              Skia.XYWHRect((w - bw) / 2, y - h, bw, h),
              FilterMode.Nearest,
              MipmapMode.None,
              huePaint,
            );
            continue;
          }

          if (op === 5) {
            // backdrop: fit to height (h), keep aspect ratio, centre horizontally in the canvas (w), bottom at y
            const img = sprites[arg];
            if (!img) continue;
            const bw = (h * img.width()) / img.height();
            const src = Skia.XYWHRect(0, 0, img.width(), img.height());
            const dst = Skia.XYWHRect((w - bw) / 2, y - h, bw, h);
            canvas.drawImageRectOptions(img, src, dst, FilterMode.Nearest, MipmapMode.None);
            continue;
          }

          if (op === 6) {
            // whole image at width w, height from its aspect ratio, bottom at y
            const img = sprites[arg];
            if (!img) continue;
            const ih = (w * img.height()) / img.width();
            const src = Skia.XYWHRect(0, 0, img.width(), img.height());
            canvas.drawImageRectOptions(img, src, Skia.XYWHRect(x, y - ih, w, ih), FilterMode.Nearest, MipmapMode.None);
            continue;
          }

          if (op === 7) {
            // tile (platform): width w, height from the image (drawn art may hang below the tile), top at y
            const img = sprites[arg];
            if (!img) {
              paint.setStyle(PaintStyle.Fill);
              paint.setColor(colors[Color.missing]);
              canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
              continue;
            }
            const fw = img.width() / frames;
            const src = Skia.XYWHRect(frame * fw, 0, fw, img.height());
            const th = (w * img.height()) / fw;
            canvas.drawImageRectOptions(img, src, Skia.XYWHRect(x, y, w, th), FilterMode.Nearest, MipmapMode.None);
            continue;
          }

          if (op === Op.psyPlayer) {
            // blurred as it moves away: sigma in px travels in the frame slot (× 1000)
            const blurPaint = Skia.Paint();
            if (frame > 0)
              blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(frame / 1000, frame / 1000, TileMode.Decal, null));
            if (nyanImage) {
              // Rotate the cropped GIF counterclockwise around the cat body.
              // Keep the cat facing up regardless of horizontal movement.
              const scale = w / NYAN_CROP.height;
              canvas.save();
              canvas.translate(x + w / 2, y + h / 2);
              canvas.rotate(-90, 0, 0);
              canvas.drawImageRectOptions(
                nyanImage,
                Skia.XYWHRect(NYAN_CROP.x, NYAN_CROP.y, NYAN_CROP.width, NYAN_CROP.height),
                Skia.XYWHRect(
                  (NYAN_CROP.x - NYAN_BODY.x) * scale,
                  (NYAN_CROP.y - NYAN_BODY.y) * scale,
                  NYAN_CROP.width * scale,
                  NYAN_CROP.height * scale,
                ),
                FilterMode.Nearest,
                MipmapMode.None,
                blurPaint,
              );
              canvas.restore();
              continue;
            }
            // GIF not decoded yet: the still psy chick
            const img = sprites[arg];
            if (img) {
              const src = Skia.XYWHRect(0, 0, img.width(), img.height());
              canvas.drawImageRectOptions(
                img,
                src,
                Skia.XYWHRect(x, y, w, h),
                FilterMode.Nearest,
                MipmapMode.None,
                blurPaint,
              );
            }
            continue;
          }

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
      },
      { width, height },
    );
  }, [sprites]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
