import { router } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';

/** Back button + centred title, as on the leaderboard. */
export function ScreenHeader({ title }: { title: string }) {
  return (
    <HStack className="items-center justify-between px-4 py-3">
      <Button variant="secondary" size="sm" onPress={() => router.back()}>
        <ButtonText>Vissza</ButtonText>
      </Button>
      <Heading size="xl" className="text-sky-foreground">
        {title}
      </Heading>
      {/* keeps the title centred */}
      <Box className="w-20" />
    </HStack>
  );
}
