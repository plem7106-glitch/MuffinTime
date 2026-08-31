import type { Card } from '../../types/card';
import cardsData from '../cards.json';
import { mapRawCard, type RawCard } from './mapper';

export const trapCards: Card[] = (cardsData.trap as RawCard[]).map((raw) =>
  mapRawCard(raw, 'trap')
);
