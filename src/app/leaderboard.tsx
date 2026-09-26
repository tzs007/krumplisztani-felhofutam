import { router } from 'expo-router';
import { Alert, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAppStore, type GameResult } from '@/store/useAppStore';

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ResultRow({ item, rank }: { item: GameResult; rank: number }) {
  const best = rank === 1;
  return (
    <HStack space="md" className={`items-center rounded-md px-4 py-3 ${best ? 'bg-secondary' : 'bg-card'}`}>
      <Text bold className="w-8 text-muted-foreground">
        #{rank}
      </Text>
      <VStack className="flex-1">
        <Text bold size="lg" className="text-foreground">
          {item.score} pts
        </Text>
        <Text size="sm" className="text-muted-foreground">
          {new Date(item.playedAt).toLocaleString()} · {formatDuration(item.durationMs)}
        </Text>
      </VStack>
      <VStack className="items-end">
        <Text size="sm" className="text-muted-foreground">
          {item.platforms} platforms
        </Text>
        <Text size="sm" className="text-muted-foreground">
          {item.pickups} pickups
        </Text>
      </VStack>
    </HStack>
  );
}

export default function LeaderboardRoute() {
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const insets = useSafeAreaInsets();

  const confirmClear = () =>
    Alert.alert('Clear history?', 'All previous results will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);

  return (
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <HStack className="items-center justify-between px-4 py-3">
        <Button variant="secondary" size="sm" onPress={() => router.back()}>
          <ButtonText>Back</ButtonText>
        </Button>
        <Heading size="xl" className="text-sky-foreground">
          Leaderboard
        </Heading>
        <Button variant="secondary" size="sm" disabled={history.length === 0} onPress={confirmClear}>
          <ButtonText>Clear</ButtonText>
        </Button>
      </HStack>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item, index }) => <ResultRow item={item} rank={index + 1} />}
        ListEmptyComponent={
          <Text className="mt-8 text-center text-sky-foreground">No games played yet. Go jump!</Text>
        }
      />
    </Box>
  );
}
