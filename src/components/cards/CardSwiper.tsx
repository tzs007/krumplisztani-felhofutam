import { useState } from 'react';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import type { Card, OwnedCard } from '@/lib/cardRules';

import { FlipCard } from './FlipCard';

export type SwiperItem = { owned: OwnedCard; card?: Card };

type Props = {
  items: SwiperItem[];
  /** Only the artwork on the fronts, without the rarity and serial label. */
  artOnly?: boolean;
  onReveal: (userCardId: number) => void;
  onIndexChange?: (index: number) => void;
};

/** One card per page, swipeable also while the cards still show their backs. */
export function CardSwiper({ items, artOnly, onReveal, onIndexChange }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const cardWidth = Math.min(width * 0.7, 240);

  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page === index) return;
    setIndex(page);
    onIndexChange?.(page);
  };

  return (
    <View testID="card-swiper" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {width > 0 && (
        <FlatList
          testID="card-swiper-list"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={items}
          keyExtractor={(item) => String(item.owned.id)}
          onMomentumScrollEnd={onPageEnd}
          renderItem={({ item }) => (
            // the padding leaves room for the card's shadow, which the list would clip
            <View style={{ width, alignItems: 'center', paddingVertical: 8 }}>
              <FlipCard
                card={item.card}
                revealed={item.owned.revealedAt !== null}
                width={cardWidth}
                artOnly={artOnly}
                onReveal={() => onReveal(item.owned.id)}
              />
            </View>
          )}
        />
      )}
      {items.length > 1 && (
        <HStack space="xs" className="mt-3 justify-center">
          {items.map((item, i) => (
            <Box
              key={item.owned.id}
              className={`h-2 w-2 rounded-full ${i === index ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
            />
          ))}
        </HStack>
      )}
    </View>
  );
}
