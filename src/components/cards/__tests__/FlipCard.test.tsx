import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Card } from '@/lib/cardRules';

import { RarityBadge } from '../CardFaces';
import { FlipCard } from '../FlipCard';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('@/lib/audio', () => ({ playSound: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const card: Card = {
  id: 'card-7',
  number: 7,
  name: 'Kártya #7',
  description: 'x',
  rarity: 'legendary',
  imageUrl: null,
  landingUrl: null,
  serialLabel: 'Season 1/432',
};

describe('FlipCard', () => {
  it('flips a hidden card on tap, only once', async () => {
    const onReveal = jest.fn();
    const view = await render(<FlipCard card={card} revealed={false} width={200} onReveal={onReveal} />);
    await fireEvent.press(screen.getByLabelText('Mystery Card, koppints a felfordításhoz'));
    expect(onReveal).toHaveBeenCalledTimes(1);

    await view.rerender(<FlipCard card={card} revealed width={200} onReveal={onReveal} />);
    await fireEvent.press(screen.getByLabelText('Kártya #7'));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('shows the front: rarity and the serial label, named for screen readers', async () => {
    await render(<FlipCard card={card} revealed width={200} onReveal={() => {}} />);
    expect(screen.getByLabelText('Kártya #7')).toBeTruthy();
    expect(screen.getByText('Legendás')).toBeTruthy();
    expect(screen.getByText('Season 1/432')).toBeTruthy();
  });

  it('shows only the artwork on the front when artOnly', async () => {
    await render(<FlipCard card={card} revealed artOnly width={200} onReveal={() => {}} />);
    expect(screen.queryByText('Legendás')).toBeNull();
    expect(screen.queryByText('Season 1/432')).toBeNull();
  });

  it('cannot be flipped while the card is unknown', async () => {
    const onReveal = jest.fn();
    await render(<FlipCard revealed={false} width={200} onReveal={onReveal} />);
    await fireEvent.press(screen.getByLabelText('Mystery Card, koppints a felfordításhoz'));
    expect(onReveal).not.toHaveBeenCalled();
  });
});

describe('RarityBadge', () => {
  it('labels every rarity, and an unknown one as common', async () => {
    await render(<RarityBadge rarity="etheric" />);
    expect(screen.getByText('Éteri')).toBeTruthy();
    await render(<RarityBadge rarity={'cosmic' as Card['rarity']} />);
    expect(screen.getByText('Gyakori')).toBeTruthy();
  });
});
