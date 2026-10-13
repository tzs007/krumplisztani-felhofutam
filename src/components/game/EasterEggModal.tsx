import { Image, type ImageSource } from 'expo-image';
import type { ReactNode } from 'react';

import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

import { GameOverlay } from './GameOverlay';

export const DEFAULT_EASTER_EGG_HEADING = 'Easter egg-et találtál! 🎃';
export const DEFAULT_CONTINUE_LABEL = 'Tovább';

export type EasterEggModalProps = {
  /** Main text of the find (e.g. the meme's name). */
  title: string;
  /** Called by the continue button; the game resumes. */
  onContinue: () => void;
  /** Card heading; defaults to DEFAULT_EASTER_EGG_HEADING. */
  heading?: string;
  description?: string;
  /** Optional picture (require(...) or { uri }), shown above the title. */
  image?: ImageSource | number;
  /** Aspect ratio (width / height) of the image box; default 1. */
  imageAspectRatio?: number;
  continueLabel?: string;
  /** Any extra custom content, rendered below the description. */
  children?: ReactNode;
};

/**
 * "You found an easter egg" card. Knows nothing about the game or the meme
 * list: everything it shows comes in through props.
 */
export function EasterEggModal({
  title,
  onContinue,
  heading = DEFAULT_EASTER_EGG_HEADING,
  description,
  image,
  imageAspectRatio = 1,
  continueLabel = DEFAULT_CONTINUE_LABEL,
  children,
}: EasterEggModalProps) {
  return (
    <GameOverlay title={heading} actions={[{ label: continueLabel, primary: true, onPress: onContinue }]}>
      <VStack space="sm" className="items-center">
        {image !== undefined && (
          <Image
            source={image}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', aspectRatio: imageAspectRatio }}
          />
        )}
        <Text size="xl" className="text-center font-heading text-foreground">
          {title}
        </Text>
        {description ? <Text className="text-center text-muted-foreground">{description}</Text> : null}
        {children}
      </VStack>
    </GameOverlay>
  );
}
