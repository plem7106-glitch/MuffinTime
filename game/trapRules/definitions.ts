import type { TrapRuleDefinition, TrapTriggerResult } from './types';
import {
  executeDiscard,
  executeAllDiscard,
  executeDiscardDownTo,
  executeRandomSteal,
} from '../primitives';
import { GAME_EVENT_TYPES, type ForcedDiscardPayload, type CardStolenPayload } from '../events';
import { getCardByCode } from '../../data/cards/index';

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

export const TRAP_RULES_BATCH_1: Record<string, TrapRuleDefinition> = {
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
