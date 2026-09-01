import { describe, expect, it } from 'vitest';
import { allCards } from './index';
import { getCardDisplay } from './display';

describe('canonical runtime card display metadata', () => {
  it('resolves every canonical card without throwing', () => {
    expect(allCards).toHaveLength(289);
    for (const card of allCards) {
      const display = getCardDisplay(card.id);
      expect(display.code).toBe(card.id);
      expect(display.type).toBe(card.type);
      expect(display.th).toBe(card.name_th);
      expect(display.effect).toBe(card.description_th);
    }
  });

  it.each(['C05', 'A173', 'T66', 'C50'])('resolves %s safely', (code) => {
    expect(() => getCardDisplay(code)).not.toThrow();
    expect(getCardDisplay(code).code).toBe(code);
  });

  it('resolves every canonical Counter code for CounterModal display', () => {
    const counterCodes = allCards.filter((card) => card.type === 'counter').map((card) => card.id);
    expect(counterCodes).toHaveLength(50);
    expect(counterCodes.map((code) => getCardDisplay(code).type)).toEqual(Array(50).fill('counter'));
  });
});
