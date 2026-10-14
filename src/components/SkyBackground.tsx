import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const sky = require('@/assets/sprites/bg_sky.png');

/**
 * The game's sky backdrop (bg_sky: gradient with the cloud bank at the
 * bottom) as a full-screen background behind the screen content; covers the
 * screen keeping the clouds at the bottom edge.
 */
export function SkyBackground() {
  return (
    <Image
      source={sky}
      contentFit="cover"
      contentPosition="bottom"
      style={StyleSheet.absoluteFill}
      accessibilityIgnoresInvertColors
    />
  );
}
