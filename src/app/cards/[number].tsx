import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_ASPECT, CardBack, CardFront, FRONT_ART_ZOOM, RarityBadge } from '@/components/cards/CardFaces';
import { MenuButton } from '@/components/MenuButton';
import { ModalPanel, panelContentWidth } from '@/components/ModalPanel';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { revealedCardIds } from '@/lib/cardRules';
import { useCardsStore } from '@/store/useCardsStore';

/** One card large (modal): artwork, text, rarity, serial label and its webshop page. */
export default function CardDetailRoute() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const card = useCardsStore((s) => s.catalog.find((c) => c.number === Number(number)));
  const owned = useCardsStore((s) => s.owned);
  const revealed = card ? revealedCardIds(owned).has(card.id) : false;
  const landingUrl = card?.landingUrl;
  // the panel runs edge to edge; the card fills the parchment inside it
  const cardWidth = Math.min(panelContentWidth(width), 320);
  const cardHeight = cardWidth / CARD_ASPECT;
  const [artAspect, setArtAspect] = useState(CARD_ASPECT);
  // the artwork fitted into the card's box at its own ratio
  const artWidth = Math.min(cardWidth, cardHeight * artAspect);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
      {/* the frame fills the whole sheet, down to its bottom edge */}
      <ModalPanel style={styles.fullPanel}>
        <VStack space="lg" className="flex-1 items-center justify-center">
          <View style={[styles.cardBox, { width: cardWidth, height: cardHeight }]}>
            {card?.imageUrl && revealed ? (
              // the artwork is the whole printed card (frame included): the frame takes the
              // image's own ratio and clips its corners, so the image itself stays square
              <View style={[styles.artFrame, { width: artWidth, height: artWidth / artAspect }]}>
                <Image
                  source={{ uri: card.imageUrl }}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                  onLoad={(e) => setArtAspect(e.source.width / e.source.height)}
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: [{ scale: FRONT_ART_ZOOM }],
                  }}
                />
              </View>
            ) : card && revealed ? (
              <CardFront card={card} />
            ) : (
              <CardBack mark="?" />
            )}
          </View>

          {!card ? (
            <Text className="text-center text-muted-foreground">Ez a kártya nem található.</Text>
          ) : revealed ? (
            <VStack space="sm" className="w-full max-w-sm items-center">
              <Text size="2xl" className="text-center font-heading text-foreground">
                {card.name}
              </Text>
              <RarityBadge rarity={card.rarity} />

              <Text className="text-center text-foreground">{card.description}</Text>
              {landingUrl && (
                <Button
                  className="mt-2 w-full"
                  onPress={() => {
                    // a double tap on iOS rejects the second call
                    WebBrowser.openBrowserAsync(landingUrl).catch(() => {});
                  }}
                >
                  <ButtonText>Megnézem a webshopban →</ButtonText>
                </Button>
              )}
            </VStack>
          ) : (
            <Text className="text-center text-muted-foreground">Még nem fedezted fel ezt a kártyát.</Text>
          )}

          <MenuButton art="close" label="Bezárás" onPress={() => router.back()} style={{ width: '70%' }} />
          {/* keep the button above the home indicator */}
          <View style={{ height: insets.bottom }} />
        </VStack>
      </ModalPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fullPanel: { flexGrow: 1, maxWidth: '100%' },
  cardBox: { alignItems: 'center', justifyContent: 'center' },
  // clips the artwork's corners; the image stays unrounded inside
  artFrame: { borderRadius: 16, overflow: 'hidden' },
});
