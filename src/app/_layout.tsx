import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider mode="light">
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="game" options={{ gestureEnabled: false }} />
          <Stack.Screen name="leaderboard" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
