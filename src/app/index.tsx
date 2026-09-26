import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAppStore } from '@/store/useAppStore';

const MIN_SPLASH_MS = 1500;

/** Loading screen: waits for persisted data (later: sprite atlas) and a minimum display time. */
export default function SplashRoute() {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasHydrated && minTimeElapsed) router.replace('/menu');
  }, [hasHydrated, minTimeElapsed]);

  return (
    <Center className="flex-1 bg-sky">
      <VStack space="xl" className="items-center">
        <Heading size="3xl" className="text-center text-sky-foreground">
          The Hiperventi Game
        </Heading>
        <Spinner size="large" className="text-sky-foreground" />
        <Text className="text-sky-foreground/80">Loading…</Text>
      </VStack>
    </Center>
  );
}
