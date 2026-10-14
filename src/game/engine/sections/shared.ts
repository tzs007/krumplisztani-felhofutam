import type { EasterEggItemDef, GameConfig } from '../../config';
import { getEasterEggs } from '../../easterEggs';
import type { ParsedHazard, ParsedPickup, ParsedPlatform } from '../../level/parser';
import { platformSpriteKey, type PlatformVariant } from '../../level/tiles';
import { touchesBox } from '../collide';
import type { Burst, CollectedPickup, EasterEggItem, GameEvent, Hazard, Pickup, Platform, Player } from '../entities';
import type { RunContext } from './Section';

/**
 * Rules and builders shared by the level sections. `columns` set = the level
 * wraps around horizontally (vertical section); null = a plain strip (side section).
 */

/** How far a "hover" item floats above its platform (like pickups). */
export const HOVER_LIFT = 0.15;
/** How long a collected pickup is remembered for its collect animation. */
export const COLLECTED_TTL_MS = 1500;
/** How far pickups and hazards float above the tile they were authored on. */
const ITEM_LIFT = 0.15;

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** The in-level object of an easter egg: its own `item` fields over the config default. */
export function easterEggItemDef(eggId: string, config: GameConfig): EasterEggItemDef {
  const own = getEasterEggs().find((e) => e.id === eggId)?.item;
  return { ...config.easterEggs.defaultItem, ...own };
}

/** A fresh chick standing at (x, y). */
export function createPlayer(config: GameConfig, x: number, y: number, vx = 0): Player {
  const { widthTiles: w, heightTiles: h } = config.player;
  return {
    x,
    y,
    w,
    h,
    vx,
    vy: 0,
    facing: 1,
    bonusUntil: 0,
    bonusSpriteKey: null,
    landedAt: -Infinity,
    apexY: y,
    targetOffset: 0,
    hurtAt: -Infinity,
  };
}

/** A take-off from where the chick is now: upward speed, and the jump's clock and apex restart. */
export function takeOff(p: Player, vy: number, time: number) {
  p.vy = vy;
  p.landedAt = time;
  p.apexY = p.y;
}

// ── chunk → entities (x0, y0: where the chunk's bottom-left corner sits in the level) ──

export function platformFrom(pl: ParsedPlatform, id: number, x0: number, y0: number, theme?: PlatformVariant | null): Platform {
  return {
    id,
    x: x0 + pl.col,
    y: y0 + pl.row + 1,
    width: pl.width,
    variant: theme ?? pl.variant,
    spriteKey: theme ? platformSpriteKey(theme) : pl.spriteKey,
  };
}

export function pickupFrom(pk: ParsedPickup, id: number, x0: number, y0: number): Pickup {
  return {
    id,
    x: x0 + pk.col + (1 - pk.size) / 2,
    y: y0 + pk.row + ITEM_LIFT,
    size: pk.size,
    effect: pk.effect,
    spriteKey: pk.spriteKey,
    bob: pk.bob,
  };
}

export function hazardFrom(hz: ParsedHazard, id: number, x0: number, y0: number): Hazard {
  const baseY = y0 + hz.row + ITEM_LIFT;
  return {
    id,
    x: x0 + hz.col + (1 - hz.size) / 2,
    y: baseY,
    baseY,
    size: hz.size,
    spriteKey: hz.spriteKey,
    // out of sync with each other, deterministic per id
    phase: (id * 2.399) % (2 * Math.PI),
  };
}

// ── step rules ──

/** Takes the pickups the chick touches (those `canTake` allows); returns the ones left. */
export function collectPickups(
  pickups: Pickup[],
  collected: CollectedPickup[],
  p: Player,
  run: RunContext,
  columns: number | null,
  events: GameEvent[],
  canTake: (pk: Pickup) => boolean = () => true,
): Pickup[] {
  return pickups.filter((pk) => {
    if (!canTake(pk) || !touchesBox(p, pk.x, pk.y, pk.size, columns)) return true;
    run.effects.trigger(pk.effect, run.time);
    p.bonusUntil = run.time + run.config.player.bonusPoseMs;
    p.bonusSpriteKey = pk.spriteKey;
    run.stats.pickups++;
    collected.push({ ...pk, collectedAt: run.time });
    events.push({ type: 'pickup', effect: pk.effect });
    return false;
  });
}

/** Finds the memes the chick touches; returns the ones left. */
export function collectEasterEggs(
  eggs: EasterEggItem[],
  p: Player,
  run: RunContext,
  columns: number | null,
  events: GameEvent[],
): EasterEggItem[] {
  return eggs.filter((egg) => {
    if (!touchesBox(p, egg.x, egg.y, egg.size, columns)) return true;
    run.stats.easterEggs++;
    events.push({ type: 'easterEgg', eggId: egg.eggId });
    return false;
  });
}

/** Hazards hover up and down; touching one costs points (then brief invulnerability). */
export function stepHazards(
  hazards: Hazard[],
  p: Player,
  run: RunContext,
  columns: number | null,
  invulnerable: boolean,
  events: GameEvent[],
) {
  const hz = run.config.hazards;
  for (const h of hazards) {
    h.y = h.baseY + ((1 - Math.cos((run.time / 1000) * hz.bobHz * 2 * Math.PI + h.phase)) / 2) * hz.bobTiles;
  }
  if (invulnerable) return;
  const hit = hazards.find((h) => {
    const box = h.size * hz.hitboxScale;
    const inset = (h.size - box) / 2;
    return touchesBox(p, h.x + inset, h.y + inset, box, columns);
  });
  if (hit) {
    run.addScore(-hz.damage);
    p.hurtAt = run.time;
    run.stats.hits++;
    events.push({ type: 'hit', damage: hz.damage });
  }
}

/** Drops the milestone bursts and collect animations that have finished. */
export function cullEffects(section: { bursts: Burst[]; collected: CollectedPickup[] }, time: number, config: GameConfig) {
  const maxLife = config.milestones.lifeMs * 1.2;
  section.bursts = section.bursts.filter((b) => time - b.startedAt < maxLife);
  section.collected = section.collected.filter((c) => time - c.collectedAt < COLLECTED_TTL_MS);
}
