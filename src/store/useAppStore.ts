import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { POINTS_PER_CARD } from '@/lib/cardRules';

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
  /** Ids of results already uploaded to the backend (the rest wait in the upload queue). */
  uploadedIds: string[];
  hasHydrated: boolean;
  addResult: (result: Omit<GameResult, 'id'>) => GameResult;
  markUploaded: (ids: string[]) => void;
  clearHistory: () => void;
};

/**
 * History is kept sorted by score (desc), then newest first, capped at MAX_HISTORY.
 * A result that earned cards and is not uploaded yet is never dropped (its cards
 * could not be opened any more), so history may briefly exceed the cap.
 */
export function insertResult(
  history: GameResult[],
  result: GameResult,
  uploadedIds: readonly string[] = [],
): GameResult[] {
  const uploaded = new Set(uploadedIds);
  return [...history, result]
    .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
    .filter((r, i) => i < MAX_HISTORY || (r.score >= POINTS_PER_CARD && !uploaded.has(r.id)));
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      history: [],
      uploadedIds: [],
      hasHydrated: false,
      addResult: (result) => {
        const saved = { ...result, id: `${result.playedAt}-${Math.random().toString(36).slice(2, 8)}` };
        set((s) => {
          const history = insertResult(s.history, saved, s.uploadedIds);
          const keep = new Set(history.map((r) => r.id));
          return { history, uploadedIds: s.uploadedIds.filter((id) => keep.has(id)) };
        });
        return saved;
      },
      markUploaded: (ids) =>
        set((s) => {
          // only remember ids still in the (capped) history
          const keep = new Set(s.history.map((r) => r.id));
          return { uploadedIds: [...new Set([...s.uploadedIds, ...ids])].filter((id) => keep.has(id)) };
        }),
      clearHistory: () => set({ history: [], uploadedIds: [] }),
    }),
    {
      name: 'hiperventi-app',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ history: s.history, uploadedIds: s.uploadedIds }),
      onRehydrateStorage: () => () => useAppStore.setState({ hasHydrated: true }),
    },
  ),
);

export const selectBestScore = (s: AppState) => s.history[0]?.score ?? 0;

/** Results on this device not uploaded yet (all of them before the first sign-in). */
export const selectPendingUploads = (s: AppState) => {
  const done = new Set(s.uploadedIds);
  return s.history.filter((r) => !done.has(r.id));
};
