import { router, useLocalSearchParams } from 'expo-router';

import { OverlayCard } from '@/components/game/GameOverlay';
import { SkyBackground } from '@/components/SkyBackground';
import { Center } from '@/components/ui/center';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

/**
 * Shown after the death sequence: the run's score and what's next. The game
 * screen replaces itself with this one, so "Menu" is one step back.
 * Params: score, best (best before this run).
 */
export default function GameOverRoute() {
  const params = useLocalSearchParams<{ score?: string; best?: string }>();
  const score = Number(params.score) || 0;
  const previousBest = Number(params.best) || 0;
  const newBest = score > previousBest;

  return (
    <Center className="flex-1 bg-sky px-8">
      <SkyBackground />
      <OverlayCard
        title="Game Over"
        actions={[
          { label: 'Play again', primary: true, onPress: () => router.replace('/game') },
          { label: 'Leaderboard', onPress: () => router.replace('/leaderboard') },
          { label: 'Menu', onPress: () => router.dismissTo('/menu') },
        ]}
      >
        <VStack space="xs" className="items-center">
          <Text bold size="4xl" className="text-foreground">
            {score}
          </Text>
          <Text className="text-muted-foreground">
            {newBest ? 'New best score!' : `Best: ${Math.max(previousBest, score)}`}
          </Text>
        </VStack>
      </OverlayCard>
    </Center>
  );
}
