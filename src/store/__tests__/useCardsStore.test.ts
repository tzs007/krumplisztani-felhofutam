import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import type { OwnedCard } from '@/lib/cardRules';

import { useCardsStore } from '../useCardsStore';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

const owned = (id: number, revealedAt: string | null = null): OwnedCard => ({
  id,
  cardId: `card-${id}`,
  gameResultId: 1,
  slot: 1,
  revealedAt,
});

beforeEach(() => {
  useCardsStore.setState({ catalog: [], owned: [], pendingClaims: [], pendingReveals: [] });
});

describe('claims', () => {
  it('queues a game once and removes it when opened', () => {
    const s = useCardsStore.getState();
    s.addClaim('r1');
    s.addClaim('r1');
    s.addClaim('r2');
    expect(useCardsStore.getState().pendingClaims).toEqual(['r1', 'r2']);
    useCardsStore.getState().removeClaim('r1');
    expect(useCardsStore.getState().pendingClaims).toEqual(['r2']);
  });
});

describe('reveals', () => {
  it('reveals locally at once and remembers it until the server confirms', () => {
    useCardsStore.setState({ owned: [owned(1), owned(2)] });
    useCardsStore.getState().revealLocal(1);
    const s = useCardsStore.getState();
    expect(s.owned[0].revealedAt).not.toBeNull();
    expect(s.owned[1].revealedAt).toBeNull();
    expect(s.pendingReveals).toEqual([1]);
    s.confirmReveals([1]);
    expect(useCardsStore.getState().pendingReveals).toEqual([]);
  });

  it('ignores a card that is already revealed', () => {
    useCardsStore.setState({ owned: [owned(1, 't')] });
    useCardsStore.getState().revealLocal(1);
    expect(useCardsStore.getState()).toMatchObject({ owned: [owned(1, 't')], pendingReveals: [] });
  });

  it('a server refresh keeps a reveal that is still being sent', () => {
    useCardsStore.setState({ owned: [owned(1)] });
    useCardsStore.getState().revealLocal(1);
    useCardsStore.getState().setOwned([owned(1)]);
    expect(useCardsStore.getState().owned[0].revealedAt).not.toBeNull();
  });
});

describe('drawn cards', () => {
  it('adds cards from open_cards next to the known ones', () => {
    useCardsStore.setState({ owned: [owned(1, 't')] });
    useCardsStore.getState().addDrawn([owned(4), owned(5)]);
    expect(useCardsStore.getState().owned.map((o) => o.id)).toEqual([1, 4, 5]);
  });
});
