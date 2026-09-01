import { getCardByCode } from './index';
import type { CardCode } from '../../game/types';

export interface CardDisplay {
  code: CardCode;
  type: 'action' | 'trap' | 'counter';
  th: string;
  effect: string;
  titleEn: string;
  image?: string;
  needsTarget: boolean;
}

export function getCardDisplay(code: CardCode): CardDisplay {
  const card = getCardByCode(code);
  if (!card) {
    return { code, type: code.startsWith('T') ? 'trap' : code.startsWith('C') ? 'counter' : 'action', th: code, effect: '', titleEn: code, needsTarget: false };
  }
  return {
    code: card.id,
    type: card.type,
    th: card.name_th,
    effect: card.description_th,
    titleEn: card.name_en,
    image: card.image,
    needsTarget: card.id === 'A014' || card.id === 'A016',
  };
}
