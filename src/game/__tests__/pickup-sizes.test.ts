import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { tiles } from '../level/tiles';
import { spriteAnimations, type SpriteKey } from '../render/sprites';

/** Largest visible (non-transparent) extent of a sprite, as a fraction of its frame. */
function contentRatio(key: SpriteKey): number {
  const png = PNG.sync.read(readFileSync(join(__dirname, '../../../assets/sprites', `${key}.png`)));
  const frames = spriteAnimations[key]?.frames ?? 1;
  const fw = png.width / frames;
  let best = 0;
  for (let f = 0; f < frames; f++) {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < fw; x++) {
        if (png.data[(y * png.width + f * fw + x) * 4 + 3]) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    best = Math.max(best, maxX - minX + 1, maxY - minY + 1);
  }
  return best / png.height;
}

describe('pickup icon sizes', () => {
  it('bonus icons look as big on screen as the coin (±5%)', () => {
    const visible = (char: string) => {
      const def = tiles[char];
      if (def.kind !== 'pickup' || !def.size) throw new Error(`${char} has no size`);
      return def.size * contentRatio(def.spriteKey as SpriteKey);
    };
    const coin = visible('C');
    for (const char of ['X', 'J']) {
      expect(visible(char) / coin).toBeGreaterThan(0.95);
      expect(visible(char) / coin).toBeLessThan(1.05);
    }
  });
});
