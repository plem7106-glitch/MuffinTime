import type { CardCode } from '../types';
import type { TrapRuleDefinition } from './types';
import { TRAP_RULES_BATCH_1, TRAP_RULES_BATCH_2 } from './definitions';

const REGISTRY: Record<string, TrapRuleDefinition> = {
  ...TRAP_RULES_BATCH_1,
  ...TRAP_RULES_BATCH_2,
};

export function getTrapRule(code: CardCode): TrapRuleDefinition | undefined {
  return REGISTRY[code];
}

export function isTrapImplemented(code: CardCode): boolean {
  return Boolean(getTrapRule(code));
}

export function getTrapStatus(code: CardCode): 'implemented' | 'not_implemented' {
  return isTrapImplemented(code) ? 'implemented' : 'not_implemented';
}

export function registerTrapRule(rule: TrapRuleDefinition): void {
  REGISTRY[rule.code] = rule;
}
