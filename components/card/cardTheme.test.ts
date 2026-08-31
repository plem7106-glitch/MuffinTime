import { describe, it, expect } from 'vitest';
import { CARD_TYPE_THEMES } from './Card';
import { getCardById, actionCards, trapCards, counterCards, allCards } from '../../data/cards/index';

describe('Card Component & Presentation Theme', () => {
  it('defines distinct themes for action, trap, and counter', () => {
    expect(CARD_TYPE_THEMES.action.label).toBe('ACTION');
    expect(CARD_TYPE_THEMES.action.border).toBe('border-action');
    expect(CARD_TYPE_THEMES.action.text).toBe('text-action');

    expect(CARD_TYPE_THEMES.trap.label).toBe('TRAP');
    expect(CARD_TYPE_THEMES.trap.border).toBe('border-trap');
    expect(CARD_TYPE_THEMES.trap.text).toBe('text-trap');

    expect(CARD_TYPE_THEMES.counter.label).toBe('COUNTER');
    expect(CARD_TYPE_THEMES.counter.border).toBe('border-counter');
    expect(CARD_TYPE_THEMES.counter.text).toBe('text-counter');
  });

  it('supplies valid sample cards for How To Play page', () => {
    const actionSample = getCardById('A001');
    const trapSample = getCardById('T01');
    const counterSample = getCardById('C01');

    expect(actionSample).toBeDefined();
    expect(actionSample?.type).toBe('action');
    expect(actionSample?.name_th).toBe('ผิดบ้านแล้ว!');

    expect(trapSample).toBeDefined();
    expect(trapSample?.type).toBe('trap');
    expect(trapSample?.name_th).toBe('มันอยู่ไหน?');

    expect(counterSample).toBeDefined();
    expect(counterSample?.type).toBe('counter');
    expect(counterSample?.name_th).toBe('เด็กกับปืนสองกระบอก');

    expect(actionCards.length).toBe(138);
    expect(trapCards.length).toBe(53);
    expect(counterCards.length).toBe(40);
    expect(allCards.length).toBe(231);
  });
});
