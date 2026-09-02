import type { TrapRuleDefinition, TrapTriggerResult } from './types';
import {
  executeDiscard,
  executeAllDiscard,
  executeDiscardDownTo,
  executeRandomSteal,
  executeDraw,
  executeAllRandomSteal,
} from '../primitives';
import { GAME_EVENT_TYPES, type ForcedDiscardPayload, type CardStolenPayload } from '../events';
import { getCardByCode } from '../../data/cards/index';
import type { CardCode } from '../types';
import { resolveActionEffect } from '../actionRules/registry';
import { cloneState } from '../util';

/**
 * Reusable steal trigger evaluator for T04 and T05.
 */
function checkStealTrigger(ownerId: string, event?: { type: string; payload: unknown }): TrapTriggerResult {
  if (!event || event.type !== GAME_EVENT_TYPES.CARD_STOLEN) {
    return { triggered: false };
  }
  const payload = event.payload as CardStolenPayload;
  if (payload.victimId === ownerId && payload.thiefId !== ownerId) {
    return {
      triggered: true,
      triggerPlayerIds: [payload.thiefId],
      note: `Player ${payload.thiefId} stole ${payload.count} cards from ${ownerId}`,
    };
  }
  return { triggered: false };
}

/**
 * Reusable forced-discard trigger evaluator for T02 and T03.
 */
function checkForcedDiscardTrigger(ownerId: string, event?: { type: string; payload: unknown }): TrapTriggerResult {
  if (!event || event.type !== GAME_EVENT_TYPES.FORCED_DISCARD) {
    return { triggered: false };
  }
  const payload = event.payload as ForcedDiscardPayload;
  if (payload.victimId === ownerId && payload.actorId !== ownerId) {
    return {
      triggered: true,
      triggerPlayerIds: [payload.actorId],
      customPayload: { count: payload.count },
      note: `Player ${payload.actorId} forced ${ownerId} to discard ${payload.count} cards`,
    };
  }
  return { triggered: false };
}

function checkBabyPlayTrigger(event?: { type: string; payload: unknown }): TrapTriggerResult {
  if (!event || event.type !== GAME_EVENT_TYPES.ACTION_PLAYED) return { triggered: false };
  const payload = event.payload as { actorId?: string; actionCode?: string };
  const title = payload.actionCode ? getCardByCode(payload.actionCode)?.name_en ?? '' : '';
  if (!payload.actorId || !title.toLowerCase().includes('baby')) return { triggered: false };
  return { triggered: true, triggerPlayerIds: [payload.actorId], note: `Card title matched baby: ${title}` };
}

function manualStealRule(code: CardCode, name_en: string, name_th: string, description_th: string, count = 3): TrapRuleDefinition {
  return { code, name_en, name_th, mode: 'manual_honor', description_th, needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่ทำเงื่อนไขกับดัก',
    resolveAffectedPlayers: (_state, _ownerId, ids) => ids,
    executeEffect: (state, frame) => executeRandomSteal(state, frame.affectedPlayerIds?.[0] ?? frame.targetIds[0] ?? '', frame.actorId, count).state };
}

const TRAP_RULES_BATCH_3_MANUAL: Record<string, TrapRuleDefinition> = {
  T22: manualStealRule('T22', 'Bad Direction', 'บอกผิดแล้ว', 'หากผู้เล่นคนอื่นเข้าใจกฎผิด ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ'),
  T24: manualStealRule('T24', 'Best Sarcasm', 'ประชดเก่ง', 'หากผู้เล่นคนอื่นพูดประชด ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ'),
  T25: manualStealRule('T25', 'Comedy', 'ตลกดีนะ', 'หากผู้เล่นคนอื่นหัวเราะออกมาดัง ๆ ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ'),
  T26: manualStealRule('T26', 'Goodbye, World', 'ลาก่อน โลกนี้', 'หากผู้เล่นคนอื่นออกจากห้อง ขโมยไพ่จากผู้เล่นคนนั้น 5 ใบ', 5),
  T27: { ...manualStealRule('T27', "Don't Think About Cats", 'อย่าคิดถึงแมว', 'หากผู้เล่นคนอื่นพูดถึงแมว ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ'), executeEffect: (state, frame) => executeDiscard(state, frame.affectedPlayerIds?.[0] ?? frame.targetIds[0] ?? '', 3).state },
  T28: manualStealRule('T28', 'Friends', 'เพื่อน', 'หากผู้เล่นคนอื่นพูดถึงเพื่อนที่ไม่ได้กำลังเล่นเกมอยู่ ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ'),
};

export const TRAP_RULES_BATCH_1: Record<string, TrapRuleDefinition> = {
  ...TRAP_RULES_BATCH_3_MANUAL,
  // T01 — Where Is It? (มันอยู่ไหน?)
  T01: {
    code: 'T01',
    name_en: 'Where Is It?',
    name_th: 'มันอยู่ไหน?',
    mode: 'manual_honor',
    description_th: 'ซ่อนของบางอย่างที่เป็นของผู้เล่นคนอื่น หากผู้เล่นคนนั้นถามว่าของอยู่ไหน ให้เขาทิ้งไพ่ 3 ใบ',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่ถามว่าของอยู่ไหน',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeDiscard(state, targetId, 3).state;
    },
  },

  // T02 — Sniper Pug (ปั๊กสไนเปอร์)
  T02: {
    code: 'T02',
    name_en: 'Sniper Pug',
    name_th: 'ปั๊กสไนเปอร์',
    mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นบังคับให้คุณทิ้งไพ่ ผู้เล่นคนอื่นทั้งหมดต้องทิ้งไพ่คนละ 1 ใบ',
    checkTrigger: (_state, ownerId, event) => checkForcedDiscardTrigger(ownerId, event),
    resolveAffectedPlayers: (state, ownerId) => Object.keys(state.players).filter((id) => id !== ownerId),
    executeEffect: (state, frame) => {
      // All other players except the Trap owner discard 1 card
      return executeAllDiscard(state, 1, [frame.actorId]);
    },
  },

  // T03 — That's a Shame (น่าเสียดายจัง)
  T03: {
    code: 'T03',
    name_en: "That's a Shame",
    name_th: 'น่าเสียดายจัง',
    mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นบังคับให้คุณทิ้งไพ่ ผู้เล่นทุกคนต้องทิ้งไพ่ในจำนวนเท่ากันด้วย',
    checkTrigger: (_state, ownerId, event) => checkForcedDiscardTrigger(ownerId, event),
    resolveAffectedPlayers: (state) => Object.keys(state.players),
    executeEffect: (state, frame) => {
      const count = Number(frame.customPayload?.count ?? 1);
      return executeAllDiscard(state, count);
    },
  },

  // T04 — Nice To Me (ดีกับฉันหน่อย)
  T04: {
    code: 'T04',
    name_en: 'Nice To Me',
    name_th: 'ดีกับฉันหน่อย',
    mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นขโมยไพ่จากคุณ ผู้เล่นคนนั้นต้องทิ้งไพ่ 5 ใบ',
    checkTrigger: (_state, ownerId, event) => checkStealTrigger(ownerId, event),
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeDiscard(state, targetId, 5).state;
    },
  },

  // T05 — Needles (เข็ม)
  T05: {
    code: 'T05',
    name_en: 'Needles',
    name_th: 'เข็ม',
    mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นขโมยไพ่ของคุณ ผู้เล่นคนนั้นต้องทิ้งไพ่ 5 ใบ',
    checkTrigger: (_state, ownerId, event) => checkStealTrigger(ownerId, event),
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeDiscard(state, targetId, 5).state;
    },
  },

  // T06 — Inappropriate (ไม่สุภาพเลยนะ)
  T06: {
    code: 'T06',
    name_en: 'Inappropriate',
    name_th: 'ไม่สุภาพเลยนะ',
    mode: 'manual_honor',
    description_th: 'หากผู้เล่นคนอื่นพูดคำหยาบ ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่พูดคำหยาบ',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeRandomSteal(state, targetId, frame.actorId, 3).state;
    },
  },

  // T07 — Did Somebody Say _____? (เมื่อกี้ใครพูดว่า _____?)
  T07: {
    code: 'T07',
    name_en: 'Did Somebody Say _____?',
    name_th: 'เมื่อกี้ใครพูดว่า _____?',
    mode: 'manual_honor',
    description_th: 'หากคุณหลอกให้ผู้เล่นคนอื่นพูดซ้ำสิ่งที่คุณพูดได้สำเร็จ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่พูดซ้ำสิ่งที่คุณพูด',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeDiscard(state, targetId, 3).state;
    },
  },

  // T08 — 日本語テキスト (ข้อความภาษาญี่ปุ่น)
  T08: {
    code: 'T08',
    name_en: '日本語テキスト',
    name_th: 'ข้อความภาษาญี่ปุ่น',
    mode: 'manual_honor',
    description_th: 'หากคุณหลอกให้ผู้เล่นคนอื่นพูดอะไรบางอย่างเป็นภาษาต่างประเทศได้สำเร็จ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่พูดภาษาต่างประเทศ',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeDiscard(state, targetId, 3).state;
    },
  },

  // T09 — Card Sick (เมาไพ่)
  T09: {
    code: 'T09',
    name_en: 'Card Sick',
    name_th: 'เมาไพ่',
    mode: 'automatic_state',
    description_th: 'ทันทีที่คุณมีไพ่มากกว่า 10 ใบ ให้ทิ้งไพ่ส่วนที่เกิน 10 ใบ',
    checkTrigger: (state, ownerId) => {
      const player = state.players[ownerId];
      if (player && player.hand.length > 10) {
        return {
          triggered: true,
          triggerPlayerIds: [ownerId],
          customPayload: { excess: player.hand.length - 10 },
          note: `${ownerId} holds ${player.hand.length} cards (exceeds 10)`,
        };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, ownerId) => [ownerId],
    executeEffect: (state, frame) => {
      return executeDiscardDownTo(state, frame.actorId, 10).state;
    },
  },

  // T10 — Just Friends (เป็นแค่เพื่อนกันนะ)
  T10: {
    code: 'T10',
    name_en: 'Just Friends',
    name_th: 'เป็นแค่เพื่อนกันนะ',
    mode: 'interactive',
    description_th: 'ชวนผู้เล่นคนอื่นไปเดตกับคุณ หากเขาปฏิเสธ ขโมยไพ่จากเขา 3 ใบ',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่คุณต้องการชวนไปเดต',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId) return state;
      return executeRandomSteal(state, targetId, frame.actorId, 3).state;
    },
  },

  ...([
    ['T11', ['A Robbery', 'นี่คือการปล้น!', 'โทรหาผู้เล่นคนอื่น หากเขารับสาย ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่รับสาย', 'steal']],
    ['T13', ['Caught You', 'จับได้แล้ว!', 'หากผู้เล่นคนอื่นจับได้ว่าคุณกำลังโกหก ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่จับได้ว่าคุณโกหก', 'steal']],
    ['T14', ['What Time Is It?', 'กี่โมงแล้ว?', 'หากผู้เล่นคนอื่นถามเวลา ขโมยไพ่จากผู้เล่นคนนั้น 4 ใบ', 4, 'เลือกผู้เล่นที่ถามเวลา', 'steal']],
    ['T15', ['Catch!', 'รับนะ!', 'หากผู้เล่นคนอื่นรับสิ่งของที่คุณโยนให้ได้ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่รับสิ่งของ', 'discard']],
    ['T16', ['Do a Book', 'เปิดตำราหน่อย', 'หากผู้เล่นคนอื่นเปิดดูกฎของเกม ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่เปิดดูกฎ', 'discard']],
    ['T17', ['We There Yet?', 'ยังไม่จบอีกเหรอ?', 'หากผู้เล่นคนอื่นบ่นว่าเกมใช้เวลานานเกินไป ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่บ่นว่าเกมนานเกินไป', 'steal']],
    ['T18', ['Crybaby', 'ขี้บ่น', 'หากผู้เล่นคนอื่นบ่น ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่บ่น', 'steal']],
    ['T19', ['Who Ate This?', 'ใครกินเนี่ย?', 'หากผู้เล่นคนอื่นกินอาหาร ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่กินอาหาร', 'steal']],
    ['T20', ['Farting Butt', 'ก้นตด', 'หากผู้เล่นคนอื่นตด เรอ ไอ หรือจาม ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่ทำพฤติกรรมตามการ์ด', 'steal']],
  ].reduce((rules, [code, values]) => {
    const [name_en, name_th, description_th, count, targetPrompt, effect] = values as string[];
    rules[code as string] = {
      code: code as string, name_en, name_th, mode: 'manual_honor', description_th,
      needsTargetSelection: true, targetPrompt,
      resolveAffectedPlayers: (_state: any, _ownerId: string, triggerPlayerIds: string[]) => triggerPlayerIds,
      executeEffect: (state: any, frame: any) => {
        const targets = frame.affectedPlayerIds ?? frame.targetIds;
        let next = state;
        for (const targetId of targets) {
          const result = effect === 'discard'
            ? executeDiscard(next, targetId, Number(count))
            : executeRandomSteal(next, targetId, frame.actorId, Number(count));
          next = result.state;
        }
        return next;
      },
    };
    return rules;
  }, {} as Record<string, TrapRuleDefinition>)),

  T12: {
    code: 'T12', name_en: 'Gullible', name_th: 'หลอกง่ายจัง', mode: 'manual_honor',
    description_th: 'สร้างสิ่งเบี่ยงเบนความสนใจ แล้วขโมยไพ่ 1 ใบจากผู้เล่นทุกคนที่คุณหลอกสำเร็จ',
    needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นทุกคนที่คุณหลอกสำเร็จ',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      let next = state;
      for (const targetId of frame.affectedPlayerIds ?? frame.targetIds) {
        next = executeRandomSteal(next, targetId, frame.actorId, 1).state;
      }
      return next;
    },
  },

  T21: {
    code: 'T21', name_en: "Don't Cry", name_th: 'อย่าร้องสิ', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นบังคับให้คุณทิ้งไพ่ ผู้เล่นคนนั้นต้องทิ้งไพ่ในจำนวนเท่ากันด้วย',
    checkTrigger: (_state, ownerId, event) => checkForcedDiscardTrigger(ownerId, event),
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => executeDiscard(state, frame.actorId, Number(frame.customPayload?.count ?? 0)).state,
  },
  T23: {
    code: 'T23', name_en: 'You Fool', name_th: 'เจ้าโง่!', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นถูกบังคับให้ทิ้งไพ่ ให้นำไพ่ที่เขาทิ้งมาเป็นของคุณ',
    checkTrigger: (_state, _ownerId, event) => event?.type === GAME_EVENT_TYPES.FORCED_DISCARD
      ? { triggered: true, triggerPlayerIds: [(event.payload as ForcedDiscardPayload).victimId] } : { triggered: false },
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const cards = Array.isArray(frame.customPayload?.cardCodes) ? frame.customPayload.cardCodes as string[] : [];
      if (cards.length === 0) return state;
      const next = { ...state, discardPile: [...state.discardPile], players: { ...state.players } };
      const owner = { ...next.players[frame.actorId], hand: [...next.players[frame.actorId].hand] };
      for (const code of cards) {
        const index = next.discardPile.indexOf(code);
        if (index >= 0) { next.discardPile.splice(index, 1); owner.hand.push(code); }
      }
      next.players[frame.actorId] = owner;
      return next;
    },
  },
  T29: {
    code: 'T29', name_en: 'Love you, Baby', name_th: 'รักนะ เบบี๋', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นเล่นไพ่ที่มีคำว่า “baby” อยู่ในชื่อ ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ',
    checkTrigger: (_state, _ownerId, event) => checkBabyPlayTrigger(event),
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => executeRandomSteal(state, frame.affectedPlayerIds?.[0] ?? '', frame.actorId, 3).state,
  },
  T30: {
    code: 'T30', name_en: 'Baby on Fire', name_th: 'เด็กไฟลุก', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นเล่นไพ่ที่มีคำว่า “baby” อยู่ในชื่อ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ',
    checkTrigger: (_state, _ownerId, event) => checkBabyPlayTrigger(event),
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => executeDiscard(state, frame.affectedPlayerIds?.[0] ?? '', 3).state,
  },
};

const MANUAL_DISCARD_TRAPS: [string, string, string, string, number, string][] = [
  ['T33', 'Backstories', 'เรื่องเก่าเล่าใหม่', 'หากผู้เล่นคนอื่นพูดถึงเหตุการณ์ที่เกิดขึ้นนานกว่า 1 ปีที่แล้ว ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่พูดถึงเหตุการณ์เกิน 1 ปีที่แล้ว'],
  ['T34', 'Inanimate Object', 'วัตถุไร้ชีวิต', 'หากผู้เล่นคนอื่นปฏิเสธที่จะตอบคำถามของคุณ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่ปฏิเสธที่จะตอบคำถาม'],
  ['T35', 'LOL Out Loud', 'หัวเราะออกมาดังๆ', 'หากผู้เล่นคนอื่นพูดว่า “Muffin Time” ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่พูดว่า Muffin Time'],
  ['T36', 'Magic Word', 'คำวิเศษ', 'หากผู้เล่นคนอื่นพูดว่า “please” ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่พูดว่า please'],
  ['T37', 'Named This Way', 'ชื่อนี้ที่เธอเรียก', 'หากผู้เล่นคนอื่นเรียกชื่อจริงของคุณ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่เรียกชื่อจริงของคุณ'],
  ['T40', 'Tired?', 'เหนื่อยไหม?', 'หากผู้เล่นคนอื่นหาว ผู้เล่นคนนั้นต้องทิ้งไพ่ 4 ใบ', 4, 'เลือกผู้เล่นที่หาว'],
  ['T41', 'Countdown', 'นับถอยหลัง', 'หากผู้เล่นคนอื่นถามว่าคุณมีไพ่กี่ใบ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่ถามจำนวนไพ่ของคุณ'],
  ['T44', 'Do An Internet', 'เล่นเน็ตซะหน่อย', 'หากคุณจับได้ว่าผู้เล่นคนอื่นกำลังใช้อินเทอร์เน็ต ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่กำลังใช้อินเทอร์เน็ต'],
  ['T47', 'High Five', 'ไฮไฟว์!', 'หากคุณไฮไฟว์กับผู้เล่นคนอื่นได้สำเร็จ ผู้เล่นคนนั้นต้องทิ้งไพ่ 5 ใบ', 5, 'เลือกผู้เล่นที่ไฮไฟว์กับคุณ'],
  ['T48', 'Made Ya Jump', 'สะดุ้งเลยดิ', 'หากคุณทำให้ผู้เล่นคนอื่นตกใจได้สำเร็จ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่ตกใจ'],
  ['T49', 'What?!', 'อะไรนะ?!', 'หากคุณหลอกให้ผู้เล่นคนอื่นพูดว่า “what” ได้สำเร็จ ผู้เล่นคนนั้นต้องทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่พูดว่า what'],
  ['T50', "Don't Touch", 'อย่าแตะนะ!', 'วางไพ่ใบนี้คว่ำหน้าไว้ที่ใดก็ได้ หากผู้เล่นคนอื่นหยิบไพ่ใบนี้ขึ้นมา ผู้เล่นคนนั้นต้องทิ้งไพ่ 5 ใบ', 5, 'เลือกผู้เล่นที่หยิบหรือจับการ์ดใบนี้'],
  ['T55', 'Spill It', 'ทำหกซะแล้ว', 'หากผู้เล่นคนอื่นทำเครื่องดื่มหกแม้แต่หยดเดียว ผู้เล่นคนนั้นทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่ทำเครื่องดื่มหก'],
  ['T58', 'Leaning Tower', 'หอเอน', 'หากผู้เล่นคนอื่นเอนตัวหรือล้มลงกับที่นั่ง ผู้เล่นคนนั้นทิ้งไพ่ 4 ใบ', 4, 'เลือกผู้เล่นที่เอนตัวหรือล้มลง'],
  ['T60', 'Giggle Fit', 'หลุดขำ', 'หากผู้เล่นคนอื่นหัวเราะโดยไม่มีเหตุผลชัดเจน ผู้เล่นคนนั้นทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่หัวเราะโดยไม่มีเหตุผล'],
  ['T63', 'Solo Dance', 'เต้นคนเดียว', 'หากผู้เล่นคนอื่นเริ่มเต้นโดยไม่มีใครขอ ผู้เล่นคนนั้นทิ้งไพ่ 3 ใบ', 3, 'เลือกผู้เล่นที่เริ่มเต้น'],
  ['T64', 'Too Loud', 'เสียงดังเกินไป', 'หากผู้เล่นคนอื่นพูดเสียงดังผิดปกติ ผู้เล่นคนนั้นทิ้งไพ่ 2 ใบ', 2, 'เลือกผู้เล่นที่พูดเสียงดังผิดปกติ'],
  ['T65', 'Wobbly Legs', 'ขาเปลี้ย', 'หากผู้เล่นคนอื่นลุกขึ้นยืนแล้วเซ ผู้เล่นคนนั้นทิ้งไพ่ 4 ใบ', 4, 'เลือกผู้เล่นที่ลุกขึ้นยืนแล้วเซ'],
];

const MANUAL_STEAL_TRAPS: [string, string, string, string, number, string][] = [
  ['T38', "If You're Happy", 'ถ้ารู้สึกมีความสุข', 'หากผู้เล่นคนอื่นร้องเพลงออกมาดัง ๆ ขโมยไพ่จากผู้เล่นคนนั้น 3 ใบ', 3, 'เลือกผู้เล่นที่ร้องเพลงออกมาดัง ๆ'],
  ['T51', 'Hello There', 'สวัสดีทักทาย', 'พูด “hello” กับผู้เล่นคนอื่น หากเขาพูด “hello” ตอบกลับมา ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่พูด hello ตอบกลับมา'],
  ['T54', 'Slurred Speech', 'พูดไม่ชัด', 'หากผู้เล่นคนอื่นพูดคำผิดเพราะเมา ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่พูดคำผิด'],
  ['T56', 'Drunk Texting', 'ส่งข้อความตอนเมา', 'หากผู้เล่นคนอื่นหยิบโทรศัพท์ขึ้นมาระหว่างเกม ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่หยิบโทรศัพท์ขึ้นมา'],
  ['T57', 'Forgot My Turn', 'ลืมเทิร์น', 'หากผู้เล่นคนอื่นสับสนว่าถึงตาใคร ขโมยไพ่จากเขา 2 ใบ', 2, 'เลือกผู้เล่นที่สับสนว่าถึงตาใคร'],
  ['T59', 'Say That Again?', 'พูดอีกทีสิ', 'หากผู้เล่นคนอื่นถามคำถามเดิมซ้ำภายในไม่กี่นาที ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่ถามคำถามเดิมซ้ำ'],
  ['T61', 'Sloppy Hugs', 'กอดกันหน่อย', 'หากผู้เล่นคนอื่นกอดใครก็ตามระหว่างเกม ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่กอดใครก็ตาม'],
  ['T62', 'Wrong Glass', 'หยิบแก้วผิด', 'หากผู้เล่นคนอื่นหยิบแก้วของคนอื่นมาดื่มโดยไม่ตั้งใจ ขโมยไพ่จากเขา 4 ใบ', 4, 'เลือกผู้เล่นที่หยิบแก้วของคนอื่นมาดื่ม'],
  ['T66', 'Sorry Spam', 'ขอโทษซ้ำๆ', 'หากผู้เล่นคนอื่นพูดคำว่า "ขอโทษ" เกิน 1 ครั้งในรอบเดียว ขโมยไพ่จากเขา 3 ใบ', 3, 'เลือกผู้เล่นที่พูดคำว่า ขอโทษ เกิน 1 ครั้ง'],
];

export const TRAP_RULES_BATCH_2: Record<string, TrapRuleDefinition> = {
  ...MANUAL_DISCARD_TRAPS.reduce((acc, [code, name_en, name_th, description_th, count, targetPrompt]) => {
    acc[code] = {
      code, name_en, name_th, mode: 'manual_honor', description_th,
      needsTargetSelection: true, targetPrompt,
      resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
      executeEffect: (state, frame) => {
        const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
        if (!targetId) return state;
        return executeDiscard(state, targetId, count).state;
      },
    };
    return acc;
  }, {} as Record<string, TrapRuleDefinition>),

  ...MANUAL_STEAL_TRAPS.reduce((acc, [code, name_en, name_th, description_th, count, targetPrompt]) => {
    acc[code] = {
      code, name_en, name_th, mode: 'manual_honor', description_th,
      needsTargetSelection: true, targetPrompt,
      resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
      executeEffect: (state, frame) => {
        const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
        if (!targetId) return state;
        return executeRandomSteal(state, targetId, frame.actorId, count).state;
      },
    };
    return acc;
  }, {} as Record<string, TrapRuleDefinition>),

  // T31 — What Have You Done? (นายทำอะไรลงไป?!)
  T31: {
    code: 'T31', name_en: 'What Have You Done?', name_th: 'นายทำอะไรลงไป?!', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นเล่นไพ่ Action โดยเจาะจงใส่คุณ Effect เดียวกันนั้นจะมีผลกับผู้เล่นคนนั้นด้วย',
    checkTrigger: (_state, ownerId, event) => {
      if (event?.type !== GAME_EVENT_TYPES.ACTION_PLAYED) return { triggered: false };
      const payload = event.payload as { actorId?: string; actionCode?: string; targetId?: string };
      if (payload.targetId === ownerId && payload.actorId && payload.actorId !== ownerId) {
        return {
          triggered: true,
          triggerPlayerIds: [payload.actorId],
          customPayload: { actionCode: payload.actionCode, actorId: payload.actorId },
          note: `Action ${payload.actionCode} played by ${payload.actorId} targeting ${ownerId}`,
        };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const actorId = frame.triggerPlayerIds?.[0] ?? frame.affectedPlayerIds?.[0];
      const actionCode = frame.customPayload?.actionCode as CardCode;
      if (!actorId || !actionCode) return state;
      return resolveActionEffect(state, actionCode, actorId, actorId);
    },
  },

  // T32 — Gonna Eat That? (จะกินนั่นไหม?)
  T32: {
    code: 'T32', name_en: 'Gonna Eat That?', name_th: 'จะกินนั่นไหม?', mode: 'manual_honor',
    description_th: 'หากผู้เล่นคนอื่นวางไพ่ในมือของตัวเองลง ให้ขโมยไพ่ในมือนั้นทั้งหมด',
    needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่วางไพ่ในมือลง',
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId || !state.players[targetId] || !state.players[frame.actorId]) return state;
      const next = cloneState(state);
      const targetHand = next.players[targetId].hand;
      const stolen = targetHand.splice(0, targetHand.length);
      next.players[frame.actorId].hand.push(...stolen);
      return next;
    },
  },

  // T39 — Super Guy (ยอดชาย)
  T39: {
    code: 'T39', name_en: 'Super Guy', name_th: 'ยอดชาย', mode: 'automatic_event',
    description_th: 'หากผู้เล่นคนอื่นใช้ไพ่ Counter กับคุณ ไพ่ Counter ใบนั้นจะไม่มีผล',
    checkTrigger: (state, ownerId, event) => {
      if (event?.type !== GAME_EVENT_TYPES.COUNTER_PLAYED) return { triggered: false };
      const payload = event.payload as { actorId?: string; counterCode?: string; targetFrameId?: string };
      if (!payload.actorId || payload.actorId === ownerId) return { triggered: false };
      const targetFrame = state.reactionStack?.find((f) => f.frameId === payload.targetFrameId);
      const isTargetingOwner = Boolean(
        targetFrame && (targetFrame.actorId === ownerId || targetFrame.targetIds?.includes(ownerId))
      );
      if (isTargetingOwner) {
        return {
          triggered: true,
          triggerPlayerIds: [payload.actorId],
          customPayload: { targetFrameId: payload.targetFrameId, counterCode: payload.counterCode },
          note: `Counter played by ${payload.actorId} against ${ownerId}`,
        };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      const targetFrameId = frame.customPayload?.targetFrameId as string;
      const targetFrame = next.reactionStack?.find((f) => f.frameId === targetFrameId) ?? (next.reactionStack?.length ? next.reactionStack[next.reactionStack.length - 1] : undefined);
      if (targetFrame) {
        targetFrame.status = 'cancelled';
      }
      return next;
    },
  },

  // T42 — Jack in the Box (แจ็คในกล่อง)
  T42: {
    code: 'T42', name_en: 'Jack in the Box', name_th: 'แจ็คในกล่อง', mode: 'automatic_event',
    description_th: 'หากไพ่ Trap ที่คุณวางไว้ใบใดก็ตามถูกใช้งาน ขโมยไพ่ 1 ใบจากผู้เล่นคนอื่นทุกคน',
    checkTrigger: (_state, ownerId, event) => {
      if (event?.type !== GAME_EVENT_TYPES.TRAP_ACTIVATED) return { triggered: false };
      const payload = event.payload as { ownerId?: string; trapCode?: string };
      if (payload.ownerId === ownerId && payload.trapCode !== 'T42') {
        return {
          triggered: true,
          triggerPlayerIds: [ownerId],
          note: `Trap ${payload.trapCode} owned by ${ownerId} activated`,
        };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (state, ownerId) => Object.keys(state.players).filter((id) => id !== ownerId),
    executeEffect: (state, frame) => {
      return executeAllRandomSteal(state, frame.actorId, 1);
    },
  },

  // T43 — Upside Down (กลับหัวกลับหาง)
  T43: {
    code: 'T43', name_en: 'Upside Down', name_th: 'กลับหัวกลับหาง', mode: 'automatic_event',
    description_th: 'หากคุณเป็นคนทำให้ Trap ของผู้เล่นคนอื่นทำงาน Effect ของ Trap นั้นจะมีผลกับเจ้าของ Trap แทน',
    checkTrigger: (state, ownerId, event) => {
      if (event?.type !== GAME_EVENT_TYPES.TRAP_ACTIVATED) return { triggered: false };
      const payload = event.payload as { ownerId?: string; triggerPlayerIds?: string[] };
      if (payload.ownerId && payload.ownerId !== ownerId && payload.triggerPlayerIds?.includes(ownerId)) {
        const topFrame = state.reactionStack?.length ? state.reactionStack[state.reactionStack.length - 1] : undefined;
        return {
          triggered: true,
          triggerPlayerIds: [payload.ownerId],
          customPayload: { trapOwnerId: payload.ownerId, trapFrameId: topFrame?.frameId },
          note: `Owner ${ownerId} triggered ${payload.ownerId}'s trap`,
        };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      const trapOwnerId = frame.customPayload?.trapOwnerId as string;
      const trapFrameId = frame.customPayload?.trapFrameId as string;
      if (trapOwnerId && next.reactionStack && next.reactionStack.length > 0) {
        const targetFrame = next.reactionStack.find((f) => f.frameId === trapFrameId) ?? next.reactionStack[next.reactionStack.length - 1];
        if (targetFrame) {
          targetFrame.affectedPlayerIds = [trapOwnerId];
          targetFrame.targetIds = [trapOwnerId];
        }
      }
      return next;
    },
  },

  // T45 — What a Twist (หักมุมซะงั้น!)
  T45: {
    code: 'T45', name_en: 'What a Twist', name_th: 'หักมุมซะงั้น!', mode: 'automatic_state',
    description_th: 'หากคุณไม่มีไพ่เหลือเลย ให้จั่วไพ่ 10 ใบ',
    checkTrigger: (state, ownerId) => {
      const player = state.players[ownerId];
      if (player && player.hand.length === 0) {
        return { triggered: true, triggerPlayerIds: [ownerId], note: `${ownerId} has 0 cards` };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, ownerId) => [ownerId],
    executeEffect: (state, frame) => {
      return executeDraw(state, frame.actorId, 10);
    },
  },

  // T46 — Don't Beat Me (อย่าชนะฉันนะ)
  T46: {
    code: 'T46', name_en: "Don't Beat Me", name_th: 'อย่าชนะฉันนะ', mode: 'automatic_state',
    description_th: 'หากคุณไม่มีไพ่เหลือเลย ขโมยไพ่ในมือทั้งหมดของผู้เล่นคนใดก็ได้ 1 คน',
    needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่คุณต้องการขโมยไพ่ทั้งหมด',
    checkTrigger: (state, ownerId) => {
      const player = state.players[ownerId];
      if (player && player.hand.length === 0) {
        return { triggered: true, triggerPlayerIds: [ownerId], note: `${ownerId} has 0 cards` };
      }
      return { triggered: false };
    },
    resolveAffectedPlayers: (_state, _ownerId, triggerPlayerIds) => triggerPlayerIds,
    executeEffect: (state, frame) => {
      const targetId = frame.affectedPlayerIds?.[0] ?? frame.targetIds[0];
      if (!targetId || !state.players[targetId] || !state.players[frame.actorId]) return state;
      const next = cloneState(state);
      const targetHand = next.players[targetId].hand;
      const stolen = targetHand.splice(0, targetHand.length);
      next.players[frame.actorId].hand.push(...stolen);
      return next;
    },
  },

  // T52 — On Your Face (ติดอยู่บนหน้า)
  T52: {
    code: 'T52', name_en: 'On Your Face', name_th: 'ติดอยู่บนหน้า', mode: 'manual_honor',
    description_th: 'แปะไพ่ใบนี้ไว้ที่หน้าผากของคุณ หากไม่มีใครพูดถึงมันจนถึงเทิร์นถัดไปของคุณ ผู้เล่นคนอื่นทั้งหมดต้องทิ้งไพ่คนละ 3 ใบ',
    resolveAffectedPlayers: (state, ownerId) => Object.keys(state.players).filter((id) => id !== ownerId),
    executeEffect: (state, frame) => {
      return executeAllDiscard(state, 3, [frame.actorId]);
    },
  },

  // T53 — Face in a Face (หน้าซ้อนหน้า)
  T53: {
    code: 'T53', name_en: 'Face in a Face', name_th: 'หน้าซ้อนหน้า', mode: 'manual_honor',
    description_th: 'แปะไพ่ใบนี้ไว้ที่หน้าผากของคุณ หากไม่มีใครพูดถึงมันจนถึงเทิร์นถัดไปของคุณ ผู้เล่นทุกคนจั่วไพ่คนละ 2 ใบ',
    resolveAffectedPlayers: (state) => Object.keys(state.players),
    executeEffect: (state) => {
      let next = cloneState(state);
      for (const playerId of Object.keys(next.players)) {
        next = executeDraw(next, playerId, 2);
      }
      return next;
    },
  },
};
