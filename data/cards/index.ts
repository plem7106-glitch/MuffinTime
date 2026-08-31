import type { Card, CardType } from '../../types/card';
import { actionCards } from './action';
import { trapCards } from './trap';
import { counterCards } from './counter';

export * from '../../types/card';
export { actionCards } from './action';
export { trapCards } from './trap';
export { counterCards } from './counter';
export { getCardImagePath } from './mapper';

export const allCards: Card[] = [
  ...actionCards,
  ...trapCards,
  ...counterCards,
];

// Pre-built index for O(1) ID lookups
const cardsById = new Map<string, Card>(
  allCards.map((card) => [card.id, card])
);

export function getCardById(id: string): Card | undefined {
  return cardsById.get(id);
}

export function getCardsByType(type: CardType): Card[] {
  switch (type) {
    case 'action':
      return actionCards;
    case 'trap':
      return trapCards;
    case 'counter':
      return counterCards;
  }
}

export function getCardsByCategory(category: string): Card[] {
  return allCards.filter((card) => card.category === category);
}

export interface AdjacentCards {
  prev?: Card;
  next?: Card;
  index: number;
  total: number;
}

export function getAdjacentCards(cardOrId: Card | string): AdjacentCards {
  const card = typeof cardOrId === 'string' ? getCardById(cardOrId) : cardOrId;
  if (!card) {
    return { prev: undefined, next: undefined, index: 0, total: 0 };
  }
  const list = getCardsByType(card.type);
  const currentIndex = list.findIndex((c) => c.id === card.id);
  return {
    prev: currentIndex > 0 ? list[currentIndex - 1] : undefined,
    next: currentIndex >= 0 && currentIndex < list.length - 1 ? list[currentIndex + 1] : undefined,
    index: currentIndex >= 0 ? currentIndex + 1 : 0,
    total: list.length,
  };
}

