import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SplashBackground } from "@/components/SplashBackground";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { selectBestScore, useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

/** Main menu over the splash illustration; buttons centred on the screen. */
export default function MenuRoute() {
  const insets = useSafeAreaInsets();
  const best = useAppStore(selectBestScore);
  const displayName = useAuthStore((s) =>
    s.status === "signedIn" ? s.displayName : null,
  );
  const { musicOn, soundsOn, setMusicOn, setSoundsOn } = useSettingsStore();

  return (
    <Box className="flex-1 bg-sky">
      <SplashBackground />
      <VStack
        space="lg"
        className="flex-1 items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
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
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push("/cards")}
          >
            <ButtonText>Gyűjtemény</ButtonText>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push("/account")}
          >
            <ButtonText numberOfLines={1}>
              {displayName ? `Fiók · ${displayName}` : "Fiók"}
            </ButtonText>
          </Button>
          <HStack space="lg">
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onPress={() => setMusicOn(!musicOn)}
            >
              <ButtonText>Zene: {musicOn ? "be" : "ki"}</ButtonText>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onPress={() => setSoundsOn(!soundsOn)}
            >
              <ButtonText>Hangok: {soundsOn ? "be" : "ki"}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </Box>
  );
}
