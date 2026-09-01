import { getCardByCode } from '../data/cards/index';
import type { CardCode } from './types';

export function cardTitleContains(code: CardCode, term: string): boolean {
  const title = getCardByCode(code)?.name_en;
  return Boolean(title && title.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
}
