import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'react-native';

import { SPRITE_KEYS, spriteSources } from './sprites';

let cache: (SkImage | null)[] | null = null;
let pending: Promise<(SkImage | null)[]> | null = null;

/** Decodes every sprite once; later calls return the cached images. Missing ones are null. */
export function loadSprites(): Promise<(SkImage | null)[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= Promise.all(
    SPRITE_KEYS.map(async (key) => {
      try {
        const { uri } = Image.resolveAssetSource(spriteSources[key]);
        const data = await Skia.Data.fromURI(uri);
        return Skia.Image.MakeImageFromEncoded(data);
      } catch (e) {
        console.warn(`Sprite "${key}" failed to load`, e);
        return null;
      }
    }),
  ).then((images) => (cache = images));
  return pending;
}

export function getLoadedSprites(): (SkImage | null)[] | null {
  return cache;
}
