import { router } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MENU_BUTTON_ASPECT, MenuButton } from "@/components/MenuButton";
import { SplashBackground } from "@/components/SplashBackground";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { selectBestScore, useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";

/** The buttons' height as a part of the screen height (sizes them; the menu sits in the middle). */
const BAND_HEIGHT = 0.38;
const GAP = 1;
/** The settings toggles are this much smaller than the main buttons. */
const TOGGLE_SCALE = 0.6;

/** Main menu over the splash illustration, in the middle of the screen. */
export default function MenuRoute() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // four main buttons and the toggle row fill the band (5 gaps), at most 230 pt wide
  const rowHeight =
    (BAND_HEIGHT * height - 5 * GAP) / (4 + TOGGLE_SCALE);
  const buttonWidth = Math.min(rowHeight * MENU_BUTTON_ASPECT, 230, width - 64);
  const best = useAppStore(selectBestScore);
  const { musicOn, soundsOn, setMusicOn, setSoundsOn } = useSettingsStore();

  return (
    <Box className="flex-1 bg-sky">
      <SplashBackground />
      <VStack
        className="flex-1 items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <VStack style={{ width: buttonWidth, gap: GAP }}>
          <MenuButton
            art="start"
            label="Hajrá Csibe!"
            onPress={() => router.push("/game")}
          />
          <MenuButton
            art="leaderboard"
            label="Ranglista"
            onPress={() => router.push("/leaderboard")}
          />
          <MenuButton
            art="collection"
            label="Gyűjtemény"
            onPress={() => router.push("/cards")}
          />
          <MenuButton
            art="account"
            label="Fiók"
            onPress={() => router.push("/account")}
          />
          {/* the art shows the current setting; a tap flips it */}
          <HStack className="justify-center" style={{ gap: GAP }}>
            <MenuButton
              art={musicOn ? "music-on" : "music-off"}
              label={musicOn ? "Zene be" : "Zene ki"}
              onPress={() => setMusicOn(!musicOn)}
              style={{ width: buttonWidth * TOGGLE_SCALE }}
            />
            <MenuButton
              art={soundsOn ? "sounds-on" : "sounds-off"}
              label={soundsOn ? "Hangok be" : "Hangok ki"}
              onPress={() => setSoundsOn(!soundsOn)}
              style={{ width: buttonWidth * TOGGLE_SCALE }}
            />
          </HStack>
        </VStack>
      </VStack>
    </Box>
  );
}
