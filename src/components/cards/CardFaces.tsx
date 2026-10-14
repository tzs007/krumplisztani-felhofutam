import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { Card, Rarity } from '@/lib/cardRules';

/** Width / height of a card (standard trading card, 63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/**
 * The printed frame is part of the artwork (≈6% of the width per side on the
 * fronts, ≈9% on the back). The faces zoom the image so half of it is clipped.
 */
export const FRONT_ART_ZOOM = 1 / (1 - 0.06);
const BACK_ART_ZOOM = 1 / (1 - 0.09);

/** Hungarian name of each rarity, shown on the badge. */
export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Gyakori',
  uncommon: 'Átlagos',
  rare: 'Ritka',
  epic: 'Epikus',
  legendary: 'Legendás',
  mythic: 'Mitikus',
  etheric: 'Éteri',
  sacred: 'Szakrális',
};

/** Badge colours per rarity (dark text on the light badges). */
const RARITY_COLORS: Record<Rarity, { background: string; color: string }> = {
  common: { background: '#F5F5F5', color: '#171717' },
  uncommon: { background: '#16A34A', color: '#FFFFFF' },
  rare: { background: '#2563EB', color: '#FFFFFF' },
  epic: { background: '#9333EA', color: '#FFFFFF' },
  legendary: { background: '#FACC15', color: '#171717' },
  mythic: { background: '#DC2626', color: '#FFFFFF' },
  // space blue
  etheric: { background: '#1E2A78', color: '#FFFFFF' },
  // ghost blue
  sacred: { background: '#C7DDF5', color: '#171717' },
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  // a rarity added on the server before the app knows it shows as common
  const known = rarity in RARITY_LABELS ? rarity : 'common';
  const r = RARITY_COLORS[known];
  return (
    <Box className="rounded-full border border-border px-2 py-0.5" style={{ backgroundColor: r.background }}>
      <Text size="2xs" bold style={{ color: r.color }}>
        {RARITY_LABELS[known]}
      </Text>
    </Box>
  );
}

/**
 * Artwork, name, rarity and serial label; `compact` for gallery thumbnails,
 * `artOnly` drops the rarity and serial label under the artwork.
 */
export function CardFront({
  card,
  compact = false,
  artOnly = false,
}: {
  card: Card;
  compact?: boolean;
  artOnly?: boolean;
}) {
  return (
    <VStack space="xs" className="flex-1 overflow-hidden rounded-lg bg-card">
      <Box className="flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            style={{
              width: '100%',
              height: '100%',
              transform: [{ scale: FRONT_ART_ZOOM }],
            }}
          />
        ) : (
          <Text bold size={compact ? 'xl' : '4xl'} className="text-muted-foreground">
            {card.number}
          </Text>
        )}
      </Box>

      {!compact && !artOnly && (
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

/** The back: the printed card back, or a big mark (e.g. "?") in the gallery. */
export function CardBack({ mark }: { mark?: string }) {
  if (mark) {
    return (
      <VStack
        space="sm"
        className="flex-1 items-center justify-center rounded-lg border-2 border-sky-foreground bg-sky"
      >
        <Text bold size="3xl" className="text-sky-foreground">
          {mark}
        </Text>
      </VStack>
    );
  }
  // the printed back fills the whole card; the frame clips its corners
  return (
    <View style={styles.backFrame}>
      <Image
        source={require('@/assets/images/card-back.webp')}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        style={{
          width: '100%',
          height: '100%',
          transform: [{ scale: BACK_ART_ZOOM }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backFrame: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});
