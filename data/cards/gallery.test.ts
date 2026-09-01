import { describe, it, expect } from 'vitest';
import {
  allCards,
  actionCards,
  trapCards,
  counterCards,
  getCardById,
  getCardsByType,
  getAdjacentCards,
} from './index';
import { CARD_TYPE_THEMES } from '../../components/card/Card';

describe('Card Library & Gallery Data Verification', () => {
  it('supplies exactly 173 Action, 66 Trap, 50 Counter, and 289 total cards', () => {
    expect(actionCards).toHaveLength(173);
    expect(trapCards).toHaveLength(66);
    expect(counterCards).toHaveLength(50);
    expect(allCards).toHaveLength(289);
  });

  it('filters cards by type accurately', () => {
    expect(getCardsByType('action')).toHaveLength(173);
    expect(getCardsByType('trap')).toHaveLength(66);
    expect(getCardsByType('counter')).toHaveLength(50);
  });

  it('retrieves representative cards for Action, Trap, and Counter correctly', () => {
    const a001 = getCardById('A001');
    expect(a001).toBeDefined();
    expect(a001?.type).toBe('action');
    expect(a001?.number).toBe(1);
    expect(a001?.name_th).toBe('ผิดบ้านแล้ว!');
    expect(a001?.name_en).toBe('Wrong House');

    const a173 = getCardById('A173');
    expect(a173).toBeDefined();
    expect(a173?.type).toBe('action');
    expect(a173?.number).toBe(173);

    const t01 = getCardById('T01');
    expect(t01).toBeDefined();
    expect(t01?.type).toBe('trap');
    expect(t01?.number).toBe(1);
    expect(t01?.name_th).toBe('มันอยู่ไหน?');

    const t66 = getCardById('T66');
    expect(t66).toBeDefined();
    expect(t66?.type).toBe('trap');
    expect(t66?.number).toBe(66);

    const c01 = getCardById('C01');
    expect(c01).toBeDefined();
    expect(c01?.type).toBe('counter');
    expect(c01?.number).toBe(1);

    const c50 = getCardById('C50');
    expect(c50).toBeDefined();
    expect(c50?.type).toBe('counter');
    expect(c50?.number).toBe(50);
  });

  it('supports search query matching by ID, Thai name, and English name', () => {
    const searchById = allCards.filter((c) => c.id.toLowerCase().includes('a001'));
    expect(searchById).toHaveLength(1);
    expect(searchById[0].id).toBe('A001');

    const searchByTh = allCards.filter((c) => c.name_th.includes('ผิดบ้าน'));
    expect(searchByTh.length).toBeGreaterThanOrEqual(1);

    const searchByEn = allCards.filter((c) => c.name_en.toLowerCase().includes('wrong house'));
    expect(searchByEn.length).toBeGreaterThanOrEqual(1);
  });

  it('has valid theme color configurations for all card types', () => {
    expect(CARD_TYPE_THEMES.action.border).toBe('border-action');
    expect(CARD_TYPE_THEMES.action.text).toBe('text-action');

    expect(CARD_TYPE_THEMES.trap.border).toBe('border-trap');
    expect(CARD_TYPE_THEMES.trap.text).toBe('text-trap');

    expect(CARD_TYPE_THEMES.counter.border).toBe('border-counter');
    expect(CARD_TYPE_THEMES.counter.text).toBe('text-counter');
  });

  it('correctly calculates adjacent cards and respects type boundaries without wrapping', () => {
    // Action Boundaries
    const a001Adj = getAdjacentCards('A001');
    expect(a001Adj.prev).toBeUndefined();
    expect(a001Adj.next?.id).toBe('A002');
    expect(a001Adj.index).toBe(1);
    expect(a001Adj.total).toBe(173);

    const a173Adj = getAdjacentCards('A173');
    expect(a173Adj.prev?.id).toBe('A172');
    expect(a173Adj.next).toBeUndefined(); // Cannot cross into Trap
    expect(a173Adj.index).toBe(173);
    expect(a173Adj.total).toBe(173);

    // Trap Boundaries
    const t01Adj = getAdjacentCards('T01');
    expect(t01Adj.prev).toBeUndefined();
    expect(t01Adj.next?.id).toBe('T02');
    expect(t01Adj.index).toBe(1);
    expect(t01Adj.total).toBe(66);

    const t66Adj = getAdjacentCards('T66');
    expect(t66Adj.prev?.id).toBe('T65');
    expect(t66Adj.next).toBeUndefined(); // Cannot cross into Counter
    expect(t66Adj.index).toBe(66);
    expect(t66Adj.total).toBe(66);

    // Counter Boundaries
    const c01Adj = getAdjacentCards('C01');
    expect(c01Adj.prev).toBeUndefined();
    expect(c01Adj.next?.id).toBe('C02');
    expect(c01Adj.index).toBe(1);
    expect(c01Adj.total).toBe(50);

    const c50Adj = getAdjacentCards('C50');
    expect(c50Adj.prev?.id).toBe('C49');
    expect(c50Adj.next).toBeUndefined();
    expect(c50Adj.index).toBe(50);
    expect(c50Adj.total).toBe(50);
  });
});
