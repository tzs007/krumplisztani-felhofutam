import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { initAudio, setMusic, type MusicTrack } from '@/lib/audio';
import '@/global.css';

SplashScreen.preventAutoHideAsync();

/** Music per screen: the game track while playing, silence on game over, the menu track elsewhere. */
function musicFor(pathname: string): MusicTrack | null {
  if (pathname === '/game') return 'game';
  if (pathname === '/game-over') return null;
  return 'menu';
}

function useScreenMusic() {
  const pathname = usePathname();
  useEffect(() => {
    initAudio();
  }, []);
  useEffect(() => {
    setMusic(musicFor(pathname));
  }, [pathname]);
}

export default function RootLayout() {
  useScreenMusic();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider mode="light">
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="game" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game-over" />
          <Stack.Screen name="leaderboard" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="account" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
