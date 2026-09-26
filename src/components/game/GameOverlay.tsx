import type { ReactNode } from 'react';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

export type OverlayAction = { label: string; onPress: () => void; primary?: boolean };

type Props = { title: string; children?: ReactNode; actions: OverlayAction[] };

/** Modal-like card over the paused canvas (pause menu, game over). */
export function GameOverlay({ title, children, actions }: Props) {
  return (
    <Center className="absolute inset-0 bg-foreground/50 px-8">
      <Box className="w-full max-w-sm rounded-xl bg-card p-6">
        <VStack space="xl">
          <Heading size="2xl" className="text-center text-foreground">
            {title}
          </Heading>
          {children}
          <VStack space="md">
            {actions.map((a) => (
              <Button key={a.label} size="lg" variant={a.primary ? 'default' : 'outline'} onPress={a.onPress}>
                <ButtonText>{a.label}</ButtonText>
              </Button>
            ))}
          </VStack>
        </VStack>
      </Box>
    </Center>
  );
}
