import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { defaultGameConfig } from '@/game/config';
import { easterEggs, getEasterEggs, resetEasterEggs, withEasterEggSettings } from '@/game/easterEggs';
import { createRng } from '@/game/engine/random';
import { World } from '@/game/engine/World';

import { parseEasterEggSettings, rowToEasterEgg, syncEasterEggs } from '../remoteEasterEggs';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// a tiny fake of the two queries the loader makes
type Result = { data: unknown; error: unknown };
let mockEggsResult: Result | Promise<Result>;
let mockConfigResult: Result | Promise<Result>;
let mockSupabaseAvailable = true;
jest.mock('../supabase', () => ({
  getSupabase: () =>
    mockSupabaseAvailable
      ? {
          from: (table: string) => {
            const chain = {
              select: () => chain,
              eq: () => chain,
              order: () => (table === 'easter_eggs' ? mockEggsResult : chain),
              maybeSingle: () => mockConfigResult,
            };
            return chain;
          },
        }
      : null,
}));

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'doge',
  title: 'Doge',
  description: 'Much wow',
  heading: null,
  continue_label: null,
  image_url: null,
  image_aspect_ratio: null,
  item_sprite_key: null,
  item_size: null,
  item_placement: null,
  enabled: true,
  created_at: '',
  updated_at: '',
  ...over,
});

beforeEach(async () => {
  resetEasterEggs();
  mockSupabaseAvailable = true;
  await mockAsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('rowToEasterEgg', () => {
  it('maps card fields and a known level object', () => {
    const egg = rowToEasterEgg(
      row({
        heading: 'Wow!',
        continue_label: 'Oké',
        image_url: 'https://x.supabase.co/storage/v1/object/public/memes/doge.png',
        image_aspect_ratio: 1.5,
        item_sprite_key: 'pickup_coin',
        item_size: 0.8,
        item_placement: 'hover',
      }) as never,
    );
    expect(egg).toEqual({
      id: 'doge',
      title: 'Doge',
      description: 'Much wow',
      heading: 'Wow!',
      continueLabel: 'Oké',
      image: { uri: 'https://x.supabase.co/storage/v1/object/public/memes/doge.png' },
      imageAspectRatio: 1.5,
      item: { spriteKey: 'pickup_coin', size: 0.8, placement: 'hover' },
    });
  });

  it('drops an unknown sprite (falls back to the default object) instead of breaking the game', () => {
    const egg = rowToEasterEgg(row({ item_sprite_key: 'no_such_sprite' }) as never);
    expect(egg.item).toBeUndefined();
  });
});

describe('parseEasterEggSettings', () => {
  it('keeps valid values and ignores invalid ones', () => {
    expect(parseEasterEggSettings({ chancePerGame: 0.25, chunkRange: [3, 9] })).toEqual({
      chancePerGame: 0.25,
      chunkRange: [3, 9],
    });
    expect(parseEasterEggSettings({ chancePerGame: 2, chunkRange: [9, 3] })).toEqual({});
    expect(parseEasterEggSettings(null)).toEqual({});
  });
});

describe('syncEasterEggs', () => {
  it('uses the downloaded content and settings, and caches them', async () => {
    mockEggsResult = { data: [row()], error: null };
    mockConfigResult = { data: { value: { chancePerGame: 0.5, chunkRange: [2, 4] } }, error: null };
    await expect(syncEasterEggs()).resolves.toBe('remote');
    expect(getEasterEggs().map((e) => e.id)).toEqual(['doge']);
    expect(withEasterEggSettings(defaultGameConfig).easterEggs).toMatchObject({ chancePerGame: 0.5, chunkRange: [2, 4] });
    expect(await mockAsyncStorage.getItem('remote-easter-eggs-v1')).toContain('doge');
  });

  it('falls back to the last download when offline', async () => {
    mockEggsResult = { data: [row()], error: null };
    mockConfigResult = { data: null, error: null };
    await syncEasterEggs();
    resetEasterEggs();

    mockEggsResult = { data: null, error: new Error('offline') };
    await expect(syncEasterEggs()).resolves.toBe('cache');
    expect(getEasterEggs().map((e) => e.id)).toEqual(['doge']);
  });

  it('keeps the built-in list without backend and without cache', async () => {
    mockSupabaseAvailable = false;
    await expect(syncEasterEggs()).resolves.toBe('bundled');
    expect(getEasterEggs()).toBe(easterEggs);
  });

  it('gives up after the timeout', async () => {
    mockEggsResult = new Promise(() => {}); // never answers
    mockConfigResult = { data: null, error: null };
    const started = Date.now();
    await expect(syncEasterEggs({ timeoutMs: 50 })).resolves.toBe('bundled');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('the game uses the active content', () => {
  it('hides a downloaded meme with its own object', async () => {
    mockEggsResult = { data: [row({ id: 'remote-meme', item_sprite_key: 'pickup_coin' })], error: null };
    mockConfigResult = { data: { value: { chancePerGame: 1 } }, error: null };
    await syncEasterEggs();
    const config = withEasterEggSettings({ ...defaultGameConfig, start: { ...defaultGameConfig.start, countdownMs: 0 } });
    const world = new World({ config, viewHeight: 400, rng: createRng(1) });
    expect(world.easterEggs).toHaveLength(1);
    expect(world.easterEggs[0]).toMatchObject({ eggId: 'remote-meme', spriteKey: 'pickup_coin' });
  });
});
