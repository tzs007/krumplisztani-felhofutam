import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { playSound } from '@/lib/audio';
import type { Card } from '@/lib/cardRules';

import { CARD_ASPECT, CardBack, CardFront } from './CardFaces';

export const FLIP_MS = 350;

type Props = {
  /** Unknown (e.g. the collection isn't downloaded yet): only the back, can't be flipped. */
  card?: Card;
  revealed: boolean;
  width: number;
  /** Only the artwork on the front, without the rarity and serial label. */
  artOnly?: boolean;
  onReveal: () => void;
};

/** A card that turns from its back to its front around the Y axis when tapped. */
export function FlipCard({ card, revealed, width, artOnly, onReveal }: Props) {
  const turn = useSharedValue(revealed ? 1 : 0);

  useEffect(() => {
    turn.set(withTiming(revealed ? 1 : 0, { duration: FLIP_MS }));
  }, [revealed, turn]);

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(turn.get(), [0, 1], [0, 180])}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(turn.get(), [0, 1], [180, 360])}deg` }],
  }));

  const canFlip = !revealed && card !== undefined;
  const flip = () => {
    if (!canFlip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('card');
    onReveal();
  };

  return (
    <Pressable
      onPress={flip}
      accessibilityRole="button"
      accessibilityLabel={revealed && card ? card.name : 'Mystery Card, koppints a felfordításhoz'}
      style={{ width, height: width / CARD_ASPECT }}
    >
      <Animated.View style={[styles.face, backStyle]}>
        <CardBack />
      </Animated.View>
      {card && (
        <Animated.View
          style={[styles.face, frontStyle]}
          accessibilityElementsHidden={!revealed}
          importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        >
          <CardFront card={card} artOnly={artOnly} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: 'hidden',
    // a small shadow that turns with the card
    borderRadius: 12,
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.3)',
  },
});
