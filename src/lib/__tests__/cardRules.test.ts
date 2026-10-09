import {
  buildGrid,
  cardsForScore,
  collectedCount,
  mergeDrawn,
  replaceOwned,
  rowToCard,
  unrevealed,
  type Card,
  type OwnedCard,
} from '../cardRules';

const card = (n: number): Card => ({
  id: `card-${n}`,
  number: n,
  name: `Kártya #${n}`,
  description: 'x',
  rarity: 'common',
  imageUrl: null,
  landingUrl: null,
  serialLabel: 'Season 1/432',
});
const owned = (id: number, n: number, revealedAt: string | null = null): OwnedCard => ({
  id,
  cardId: `card-${n}`,
  gameResultId: 1,
  slot: 1,
  revealedAt,
});

describe('cardsForScore', () => {
  it('gives one card per full 100 points, at most 3', () => {
    expect([0, 99, 100, 199, 200, 299, 300, 1000].map(cardsForScore)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('treats negative or broken scores as zero', () => {
    expect(cardsForScore(-50)).toBe(0);
    expect(cardsForScore(Number.NaN)).toBe(0);
  });
});

describe('rowToCard', () => {
  it('maps a database row to the app type', () => {
    expect(
      rowToCard({
        id: 'demagogia',
        number: 7,
        name: 'Demagógia',
        description: 'd',
        rarity: 'rare',
        image_url: 'https://x/a.png',
        landing_url: 'https://krumplisztan.hu/kartyak/abc',
        season: 1,
        serial_label: 'Season 1/432',
        enabled: true,
        created_at: '',
        updated_at: '',
      }),
    ).toEqual({
      id: 'demagogia',
      number: 7,
      name: 'Demagógia',
      description: 'd',
      rarity: 'rare',
      imageUrl: 'https://x/a.png',
      landingUrl: 'https://krumplisztan.hu/kartyak/abc',
      serialLabel: 'Season 1/432',
    });
  });
});

describe('grid', () => {
  it('lists every card by number; only revealed ones are open, duplicates change nothing', () => {
    const grid = buildGrid([card(3), card(1), card(2)], [owned(1, 2, 't'), owned(2, 2, 't'), owned(3, 3)]);
    expect(grid.map((c) => [c.card.number, c.revealed])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
  });

  it('counts distinct revealed cards that are still in the collection', () => {
    const catalog = [card(1), card(2)];
    expect(collectedCount(catalog, [owned(1, 1, 't'), owned(2, 1, 't'), owned(3, 2), owned(4, 9, 't')])).toBe(1);
  });

  it('lists the unrevealed cards oldest first', () => {
    expect(unrevealed([owned(5, 1), owned(2, 1, 't'), owned(3, 2)]).map((o) => o.id)).toEqual([3, 5]);
  });
});

describe('merging with the server', () => {
  it('replaces the local list with the server list', () => {
    expect(replaceOwned([owned(1, 1, 't'), owned(9, 9)], [owned(1, 4)], [])).toEqual([owned(1, 4)]);
  });

  it('keeps a reveal made on this device that has not reached the server yet', () => {
    expect(replaceOwned([owned(1, 1, 'local')], [owned(1, 1)], [1])).toEqual([owned(1, 1, 'local')]);
  });

  it('adds freshly drawn cards and updates the ones already known', () => {
    const merged = mergeDrawn([owned(1, 1, 't'), owned(2, 2)], [owned(2, 2, 's'), owned(3, 3)], []);
    expect(merged).toEqual([owned(1, 1, 't'), owned(2, 2, 's'), owned(3, 3)]);
  });
});
