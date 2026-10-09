import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_ASPECT, CardBack, CardFront, RarityBadge } from '@/components/cards/CardFaces';
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
  const cardWidth = Math.min(width - 64, 320);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ alignItems: 'center', gap: 16, padding: 24, paddingBottom: insets.bottom + 24 }}
    >
      <View style={{ width: cardWidth, height: cardWidth / CARD_ASPECT }}>
        {card && revealed ? <CardFront card={card} /> : <CardBack mark="?" />}
      </View>

      {!card ? (
        <Text className="text-center text-muted-foreground">Ez a kártya nem található.</Text>
      ) : revealed ? (
        <VStack space="sm" className="w-full max-w-sm items-center">
          <Text bold size="2xl" className="text-center text-foreground">
            {card.name}
          </Text>
          <RarityBadge rarity={card.rarity} />
          <Text size="sm" className="text-muted-foreground">
            #{card.number} · {card.serialLabel}
          </Text>
          <Text className="text-center text-foreground">{card.description}</Text>
          {card.landingUrl && (
            <Button className="mt-2 w-full" onPress={() => WebBrowser.openBrowserAsync(card.landingUrl!)}>
              <ButtonText>Megnézem a webshopban →</ButtonText>
            </Button>
          )}
        </VStack>
      ) : (
        <Text className="text-center text-muted-foreground">Még nem fedezted fel ezt a kártyát.</Text>
      )}

      <Button variant="outline" className="w-full max-w-sm" onPress={() => router.back()}>
        <ButtonText>Bezárás</ButtonText>
      </Button>
    </ScrollView>
  );
}
