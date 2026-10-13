import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CardDetailRoute from '@/app/cards/[number]';
import { useCardsStore } from '@/store/useCardsStore';

jest.unmock('react-native/Libraries/Components/ScrollView/ScrollView');
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

const mockParams: { number?: string } = {};
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));

const mockOpen = jest.fn(async (..._args: unknown[]) => ({ type: 'cancel' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...args: unknown[]) => mockOpen(...args) }));

const card = {
  id: 'demagogia',
  number: 4,
  name: 'Demagógia',
  description: 'A hangos ígéretek kártyája.',
  rarity: 'rare' as const,
  imageUrl: null,
  landingUrl: 'https://krumplisztan.hu/kartyak/d91e303d647ad4e95769e823f7ef20cb',
  serialLabel: 'Season 1/432',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.number = '4';
  useCardsStore.setState({
    catalog: [card],
    owned: [{ id: 1, cardId: 'demagogia', gameResultId: 1, slot: 1, revealedAt: 't' }],
    pendingClaims: [],
    pendingReveals: [],
  });
});

describe('card details', () => {
  it('shows the revealed card and opens its webshop page', async () => {
    await render(<CardDetailRoute />);
    expect(screen.getAllByText('Demagógia').length).toBeGreaterThan(0);
    expect(screen.getByText('A hangos ígéretek kártyája.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Megnézem a webshopban →'));
    expect(mockOpen).toHaveBeenCalledWith(card.landingUrl);
  });

  it('keeps an undiscovered card hidden', async () => {
    useCardsStore.setState({ owned: [] });
    await render(<CardDetailRoute />);
    expect(screen.getByText('Még nem fedezted fel ezt a kártyát.')).toBeTruthy();
    expect(screen.queryByText('A hangos ígéretek kártyája.')).toBeNull();
    expect(screen.queryByText('Megnézem a webshopban →')).toBeNull();
  });

  it('hides the webshop button without a landing page and closes', async () => {
    useCardsStore.setState({ catalog: [{ ...card, landingUrl: null }] });
    await render(<CardDetailRoute />);
    expect(screen.queryByText('Megnézem a webshopban →')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Bezárás'));
    expect(mockBack).toHaveBeenCalled();
  });
});
