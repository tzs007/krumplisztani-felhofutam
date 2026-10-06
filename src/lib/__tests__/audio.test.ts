import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

type MockPlayer = {
  source: unknown;
  playing: boolean;
  loop: boolean;
  volume: number;
  play: jest.Mock;
  pause: jest.Mock;
  replace: jest.Mock;
  seekTo: jest.Mock;
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
      loop: false,
      volume: 1,
      play: jest.fn(() => {
        p.playing = true;
      }),
      pause: jest.fn(() => {
        p.playing = false;
      }),
      replace: jest.fn((s: unknown) => {
        p.source = s;
      }),
      seekTo: jest.fn(async () => {}),
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
  it('preloads two voices per effect and overlaps quick repeats', () => {
    const audio = load();
    audio.initAudio();
    expect(playersOf('sfx_card')).toHaveLength(2);
    audio.playSound('card');
    audio.playSound('card');
    expect(playersOf('sfx_card').every((p) => p.playing)).toBe(true);
    // a third one restarts a voice from the beginning
    audio.playSound('card');
    expect(playersOf('sfx_card').some((p) => p.seekTo.mock.calls.length === 2)).toBe(true);
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
