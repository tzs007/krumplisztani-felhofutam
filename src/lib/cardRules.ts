/**
 * Season 1 card rules that don't need the network: how many cards a game
 * earns, the app-side types, the gallery grid, and how the server's list is
 * merged into the device's copy (the server wins, except for a reveal made on
 * this device that hasn't been sent yet).
 */
import type { Database } from './database.types';

type CardRow = Database['public']['Tables']['cards']['Row'];
type UserCardRow = Database['public']['Tables']['user_cards']['Row'];

export const MAX_CARDS_PER_GAME = 3;
export const POINTS_PER_CARD = 100;

export type Rarity = CardRow['rarity'];

export type Card = {
  id: string;
  number: number;
  name: string;
  description: string;
  rarity: Rarity;
  imageUrl: string | null;
  landingUrl: string | null;
  serialLabel: string;
};

/** One drawn copy (duplicates are separate rows). */
export type OwnedCard = {
  id: number;
  cardId: string;
  gameResultId: number;
  slot: number;
  revealedAt: string | null;
};

export type GridCell = { card: Card; revealed: boolean };

/** 100+ points → 1, 200+ → 2, 300+ → 3 (the server applies the same rule). */
export function cardsForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(MAX_CARDS_PER_GAME, Math.floor(score / POINTS_PER_CARD));
}

export function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    imageUrl: row.image_url,
    landingUrl: row.landing_url,
    serialLabel: row.serial_label,
  };
}

export function rowToOwned(row: UserCardRow): OwnedCard {
  return {
    id: row.id,
    cardId: row.card_id,
    gameResultId: row.game_result_id,
    slot: row.slot,
    revealedAt: row.revealed_at,
  };
}

export function revealedCardIds(owned: OwnedCard[]): Set<string> {
  return new Set(owned.filter((o) => o.revealedAt).map((o) => o.cardId));
}

/** Every card of the collection by number, open if any copy of it is revealed. */
export function buildGrid(catalog: Card[], owned: OwnedCard[]): GridCell[] {
  const revealed = revealedCardIds(owned);
  return [...catalog]
    .sort((a, b) => a.number - b.number)
    .map((card) => ({ card, revealed: revealed.has(card.id) }));
}

/** Distinct revealed cards (e.g. the 12 in "12/30"). */
export function collectedCount(catalog: Card[], owned: OwnedCard[]): number {
  const revealed = revealedCardIds(owned);
  return catalog.filter((c) => revealed.has(c.id)).length;
}

/** Drawn but not flipped yet, oldest first. */
export function unrevealed(owned: OwnedCard[]): OwnedCard[] {
  return owned.filter((o) => !o.revealedAt).sort((a, b) => a.id - b.id);
}

/** The server's list replaces the local one; a local reveal still being sent is kept. */
export function replaceOwned(previous: OwnedCard[], server: OwnedCard[], pendingReveals: number[]): OwnedCard[] {
  const before = new Map(previous.map((o) => [o.id, o]));
  const pending = new Set(pendingReveals);
  return server.map((o) =>
    o.revealedAt || !pending.has(o.id) ? o : { ...o, revealedAt: before.get(o.id)?.revealedAt ?? null },
  );
}

/** Adds the cards open_cards returned (and updates any already known), oldest first. */
export function mergeDrawn(previous: OwnedCard[], drawn: OwnedCard[], pendingReveals: number[]): OwnedCard[] {
  const updated = replaceOwned(previous, drawn, pendingReveals);
  const ids = new Set(updated.map((o) => o.id));
  return [...previous.filter((o) => !ids.has(o.id)), ...updated].sort((a, b) => a.id - b.id);
}
