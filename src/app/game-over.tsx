import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameOverCards } from '@/components/cards/GameOverCards';
import { GameOverBackground } from '@/components/game/GameOverBackground';
import { OverlayCard } from '@/components/game/GameOverlay';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { playSound, stopSound } from '@/lib/audio';

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text size="sm" className="text-muted-foreground underline" onPress={onPress} accessibilityRole="link">
      {label}
    </Text>
  );
}

/**
 * Shown after the death sequence: the run's score, the cards it earned and
 * what's next. The game screen replaces itself with this one, so "Menü" is
 * one step back. Params: score, best (best before this run), resultId (the
 * run's id on this device; its cards are drawn by it).
 */
export default function GameOverRoute() {
  const params = useLocalSearchParams<{ score?: string; best?: string; resultId?: string }>();
  const insets = useSafeAreaInsets();
  const score = Number(params.score) || 0;
  const previousBest = Number(params.best) || 0;
  const newBest = score > previousBest;

  // the game over jingle (the music is off on this screen); cut it short when leaving
  useEffect(() => {
    playSound('gameOver');
    return () => stopSound('gameOver');
  }, []);

  return (
    <Box className="flex-1 bg-sky">
      <GameOverBackground score={score} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <OverlayCard
          title="Game Over"
          actions={[{ label: 'Újra játszom', primary: true, onPress: () => router.replace('/game') }]}
          footer={
            <HStack space="sm" className="justify-center">
              <FooterLink label="Ranglista" onPress={() => router.replace('/leaderboard')} />
              <Text size="sm" className="text-muted-foreground">·</Text>
              <FooterLink label="Gyűjtemény" onPress={() => router.replace('/cards')} />
              <Text size="sm" className="text-muted-foreground">·</Text>
              <FooterLink label="Menü" onPress={() => router.dismissTo('/menu')} />
            </HStack>
          }
        >
          <VStack space="xs" className="items-center">
            <Text bold size="4xl" className="text-foreground">
              {score}
            </Text>
            <Text className="text-muted-foreground">
              {newBest ? 'New best score!' : `Best: ${Math.max(previousBest, score)}`}
            </Text>
          </VStack>
          <GameOverCards resultId={params.resultId} score={score} />
        </OverlayCard>
      </ScrollView>
    </Box>
  );
}
