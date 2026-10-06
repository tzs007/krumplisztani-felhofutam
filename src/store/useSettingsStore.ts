import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  /** Background music (menu / game). */
  musicOn: boolean;
  /** Sound effects (pickups, milestones, countdown, game over). */
  soundsOn: boolean;
  setMusicOn: (on: boolean) => void;
  setSoundsOn: (on: boolean) => void;
};

/** Player preferences, kept on the device. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      musicOn: true,
      soundsOn: true,
      setMusicOn: (musicOn) => set({ musicOn }),
      setSoundsOn: (soundsOn) => set({ soundsOn }),
    }),
    {
      name: 'hiperventi-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ musicOn: s.musicOn, soundsOn: s.soundsOn }),
    },
  ),
);
