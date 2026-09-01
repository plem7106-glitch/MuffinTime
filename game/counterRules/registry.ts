import { getCardsByType } from '../../data/cards/index';
import type { CardCode } from '../types';

export type CounterStatus = 'implemented' | 'not_implemented';
const IMPLEMENTED_COUNTERS = new Set<CardCode>(['C09', 'C16', 'C17']);

export function isCounterImplemented(code: CardCode): boolean { return IMPLEMENTED_COUNTERS.has(code); }
export function getCounterStatus(code: CardCode): CounterStatus { return isCounterImplemented(code) ? 'implemented' : 'not_implemented'; }
export function isCounterEligible(code: CardCode, pending: { kind: 'action' | 'trap'; code: CardCode }): boolean {
  if (!isCounterImplemented(code)) return false;
  if (code === 'C09') return pending.kind === 'trap';
  if (code === 'C17') return pending.kind === 'action';
  return code === 'C16';
}
export function getPlayableCounters(hand: CardCode[], pending: { kind: 'action' | 'trap'; code: CardCode } | null): CardCode[] {
  if (!pending) return [];
  const canonicalCounters = new Set(getCardsByType('counter').map((card) => card.id));
  return hand.filter((code) => canonicalCounters.has(code) && isCounterEligible(code, pending));
}
