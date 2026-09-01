import { everyoneDraws, everyoneDiscards } from '../group';
import { draw, discard } from '../pile';
import { stealRandom } from '../transfer';
import type { ActionRuleDefinition } from './types';

/**
 * Batch 1 — cards migrated from the old `lib/demoCards.ts` hardcoded switch.
 * Kept behaviorally identical (same primitives, same call shapes) so the
 * existing registry.test.ts assertions keep passing unchanged.
 */
export const ACTION_RULES_BATCH_1: Record<string, ActionRuleDefinition> = {
  A001: {
    code: 'A001',
    name_en: 'Wrong House',
    name_th: 'ผิดบ้านแล้ว!',
    description_th: 'ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ จั่วไพ่คนละ 2 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDraws(state, 2, [frame.actorId]),
  },

  A004: {
    code: 'A004',
    name_en: 'Parallel Universe',
    name_th: 'จักรวาลคู่ขนาน',
    description_th: 'จั่วไพ่เพิ่มเท่ากับจำนวนไพ่ที่คุณมีอยู่ในมือตอนนี้',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, state.players[frame.actorId].hand.length),
  },

  A008: {
    code: 'A008',
    name_en: 'Throw The Cheese',
    name_th: 'ปาชีส!',
    description_th: 'ผู้เล่นคนอื่นทั้งหมดทิ้งไพ่คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDiscards(state, 1, [frame.actorId]),
  },

  A014: {
    code: 'A014',
    name_en: 'Pull My Finger',
    name_th: 'ดึงนิ้วฉันสิ',
    description_th: 'เลือกผู้เล่น 1 คนให้ขโมยไพ่จากมือคุณ 1 ใบ',
    kind: 'auto',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่จากมือคุณ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      return stealRandom(state, frame.actorId, targetId, 1);
    },
  },

  A016: {
    code: 'A016',
    name_en: "Take 'Em Out",
    name_th: 'จัดการมัน!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้งไพ่ทั้งหมดในมือ',
    kind: 'auto',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      return discard(state, targetId, state.players[targetId].hand.length);
    },
  },
};
