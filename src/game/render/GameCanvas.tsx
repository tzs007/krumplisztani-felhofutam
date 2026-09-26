import { Canvas, createPicture, Picture, Skia, PaintStyle } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { palette } from '@/theme/colors';

import { STRIDE } from './snapshot';

type Props = {
  width: number;
  height: number;
  /** Draw list produced by buildSnapshot, updated from the game loop every frame. */
  commands: SharedValue<number[]>;
};

const colors = palette.map((c) => Skia.Color(c));

/**
 * Records the draw list into an SkPicture on the UI thread, so a frame never
 * goes through React reconciliation.
 */
export function GameCanvas({ width, height, commands }: Props) {
  const picture = useDerivedValue(() => {
    const cmds = commands.value;
    return createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(false);
      paint.setColor(colors[0]);
      canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);

      for (let i = 0; i < cmds.length; i += STRIDE) {
        const op = cmds[i];
        paint.setColor(colors[cmds[i + 1]]);
        if (op === 2) {
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(2);
          canvas.drawLine(cmds[i + 2], cmds[i + 3], cmds[i + 4], cmds[i + 5], paint);
        } else {
          paint.setStyle(op === 1 ? PaintStyle.Stroke : PaintStyle.Fill);
          paint.setStrokeWidth(2);
          canvas.drawRect(Skia.XYWHRect(cmds[i + 2], cmds[i + 3], cmds[i + 4], cmds[i + 5]), paint);
        }
      }
    }, { width, height });
  });

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
