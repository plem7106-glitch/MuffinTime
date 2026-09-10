import { expect, it } from 'vitest';
import { buildPlayableDeck, isCardSupported } from './playableCards';
import { buildCanonicalDeck } from '../data/cards/deck';

it('keeps complete supported cards and excludes missing or partial effects', () => {
  const deck = buildPlayableDeck();
  expect(deck).toEqual(expect.arrayContaining(['A001', 'A097', 'T09', 'T06', 'C09', 'C16', 'C17']));
  for (const code of ['A064', 'A026', 'A046', 'A106', 'A025', 'A056', 'C01', 'T02', 'T23', 'T46']) {
    expect(deck).not.toContain(code);
    expect(isCardSupported(code)).toBe(false);
  }
  expect(new Set(deck).size).toBe(deck.length);
  expect(buildCanonicalDeck()).toHaveLength(289);
  console.info(`Supported deck: ${deck.length} cards`);
});
