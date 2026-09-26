import type { EffectDefinition } from './EffectRegistry';

export const addBonus = (points: number): EffectDefinition => ({
  id: 'bonus',
  apply: (ctx) => ctx.addScore(points),
});

export const doubleScore = (durationMs: number): EffectDefinition => ({
  id: 'doubleScore',
  durationMs,
  apply: (ctx) => ctx.setScoreMultiplier(2),
  expire: (ctx) => ctx.setScoreMultiplier(1),
});

export const doubleJumpHeight = (durationMs: number): EffectDefinition => ({
  id: 'doubleJump',
  durationMs,
  apply: (ctx) => ctx.setJumpMultiplier(2),
  expire: (ctx) => ctx.setJumpMultiplier(1),
});
