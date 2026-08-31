import type { Card } from '../../types/card';
import cardsData from '../cards.json';
import { mapRawCard, type RawCard } from './mapper';

export const counterCards: Card[] = (cardsData.counter as RawCard[]).map((raw) =>
  mapRawCard(raw, 'counter')
);
