/**
 * Music and sound effects (expo-audio). Sources live in assets/sounds
 * (AAC m4a, converted from assets/sound-sources).
 *
 * - Music: one track at a time, chosen by the screen (setMusic); it loops,
 *   except the psy track, which plays once and then stays silent. Paused
 *   while the app is in the background or the music is switched off.
 * - Effects: a couple of preloaded players per sound so quick repeats can
 *   overlap (playSound / stopSound).
 *
 * The module is loaded lazily and only when the native module is in the
 * binary, so an older build updated over the air simply stays silent.
 * The phone's silent switch is respected (no sound in silent mode on iOS).
 */
import { requireOptionalNativeModule } from 'expo';
import type { AudioPlayer } from 'expo-audio';
import { AppState } from 'react-native';

import { useSettingsStore } from '@/store/useSettingsStore';

export type MusicTrack = 'menu' | 'game' | 'psy';
export type SoundEffect =
  'jump' | 'card' | 'bonus' | 'milestone' | 'gameOver' | 'countdownTick' | 'portal' | 'backspin';

const MUSIC: Record<MusicTrack, number> = {
  menu: require('@/assets/sounds/music_menu.m4a'),
  game: require('@/assets/sounds/music_game.m4a'),
  // psy mode (magic mushroom): a trance track
  psy: require('@/assets/sounds/music_psy.m4a'),
};
/** Tracks that play only once (no loop). */
const ONCE: ReadonlySet<MusicTrack> = new Set(['psy']);
const EFFECTS: Record<SoundEffect, number> = {
  jump: require('@/assets/sounds/sfx_jump.m4a'),
  card: require('@/assets/sounds/sfx_card.m4a'),
  bonus: require('@/assets/sounds/sfx_bonus.m4a'),
  milestone: require('@/assets/sounds/sfx_milestone.m4a'),
  gameOver: require('@/assets/sounds/sfx_game_over.m4a'),
  countdownTick: require('@/assets/sounds/sfx_countdown_tick.m4a'),
  // until a portal sound of its own arrives: the bonus chime
  portal: require('@/assets/sounds/sfx_bonus.m4a'),
  // the end of psy mode, back on the normal level
  backspin: require('@/assets/sounds/sfx_backspin.m4a'),
};
/** Players per effect: how many of the same sound may overlap (the jump repeats faster than it fades). */
const VOICES: Partial<Record<SoundEffect, number>> = { jump: 3 };
const DEFAULT_VOICES = 2;
/** Effects quieter than full volume. */
const EFFECT_VOLUME: Partial<Record<SoundEffect, number>> = { backspin: 0.5, card: 0.7, jump: 0.7, bonus: 0.6 };
const MUSIC_VOLUME = 0.5;
/** Tracks louder (or quieter) than the default music volume. */
const TRACK_VOLUME: Partial<Record<MusicTrack, number>> = { game: 0.7, psy: 1 };

type ExpoAudio = typeof import('expo-audio');
let audio: ExpoAudio | null | undefined;

function getAudio(): ExpoAudio | null {
  if (audio !== undefined) return audio;
  if (!requireOptionalNativeModule('ExpoAudio')) {
    audio = null;
    return audio;
  }
  try {
    // loaded only now (not via import), so binaries without the native module never touch it
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio') as ExpoAudio;
  } catch (e) {
    console.warn('Audio unavailable, playing silently', e);
    audio = null;
    return audio;
  }
  audio
    .setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false })
    .catch(() => {});
  return audio;
}

// ── music ───────────────────────────────────────────────────────────

let wantedTrack: MusicTrack | null = null;
let musicPlayer: AudioPlayer | null = null;
let musicTrack: MusicTrack | null = null;
// a play-once track that reached its end: not started again until another track is chosen
let musicEnded = false;
// 'unknown' / null right at launch counts as foreground
let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';

function applyMusic() {
  const on = useSettingsStore.getState().musicOn && foreground && wantedTrack !== null;
  if (!on) {
    musicPlayer?.pause();
    return;
  }
  const a = getAudio();
  if (!a || !wantedTrack) return;
  if (!musicPlayer) {
    const player = a.createAudioPlayer(MUSIC[wantedTrack]);
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && musicTrack && ONCE.has(musicTrack)) musicEnded = true;
    });
    musicPlayer = player;
    musicTrack = wantedTrack;
  } else if (musicTrack !== wantedTrack) {
    // two tracks may share a file (a placeholder): then the music just keeps playing
    if (!musicTrack || MUSIC[musicTrack] !== MUSIC[wantedTrack]) musicPlayer.replace(MUSIC[wantedTrack]);
    musicTrack = wantedTrack;
    musicEnded = false;
  }
  if (musicEnded) return;
  musicPlayer.loop = !ONCE.has(wantedTrack);
  musicPlayer.volume = TRACK_VOLUME[wantedTrack] ?? MUSIC_VOLUME;
  musicPlayer.play();
}

/** The track the current screen wants (null: silence, e.g. on the game over screen). */
export function setMusic(track: MusicTrack | null) {
  if (track === wantedTrack) return;
  wantedTrack = track;
  applyMusic();
}

// ── effects ─────────────────────────────────────────────────────────

const voices = new Map<SoundEffect, AudioPlayer[]>();
const nextVoice = new Map<SoundEffect, number>();

function voicesOf(effect: SoundEffect): AudioPlayer[] | null {
  const a = getAudio();
  if (!a) return null;
  let list = voices.get(effect);
  if (!list) {
    list = Array.from({ length: VOICES[effect] ?? DEFAULT_VOICES }, () => {
      const player = a.createAudioPlayer(EFFECTS[effect]);
      player.volume = EFFECT_VOLUME[effect] ?? 1;
      // a finished effect stays at its end: rewind it right away, so the next play can start at once.
      // Paused first: on Android the player still "plays" at its end, so a bare seek starts it over
      // (and the next finish rewinds it again: an endless loop)
      player.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        player.pause();
        player.seekTo(0).catch(() => {});
      });
      return player;
    });
    voices.set(effect, list);
  }
  return list;
}

/** Plays an effect from the start (a free voice if there is one, otherwise the oldest). */
export function playSound(effect: SoundEffect) {
  if (!useSettingsStore.getState().soundsOn) return;
  const list = voicesOf(effect);
  if (!list) return;
  const free = list.find((p) => !p.playing);
  const i = nextVoice.get(effect) ?? 0;
  const player = free ?? list[i];
  nextVoice.set(effect, (i + 1) % list.length);
  if (player.currentTime > 0) {
    // native seekTo is asynchronous but play() is not: started right away, a voice left at the
    // end of the sound would "play" from there and stop at once (silently), then rewind
    player.seekTo(0).then(
      () => player.play(),
      () => {},
    );
  } else {
    player.play();
  }
}

/** Stops an effect that may still be playing (e.g. the long game over jingle when leaving the screen). */
export function stopSound(effect: SoundEffect) {
  for (const p of voices.get(effect) ?? []) p.pause();
}

// ── setup ───────────────────────────────────────────────────────────

let started = false;

/** Preloads the effects and follows the settings and the app state. Call once at startup. */
export function initAudio() {
  if (started) return;
  started = true;
  if (!getAudio()) return;
  for (const effect of Object.keys(EFFECTS) as SoundEffect[]) voicesOf(effect);
  useSettingsStore.subscribe((s, prev) => {
    if (s.musicOn !== prev.musicOn) applyMusic();
    if (!s.soundsOn && prev.soundsOn) for (const effect of voices.keys()) stopSound(effect);
  });
  AppState.addEventListener('change', (state) => {
    foreground = state === 'active';
    applyMusic();
  });
}
