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
  it('supplies exactly 138 Action, 53 Trap, 40 Counter, and 231 total cards', () => {
    expect(actionCards).toHaveLength(138);
    expect(trapCards).toHaveLength(53);
    expect(counterCards).toHaveLength(40);
    expect(allCards).toHaveLength(231);
  });

  it('filters cards by type accurately', () => {
    expect(getCardsByType('action')).toHaveLength(138);
    expect(getCardsByType('trap')).toHaveLength(53);
    expect(getCardsByType('counter')).toHaveLength(40);
  });

  it('retrieves representative cards for Action, Trap, and Counter correctly', () => {
    const a001 = getCardById('A001');
    expect(a001).toBeDefined();
    expect(a001?.type).toBe('action');
    expect(a001?.number).toBe(1);
    expect(a001?.name_th).toBe('ผิดบ้านแล้ว!');
    expect(a001?.name_en).toBe('Wrong House');

    const a138 = getCardById('A138');
    expect(a138).toBeDefined();
    expect(a138?.type).toBe('action');
    expect(a138?.number).toBe(138);

    const t01 = getCardById('T01');
    expect(t01).toBeDefined();
    expect(t01?.type).toBe('trap');
    expect(t01?.number).toBe(1);
    expect(t01?.name_th).toBe('มันอยู่ไหน?');

    const t53 = getCardById('T53');
    expect(t53).toBeDefined();
    expect(t53?.type).toBe('trap');
    expect(t53?.number).toBe(53);

    const c01 = getCardById('C01');
    expect(c01).toBeDefined();
    expect(c01?.type).toBe('counter');
    expect(c01?.number).toBe(1);

    const c40 = getCardById('C40');
    expect(c40).toBeDefined();
    expect(c40?.type).toBe('counter');
    expect(c40?.number).toBe(40);
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
    expect(a001Adj.total).toBe(138);

    const a138Adj = getAdjacentCards('A138');
    expect(a138Adj.prev?.id).toBe('A137');
    expect(a138Adj.next).toBeUndefined(); // Cannot cross into Trap
    expect(a138Adj.index).toBe(138);
    expect(a138Adj.total).toBe(138);

    // Trap Boundaries
    const t01Adj = getAdjacentCards('T01');
    expect(t01Adj.prev).toBeUndefined();
    expect(t01Adj.next?.id).toBe('T02');
    expect(t01Adj.index).toBe(1);
    expect(t01Adj.total).toBe(53);

    const t53Adj = getAdjacentCards('T53');
    expect(t53Adj.prev?.id).toBe('T52');
    expect(t53Adj.next).toBeUndefined(); // Cannot cross into Counter
    expect(t53Adj.index).toBe(53);
    expect(t53Adj.total).toBe(53);

    // Counter Boundaries
    const c01Adj = getAdjacentCards('C01');
    expect(c01Adj.prev).toBeUndefined();
    expect(c01Adj.next?.id).toBe('C02');
    expect(c01Adj.index).toBe(1);
    expect(c01Adj.total).toBe(40);

    const c40Adj = getAdjacentCards('C40');
    expect(c40Adj.prev?.id).toBe('C39');
    expect(c40Adj.next).toBeUndefined();
    expect(c40Adj.index).toBe(40);
    expect(c40Adj.total).toBe(40);
  });
});
