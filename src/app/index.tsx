import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { readableOnArt, SplashBackground } from "@/components/SplashBackground";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { loadSprites } from "@/game/render/loadSprites";
import { syncEasterEggs } from "@/lib/remoteEasterEggs";
import { startBackgroundSync } from "@/lib/resultsSync";
import { useAppStore } from "@/store/useAppStore";

const MIN_SPLASH_MS = 1500;
/** Hide the native splash even if the background image never reports loaded. */
const BG_LOAD_TIMEOUT_MS = 1000;

/**
 * Opening / loading screen over the splash-bg illustration: waits for
 * persisted data, decoded sprites, the easter egg content (backend, with a
 * short timeout and offline fallbacks) and a minimum display time.
 */
export default function SplashRoute() {
  const insets = useSafeAreaInsets();
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [contentSynced, setContentSynced] = useState(false);

  useEffect(() => {
    loadSprites().then(() => setSpritesLoaded(true));
    syncEasterEggs().finally(() => setContentSynced(true));
    // player account (anonymous on first launch) + upload of results waiting on
    // this device; runs in the background (retried on foreground), the menu doesn't wait for it
    startBackgroundSync();
    const minTimer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    const splashTimer = setTimeout(
      () => SplashScreen.hideAsync(),
      BG_LOAD_TIMEOUT_MS,
    );
    return () => {
      clearTimeout(minTimer);
      clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    if (hasHydrated && spritesLoaded && contentSynced && minTimeElapsed) {
      router.replace("/menu");
    }
  }, [hasHydrated, spritesLoaded, contentSynced, minTimeElapsed]);

  return (
    <Box className="flex-1 bg-sky">
      {/* swap the native splash for this screen only once the picture is on screen */}
      <SplashBackground onDisplay={() => SplashScreen.hideAsync()} />
      <VStack
        className="flex-1 items-center justify-between px-6"
        style={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Heading
          size="3xl"
          className="text-center text-sky-foreground"
          style={readableOnArt}
        >
          Krumplisztáni Felhőfutam: Hiperventi Kalandjai
        </Heading>
        <VStack space="sm" className="items-center">
          <Spinner size="large" className="text-sky-foreground" />
          <Text className="text-sky-foreground" style={readableOnArt}>
            Loading…
          </Text>
        </VStack>
      </VStack>
    </Box>
  );
}
