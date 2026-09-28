import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { readableOnArt, SplashBackground } from "@/components/SplashBackground";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { selectBestScore, useAppStore } from "@/store/useAppStore";

/** Main menu over the splash illustration; buttons sit below the chick. */
export default function MenuRoute() {
  const insets = useSafeAreaInsets();
  const best = useAppStore(selectBestScore);

  return (
    <Box className="flex-1 bg-sky">
      <SplashBackground />
      <VStack
        space="lg"
        className="flex-1 items-center justify-end px-8"
        style={{ paddingBottom: insets.bottom + 40 }}
      >
        {best > 0 && (
          <Text bold size="lg" className="text-sky-foreground" style={readableOnArt}>
            Best: {best}
          </Text>
        )}
        <VStack space="lg" className="w-full max-w-sm">
          <Button
            size="lg"
            variant="secondary"
            onPress={() => router.push("/game")}
          >
            <ButtonText>Start Game</ButtonText>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push("/leaderboard")}
          >
            <ButtonText>Leaderboard</ButtonText>
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
}
