import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mergeDrawn, replaceOwned, type Card, type OwnedCard } from '@/lib/cardRules';

type CardsState = {
  /** The collection's cards as last downloaded (kept for offline use). */
  catalog: Card[];
  /** This player's drawn copies as last known; the server's list replaces it on sync. */
  owned: OwnedCard[];
  /** Device ids of games that earned cards not drawn yet (e.g. offline at game over). */
  pendingClaims: string[];
  /** Cards flipped on this device whose reveal hasn't reached the server yet. */
  pendingReveals: number[];
  addClaim: (clientId: string) => void;
  removeClaim: (clientId: string) => void;
  setCatalog: (cards: Card[]) => void;
  setOwned: (server: OwnedCard[]) => void;
  addDrawn: (drawn: OwnedCard[]) => void;
  revealLocal: (id: number) => void;
  confirmReveals: (ids: number[]) => void;
};

export const useCardsStore = create<CardsState>()(
  persist(
    (set) => ({
      catalog: [],
      owned: [],
      pendingClaims: [],
      pendingReveals: [],
      addClaim: (clientId) =>
        set((s) => (s.pendingClaims.includes(clientId) ? s : { pendingClaims: [...s.pendingClaims, clientId] })),
      removeClaim: (clientId) => set((s) => ({ pendingClaims: s.pendingClaims.filter((id) => id !== clientId) })),
      setCatalog: (catalog) => set({ catalog }),
      setOwned: (server) => set((s) => ({ owned: replaceOwned(s.owned, server, s.pendingReveals) })),
      addDrawn: (drawn) => set((s) => ({ owned: mergeDrawn(s.owned, drawn, s.pendingReveals) })),
      revealLocal: (id) =>
        set((s) => {
          const target = s.owned.find((o) => o.id === id);
          if (!target || target.revealedAt) return s;
          const revealedAt = new Date().toISOString();
          return {
            owned: s.owned.map((o) => (o.id === id ? { ...o, revealedAt } : o)),
            pendingReveals: [...s.pendingReveals, id],
          };
        }),
      confirmReveals: (ids) => set((s) => ({ pendingReveals: s.pendingReveals.filter((id) => !ids.includes(id)) })),
    }),
    {
      name: 'hiperventi-cards',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        catalog: s.catalog,
        owned: s.owned,
        pendingClaims: s.pendingClaims,
        pendingReveals: s.pendingReveals,
      }),
    },
  ),
);
