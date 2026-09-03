import { describe, expect, it } from 'vitest';
import { isQuantityEffectCard, QUANTITY_EFFECT_CARDS } from './quantityCards';

describe('quantityCards', () => {
  it('includes a known draw/discard/steal card', () => {
    expect(isQuantityEffectCard('A006')).toBe(true);
  });

  it('excludes a known non-quantity card', () => {
    expect(isQuantityEffectCard('A119')).toBe(false); // turn-order jump
  });

  it('excludes this cluster\'s own cards', () => {
    expect(isQuantityEffectCard('A017')).toBe(false);
    expect(isQuantityEffectCard('A028')).toBe(false);
    expect(isQuantityEffectCard('A094')).toBe(false);
    expect(isQuantityEffectCard('A108')).toBe(false);
  });

  it('excludes A084 (hand swap -- doubling would cancel itself out)', () => {
    expect(isQuantityEffectCard('A084')).toBe(false);
  });

  it('QUANTITY_EFFECT_CARDS is non-empty and has the expected size', () => {
    expect(QUANTITY_EFFECT_CARDS.size).toBe(104);
  });
});
