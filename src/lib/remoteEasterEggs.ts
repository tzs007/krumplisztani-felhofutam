/**
 * Easter egg content + drop-rate settings from Supabase (tables `easter_eggs`
 * and `app_config`), so memes can be added or tuned from the dashboard without
 * an app release.
 *
 * Order of preference: fresh download → last download cached on the device →
 * the app's built-in list. Rows are validated; anything the app can't use
 * (unknown sprite, bad size…) falls back to defaults instead of breaking a game.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { type EasterEgg, type EasterEggSettings, setEasterEggs } from '@/game/easterEggs';
import { hasSprite } from '@/game/render/sprites';

import type { Database } from './database.types';
import { getSupabase } from './supabase';
import { withTimeout } from './withTimeout';

type EasterEggRow = Database['public']['Tables']['easter_eggs']['Row'];

const CACHE_KEY = 'remote-easter-eggs-v1';
type Cached = { eggs: EasterEgg[]; settings: EasterEggSettings; fetchedAt: number };

export type EasterEggSource = 'remote' | 'cache' | 'bundled';

/** A database row → the app's EasterEgg; unusable level-object fields are dropped (→ defaults). */
export function rowToEasterEgg(row: EasterEggRow): EasterEgg {
  const item: EasterEgg['item'] = {};
  if (row.item_sprite_key && hasSprite(row.item_sprite_key)) item.spriteKey = row.item_sprite_key;
  if (row.item_size && row.item_size > 0) item.size = row.item_size;
  if (row.item_placement === 'ground' || row.item_placement === 'hover') item.placement = row.item_placement;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    heading: row.heading ?? undefined,
    continueLabel: row.continue_label ?? undefined,
    image: row.image_url ? { uri: row.image_url } : undefined,
    imageAspectRatio: row.image_aspect_ratio ?? undefined,
    item: Object.keys(item).length > 0 ? item : undefined,
  };
}

/** app_config `easter_eggs` JSON → settings; invalid fields are ignored. */
export function parseEasterEggSettings(value: unknown): EasterEggSettings {
  const settings: EasterEggSettings = {};
  if (!value || typeof value !== 'object') return settings;
  const v = value as Record<string, unknown>;
  if (typeof v.chancePerGame === 'number' && v.chancePerGame >= 0 && v.chancePerGame <= 1) {
    settings.chancePerGame = v.chancePerGame;
  }
  const range = v.chunkRange;
  if (
    Array.isArray(range) &&
    range.length === 2 &&
    range.every((n) => Number.isInteger(n) && n >= 1) &&
    range[0] <= range[1]
  ) {
    settings.chunkRange = [range[0], range[1]];
  }
  return settings;
}

async function download(timeoutMs: number): Promise<Cached | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const [eggs, config] = await withTimeout(
    Promise.all([
      supabase.from('easter_eggs').select('*').eq('enabled', true).order('id'),
      supabase.from('app_config').select('value').eq('key', 'easter_eggs').maybeSingle(),
    ]),
    timeoutMs,
  );
  if (eggs.error) throw eggs.error;
  if (config.error) throw config.error;
  return {
    eggs: eggs.data.map(rowToEasterEgg),
    settings: parseEasterEggSettings(config.data?.value),
    fetchedAt: Date.now(),
  };
}

async function readCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

/**
 * Makes the best available content active for the next game. Never throws;
 * waits at most about `timeoutMs` for the network.
 */
export async function syncEasterEggs({ timeoutMs = 2500 } = {}): Promise<EasterEggSource> {
  try {
    const fresh = await download(timeoutMs);
    if (fresh) {
      setEasterEggs(fresh.eggs, fresh.settings);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
      return 'remote';
    }
  } catch (e) {
    console.warn('Easter egg download failed, using cached / built-in content', e);
  }
  const cached = await readCache();
  if (cached) {
    setEasterEggs(cached.eggs, cached.settings);
    return 'cache';
  }
  return 'bundled';
}
