import { allCards, getCardById } from '../data/cards/index';
import { getActionRule } from './actionRules/registry';
import { isCounterImplemented } from './counterRules/registry';
import { getTrapRule } from './trapRules/registry';

// These definitions still substitute random choices or omit part of the card text.
// Keep them out of new games until the corresponding interaction is implemented.
const PARTIAL_ACTIONS = new Set([
  'A003', 'A010', 'A026', 'A029', 'A039', 'A046', 'A047', 'A051',
  'A056', 'A063', 'A079', 'A106', 'A116', 'A120',
]);

export function isCardSupported(code: string): boolean {
  const card = getCardById(code);
  if (card?.type === 'action') {
    const rule = getActionRule(code);
    return Boolean(rule && (rule.kind !== 'no_op' || code === 'A109') && !PARTIAL_ACTIONS.has(code));
  }
  if (card?.type === 'counter') return isCounterImplemented(code);
  if (card?.type === 'trap') {
    const rule = getTrapRule(code);
    // Event-based traps need the live event/reaction bridge, which is not wired yet.
    return Boolean(rule && rule.mode !== 'automatic_event' && !(rule.mode === 'automatic_state' && rule.needsTargetSelection));
  }
  return false;
}

export function buildPlayableDeck(): string[] {
  return allCards.filter(card => isCardSupported(card.id)).map(card => card.id);
}
