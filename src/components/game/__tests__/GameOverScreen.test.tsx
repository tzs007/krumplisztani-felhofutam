import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { fireEvent, render, screen } from '@testing-library/react-native';

import GameOverRoute from '@/app/game-over';
import { useCardsStore } from '@/store/useCardsStore';

import { gameOverBand } from '../GameOverBackground';

jest.unmock('react-native/Libraries/Components/ScrollView/ScrollView');
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const mockClaim = jest.fn();
const mockReveal = jest.fn();
jest.mock('@/lib/cards', () => ({
  claimCards: (...args: unknown[]) => mockClaim(...args),
  revealCard: (...args: unknown[]) => mockReveal(...args),
}));

const mockParams: { score?: string; best?: string; resultId?: string } = {};
const mockRouter = { replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
// the factory runs before the consts above are initialised: look them up at call time
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    dismissTo: (...args: unknown[]) => mockRouter.dismissTo(...args),
    push: (...args: unknown[]) => mockRouter.push(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

const mockPlaySound = jest.fn();
jest.mock('@/lib/audio', () => ({
  playSound: (...args: unknown[]) => mockPlaySound(...args),
  stopSound: () => {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k as keyof typeof mockParams];
  useCardsStore.setState({ catalog: [], owned: [], pendingClaims: [], pendingReveals: [] });
});

describe('game over background', () => {
  it('picks the art by score band (100 and 200 start the next band)', () => {
    expect([0, 99, 100, 199, 200, 950].map(gameOverBand)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('game over screen', () => {
  it('shows the score and the previous best', async () => {
    Object.assign(mockParams, { score: '42', best: '77' });
    await render(<GameOverRoute />);
    expect(screen.getByText('Game Over')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Rekord: 77')).toBeTruthy();
    expect(mockPlaySound).toHaveBeenCalledWith('gameOver');
  });

  it('celebrates a new best', async () => {
    Object.assign(mockParams, { score: '120', best: '77' });
    await render(<GameOverRoute />);
    expect(screen.getByText('Új rekord!')).toBeTruthy();
  });

  it('starts a new run, opens the leaderboard, the collection or the menu', async () => {
    Object.assign(mockParams, { score: '5', best: '0' });
    await render(<GameOverRoute />);
    await fireEvent.press(screen.getByLabelText('Újra játszom'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/game');
    await fireEvent.press(screen.getByText('Ranglista'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/leaderboard');
    await fireEvent.press(screen.getByText('Gyűjtemény'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/cards');
    await fireEvent.press(screen.getByText('Menü'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/menu');
  });
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
const owned = (id: number, n: number) => ({ id, cardId: `card-${n}`, gameResultId: 1, slot: id, revealedAt: null });

describe('game over cards', () => {
  it('shows no card section under 100 points', async () => {
    Object.assign(mockParams, { score: '99', best: '0', resultId: 'r1' });
    await render(<GameOverRoute />);
    expect(screen.queryByText(/kártyát nyithatsz meg/)).toBeNull();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('draws the earned cards and flips them from the swiper', async () => {
    useCardsStore.setState({ catalog: [card(4), card(5)], owned: [owned(1, 4), owned(2, 5)] });
    mockClaim.mockResolvedValue({ status: 'ok', cards: [owned(1, 4), owned(2, 5)] });
    Object.assign(mockParams, { score: '250', best: '0', resultId: 'r1' });
    await render(<GameOverRoute />);

    expect(screen.getByText('2 kártyát nyithatsz meg (250 pont)')).toBeTruthy();
    expect(mockClaim).toHaveBeenCalledWith('r1');
    await fireEvent(await screen.findByTestId('card-swiper'), 'layout', { nativeEvent: { layout: { width: 300, height: 500 } } });
    await fireEvent.press(screen.getAllByLabelText('Mystery Card, koppints a felfordításhoz')[0]);
    expect(mockReveal).toHaveBeenCalledWith(1);
  });

  it('points to the real card once the shown card is revealed', async () => {
    useCardsStore.setState({
      catalog: [card(4)],
      owned: [{ ...owned(1, 4), revealedAt: 't' }],
    });
    mockClaim.mockResolvedValue({ status: 'ok', cards: [owned(1, 4)] });
    Object.assign(mockParams, { score: '120', best: '0', resultId: 'r1' });
    await render(<GameOverRoute />);
    expect(await screen.findByText('A valódi kártyát is megismerheted!')).toBeTruthy();
  });

  it('keeps the cards for later when offline', async () => {
    mockClaim.mockResolvedValue({ status: 'offline', cards: [] });
    Object.assign(mockParams, { score: '300', best: '0', resultId: 'r1' });
    await render(<GameOverRoute />);
    expect(await screen.findByText('Csatlakozz a kártyák megnyitásához — megőrizzük őket.')).toBeTruthy();
  });
});
