import type { ImageSource } from 'expo-image';

import type { EasterEggItemDef, GameConfig } from './config';

/**
 * Hidden easter eggs (memes). Each one is:
 * - an object in the level (`item`: any registered sprite, its size and
 *   placement; defaults to config.easterEggs.defaultItem, the pumpkin), and
 * - the "you found it" card: every other field except `id` is passed straight
 *   to EasterEggModal's props (heading, title, description, image, button label).
 * Content normally comes from the backend (Supabase table `easter_eggs`,
 * see src/lib/remoteEasterEggs.ts); the list below is the built-in fallback
 * used offline / before the first download. Ids must be unique and stable.
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

/** Built-in fallback content (same as the backend's initial rows). */
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

/** Drop-rate settings that can come from the backend (app_config `easter_eggs`). */
export type EasterEggSettings = Partial<Pick<GameConfig['easterEggs'], 'chancePerGame' | 'chunkRange'>>;

let active: EasterEgg[] = easterEggs;
let activeSettings: EasterEggSettings = {};

/** The easter eggs the next game uses (downloaded, cached or built-in). */
export function getEasterEggs(): readonly EasterEgg[] {
  return active;
}

export function getEasterEgg(id: string): EasterEgg | undefined {
  return active.find((e) => e.id === id);
}

/** Replaces the active content, e.g. after a download. */
export function setEasterEggs(list: EasterEgg[], settings: EasterEggSettings = {}): void {
  active = list;
  activeSettings = settings;
}

/** Back to the built-in content (tests, sign-out, …). */
export function resetEasterEggs(): void {
  active = easterEggs;
  activeSettings = {};
}

/** Game config with the downloaded drop-rate settings applied on top. */
export function withEasterEggSettings(config: GameConfig): GameConfig {
  return { ...config, easterEggs: { ...config.easterEggs, ...activeSettings } };
}
