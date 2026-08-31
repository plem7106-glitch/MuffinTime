import { describe, it, expect } from 'vitest';
import {
  allCards,
  actionCards,
  trapCards,
  counterCards,
  getCardById,
  getCardsByType,
  getCardsByCategory,
  getCardImagePath,
} from './index';

describe('Card Data Layer (data/cards)', () => {
  it('has correct card counts across all categories', () => {
    expect(actionCards).toHaveLength(138);
    expect(trapCards).toHaveLength(53);
    expect(counterCards).toHaveLength(40);
    expect(allCards).toHaveLength(231);
  });

  it('contains no duplicate card IDs and matches total count', () => {
    const idSet = new Set(allCards.map((c) => c.id));
    expect(idSet.size).toBe(231);
  });

  it('has complete bilingual content and valid type for every card', () => {
    for (const card of allCards) {
      expect(card.id).toBeTruthy();
      expect(typeof card.number).toBe('number');
      expect(card.number).toBeGreaterThan(0);
      expect(['action', 'trap', 'counter']).toContain(card.type);
      expect(card.name_en.trim()).toBeTruthy();
      expect(card.name_th.trim()).toBeTruthy();
      expect(card.description_en.trim()).toBeTruthy();
      expect(card.description_th.trim()).toBeTruthy();
    }
  });

  it('correctly maps Action card A001 and A138', () => {
    const a001 = getCardById('A001');
    expect(a001).toBeDefined();
    expect(a001?.id).toBe('A001');
    expect(a001?.number).toBe(1);
    expect(a001?.type).toBe('action');
    expect(a001?.name_en).toBe('Wrong House');
    expect(a001?.name_th).toBe('ผิดบ้านแล้ว!');

    const a138 = getCardById('A138');
    expect(a138).toBeDefined();
    expect(a138?.number).toBe(138);
    expect(a138?.type).toBe('action');
  });

  it('correctly maps Trap card T01 and T53 with Thai descriptions', () => {
    const t01 = getCardById('T01');
    expect(t01).toBeDefined();
    expect(t01?.id).toBe('T01');
    expect(t01?.number).toBe(1);
    expect(t01?.type).toBe('trap');
    expect(t01?.name_en).toBe('Where Is It?');
    expect(t01?.name_th).toBe('มันอยู่ไหน?');
    expect(t01?.description_th).toBe('ซ่อนของบางอย่างที่เป็นของผู้เล่นคนอื่น หากผู้เล่นคนนั้นถามว่าของอยู่ไหน ให้เขาทิ้งไพ่ 3 ใบ');
    expect(t01?.description_en).toContain('Hide something belonging to another player');

    const t53 = getCardById('T53');
    expect(t53).toBeDefined();
    expect(t53?.number).toBe(53);
    expect(t53?.type).toBe('trap');
  });

  it('correctly maps Counter card C01 and C40', () => {
    const c01 = getCardById('C01');
    expect(c01).toBeDefined();
    expect(c01?.id).toBe('C01');
    expect(c01?.number).toBe(1);
    expect(c01?.type).toBe('counter');
    expect(c01?.name_en).toBe('Baby with Two Guns');

    const c40 = getCardById('C40');
    expect(c40).toBeDefined();
    expect(c40?.number).toBe(40);
    expect(c40?.type).toBe('counter');
    expect(c40?.name_en).toBe('Opposite Day');
  });

  it('returns undefined when querying non-existent card ID', () => {
    expect(getCardById('Z999')).toBeUndefined();
  });

  it('filters cards by type accurately', () => {
    const actions = getCardsByType('action');
    expect(actions).toHaveLength(138);
    expect(actions.every((c) => c.type === 'action')).toBe(true);

    const traps = getCardsByType('trap');
    expect(traps).toHaveLength(53);
    expect(traps.every((c) => c.type === 'trap')).toBe(true);

    const counters = getCardsByType('counter');
    expect(counters).toHaveLength(40);
    expect(counters.every((c) => c.type === 'counter')).toBe(true);
  });

  it('safely handles getCardsByCategory when categories are not yet assigned', () => {
    const result = getCardsByCategory('unassigned');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('correctly maps deterministic card image paths with getCardImagePath', () => {
    expect(getCardImagePath('action', 'A001')).toBe('/cards/action/A001.jpg');
    expect(getCardImagePath('action', 'A138')).toBe('/cards/action/A138.jpg');
    expect(getCardImagePath('trap', 'T01')).toBe('/cards/trap/T01.jpg');
    expect(getCardImagePath('trap', 'T53')).toBe('/cards/trap/T53.jpg');
    expect(getCardImagePath('counter', 'C01')).toBe('/cards/counter/C01.jpg');
    expect(getCardImagePath('counter', 'C40')).toBe('/cards/counter/C40.jpg');
  });

  it('assigns valid image paths to all 231 runtime Card objects', () => {
    for (const card of allCards) {
      expect(card.image).toBe(`/cards/${card.type}/${card.id}.jpg`);
    }
  });
});
