import { everyoneDraws, everyoneDiscards } from '../group';
import { draw, discard } from '../pile';
import { stealRandom } from '../transfer';
import { executeRandomSteal, executeAllRandomSteal, executeFullHandTransfer } from '../primitives';
import { skipTurn } from '../turnFlow';
import { getNextPlayerId } from '../turn';
import { getCardById } from '../../data/cards/index';
import type { ActionRuleDefinition } from './types';
import type { CardCode, PlayerId, RoomState } from '../types';

/** Moves the specific card instance just played (frame.sourceCode, already in
 * discardPile by the time executeEffect runs) into another player's hand
 * instead of leaving it discarded. Safe because every card code is unique
 * across the whole deck (no duplicate copies), so indexOf finds exactly the
 * one that was just played, regardless of what else discarded in between. */
function handOffPlayedCard(state: RoomState, code: CardCode, toId: PlayerId): RoomState {
  const pos = state.discardPile.indexOf(code);
  if (pos === -1) return state;
  const next = { ...state, discardPile: [...state.discardPile], players: { ...state.players } };
  next.discardPile.splice(pos, 1);
  next.players[toId] = { ...next.players[toId], hand: [...next.players[toId].hand, code] };
  return next;
}

function discardAllOfType(state: RoomState, playerId: PlayerId, type: 'action' | 'counter' | 'trap'): RoomState {
  const hand = state.players[playerId].hand;
  const matching = hand.filter((code) => getCardById(code)?.type === type);
  if (matching.length === 0) return state;
  return discard(state, playerId, matching.length, matching);
}

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

  // -- Family D: single-target direct effects (classification doc §Family D) --

  A029: {
    code: 'A029', name_en: 'Barbershop Quartet', name_th: 'วงประสานเสียงสี่คน',
    description_th: 'เลือกขโมยไพ่ 4 ใบจากผู้เล่นอีก 1 คน หรือจั่วไพ่ 4 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 4 ใบ',
    // ponytail: card offers "steal 4 OR draw 4 instead" as the actor's own choice;
    // no UI exists for that pre-play branch, so this always takes the steal branch.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      return stealRandom(state, targetId, frame.actorId, 4);
    },
  },
  A077: {
    code: 'A077', name_en: 'Got Your Nose', name_th: 'ขโมยจมูกแล้ว!',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 1 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 1) : state;
    },
  },
  A112: {
    code: 'A112', name_en: 'Stolen Face', name_th: 'ขโมยหน้า',
    description_th: 'ขโมยไพ่ 2 ใบจากผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 2 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 2) : state;
    },
  },
  A141: {
    code: 'A141', name_en: 'Drinking Buddy', name_th: 'เพื่อนกินเหล้า',
    description_th: 'เลือกผู้เล่นอีก 1 คน ให้ดื่ม 1 อึกพร้อมกับคุณ แล้วขโมยไพ่จากเขา 1 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะดื่มด้วยกันแล้วขโมยไพ่',
    // Classification doc flags this as an open rules question (unconditional
    // steal vs. conditional on completing the drink) -- implemented unconditional.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 1) : state;
    },
  },
  A144: {
    code: 'A144', name_en: 'Chug It', name_th: 'เอาให้จบแก้ว',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ดื่มรวดเดียวจนกว่าคุณจะนับ 5 แล้วขโมยไพ่ 2 ใบจากเขา',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 2 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 2) : state;
    },
  },
  A051: {
    code: 'A051', name_en: 'Invisible Billy', name_th: 'บิลลี่ล่องหน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้เปิดไพ่ในมือให้คุณดู แล้วเลือกขโมยมา 1 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้เปิดมือ',
    // ponytail: real card lets you see the hand and pick a specific card; no
    // reveal-then-pick-one UI exists yet, so this steals 1 random card instead.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 1) : state;
    },
  },
  A120: {
    code: 'A120', name_en: 'Wish Granted', name_th: 'คำขอเป็นจริง',
    description_th: 'เลือกประเภทไพ่ Action, Trap หรือ Counter อย่างใดอย่างหนึ่ง แล้วขโมยไพ่ประเภทนั้น 1 ใบจากผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่',
    // ponytail: no card-type-picker UI exists yet, so this steals 1 random card
    // of any type instead of letting the actor pick Action/Trap/Counter first.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, targetId, frame.actorId, 1) : state;
    },
  },
  A052: {
    code: 'A052', name_en: 'Is This You?', name_th: 'นี่นายเหรอ?',
    description_th: 'จั่วไพ่ 3 ใบ แล้วเลือกผู้เล่นอีก 1 คนให้จั่ว 3 ใบเช่นกัน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้จั่วไพ่ 3 ใบด้วยกัน',
    executeEffect: (state, frame) => {
      const afterSelf = draw(state, frame.actorId, 3);
      const targetId = frame.targetIds[0];
      return targetId ? draw(afterSelf, targetId, 3) : afterSelf;
    },
  },
  A124: {
    code: 'A124', name_en: 'Fat Man', name_th: 'นายอ้วน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้จั่วไพ่ 5 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้จั่วไพ่ 5 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? draw(state, targetId, 5) : state;
    },
  },
  A140: {
    code: 'A140', name_en: 'Cheers to That', name_th: 'ชนแก้ว',
    description_th: 'เลือกผู้เล่นอีก 1 คนมาชนแก้วด้วยกัน ทั้งคู่จั่วไพ่คนละ 2 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้มาชนแก้วด้วยกัน',
    executeEffect: (state, frame) => {
      const afterSelf = draw(state, frame.actorId, 2);
      const targetId = frame.targetIds[0];
      return targetId ? draw(afterSelf, targetId, 2) : afterSelf;
    },
  },
  A038: {
    code: 'A038', name_en: 'Die Potato', name_th: 'ตายซะ มันฝรั่ง!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้งไพ่ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ 3 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? discard(state, targetId, 3) : state;
    },
  },
  A039: {
    code: 'A039', name_en: "Don't Want to Be Fat", name_th: 'ไม่อยากอ้วน',
    description_th: 'เลือกผู้เล่นอีก 1 คนหรือเลือกตัวเอง ให้ทิ้งไพ่ 5 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ 5 ใบ',
    // ponytail: "or pick yourself instead" isn't offered -- the target picker
    // only lists opponents right now, so this always targets an opponent.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? discard(state, targetId, 5) : state;
    },
  },
  A041: {
    code: 'A041', name_en: 'Feed Me Paper', name_th: 'เอากระดาษมาให้ฉันกิน',
    description_th: 'คุณและผู้เล่นอีก 1 คนที่คุณเลือก ทิ้งไพ่คนละ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะทิ้งไพ่ด้วยกัน',
    executeEffect: (state, frame) => {
      const afterSelf = discard(state, frame.actorId, 3);
      const targetId = frame.targetIds[0];
      return targetId ? discard(afterSelf, targetId, 3) : afterSelf;
    },
  },
  A045: {
    code: 'A045', name_en: 'Hit By A Card', name_th: 'โดนไพ่ฟาด',
    description_th: 'บังคับผู้เล่นอีก 1 คนให้ทิ้งไพ่ทั้งหมดในมือ แล้วจั่วไพ่ใหม่ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดแล้วจั่วใหม่ 3 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      const discarded = discard(state, targetId, state.players[targetId].hand.length);
      return draw(discarded, targetId, 3);
    },
  },
  A093: {
    code: 'A093', name_en: 'Imma Getcha!', name_th: 'จับได้แน่!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้ง Action ทั้งหมดที่อยู่ในมือ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ Action ทั้งหมด',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? discardAllOfType(state, targetId, 'action') : state;
    },
  },
  A123: {
    code: 'A123', name_en: "You're Dead!", name_th: 'นายตายแล้ว!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้ง Counter ทั้งหมดในมือ ไพ่ใบนี้ไม่สามารถถูก Counter ได้',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ Counter ทั้งหมด',
    // Known gap: the "cannot be countered" self-immunity rule isn't enforced --
    // that lives in game/counterRules' eligibility check, not in this effect.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? discardAllOfType(state, targetId, 'counter') : state;
    },
  },
  A018: {
    code: 'A018', name_en: 'You Can Wait', name_th: 'รอไปก่อนนะ',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ข้ามเทิร์น',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ข้ามเทิร์นถัดไป',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? skipTurn(state, targetId) : state;
    },
  },
  A047: {
    code: 'A047', name_en: 'I Sentence You', name_th: 'ฉันขอตัดสินโทษนาย',
    description_th: 'ให้ผู้เล่นอีก 1 คนเลือกระหว่างข้าม 1 เทิร์น หรือทิ้งไพ่ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะถูกตัดสินโทษ',
    // ponytail: the choice is the TARGET's (live, in person) -- no cross-player
    // prompt exists for it, so this always takes the skip-turn branch.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? skipTurn(state, targetId) : state;
    },
  },
  A060: {
    code: 'A060', name_en: 'Alien Invasion', name_th: 'เอเลี่ยนบุก!',
    description_th: 'มอบไพ่ทั้งหมดในมือของคุณให้ผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ทั้งหมดในมือคุณ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? executeFullHandTransfer(state, frame.actorId, targetId) : state;
    },
  },
  A079: {
    code: 'A079', name_en: 'Here! Have It!', name_th: 'เอ้า! เอาไป!',
    description_th: 'มอบไพ่ใบใดก็ได้ที่คุณไม่ต้องการให้ผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ 1 ใบจากคุณ',
    // ponytail: "any card you don't want" is the actor's free choice; no
    // self-hand-picker UI exists yet, so this gives 1 random card instead.
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, frame.actorId, targetId, 1) : state;
    },
  },
  A082: {
    code: 'A082', name_en: 'Hey, You Two Should Kiss!', name_th: 'เฮ้ พวกเธอสองคนจูบกันสิ!',
    description_th: 'จั่วไพ่ 2 ใบ แต่ต้องมอบ 1 ใบให้ผู้เล่นอีกคน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ 1 ใบ',
    executeEffect: (state, frame) => {
      const afterDraw = draw(state, frame.actorId, 2);
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(afterDraw, frame.actorId, targetId, 1) : afterDraw;
    },
  },
  A107: {
    code: 'A107', name_en: 'Piece of Me', name_th: 'ส่วนหนึ่งของฉัน',
    description_th: 'มอบไพ่ 2 ใบให้ผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ 2 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandom(state, frame.actorId, targetId, 2) : state;
    },
  },
  A049: {
    code: 'A049', name_en: "I'm On My Way", name_th: 'กำลังไปแล้ว!',
    description_th: 'มอบไพ่ใบนี้ให้ผู้เล่นที่เล่นต่อจากคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const nextId = getNextPlayerId(state.turnOrder, frame.actorId, state.direction);
      return nextId ? handOffPlayedCard(state, frame.sourceCode, nextId) : state;
    },
  },
  A078: {
    code: 'A078', name_en: 'Here Comes The Aeroplane', name_th: 'เครื่องบินมาแล้ว!',
    description_th: 'มอบไพ่ใบนี้ให้ผู้เล่นอีก 1 คน จากนี้ไพ่ใบนี้เป็นของผู้เล่นคนนั้น',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ใบนี้',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? handOffPlayedCard(state, frame.sourceCode, targetId) : state;
    },
  },
  A125: {
    code: 'A125', name_en: 'Do Not Want', name_th: 'ไม่เอา!',
    description_th: 'มอบไพ่ใบนี้ให้ผู้เล่นอีก 1 คน แล้วขโมยไพ่จากผู้เล่นคนนั้น 1 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะรับไพ่ใบนี้',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      const handedOff = handOffPlayedCard(state, frame.sourceCode, targetId);
      return stealRandom(handedOff, targetId, frame.actorId, 1);
    },
  },
  A164: {
    code: 'A164', name_en: 'Pass the Shame', name_th: 'ส่งต่อความอาย',
    description_th: 'มอบไพ่ใบนี้พร้อมภารกิจอายๆ ให้ผู้เล่นถัดไป',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const nextId = getNextPlayerId(state.turnOrder, frame.actorId, state.direction);
      return nextId ? handOffPlayedCard(state, frame.sourceCode, nextId) : state;
    },
  },

  // A091 "I'm A Doctor" (Family C3) intentionally NOT included here -- needs a
  // "cards lost since your last turn" counter that requires touching
  // game/turn.ts's advanceTurn (a file under active concurrent edits). Add in
  // a dedicated follow-up once that's coordinated.
};
