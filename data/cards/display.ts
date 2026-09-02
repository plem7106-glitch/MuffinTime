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
    // True for any Action rule that needs a manual picker before it can
    // resolve (single target, multi-select roster, or an outcome toggle) --
    // GameTable.tsx's handleRequestTarget picks the right modal per rule.kind.
    needsTarget: Boolean(
      getActionRule(card.id)?.needsTargetSelection ||
        getActionRule(card.id)?.needsRosterSelection ||
        getActionRule(card.id)?.needsOutcomeEntry ||
        getActionRule(card.id)?.needsDualTargetSelection ||
        getActionRule(card.id)?.needsNumberInput
    ),
  };
}
