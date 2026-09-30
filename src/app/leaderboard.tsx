import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { fetchBoard, localBest, OfflineError, type Board, type BoardRow } from '@/lib/leaderboard';
import { connectAndSync } from '@/lib/resultsSync';
import { useAppStore, type GameResult } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

type Tab = 'global' | 'mine';
type Load = { state: 'loading' } | { state: 'ready'; board: Board } | { state: 'offline' } | { state: 'error' };

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One row of the online top list; the own row is highlighted, and red when outside the top 10. */
function BoardRowView({ row }: { row: BoardRow }) {
  const tone = row.outside ? 'bg-destructive' : row.isMe ? 'bg-secondary' : 'bg-card';
  const text = row.outside ? 'text-sky-foreground' : 'text-foreground';
  return (
    <HStack space="md" className={`items-center rounded-md px-4 py-3 ${tone}`}>
      <Text bold className={`w-16 ${row.outside ? 'text-sky-foreground' : 'text-muted-foreground'}`}>
        #{row.rank}
      </Text>
      <Text bold={row.isMe} className={`flex-1 ${text}`} numberOfLines={1}>
        {row.name}
      </Text>
      <Text bold size="lg" className={text}>
        {row.score}
      </Text>
    </HStack>
  );
}

/** One result stored on this device (the "Saját" tab). */
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

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Button size="sm" variant={active ? 'default' : 'secondary'} className="flex-1" onPress={onPress}>
      <ButtonText>{label}</ButtonText>
    </Button>
  );
}

export default function LeaderboardRoute() {
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const authStatus = useAuthStore((s) => s.status);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('global');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const best = localBest(history);
  const load$ = useCallback(
    () =>
      // retry a failed sign-in and upload first, so the own row is up to date
      connectAndSync()
        .then(() => fetchBoard(best))
        .then(
          (board): Load => ({ state: 'ready', board }),
          (e): Load => (e instanceof OfflineError ? { state: 'offline' } : { state: 'error' }),
        ),
    [best],
  );
  const refresh = useCallback(async () => setLoad(await load$()), [load$]);

  // (re)load when opened and when the account state settles (e.g. anonymous sign-in finished)
  useEffect(() => {
    let alive = true;
    load$().then((next) => {
      if (alive) setLoad(next);
    });
    return () => {
      alive = false;
    };
  }, [load$, authStatus]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const confirmClear = () =>
    Alert.alert('Clear history?', 'All previous results on this device will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);

  const noAccount = authStatus !== 'signedIn';

  return (
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <HStack className="items-center justify-between px-4 py-3">
        <Button variant="secondary" size="sm" onPress={() => router.back()}>
          <ButtonText>Back</ButtonText>
        </Button>
        <Heading size="xl" className="text-sky-foreground">
          Leaderboard
        </Heading>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={tab !== 'mine' || history.length === 0}
          onPress={confirmClear}
        >
          <ButtonText>Clear</ButtonText>
        </Button>
      </HStack>

      <HStack space="sm" className="px-4 pb-2">
        <TabButton label="Globális" active={tab === 'global'} onPress={() => setTab('global')} />
        <TabButton label="Saját" active={tab === 'mine'} onPress={() => setTab('mine')} />
      </HStack>

      {tab === 'global' ? (
        <FlatList
          data={load.state === 'ready' ? load.board.rows : []}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor="#fff" />}
          ListHeaderComponent={
            noAccount && authStatus !== 'loading' ? (
              <HStack space="md" className="mb-2 items-center rounded-md border-l-4 border-destructive bg-card px-4 py-3">
                <Text className="flex-1 text-foreground">Az eredményeid csak a saját eszközödön jelennek meg.</Text>
                <Button size="sm" onPress={() => router.push('/account')}>
                  <ButtonText>Fiók</ButtonText>
                </Button>
              </HStack>
            ) : null
          }
          renderItem={({ item, index }) => {
            const gapBefore = load.state === 'ready' && load.board.gap && index === load.board.rows.length - 1;
            return (
              <VStack space="sm">
                {gapBefore && (
                  <Text bold className="text-center text-sky-foreground">
                    …
                  </Text>
                )}
                <BoardRowView row={item} />
              </VStack>
            );
          }}
          ListEmptyComponent={
            load.state === 'loading' ? (
              <Spinner size="large" className="mt-8 text-sky-foreground" />
            ) : (
              <Text className="mt-8 text-center text-sky-foreground">
                {load.state === 'offline'
                  ? 'Nincs kapcsolat a szerverrel — a Saját fülön látod az eredményeidet.'
                  : load.state === 'error'
                    ? 'Nem sikerült betölteni a ranglistát. Húzd le a frissítéshez.'
                    : 'Még senki nincs a ranglistán. Légy te az első!'}
              </Text>
            )
          }
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item, index }) => <ResultRow item={item} rank={index + 1} />}
          ListEmptyComponent={
            <Text className="mt-8 text-center text-sky-foreground">No games played yet. Go jump!</Text>
          }
        />
      )}
    </Box>
  );
}
