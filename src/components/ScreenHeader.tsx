import { router } from 'expo-router';

import { MenuButton } from '@/components/MenuButton';
import { readableOnArt } from '@/components/SplashBackground';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';

/** Back button + centred title, at the top of the sub-screens (leaderboard, collection, account). */
export function ScreenHeader({ title }: { title: string }) {
  return (
    <HStack className="items-center justify-between px-4 py-3">
      <MenuButton art="back" label="Vissza" onPress={() => router.back()} style={{ width: 96 }} />
      <Heading size="xl" className="text-sky-foreground" style={readableOnArt}>
        {title}
      </Heading>
      {/* keeps the title centred */}
      <Box style={{ width: 96 }} />
    </HStack>
  );
}
