/** Built-in ids; any other string can be registered too. */
export type EffectId = 'bonus' | 'doubleScore' | 'doubleJump' | (string & {});

/** What an effect is allowed to change in the running game. */
export interface EffectContext {
  addScore(points: number): void;
  setScoreMultiplier(multiplier: number): void;
  setJumpMultiplier(multiplier: number): void;
  /** Psy mode (magic mushroom) on / off. */
  setPsy(on: boolean): void;
}

export interface EffectDefinition {
  id: EffectId;
  /** Omit for instant effects (e.g. bonus points). */
  durationMs?: number;
  apply(ctx: EffectContext): void;
  /** Called when a timed effect runs out. */
  expire?(ctx: EffectContext): void;
}

export type ActiveEffect = { id: EffectId; remainingMs: number; durationMs: number };

/**
 * Abstract pickup handler: pickups only know an EffectId, the registry maps it
 * to behaviour. Re-triggering an active timed effect refreshes its timer.
 */
export class EffectRegistry {
  private defs = new Map<EffectId, EffectDefinition>();
  private active = new Map<EffectId, { expiresAt: number; durationMs: number }>();

  constructor(private ctx: EffectContext) {}

  register(def: EffectDefinition): this {
    this.defs.set(def.id, def);
    return this;
  }

  has(id: EffectId): boolean {
    return this.defs.has(id);
  }

  trigger(id: EffectId, now: number): void {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Effect "${id}" is not registered`);
    def.apply(this.ctx);
    if (def.durationMs !== undefined) {
      this.active.set(id, { expiresAt: now + def.durationMs, durationMs: def.durationMs });
    }
  }

  /** Pushes an active timed effect's end later (e.g. by a pause that ran on the game clock). */
  extend(id: EffectId, ms: number): void {
    const a = this.active.get(id);
    if (a) a.expiresAt += ms;
  }

  tick(now: number): void {
    for (const [id, { expiresAt }] of this.active) {
      if (now >= expiresAt) {
        this.active.delete(id);
        this.defs.get(id)?.expire?.(this.ctx);
      }
    }
  }

  getActive(now: number): ActiveEffect[] {
    return [...this.active].map(([id, a]) => ({
      id,
      remainingMs: Math.max(0, a.expiresAt - now),
      durationMs: a.durationMs,
    }));
  }
}
