import { Image } from 'expo-image';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

/** Button art cut from assets/sprite-sources/menu.png (`npm run menu-buttons`); the label is part of the art. */
const ART = {
  start: require('@/assets/images/menu/start.png'),
  leaderboard: require('@/assets/images/menu/leaderboard.png'),
  collection: require('@/assets/images/menu/collection.png'),
  account: require('@/assets/images/menu/account.png'),
  'music-on': require('@/assets/images/menu/music-on.png'),
  'music-off': require('@/assets/images/menu/music-off.png'),
  'sounds-on': require('@/assets/images/menu/sounds-on.png'),
  'sounds-off': require('@/assets/images/menu/sounds-off.png'),
  back: require('@/assets/images/menu/back.png'),
  'tab-global': require('@/assets/images/menu/tab-global.png'),
  'tab-collectors': require('@/assets/images/menu/tab-collectors.png'),
  'tab-mine': require('@/assets/images/menu/tab-mine.png'),
  // the wide ones (menu2.png)
  'open-cards': require('@/assets/images/menu/open-cards.png'),
  'play-again': require('@/assets/images/menu/play-again.png'),
  close: require('@/assets/images/menu/close.png'),
  // the account forms (buttons.png)
  'save-name': require('@/assets/images/menu/save-name.png'),
  'save-account': require('@/assets/images/menu/save-account.png'),
  'sign-in': require('@/assets/images/menu/sign-in.png'),
} as const;

export type MenuButtonArt = keyof typeof ART;

/** Width / height of the cut buttons from menu.png (about 464 × 164 px). */
export const MENU_BUTTON_ASPECT = 464 / 164;
/** The wide buttons (menu2.png, close.png) and their own width / height. */
const WIDE: Partial<Record<MenuButtonArt, number>> = {
  'open-cards': 1160 / 272,
  'play-again': 1160 / 276,
  close: 1816 / 423,
  'save-name': 1413 / 292,
  'save-account': 1413 / 290,
  'sign-in': 1413 / 292,
};

type Props = {
  art: MenuButtonArt;
  /** What the art says, for screen readers. */
  label: string;
  onPress: () => void;
  /** Faded, e.g. a tab that isn't selected. */
  dimmed?: boolean;
  /** Faded and not pressable (e.g. nothing to save, or saving). */
  disabled?: boolean;
  selected?: boolean;
  /** Width (or flex) of the button; the height follows the art. */
  style?: StyleProp<ViewStyle>;
};

/** A pixel-art menu button: sinks a little while pressed. */
export function MenuButton({ art, label, onPress, dimmed = false, disabled = false, selected, style }: Props) {
  dimmed ||= disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'tab'}
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? (disabled ? { disabled } : undefined) : { selected, disabled }}
      style={({ pressed }) => [
        { aspectRatio: WIDE[art] ?? MENU_BUTTON_ASPECT, opacity: dimmed ? 0.55 : 1 },
        pressed && { transform: [{ scale: 0.96 }], opacity: dimmed ? 0.45 : 0.85 },
        style,
      ]}
    >
      <Image source={ART[art]} contentFit="contain" accessibilityIgnoresInvertColors style={{ flex: 1 }} />
    </Pressable>
  );
}
