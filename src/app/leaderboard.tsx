import { router } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MenuButton, type MenuButtonArt } from "@/components/MenuButton";
import { Paper } from "@/components/Paper";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkyBackground } from "@/components/SkyBackground";
import { readableOnArt } from "@/components/SplashBackground";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useLoad } from "@/hooks/useLoad";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { fetchCollectors } from "@/lib/collectors";
import {
  fetchBoard,
  localBest,
  OfflineError,
  type Board,
  type BoardRow,
} from "@/lib/leaderboard";
import { connectAndSync } from "@/lib/resultsSync";
import { useAppStore, type GameResult } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCardsStore } from "@/store/useCardsStore";

type Tab = "global" | "collectors" | "mine";
type OnlineTab = Exclude<Tab, "mine">;
const TABS: { id: Tab; art: MenuButtonArt; label: string }[] = [
  { id: "global", art: "tab-global", label: "Mindenki" },
  { id: "collectors", art: "tab-collectors", label: "Gyűjtők" },
  { id: "mine", art: "tab-mine", label: "Saját" },
];
type Load =
  | { state: "loading" }
  | { state: "ready"; board: Board; tab: OnlineTab }
  | { state: "offline" }
  | { state: "error" };

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One row of the online top list; the own row is highlighted, and red when outside the top 10. */
function BoardRowView({
  row,
  suffix = "",
}: {
  row: BoardRow;
  suffix?: string;
}) {
  const text = row.outside ? "text-sky-foreground" : "text-foreground";
  const Row = row.outside ? HStack : Paper;
  // outside the top 10: red; the own row inside it: paper with a gold edge
  const tone = row.outside
    ? "bg-destructive"
    : row.isMe
      ? "border-2 border-amber-500"
      : "";
  return (
    <Row className={`flex-row items-center gap-3 rounded-md px-4 py-3 ${tone}`}>
      <Text
        bold
        className={`w-16 pt-2 ${row.outside ? "text-sky-foreground" : "text-muted-foreground"}`}
      >
        #{row.rank}
      </Text>
      <Text bold={row.isMe} className={`pt-2 flex-1 ${text}`} numberOfLines={1}>
        {row.name}
      </Text>
      <Text bold size="lg" className={`pt-2 ${text}`}>
        {row.score}
        {suffix}
      </Text>
    </Row>
  );
}

/** One result stored on this device (the "Saját" tab). */
function ResultRow({ item, rank }: { item: GameResult; rank: number }) {
  const best = rank === 1;
  return (
    <Paper
      className={`flex-row items-center gap-3 rounded-md px-4 py-3 ${best ? "border-2 border-amber-500" : ""}`}
    >
      <Text bold className="w-8 text-muted-foreground">
        #{rank}
      </Text>
      <VStack className="flex-1">
        <Text bold size="lg" className="text-foreground">
          {item.score} pts
        </Text>
        <Text size="sm" className="text-muted-foreground">
          {new Date(item.playedAt).toLocaleString()} ·{" "}
          {formatDuration(item.durationMs)}
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
    </Paper>
  );
}

export default function LeaderboardRoute() {
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const authStatus = useAuthStore((s) => s.status);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("global");
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const best = localBest(history);
  const onlineTab: OnlineTab = tab === "collectors" ? "collectors" : "global";
  const totalCards = useCardsStore((s) => s.catalog.length) || 30;
  const load$ = useCallback(
    () =>
      // retry a failed sign-in and upload first, so the own row is up to date
      connectAndSync()
        .then(() =>
          onlineTab === "collectors" ? fetchCollectors() : fetchBoard(best),
        )
        .then(
          (board): Load => ({ state: "ready", board, tab: onlineTab }),
          (e): Load =>
            e instanceof OfflineError
              ? { state: "offline" }
              : { state: "error" },
        ),
    [best, onlineTab],
  );
  // (re)load when opened and when the account state settles (e.g. anonymous sign-in finished)
  useLoad(load$, setLoad, [load$, authStatus]);
  const pull = usePullRefresh(async () => setLoad(await load$()));

  const board =
    load.state === "ready" && load.tab === onlineTab ? load.board : null;
  const noAccount = authStatus !== "signedIn";

  return (
    <Box
      className="flex-1 bg-sky"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <SkyBackground />
      <ScreenHeader title="Ranglista" />

      <HStack space="sm" className="px-4 pb-2">
        {TABS.map((t) => (
          <MenuButton
            key={t.id}
            art={t.art}
            label={t.label}
            selected={tab === t.id}
            dimmed={tab !== t.id}
            onPress={() => setTab(t.id)}
            style={{ flex: 1 }}
          />
        ))}
      </HStack>

      {tab !== "mine" ? (
        <FlatList
          data={board?.rows ?? []}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl {...pull} tintColor="#fff" />
          }
          ListHeaderComponent={
            noAccount && authStatus !== "loading" ? (
              <Paper className="mb-2 flex-row items-center gap-3 rounded-md border-l-4 border-destructive px-4 py-3">
                <Text className="flex-1 text-foreground">
                  Az eredményeid csak a saját eszközödön jelennek meg.
                </Text>
                <Button size="sm" onPress={() => router.push("/account")}>
                  <ButtonText>Fiók</ButtonText>
                </Button>
              </Paper>
            ) : null
          }
          renderItem={({ item, index }) => {
            const gapBefore = board?.gap && index === board.rows.length - 1;
            return (
              <VStack space="sm">
                {gapBefore && (
                  <Text
                    bold
                    className="text-center text-sky-foreground"
                    style={readableOnArt}
                  >
                    …
                  </Text>
                )}
                <BoardRowView
                  row={item}
                  suffix={tab === "collectors" ? `/${totalCards}` : ""}
                />
              </VStack>
            );
          }}
          ListEmptyComponent={
            load.state === "loading" || (load.state === "ready" && !board) ? (
              <Spinner size="large" className="mt-8 text-sky-foreground" />
            ) : (
              <Text
                className="mt-8 text-center text-sky-foreground"
                style={readableOnArt}
              >
                {load.state === "offline"
                  ? "Nincs kapcsolat a szerverrel — a Saját fülön látod az eredményeidet."
                  : load.state === "error"
                    ? "Nem sikerült betölteni a ranglistát. Húzd le a frissítéshez."
                    : tab === "collectors"
                      ? "Még senki nem fedezett fel kártyát. Légy te az első!"
                      : "Még senki nincs a ranglistán. Légy te az első!"}
              </Text>
            )
          }
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item, index }) => (
            <ResultRow item={item} rank={index + 1} />
          )}
          ListEmptyComponent={
            <Text
              className="mt-8 text-center text-sky-foreground"
              style={readableOnArt}
            >
              Még nem játszottál még egy játékot sem. Hajrá Csibe!
            </Text>
          }
        />
      )}
    </Box>
  );
}
