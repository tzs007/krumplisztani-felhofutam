import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { ActiveEffect } from '@/game/engine/effects/EffectRegistry';

const effectLabels: Record<string, string> = {
  doubleScore: '×2 SCORE',
  doubleJump: '×2 JUMP',
};

type Props = {
  score: number;
  effects: ActiveEffect[];
  topInset: number;
  onPause: () => void;
};

export function Hud({ score, effects, topInset, onPause }: Props) {
  return (
    <Box pointerEvents="box-none" className="absolute inset-x-0 top-0 px-3" style={{ paddingTop: topInset + 8 }}>
      <HStack pointerEvents="box-none" className="items-start justify-between">
        <Pressable
          onPress={onPause}
          accessibilityRole="button"
          accessibilityLabel="Pause"
          className="h-12 w-12 items-center justify-center rounded-lg bg-sky-foreground"
        >
          <HStack space="xs">
            <Box className="h-5 w-1.5 rounded-sm bg-sky" />
            <Box className="h-5 w-1.5 rounded-sm bg-sky" />
          </HStack>
        </Pressable>
        <VStack pointerEvents="none" space="xs" className="items-center">
          <Text bold size="3xl" className="text-sky-foreground">
            {score}
          </Text>
          {effects.map((e) => (
            <Text key={e.id} bold size="xs" className="text-sky-foreground">
              {effectLabels[e.id] ?? e.id} {Math.ceil(e.remainingMs / 1000)}s
            </Text>
          ))}
        </VStack>
        <Box className="h-12 w-12" />
      </HStack>
    </Box>
  );
}
