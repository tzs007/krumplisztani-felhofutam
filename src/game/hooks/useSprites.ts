import { useEffect, useState } from 'react';

import { getLoadedSprites, loadSprites } from '../render/loadSprites';
import { SPRITE_KEYS } from '../render/sprites';

/**
 * The decoded sprite images, or null while they load. Normally decoded on
 * the splash screen; deep links straight into the game load them here.
 * The images are tied to the sprite order they were built for: if that order
 * changed (a sprite was added and Fast Refresh kept this state), they are stale and reloaded.
 */
export function useSprites() {
  const [loaded, setLoaded] = useState(() => ({ keys: SPRITE_KEYS, images: getLoadedSprites() }));
  const sprites = loaded.keys === SPRITE_KEYS ? loaded.images : null;
  useEffect(() => {
    if (!sprites) loadSprites().then((images) => setLoaded({ keys: SPRITE_KEYS, images }));
  }, [sprites]);
  return sprites;
}
