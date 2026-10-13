import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const ART = require("@/assets/sprite-sources/modal-bg.png");
/** Size of modal-bg.png. */
const ART_W = 906;
const ART_H = 1367;
/**
 * Nine-slice cuts in art pixels: the outer edges skip the transparent margin
 * (20 px on the sides), the inner ones sit just past the corner ornaments.
 * Only the middle stretches.
 */
const CUT_X = [20, 160, 746, 886];
const CUT_Y = [0, 170, 1177, 1367];
/** Where the parchment starts inside the frame (art pixels from each outer edge). */
const INSET = { left: 52, right: 51, top: 84, bottom: 71 };
const GAP = 28;

export const PANEL_MAX_WIDTH = 384;
const FRAME_W = CUT_X[3] - CUT_X[0];

/** The width left for content in a panel this wide. */
export function panelContentWidth(panelWidth: number) {
  return panelWidth * (1 - (INSET.left + INSET.right + 2 * GAP) / FRAME_W);
}

type Props = { children: ReactNode; style?: StyleProp<ViewStyle> };

/**
 * The gold-framed parchment behind every modal's content (pause menu, game
 * over, easter eggs, card details, unopened cards). Drawn as a nine-slice: the
 * frame scales with the panel's width and never distorts; only the parchment
 * between the corners stretches to the content's height.
 */
export function ModalPanel({ children, style }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // art pixels → screen points (the frame keeps its look at any width)
  const scale = (size.width || 340) / FRAME_W;

  return (
    <View
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      style={[
        styles.panel,
        {
          paddingLeft: (INSET.left + GAP) * scale,
          paddingRight: (INSET.right + GAP) * scale,
          paddingTop: (INSET.top + GAP) * scale,
          paddingBottom: (INSET.bottom + GAP) * scale,
        },
        style,
      ]}
    >
      {size.width > 0 && (
        <NineSlice width={size.width} height={size.height} scale={scale} />
      )}
      {children}
    </View>
  );
}

function NineSlice({
  width,
  height,
  scale,
}: {
  width: number;
  height: number;
  scale: number;
}) {
  // screen positions of the cuts: corners at the art's scale, the middle takes the rest
  const xs = [
    0,
    (CUT_X[1] - CUT_X[0]) * scale,
    width - (CUT_X[3] - CUT_X[2]) * scale,
    width,
  ];
  const ys = [
    0,
    (CUT_Y[1] - CUT_Y[0]) * scale,
    height - (CUT_Y[3] - CUT_Y[2]) * scale,
    height,
  ];

  const cells = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const w = xs[col + 1] - xs[col];
      const h = ys[row + 1] - ys[row];
      if (w <= 0 || h <= 0) continue;
      // stretch the whole art so this cell's source rectangle lands exactly on the cell
      const sx = w / (CUT_X[col + 1] - CUT_X[col]);
      const sy = h / (CUT_Y[row + 1] - CUT_Y[row]);
      cells.push(
        <View
          key={`${row}${col}`}
          style={[
            styles.cell,
            { left: xs[col], top: ys[row], width: w, height: h },
          ]}
        >
          <Image
            source={ART}
            contentFit="fill"
            accessibilityIgnoresInvertColors
            style={{
              position: "absolute",
              left: -CUT_X[col] * sx,
              top: -CUT_Y[row] * sy,
              width: ART_W * sx,
              height: ART_H * sy,
            }}
          />
        </View>,
      );
    }
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {cells}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: "100%", maxWidth: PANEL_MAX_WIDTH },
  cell: { position: "absolute", overflow: "hidden" },
});
