import { describe, expect, it } from 'vitest';
import { allCards } from '../../data/cards/index';
import { getCounterStatus, getPlayableCounters, isCounterImplemented } from './registry';

describe('counter capability registry', () => {
  it('classifies every canonical Counter without using a throwing resolver', () => {
    const counters = allCards.filter((card) => card.type === 'counter');
    expect(counters).toHaveLength(50);
    for (const card of counters) {
      expect(['implemented', 'not_implemented']).toContain(getCounterStatus(card.id));
      expect(typeof isCounterImplemented(card.id)).toBe('boolean');
    }
  });

  it('offers only implemented and eligible Counters', () => {
    expect(getPlayableCounters(['C05', 'C06', 'C09'], { kind: 'trap', code: 'T01' })).toEqual(['C09']);
    expect(getPlayableCounters(['C05', 'C06', 'C17'], { kind: 'action', code: 'A001' })).toEqual(['C17']);
  });
});
