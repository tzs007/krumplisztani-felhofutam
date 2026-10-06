import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/** Game over art by score: the chick cries, plays it cool, or celebrates in a tuxedo. */
const BACKGROUNDS = [
  { from: 200, source: require('@/assets/images/200-bg.png') },
  { from: 100, source: require('@/assets/images/100-200-bg.png') },
  { from: 0, source: require('@/assets/images/0-100-bg.png') },
] as const;

/** Index into the score bands: 0 = under 100, 1 = 100–199, 2 = 200 and up. */
export function gameOverBand(score: number): 0 | 1 | 2 {
  if (score >= 200) return 2;
  if (score >= 100) return 1;
  return 0;
}

/** Full-screen game over art for the score; anchored at the bottom so the chick stays in view. */
export function GameOverBackground({ score }: { score: number }) {
  const { source } = BACKGROUNDS[2 - gameOverBand(score)];
  return (
    <Image
      source={source}
      contentFit="cover"
      contentPosition="bottom"
      style={StyleSheet.absoluteFill}
      accessibilityIgnoresInvertColors
    />
  );
}
