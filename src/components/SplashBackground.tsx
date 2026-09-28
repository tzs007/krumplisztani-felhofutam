import { Image } from "expo-image";
import { StyleSheet } from "react-native";

const background = require("@/assets/images/splash-bg.png");

/**
 * Text on top of the busy splash illustration gets a dark shadow to stay
 * readable (inline style: NativeWind has no text-shadow utilities).
 */
export const readableOnArt = {
  textShadowColor: "rgba(0, 0, 0, 0.6)",
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 6,
};

/** Full-screen splash-bg illustration (cover), placed behind the screen content. */
export function SplashBackground({ onDisplay }: { onDisplay?: () => void }) {
  return (
    <Image
      source={background}
      contentFit="cover"
      style={StyleSheet.absoluteFill}
      accessibilityIgnoresInvertColors
      onDisplay={onDisplay}
    />
  );
}
