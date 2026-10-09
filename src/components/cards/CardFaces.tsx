import { Image } from 'expo-image';

import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { Card, Rarity } from '@/lib/cardRules';

/** Width / height of a card (standard trading card, 63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

const RARITY: Record<Rarity, { label: string; badge: string; text: string }> = {
  common: { label: 'Common', badge: 'bg-muted', text: 'text-foreground' },
  rare: { label: 'Rare', badge: 'bg-sky', text: 'text-sky-foreground' },
  legendary: { label: 'Legendary', badge: 'bg-amber-400', text: 'text-foreground' },
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const r = RARITY[rarity];
  return (
    <Box className={`rounded-full px-2 py-0.5 ${r.badge}`}>
      <Text size="2xs" bold className={r.text}>
        {r.label}
      </Text>
    </Box>
  );
}

/** Artwork, name, rarity and serial label; `compact` for gallery thumbnails. */
export function CardFront({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <VStack space="xs" className="flex-1 overflow-hidden rounded-lg border-2 border-border bg-card p-2">
      <Box className="flex-1 items-center justify-center overflow-hidden rounded-md bg-muted">
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <Text bold size={compact ? 'xl' : '4xl'} className="text-muted-foreground">
            {card.number}
          </Text>
        )}
      </Box>
      <Text bold size={compact ? '2xs' : 'md'} numberOfLines={1} className="text-center text-foreground">
        {card.name}
      </Text>
      {!compact && (
        <VStack space="xs" className="items-center">
          <RarityBadge rarity={card.rarity} />
          <Text size="2xs" className="text-muted-foreground">
            {card.serialLabel}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}

/** The back: brand logo and "Mystery Card", or a big mark (e.g. "?") in the gallery. */
export function CardBack({ mark }: { mark?: string }) {
  return (
    <VStack space="sm" className="flex-1 items-center justify-center rounded-lg border-2 border-sky-foreground bg-sky p-2">
      {mark ? (
        <Text bold size="3xl" className="text-sky-foreground">
          {mark}
        </Text>
      ) : (
        <>
          {/* placeholder brand mark until the TCG logo arrives */}
          <Image
            source={require('@/assets/images/logo-glow.png')}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: '60%', aspectRatio: 1 }}
          />
          <Text bold className="text-sky-foreground">
            Mystery Card
          </Text>
        </>
      )}
    </VStack>
  );
}
