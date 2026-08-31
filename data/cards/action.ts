import type { Card } from '../../types/card';
import cardsData from '../cards.json';
import { mapRawCard, type RawCard } from './mapper';

export const actionCards: Card[] = (cardsData.action as RawCard[]).map((raw) =>
  mapRawCard(raw, 'action')
);
