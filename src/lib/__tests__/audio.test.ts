import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

type MockPlayer = {
  source: unknown;
  playing: boolean;
  /** Like the native player: position in s; play() at the end is over at once (no sound). */
  currentTime: number;
  duration: number;
  /** For each play() call: was there anything left to hear? */
  audible: boolean[];
  loop: boolean;
  volume: number;
  play: jest.Mock;
  pause: jest.Mock;
  replace: jest.Mock;
  seekTo: jest.Mock;
  addListener: jest.Mock;
};
const mockPlayers: MockPlayer[] = [];
let mockNativeModule = true;

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => (mockNativeModule ? {} : null),
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  createAudioPlayer: (source: unknown) => {
    const p: MockPlayer = {
      source,
      playing: false,
      currentTime: 0,
      duration: 1,
      audible: [],
      loop: false,
      volume: 1,
      // native play() is synchronous
      play: jest.fn(() => {
        const left = p.currentTime < p.duration;
        p.audible.push(left);
        p.playing = left;
      }),
      pause: jest.fn(() => {
        p.playing = false;
      }),
      replace: jest.fn((s: unknown) => {
        p.source = s;
      }),
      // native seekTo is asynchronous: the position changes only later
      seekTo: jest.fn(async (s: number) => {
        await Promise.resolve();
        p.currentTime = s;
      }),
      addListener: jest.fn(),
    };
    mockPlayers.push(p);
    return p;
  },
}));
// asset requires resolve to their file name, so tests can tell the sounds apart
jest.mock('@/assets/sounds/music_menu.m4a', () => 'music_menu', { virtual: true });
jest.mock('@/assets/sounds/music_game.m4a', () => 'music_game', { virtual: true });
jest.mock('@/assets/sounds/sfx_jump.m4a', () => 'sfx_jump', { virtual: true });
jest.mock('@/assets/sounds/sfx_card.m4a', () => 'sfx_card', { virtual: true });
jest.mock('@/assets/sounds/sfx_bonus.m4a', () => 'sfx_bonus', { virtual: true });
jest.mock('@/assets/sounds/sfx_milestone.m4a', () => 'sfx_milestone', { virtual: true });
jest.mock('@/assets/sounds/sfx_game_over.m4a', () => 'sfx_game_over', { virtual: true });
jest.mock('@/assets/sounds/sfx_countdown_tick.m4a', () => 'sfx_countdown_tick', { virtual: true });

type Settings = typeof import('@/store/useSettingsStore').useSettingsStore;
let useSettingsStore: Settings;

/** Fresh module state per test (players, wanted track, settings subscription), with its settings store. */
function load({ musicOn = true, soundsOn = true } = {}) {
  let mod!: typeof import('../audio');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    useSettingsStore = require('@/store/useSettingsStore').useSettingsStore;
    useSettingsStore.setState({ musicOn, soundsOn });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../audio');
  });
  return mod;
}

const playersOf = (source: string) => mockPlayers.filter((p) => p.source === source);
const music = () => mockPlayers.find((p) => p.loop);

beforeEach(() => {
  mockPlayers.length = 0;
  mockNativeModule = true;
  // settings persisted by an earlier test would rehydrate into the next one
  return mockAsyncStorage.clear();
});

describe('music', () => {
  it('loops the track the screen asks for and switches tracks on one player', () => {
    const audio = load();
    audio.initAudio();
    audio.setMusic('menu');
    expect(music()).toMatchObject({ source: 'music_menu', playing: true, volume: 0.5 });
    audio.setMusic('game');
    expect(mockPlayers.filter((p) => p.loop)).toHaveLength(1);
    expect(music()).toMatchObject({ source: 'music_game', playing: true });
    audio.setMusic(null);
    expect(music()?.playing).toBe(false);
  });

  it('switching to a track that is the same file keeps the music going (no restart)', () => {
    const audio = load();
    audio.initAudio();
    audio.setMusic('game');
    const player = music()!;
    audio.setMusic('psy');
    expect(player.replace).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
  });

  it('follows the music switch', () => {
    const audio = load();
    audio.initAudio();
    audio.setMusic('menu');
    useSettingsStore.getState().setMusicOn(false);
    expect(music()?.playing).toBe(false);
    useSettingsStore.getState().setMusicOn(true);
    expect(music()?.playing).toBe(true);
  });

  it('starts silent when the music is off', () => {
    const audio = load({ musicOn: false });
    audio.initAudio();
    audio.setMusic('menu');
    expect(music()).toBeUndefined();
  });
});

describe('effects', () => {
  it('preloads two voices per effect and overlaps quick repeats', async () => {
    const audio = load();
    audio.initAudio();
    expect(playersOf('sfx_card')).toHaveLength(2);
    audio.playSound('card');
    audio.playSound('card');
    const cards = playersOf('sfx_card');
    expect(cards.every((p) => p.playing)).toBe(true);
    // both halfway through: a third one restarts a voice from the beginning
    for (const p of cards) p.currentTime = 0.5;
    audio.playSound('card');
    await new Promise((r) => setTimeout(r, 0));
    expect(cards.some((p) => p.currentTime === 0 && p.play.mock.calls.length === 2)).toBe(true);
  });

  it('stays quiet when the sounds are off, and stops what is playing when switched off', () => {
    const audio = load();
    audio.initAudio();
    audio.playSound('gameOver');
    expect(playersOf('sfx_game_over').some((p) => p.playing)).toBe(true);
    useSettingsStore.getState().setSoundsOn(false);
    expect(playersOf('sfx_game_over').some((p) => p.playing)).toBe(false);
    audio.playSound('milestone');
    expect(playersOf('sfx_milestone').some((p) => p.playing)).toBe(false);
  });

  it('replays a voice that already played to the end from the start (not silently from its end)', async () => {
    const audio = load();
    audio.initAudio();
    const jumps = playersOf('sfx_jump');
    // every voice has played once and stopped at its end, like after a few bounces
    for (const p of jumps) Object.assign(p, { currentTime: p.duration, playing: false });
    for (let i = 0; i < 6; i++) {
      audio.playSound('jump');
      await new Promise((r) => setTimeout(r, 0));
      // the sound ends before the next bounce
      for (const p of jumps) Object.assign(p, { currentTime: p.duration, playing: false });
    }
    const plays = jumps.flatMap((p) => p.audible);
    expect(plays).toHaveLength(6);
    expect(plays.every(Boolean)).toBe(true);
  });

  it('gives the jump three voices, so quick bounces overlap', () => {
    const audio = load();
    audio.initAudio();
    expect(playersOf('sfx_jump')).toHaveLength(3);
    for (let i = 0; i < 3; i++) audio.playSound('jump');
    expect(playersOf('sfx_jump').every((p) => p.playing)).toBe(true);
  });

  it('stopSound cuts an effect short', () => {
    const audio = load();
    audio.initAudio();
    audio.playSound('gameOver');
    audio.stopSound('gameOver');
    expect(playersOf('sfx_game_over').some((p) => p.playing)).toBe(false);
  });
});

it('does nothing in a build without the native audio module', () => {
  mockNativeModule = false;
  const audio = load();
  audio.initAudio();
  audio.setMusic('menu');
  audio.playSound('card');
  expect(mockPlayers).toHaveLength(0);
});
