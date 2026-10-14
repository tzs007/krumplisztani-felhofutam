import type { SoundEffect } from '@/lib/audio';

import type { GameEvent } from './engine/entities';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success';

/** What the player feels and hears on a game event. */
export type Feedback = { haptic?: HapticKind; sound?: SoundEffect };

export function feedbackFor(e: GameEvent): Feedback {
  switch (e.type) {
    // score card: its own sound; timed bonuses (×2, double jump): the "bonus" chime
    case 'pickup':
      return { haptic: 'medium', sound: e.effect === 'bonus' ? 'card' : 'bonus' };
    case 'hit':
    case 'death':
      return { haptic: 'heavy' };
    // every take-off: the hop out of the egg and each bounce off a platform (new or not)
    case 'launch':
      return { haptic: 'light', sound: 'jump' };
    case 'bounce':
      return { sound: 'jump' };
    case 'mushroom':
      return { haptic: 'success', sound: 'bonus' };
    case 'portalEnter':
    case 'portalExit':
      return { haptic: 'success', sound: 'portal' };
    case 'milestone':
      return { haptic: 'success', sound: 'milestone' };
    // the easter egg (only when its meme is known) and game over are handled by the screen
    default:
      return {};
  }
}
