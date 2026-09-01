import { everyoneDraws, everyoneDiscards } from '../group';
import { draw, discard } from '../pile';
import { stealRandom } from '../transfer';
import { executeRandomSteal, executeAllRandomSteal } from '../primitives';
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

  // -- Family B: unconditional "everyone" effects (classification doc §Family B) --

  A145: {
    code: 'A145',
    name_en: 'Mercy Round',
    name_th: 'เมตตารอบนี้',
    description_th: 'ทุกคนดื่ม 1 อึกพร้อมกัน แล้วจั่วไพ่คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state) => everyoneDraws(state, 1, []),
  },
  A168: {
    code: 'A168',
    name_en: "Don't Drink and Drive",
    name_th: 'เมาไม่ขับ',
    description_th: 'ผู้เล่นทุกคนพูดพร้อมกันว่า "เมาไม่ขับ" แล้วจั่วไพ่คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state) => everyoneDraws(state, 1, []),
  },
  A171: {
    code: 'A171',
    name_en: 'Toast Master',
    name_th: 'ยกแก้วให้สุด',
    description_th: 'นำการชนแก้วพร้อมกันทั้งวง ทุกคนจั่วไพ่คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state) => everyoneDraws(state, 1, []),
  },
  A099: {
    code: 'A099',
    name_en: 'Mine Turtle',
    name_th: 'เต่าระเบิด',
    description_th: 'ผู้เล่นทุกคนทิ้งไพ่คนละ 3 ใบ',
    kind: 'auto',
    executeEffect: (state) => everyoneDiscards(state, 3, []),
  },
  A121: {
    code: 'A121',
    name_en: 'Yay! Cookies!',
    name_th: 'เย้! คุกกี้!',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นคนอื่นทุกคน',
    kind: 'auto',
    executeEffect: (state, frame) => executeAllRandomSteal(state, frame.actorId, 1),
  },
  A005: {
    code: 'A005',
    name_en: 'Rejects',
    name_th: 'พวกถูกทิ้ง',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นคนอื่นทุกคน จากนั้นเก็บไว้ 1 ใบ และทิ้งไพ่ที่เหลือ',
    kind: 'auto',
    // Same steal-from-all-others verb as A121, but with an extra keep-1-discard-rest
    // step applied only to the cards just stolen this turn -- not a shared resolver.
    executeEffect: (state, frame) => {
      let next = state;
      const stolen: string[] = [];
      for (const victimId of Object.keys(next.players)) {
        if (victimId === frame.actorId) continue;
        const res = executeRandomSteal(next, victimId, frame.actorId, 1);
        next = res.state;
        stolen.push(...res.stolenCards);
      }
      if (stolen.length <= 1) return next;
      return discard(next, frame.actorId, stolen.length - 1, stolen.slice(1));
    },
  },
  A132: {
    code: 'A132',
    name_en: 'Level Up',
    name_th: 'เลเวลอัป!',
    description_th: 'คุณจั่วไพ่ 2 ใบ ผู้เล่นคนอื่นทั้งหมดจั่วคนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDraws(draw(state, frame.actorId, 2), 1, [frame.actorId]),
  },
  A159: {
    code: 'A159',
    name_en: 'Round for the House',
    name_th: 'รอบปาร์ตี้',
    description_th: 'ทุกคนดื่มพร้อมกัน 1 อึก แล้วผู้เล่นคนอื่นทั้งหมดจั่วไพ่คนละ 1 ใบ คุณจั่ว 2 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDraws(draw(state, frame.actorId, 2), 1, [frame.actorId]),
  },

  // -- Family C: self-only effects (classification doc §Family C) --

  A097: {
    code: 'A097',
    name_en: 'Magical Pony',
    name_th: 'โพนี่วิเศษ',
    description_th: 'จั่วไพ่ 4 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, 4),
  },
  A101: {
    code: 'A101',
    name_en: 'Muffin Time',
    name_th: 'ถึงเวลามัฟฟิน!',
    description_th: 'จั่วไพ่ 5 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, 5),
  },
  A155: {
    code: 'A155',
    name_en: 'Order for Them',
    name_th: 'สั่งดื่มแทน',
    description_th: 'เลือกผู้เล่นอีก 1 คน สั่งให้เขาดื่มแทนคุณ 1 อึก แล้วจั่วไพ่ 2 ใบ',
    kind: 'auto',
    // The named target has no card-state effect at all (physical-only) -- no
    // target selection needed digitally, see classification doc §C1.
    executeEffect: (state, frame) => draw(state, frame.actorId, 2),
  },
  A127: {
    code: 'A127',
    name_en: 'My Lemons',
    name_th: 'มะนาวของฉัน',
    description_th: 'ทิ้งไพ่ 4 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => discard(state, frame.actorId, 4),
  },
  A056: {
    code: 'A056',
    name_en: 'Let You Go',
    name_th: 'ปล่อยนายไป',
    description_th: 'ทิ้งไพ่ใบใดก็ได้ที่คุณไม่ต้องการ',
    kind: 'auto',
    // ponytail: card text lets the player pick which/how many cards to discard;
    // no "select own cards" UI exists yet, so this discards 1 random card.
    // Upgrade to a real picker if this undersells the card in practice.
    executeEffect: (state, frame) => discard(state, frame.actorId, 1),
  },

  // A091 "I'm A Doctor" (Family C3) intentionally NOT included here -- needs a
  // "cards lost since your last turn" counter that requires touching
  // game/turn.ts's advanceTurn (a file under active concurrent edits). Add in
  // a dedicated follow-up once that's coordinated.
};
