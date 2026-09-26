/**
 * Game palette (Skia canvas). Indices are referenced by the render snapshot,
 * so append new colors at the end.
 */
export const palette = [
  '#2E8BEA', // 0 sky
  '#FFFFFF', // 1 cloud / placeholder frame
  '#6CC24A', // 2 grass top
  '#C77B3F', // 3 grass dirt
  '#4F8DF5', // 4 blue top
  '#1F3F8F', // 5 blue body
  '#C8462F', // 6 brick
  '#7E2A1C', // 7 brick mortar
  '#F7C325', // 8 coin
  '#A24BE0', // 9 double score
  '#26D4E0', // 10 double jump
  '#3BAA3B', // 11 player body
  '#1E5E1E', // 12 player placeholder lines
  '#DCEEFF', // 13 cloud shade
] as const;

export const Color = {
  sky: 0,
  cloud: 1,
  grassTop: 2,
  grassBody: 3,
  blueTop: 4,
  blueBody: 5,
  brickTop: 6,
  brickBody: 7,
  coin: 8,
  doubleScore: 9,
  doubleJump: 10,
  player: 11,
  playerLines: 12,
  cloudShade: 13,
} as const;
