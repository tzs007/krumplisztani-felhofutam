import type { ImageSource } from 'expo-image';

import type { EasterEggItemDef } from './config';

/**
 * Hidden easter eggs (memes). Each one is:
 * - an object in the level (`item`: any registered sprite, its size and
 *   placement; defaults to config.easterEggs.defaultItem, the pumpkin), and
 * - the "you found it" card: every other field except `id` is passed straight
 *   to EasterEggModal's props (heading, title, description, image, button label).
 * Add entries here — ids must be unique and stay stable (later: saved as "found").
 */
export type EasterEgg = {
  id: string;
  title: string;
  description: string;
  heading?: string;
  /** e.g. require('@/assets/memes/foo.png') or { uri: 'https://…' } */
  image?: ImageSource | number;
  imageAspectRatio?: number;
  continueLabel?: string;
  /** In-level object; missing fields fall back to config.easterEggs.defaultItem. */
  item?: Partial<EasterEggItemDef>;
};

// TODO(content): replace the placeholders with the real memes
export const easterEggs: EasterEgg[] = [
  {
    id: 'placeholder-1',
    title: 'Az első rejtett mém',
    description: 'Ide kerül majd a mém leírása. Ritkán bukkan fel, szerencséd volt!',
  },
  {
    id: 'placeholder-2',
    title: 'A második rejtett mém',
    description: 'Ez is csak egy helyőrző. A valódi tartalom hamarosan érkezik.',
  },
];

export function getEasterEgg(id: string): EasterEgg | undefined {
  return easterEggs.find((e) => e.id === id);
}
