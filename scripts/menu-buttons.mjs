/**
 * Cuts the menu button sheets (assets/sprite-sources/menu.png, menu2.png, close.png and buttons.png:
 * grids of labelled buttons on transparency) into one image per button in
 * assets/images/menu/, each trimmed to its own opaque pixels.
 *
 *   npm run menu-buttons
 *
 * Re-run after updating a sheet. Buttons are read row by row, left to right.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pngjs from "pngjs";

const { PNG } = pngjs;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets/images/menu");

/** Each sheet and the names of its buttons, by grid row. */
const SHEETS = [
  {
    file: "menu.png",
    names: [
      ["start", "leaderboard", "collection"],
      ["account", "music-off", "music-on"],
      ["sounds-off", "sounds-on", "back"],
      ["tab-global", "tab-collectors", "tab-mine"],
    ],
  },
  { file: "menu2.png", names: [["open-cards"], ["play-again"]] },
  { file: "close.png", names: [["close"]] },
  // buttons.webp converted with: sips -s format png buttons.webp --out buttons.png
  { file: "buttons.png", names: [["save-name"], ["save-account"], ["sign-in"]] },
];
const SOLID = 16; // alpha above this counts as part of a button

function cutSheet({ file, names: NAMES }) {
  const sheet = PNG.sync.read(
    readFileSync(join(ROOT, "assets/sprite-sources", file)),
  );
  const { width, height, data } = sheet;
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];

  /** Runs of rows (or columns) that contain any opaque pixel. */
  function bands(length, crossLength, solidAt) {
    const runs = [];
    let start = -1;
    for (let i = 0; i <= length; i++) {
      let solid = false;
      for (let j = 0; i < length && j < crossLength && !solid; j++)
        solid = solidAt(i, j);
      if (solid && start < 0) start = i;
      if (!solid && start >= 0) {
        if (i - start > 10) runs.push([start, i - 1]);
        start = -1;
      }
    }
    return runs;
  }

  const rows = bands(height, width, (y, x) => alpha(x, y) > SOLID);
  const cols = bands(width, height, (x, y) => alpha(x, y) > SOLID);
  if (rows.length !== NAMES.length || cols.length !== NAMES[0].length) {
    throw new Error(
      `${file}: expected a ${NAMES[0].length} × ${NAMES.length} grid, found ${cols.length} × ${rows.length}`,
    );
  }

  rows.forEach(([top, bottom], r) =>
    cols.forEach(([left, right], c) => {
      // trim the cell to its own opaque pixels
      let x0 = right,
        x1 = left,
        y0 = bottom,
        y1 = top;
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++)
          if (alpha(x, y) > SOLID) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
      PNG.bitblt(sheet, out, x0, y0, out.width, out.height, 0, 0);
      const target = join(OUT_DIR, `${NAMES[r][c]}.png`);
      writeFileSync(target, PNG.sync.write(out));
      console.log(`${NAMES[r][c]}.png  ${out.width} × ${out.height}`);
    }),
  );
}

mkdirSync(OUT_DIR, { recursive: true });
SHEETS.forEach(cutSheet);
