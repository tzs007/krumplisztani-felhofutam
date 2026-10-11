import { Image } from "expo-image";

import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Card, Rarity } from "@/lib/cardRules";

/** Width / height of a card (standard trading card, 63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/** Badge label and colours per rarity (dark text on the light badges). */
const RARITY: Record<
  Rarity,
  { label: string; background: string; color: string }
> = {
  common: { label: "Common", background: "#F5F5F5", color: "#171717" },
  uncommon: { label: "Uncommon", background: "#16A34A", color: "#FFFFFF" },
  rare: { label: "Rare", background: "#2563EB", color: "#FFFFFF" },
  epic: { label: "Epic", background: "#9333EA", color: "#FFFFFF" },
  legendary: { label: "Legendary", background: "#FACC15", color: "#171717" },
  mythic: { label: "Mythic", background: "#DC2626", color: "#FFFFFF" },
  // space blue
  etheric: { label: "Etheric", background: "#1E2A78", color: "#FFFFFF" },
  // ghost blue
  sacred: { label: "Sacred", background: "#C7DDF5", color: "#171717" },
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  // a rarity added on the server before the app knows it shows as common
  const r = RARITY[rarity] ?? RARITY.common;
  return (
    <Box
      className="rounded-full border border-border px-2 py-0.5"
      style={{ backgroundColor: r.background }}
    >
      <Text size="2xs" bold style={{ color: r.color }}>
        {r.label}
      </Text>
    </Box>
  );
}

/** Artwork, name, rarity and serial label; `compact` for gallery thumbnails. */
export function CardFront({
  card,
  compact = false,
}: {
  card: Card;
  compact?: boolean;
}) {
  return (
    <VStack
      space="xs"
      className="flex-1 overflow-hidden rounded-lg border-2 border-border bg-card"
    >
      <Box className="flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Text
            bold
            size={compact ? "xl" : "4xl"}
            className="text-muted-foreground"
          >
            {card.number}
          </Text>
        )}
      </Box>

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
    <VStack
      space="sm"
      className="flex-1 items-center justify-center rounded-lg border-2 border-sky-foreground bg-sky p-2"
    >
      {mark ? (
        <Text bold size="3xl" className="text-sky-foreground">
          {mark}
        </Text>
      ) : (
        <>
          {/* placeholder brand mark until the TCG logo arrives */}
          <Image
            source={require("@/assets/images/logo-glow.png")}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: "60%", aspectRatio: 1 }}
          />
          <Text bold className="text-sky-foreground">
            Mystery Card
          </Text>
        </>
      )}
    </VStack>
  );
}
