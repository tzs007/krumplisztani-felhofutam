import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_ASPECT, CardBack, CardFront } from '@/components/cards/CardFaces';
import { CardSwiper, type SwiperItem } from '@/components/cards/CardSwiper';
import { SkyBackground } from '@/components/SkyBackground';
import { readableOnArt } from '@/components/SplashBackground';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { buildGrid, collectedCount, unrevealed } from '@/lib/cardRules';
import { revealCard, syncCards, type CardSyncStatus } from '@/lib/cards';
import { useCardsStore } from '@/store/useCardsStore';

const GAP = 8;
const PADDING = 16;

/** The Season 1 collection: every card, open once revealed; tap one for its details. */
export default function CardsRoute() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const catalog = useCardsStore((s) => s.catalog);
  const owned = useCardsStore((s) => s.owned);
  const pendingClaims = useCardsStore((s) => s.pendingClaims);
  const [status, setStatus] = useState<CardSyncStatus | 'loading'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  // the cards shown in the swiper, fixed when it opens (a flipped card must not jump out of it)
  const [unboxing, setUnboxing] = useState<number[] | null>(null);

  useEffect(() => {
    let alive = true;
    syncCards().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setStatus(await syncCards());
    setRefreshing(false);
  };

  const columns = width >= 600 ? 5 : 3;
  const tileWidth = (Math.min(width, 900) - PADDING * 2 - GAP * (columns - 1)) / columns;
  const grid = buildGrid(catalog, owned);
  const waiting = unrevealed(owned);
  const swiperItems: SwiperItem[] = (unboxing ?? []).flatMap((id) => {
    const o = owned.find((x) => x.id === id);
    return o ? [{ owned: o, card: catalog.find((c) => c.id === o.cardId) }] : [];
  });

  return (
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <SkyBackground />
      <HStack className="items-center justify-between px-4 py-3">
        <Button variant="secondary" size="sm" onPress={() => router.back()}>
          <ButtonText>Vissza</ButtonText>
        </Button>
        <Heading size="xl" className="text-sky-foreground" style={readableOnArt}>
          Gyűjtemény
        </Heading>
        <View style={{ width: 64 }} />
      </HStack>

      <FlatList
        key={columns}
        data={grid}
        numColumns={columns}
        keyExtractor={(cell) => cell.card.id}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PADDING, gap: GAP, alignSelf: 'center', maxWidth: 900 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListHeaderComponent={
          <VStack space="sm" className="mb-2">
            <HStack className="items-center justify-between">
              <Box className="rounded-full bg-card px-3 py-1">
                <Text bold size="sm" className="text-foreground">
                  Season 1 Limited (30 cards)
                </Text>
              </Box>
              <Text bold className="text-sky-foreground" style={readableOnArt}>
                {collectedCount(catalog, owned)}/{catalog.length} gyűjtve
              </Text>
            </HStack>
            {(status === 'offline' || status === 'error') && (
              <Text size="sm" className="rounded-md bg-card px-3 py-2 text-foreground">
                Nincs kapcsolat — a legutóbb letöltött gyűjteményt látod.
              </Text>
            )}
            {pendingClaims.length > 0 && (
              <Text size="sm" className="rounded-md bg-card px-3 py-2 text-foreground">
                {pendingClaims.length} játék kártyái várnak — húzd le a frissítéshez.
              </Text>
            )}
            {waiting.length > 0 && (
              <Button onPress={() => setUnboxing(waiting.map((o) => o.id))}>
                <ButtonText>Bontatlan kártyák ({waiting.length})</ButtonText>
              </Button>
            )}
          </VStack>
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={!item.revealed}
            onPress={() => router.push(`/cards/${item.card.number}`)}
            accessibilityRole={item.revealed ? 'button' : undefined}
            accessibilityLabel={item.revealed ? item.card.name : 'Még nem felfedezett kártya'}
            style={{ width: tileWidth, height: tileWidth / CARD_ASPECT }}
          >
            {item.revealed ? <CardFront card={item.card} compact /> : <CardBack mark="?" />}
          </Pressable>
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <Spinner size="large" className="mt-8 text-sky-foreground" />
          ) : (
            <Text className="mt-8 text-center text-sky-foreground" style={readableOnArt}>
              Nem sikerült betölteni a kártyákat. Húzd le a frissítéshez.
            </Text>
          )
        }
      />

      {unboxing && (
        <Center className="absolute inset-0 bg-foreground/70 px-4">
          <VStack space="lg" className="w-full max-w-sm rounded-xl bg-card p-6">
            <CardSwiper items={swiperItems} onReveal={revealCard} />
            <Button onPress={() => setUnboxing(null)}>
              <ButtonText>Kész</ButtonText>
            </Button>
          </VStack>
        </Center>
      )}
    </Box>
  );
}
