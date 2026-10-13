import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Box } from '@/components/ui/box';

const PAPER = require('@/assets/images/paper-bg.webp');

type Props = { children?: ReactNode; className?: string; style?: StyleProp<ViewStyle> };

/** A paper-textured surface (paper-bg.webp) for list rows and info cards; layout and padding come from `className`. */
export function Paper({ children, className = '', style }: Props) {
  return (
    <Box className={`overflow-hidden ${className}`} style={style}>
      <Image source={PAPER} contentFit="cover" accessibilityIgnoresInvertColors style={StyleSheet.absoluteFill} />
      {children}
    </Box>
  );
}
