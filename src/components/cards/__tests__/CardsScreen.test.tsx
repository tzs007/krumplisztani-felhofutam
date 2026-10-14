import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CardsRoute from '@/app/cards';
import { useCardsStore } from '@/store/useCardsStore';

jest.unmock('react-native/Libraries/Components/ScrollView/ScrollView');
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('@/lib/audio', () => ({ playSound: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
  },
}));

const mockSync = jest.fn();
jest.mock('@/lib/cards', () => {
  const { useCardsStore: store } = jest.requireActual('@/store/useCardsStore');
  return {
    syncCards: (...args: unknown[]) => mockSync(...args),
    // like the real one: reveal in the store at once
    revealCard: async (id: number) => store.getState().revealLocal(id),
  };
});

const card = (n: number) => ({
  id: `card-${n}`,
  number: n,
  name: `Kártya #${n}`,
  description: 'x',
  rarity: 'common' as const,
  imageUrl: null,
  landingUrl: null,
  serialLabel: 'Season 1/432',
});
const owned = (id: number, n: number, revealedAt: string | null = null) => ({
  id,
  cardId: `card-${n}`,
  gameResultId: 1,
  slot: 1,
  revealedAt,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSync.mockResolvedValue('ok');
  useCardsStore.setState({
    catalog: [card(1), card(2), card(3)],
    owned: [owned(1, 2, 't'), owned(2, 3), owned(3, 1)],
    pendingClaims: [],
    pendingReveals: [],
  });
});

describe('collection screen', () => {
  it('shows the progress and every card', async () => {
    await render(<CardsRoute />);
    expect(screen.getByText('1/3 begyűjtve')).toBeTruthy();
    expect(screen.getByLabelText('Kártya #2')).toBeTruthy();
    expect(screen.getAllByLabelText('Még nem felfedezett kártya')).toHaveLength(2);
    expect(mockSync).toHaveBeenCalled();
  });

  it('opens a revealed card', async () => {
    await render(<CardsRoute />);
    await fireEvent.press(screen.getByLabelText('Kártya #2'));
    expect(mockRouter.push).toHaveBeenCalledWith('/cards/2');
  });

  it('flips waiting cards; a flipped card stays in the swiper', async () => {
    await render(<CardsRoute />);
    await fireEvent.press(screen.getByText('Bontatlan kártyák (2)'));
    await fireEvent(screen.getByTestId('card-swiper'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 500 } },
    });
    await fireEvent.press(screen.getAllByLabelText('Mystery Card, koppints a felfordításhoz')[0]);
    // card 3 (owned id 2) is now open, and the swiper still holds both cards
    expect(screen.getAllByLabelText('Kártya #3').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Mystery Card, koppints a felfordításhoz')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Kész'));
    expect(screen.getByText('2/3 begyűjtve')).toBeTruthy();
  });

  it('says when the collection could not be refreshed', async () => {
    mockSync.mockResolvedValue('offline');
    await render(<CardsRoute />);
    expect(await screen.findByText('Nincs kapcsolat — a legutóbb letöltött gyűjteményt látod.')).toBeTruthy();
  });
});
