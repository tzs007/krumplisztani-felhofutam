import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type GameResult = {
  id: string;
  score: number;
  platforms: number;
  pickups: number;
  durationMs: number;
  playedAt: number;
};

export const MAX_HISTORY = 50;

type AppState = {
  history: GameResult[];
  hasHydrated: boolean;
  addResult: (result: Omit<GameResult, 'id'>) => void;
  clearHistory: () => void;
};

/** History is kept sorted by score (desc), then newest first, capped at MAX_HISTORY. */
export function insertResult(history: GameResult[], result: GameResult): GameResult[] {
  return [...history, result]
    .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
    .slice(0, MAX_HISTORY);
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      history: [],
      hasHydrated: false,
      addResult: (result) =>
        set((s) => ({
          history: insertResult(s.history, { ...result, id: `${result.playedAt}-${Math.random().toString(36).slice(2, 8)}` }),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'hiperventi-app',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ history: s.history }),
      onRehydrateStorage: () => () => useAppStore.setState({ hasHydrated: true }),
    },
  ),
);

export const selectBestScore = (s: AppState) => s.history[0]?.score ?? 0;
