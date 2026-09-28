import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'react-native';

import { SPRITE_KEYS, spriteSources, type SpriteKey } from './sprites';

/**
 * Decoded images by sprite NAME, not by position: the draw list refers to
 * sprites by index into the current SPRITE_KEYS, so the array handed to the
 * renderer is always rebuilt in that order. (A positional cache went stale
 * after a Fast Refresh that inserted a sprite → clouds drew as stars.)
 */
const cache = new Map<SpriteKey, SkImage | null>();
let pending: Promise<void> | null = null;

async function decode(key: SpriteKey): Promise<SkImage | null> {
  try {
    const { uri } = Image.resolveAssetSource(spriteSources[key]);
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch (e) {
    console.warn(`Sprite "${key}" failed to load`, e);
    return null;
  }
}

/** Decodes every sprite not decoded yet; resolves to the images in SPRITE_KEYS order (missing → null). */
export async function loadSprites(): Promise<(SkImage | null)[]> {
  const missing = SPRITE_KEYS.filter((k) => !cache.has(k));
  if (missing.length > 0) {
    pending ??= Promise.all(missing.map(async (k) => cache.set(k, await decode(k)))).then(() => {
      pending = null;
    });
    await pending;
  }
  return getLoadedSprites() ?? loadSprites();
}

/** Images in the current SPRITE_KEYS order, or null while any sprite is still undecoded. */
export function getLoadedSprites(): (SkImage | null)[] | null {
  if (SPRITE_KEYS.some((k) => !cache.has(k))) return null;
  return SPRITE_KEYS.map((k) => cache.get(k) ?? null);
}
