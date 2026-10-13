import type { ReactNode } from 'react';

import { MenuButton, type MenuButtonArt } from '@/components/MenuButton';
import { ModalPanel } from '@/components/ModalPanel';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

export type OverlayAction = {
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Pixel-art button to show instead of a text button (the label is then for screen readers). */
  art?: MenuButtonArt;
};

type Props = { title: string; children?: ReactNode; actions: OverlayAction[]; footer?: ReactNode };

/** Title, content and a column of buttons on the modal panel (pause menu, game over screen). */
export function OverlayCard({ title, children, actions, footer }: Props) {
  return (
    <ModalPanel>
      <VStack space="xl">
        <Heading size="2xl" className="text-center text-foreground">
          {title}
        </Heading>
        {children}
        <VStack space="md">
          {actions.map((a) =>
            a.art ? (
              <MenuButton key={a.label} art={a.art} label={a.label} onPress={a.onPress} />
            ) : (
              <Button key={a.label} size="lg" variant={a.primary ? 'default' : 'outline'} onPress={a.onPress}>
                <ButtonText>{a.label}</ButtonText>
              </Button>
            ),
          )}
        </VStack>
        {footer}
      </VStack>
    </ModalPanel>
  );
}

/** Modal-like card over the paused canvas. */
export function GameOverlay(props: Props) {
  return (
    <Center className="absolute inset-0 bg-foreground/50 px-8">
      <OverlayCard {...props} />
    </Center>
  );
}
