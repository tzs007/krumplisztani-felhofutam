import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import { Center } from '@/components/ui/center';
import { Text } from '@/components/ui/text';

/** Big centred start countdown; each new label pops in. */
export function Countdown({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Center pointerEvents="none" className="absolute inset-0">
      <Animated.View key={label} entering={ZoomIn.duration(220)} exiting={FadeOut.duration(150)}>
        <Text bold className="text-8xl text-sky-foreground">
          {label}
        </Text>
      </Animated.View>
    </Center>
  );
}
