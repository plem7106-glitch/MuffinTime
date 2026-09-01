import type { CardCode } from '../types';
import type { TrapRuleDefinition } from './types';
import { TRAP_RULES_BATCH_1 } from './definitions';

const REGISTRY: Record<string, TrapRuleDefinition> = {
  ...TRAP_RULES_BATCH_1,
};

export function getTrapRule(code: CardCode): TrapRuleDefinition | undefined {
  return REGISTRY[code];
}

export function registerTrapRule(rule: TrapRuleDefinition): void {
  REGISTRY[rule.code] = rule;
}
