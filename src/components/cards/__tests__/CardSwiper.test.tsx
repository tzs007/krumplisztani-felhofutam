import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { Card, OwnedCard } from '@/lib/cardRules';

import { CardSwiper } from '../CardSwiper';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.unmock('react-native/Libraries/Components/ScrollView/ScrollView');
jest.mock('@/lib/audio', () => ({ playSound: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const card = (n: number): Card => ({
  id: `card-${n}`,
  number: n,
  name: `Kártya #${n}`,
  description: 'x',
  rarity: 'common',
  imageUrl: null,
  landingUrl: null,
  serialLabel: 'Season 1/432',
});
const owned = (id: number, n: number, revealedAt: string | null = null): OwnedCard => ({
  id,
  cardId: `card-${n}`,
  gameResultId: 1,
  slot: id,
  revealedAt,
});

async function renderSwiper(onReveal = jest.fn(), onIndexChange = jest.fn()) {
  await render(
    <CardSwiper
      items={[
        { owned: owned(1, 4), card: card(4) },
        { owned: owned(2, 5, 't'), card: card(5) },
        { owned: owned(3, 6), card: card(6) },
      ]}
      onReveal={onReveal}
      onIndexChange={onIndexChange}
    />,
  );
  await fireEvent(screen.getByTestId('card-swiper'), 'layout', { nativeEvent: { layout: { width: 300, height: 500 } } });
  return { onReveal, onIndexChange };
}

describe('CardSwiper', () => {
  it('shows every card, hidden ones by their back', async () => {
    await renderSwiper();
    expect(screen.getAllByLabelText('Mystery Card, koppints a felfordításhoz')).toHaveLength(2);
    expect(screen.getByLabelText('Kártya #5')).toBeTruthy();
  });

  it('reveals the tapped card by its id', async () => {
    const { onReveal } = await renderSwiper();
    await fireEvent.press(screen.getAllByLabelText('Mystery Card, koppints a felfordításhoz')[1]);
    expect(onReveal).toHaveBeenCalledWith(3);
  });

  it('reports the page after a swipe, even over unrevealed cards', async () => {
    const { onIndexChange } = await renderSwiper();
    // fireEvent drops this: RNTL skips a ScrollView whose responder rejects the touch.
    const list = screen.getByTestId('card-swiper-list');
    await act(() => {
      list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 600, y: 0 } } });
    });
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });
});
