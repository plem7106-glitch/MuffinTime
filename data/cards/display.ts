import { getCardByCode } from './index';
import { getActionRule } from '../../game/actionRules/registry';
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
    // Single-select target flow only -- roster_select/outcome_entry Action kinds
    // need their own UI wiring (added alongside the first card that uses them).
    needsTarget: getActionRule(card.id)?.needsTargetSelection === true,
  };
}
