import { useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useLoad } from '@/hooks/useLoad';
import { cardsForScore, withCard, type OwnedCard } from '@/lib/cardRules';
import { claimCards, revealCard } from '@/lib/cards';
import { useCardsStore } from '@/store/useCardsStore';

import { CardSwiper, type SwiperItem } from './CardSwiper';

type Claim = { state: 'loading' } | { state: 'ready'; cards: OwnedCard[] } | { state: 'offline' } | { state: 'error' };

/**
 * The game over screen's card section: how many cards the score earned, then
 * the drawn cards in a swiper to flip. The draw starts as soon as the screen
 * opens; offline the game stays queued and opens later (menu / collection).
 */
export function GameOverCards({ resultId, score }: { resultId?: string; score: number }) {
  const count = cardsForScore(score);
  const [claim, setClaim] = useState<Claim>({ state: 'loading' });
  const [index, setIndex] = useState(0);
  const owned = useCardsStore((s) => s.owned);
  const catalog = useCardsStore((s) => s.catalog);

  useLoad(
    () => (resultId && count > 0 ? claimCards(resultId) : null),
    (r) => setClaim(r.status === 'ok' ? { state: 'ready', cards: r.cards } : { state: r.status }),
    [resultId, count],
  );

  if (!resultId || count === 0) return null;

  // read from the store, so a flip shows at once; a sync that ran before this draw may have
  // replaced the store's list, so fall back to the card claimed here
  const items: SwiperItem[] =
    claim.state === 'ready'
      ? claim.cards.map((claimed) => withCard(owned.find((x) => x.id === claimed.id) ?? claimed, catalog))
      : [];
  const current = items[index];

  return (
    <VStack space="md" className="items-center border-t border-border pt-4">
      <Text className="text-center text-foreground">
        {count} kártyát nyithatsz meg ({score} pont)
      </Text>
      {claim.state === 'offline' || claim.state === 'error' ? (
        <Text size="sm" className="text-center text-muted-foreground">
          {claim.state === 'offline'
            ? 'Csatlakozz a kártyák megnyitásához — megőrizzük őket.'
            : 'Most nem sikerült megnyitni a kártyákat.'}
        </Text>
      ) : claim.state === 'loading' ? (
        <Spinner />
      ) : (
        // the drawn cards right away, face down: a tap flips one
        <CardSwiper items={items} artOnly onReveal={revealCard} onIndexChange={setIndex} />
      )}
      {current?.card && current.owned.revealedAt && (
        <VStack space="sm" className="w-full items-center">
          <Text size="sm" className="text-center text-foreground">
            A valódi kártyát is megismerheted!
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
