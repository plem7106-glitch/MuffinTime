import { allCards } from './index';

export const canonicalCardCodes = allCards.map((card) => card.id);

export function buildCanonicalDeck(): string[] {
  return [...canonicalCardCodes];
}
