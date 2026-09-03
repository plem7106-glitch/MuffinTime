import { everyoneDraws, everyoneDiscards, passHands } from '../group';
import { draw, discard, forceDiscard } from '../pile';
import { stealRandom, swapHands, forceSteal } from '../transfer';
import { executeRandomSteal, executeAllRandomSteal, executeFullHandTransfer, executeHandSwapAndDeal } from '../primitives';
import { skipTurn, reverseDirection, changeMuffinTarget } from '../turnFlow';
import { getNextPlayerId, jumpToPlayerTurn, resolveTurnArrival } from '../turn';
import { restartGame } from '../room';
import { initiateDelegatedTargetPick } from './delegatedTargetPick';
import { drawUntilCount } from '../misc';
import { cloneState, shuffle, trackForcedLoss } from '../util';
import { getCardById } from '../../data/cards/index';
import { discardTraps, discardAllTraps, returnTrapsToHand, stealTrapToHand, forceDiscardTraps, forceDiscardAllTraps } from '../trapPile';
import { drawFromBottom } from '../pile';
import { returnCardToHand } from '../misc';
import { peekTopN, takeChosenFromPeek, takeTopNFromDiscard } from '../deckOps';
import { rosterDraws, rosterDiscards, rosterStolenBy, rosterSkipTurn } from '../roster';
import { resolveForcedDraw } from '../forcedDraw';
import type { ActionRuleDefinition } from './types';
import { rosterIdsFromFrame, outcomeFromFrame, dualTargetIdsFromFrame, todayFromFrame, numberInputFromFrame } from './types';
import type { CardCode, PlayerId, RoomState, Rng } from '../types';

/** A105: steals every Action-type card (not the whole hand) from one player to another. */
function stealAllActionCards(state: RoomState, fromId: PlayerId, toId: PlayerId): RoomState {
  const hand = state.players[fromId].hand;
  const matching = hand.filter((code) => getCardById(code)?.type === 'action');
  if (matching.length === 0) return state;
  let next = cloneState(state);
  for (const code of matching) {
    const pos = next.players[fromId].hand.indexOf(code);
    if (pos === -1) continue;
    next.players[fromId].hand.splice(pos, 1);
    next.players[toId].hand.push(code);
  }
  return trackForcedLoss(next, fromId, matching.length);
}

/** Players tied for the min/max hand size (J1/J2/J3-style "extreme, ties all
 * included" resolution, for the subset of those cards whose comparator is
 * objectively computable from live state). */
function extremeByHandSize(state: RoomState, direction: 'min' | 'max'): PlayerId[] {
  const ids = Object.keys(state.players);
  if (ids.length === 0) return [];
  const sizes = ids.map((id) => state.players[id].hand.length);
  const extreme = direction === 'min' ? Math.min(...sizes) : Math.max(...sizes);
  return ids.filter((id) => state.players[id].hand.length === extreme);
}

/** Day-of-year for an "MM-DD" string, using a fixed leap year (2024) as the
 * reference so Feb-29 birthdays resolve without special-casing. */
function dayOfYear(mmdd: string): number {
  const [month, day] = mmdd.split('-').map(Number);
  const start = Date.UTC(2024, 0, 1);
  const date = Date.UTC(2024, month - 1, day);
  return Math.round((date - start) / 86400000);
}

/** Days from `todayMMDD` until the next occurrence of `birthdayMMDD`
 * (0 if today *is* the birthday, otherwise wraps forward to next year). */
function daysUntilBirthday(todayMMDD: string, birthdayMMDD: string): number {
  const diff = dayOfYear(birthdayMMDD) - dayOfYear(todayMMDD);
  return diff >= 0 ? diff : diff + 366;
}

/** Players whose birthdayMMDD is soonest from todayMMDD (ties -> all tied,
 * same convention as extremeByHandSize/J1/J2). Players with no birthday set
 * are excluded entirely -- birthdayMMDD is optional and self-reported, so a
 * player who never set one simply never counts as "soonest". */
function soonestBirthdayPlayers(state: RoomState, todayMMDD: string): PlayerId[] {
  const withBirthday = Object.keys(state.players).filter((id) => state.players[id].birthdayMMDD);
  if (withBirthday.length === 0) return [];
  const distances = withBirthday.map((id) => daysUntilBirthday(todayMMDD, state.players[id].birthdayMMDD!));
  const soonest = Math.min(...distances);
  return withBirthday.filter((id) => daysUntilBirthday(todayMMDD, state.players[id].birthdayMMDD!) === soonest);
}

/** Every player not in `recipientIds` gives 1 random card to one of
 * `recipientIds` (round-robin by rng when there's more than one tied
 * recipient), for A066. */
function everyoneGivesOneTo(state: RoomState, recipientIds: PlayerId[], actorId: PlayerId, rng: Rng = Math.random): RoomState {
  let next = state;
  for (const giverId of Object.keys(state.players)) {
    if (recipientIds.includes(giverId)) continue;
    const recipientId = recipientIds[Math.floor(rng() * recipientIds.length)];
    next = giverId === actorId ? stealRandom(next, giverId, recipientId, 1, rng) : forceSteal(next, giverId, recipientId, 1, rng);
  }
  return next;
}

/** Every player not in `targetIds` steals 1 random card from one of
 * `targetIds`, for A137. */
function everyoneStealsOneFrom(state: RoomState, targetIds: PlayerId[], actorId: PlayerId, rng: Rng = Math.random): RoomState {
  let next = state;
  for (const stealerId of Object.keys(state.players)) {
    if (targetIds.includes(stealerId)) continue;
    const targetId = targetIds[Math.floor(rng() * targetIds.length)];
    next = targetId === actorId ? stealRandom(next, targetId, stealerId, 1, rng) : forceSteal(next, targetId, stealerId, 1, rng);
  }
  return next;
}

/** A046/A026: peek N from the top of the draw pile and take one -- no
 * card-picker UI exists yet, so this takes a random one of the peeked cards
 * rather than letting the actor choose which. */
function takeRandomFromPeek(state: RoomState, actorId: PlayerId, n: number, rng: Rng = Math.random): RoomState {
  const peeked = peekTopN(state, n);
  if (peeked.length === 0) return state;
  const code = peeked[Math.floor(rng() * peeked.length)];
  return takeChosenFromPeek(state, actorId, code);
}

/** A106: same "no picker" simplification, but choosing among the last N
 * discarded cards instead of the top of the draw pile. */
function takeRandomFromDiscardWindow(state: RoomState, actorId: PlayerId, windowSize: number, rng: Rng = Math.random): RoomState {
  const count = Math.min(windowSize, state.discardPile.length);
  if (count === 0) return state;
  const window = state.discardPile.slice(state.discardPile.length - count);
  const code = window[Math.floor(rng() * window.length)];
  return returnCardToHand(state, code, actorId);
}

/** A059 "Mine Now" steals a random one of the target's placed traps. */
function stealRandomTrapToHand(state: RoomState, fromId: PlayerId, toId: PlayerId, rng: Rng = Math.random): RoomState {
  const traps = state.players[fromId].traps;
  if (traps.length === 0) return state;
  const code = traps[Math.floor(rng() * traps.length)];
  return trackForcedLoss(stealTrapToHand(state, fromId, toId, code), fromId, 1);
}

/** A009 "Quickfire" forces every trap-type card straight from hand onto the
 * table, bypassing the normal one-at-a-time placement flow and its 3-slot UI
 * cap (RoomState itself doesn't enforce a max, only GameTable's placement UI
 * does) -- so a player holding 4+ traps can end up with more than 3 placed. */
function placeAllTrapsFromHand(state: RoomState, playerId: PlayerId): RoomState {
  const hand = state.players[playerId].hand;
  const trapCodes = hand.filter((code) => getCardById(code)?.type === 'trap');
  if (trapCodes.length === 0) return state;
  const next = cloneState(state);
  const player = next.players[playerId];
  player.hand = player.hand.filter((code) => !trapCodes.includes(code));
  player.traps.push(...trapCodes);
  return next;
}

/** Seating order used for "left/right neighbor" cards, falling back the same
 * way GameTable.tsx's own seatOrder computation does. Convention chosen here
 * (not verified against the seating UI's visual layout): index+1 = "right
 * neighbor", index-1 = "left neighbor". Flip the sign below if it turns out
 * backwards once seen on screen. */
function getSeatOrder(state: RoomState): PlayerId[] {
  const ids = Object.keys(state.players);
  if (state.seatOrder && state.seatOrder.length === ids.length && state.seatOrder.every((id) => state.players[id])) {
    return state.seatOrder;
  }
  return state.turnOrder && state.turnOrder.length === ids.length ? state.turnOrder : ids;
}

function rotateSeatOrder(state: RoomState, steps: number): RoomState {
  const order = getSeatOrder(state);
  const count = order.length;
  if (count === 0) return state;
  const rotated = order.map((_, i) => order[((i - steps) % count + count) % count]);
  // Deliberately leaves currentTurnIndex untouched. Whose turn it is is
  // decided everywhere in the app (GameTable.tsx's currentTurnPlayerId,
  // every gameplay gate in lib/session.tsx) by turnOrder[currentTurnIndex]
  // -- never by seatOrder. turnOrder is fixed at game start and this
  // primitive doesn't touch it, so leaving currentTurnIndex alone is what
  // keeps the *actual* active player unchanged, matching the real-world
  // rule that shuffling seats mid-turn doesn't hand your turn to someone
  // else. (An earlier version of this function nudged currentTurnIndex to
  // keep tracking the active player *within seatOrder* -- that was wrong:
  // nothing reads seatOrder[currentTurnIndex] for turn-taking, so it just
  // desynced currentTurnIndex from the turnOrder index everything else
  // trusts, handing the turn to the wrong player mid-play. Caught by
  // review before shipping; see the regression test below.)
  return { ...state, seatOrder: rotated };
}

/** Swaps exactly two players' seats in place, leaving everyone else's
 * position untouched (unlike rotateSeatOrder's whole-table shift).
 * currentTurnIndex is intentionally left alone -- see rotateSeatOrder's
 * comment on why seatOrder and currentTurnIndex are independent. */
function swapSeats(state: RoomState, idA: PlayerId, idB: PlayerId): RoomState {
  const order = getSeatOrder(state);
  const posA = order.indexOf(idA);
  const posB = order.indexOf(idB);
  if (posA === -1 || posB === -1 || posA === posB) return state;
  const swapped = [...order];
  swapped[posA] = idB;
  swapped[posB] = idA;
  return { ...state, seatOrder: swapped };
}

/** Everyone simultaneously steals 1 card from their right-seat neighbor,
 * pairing computed from the seat order before any of the steals happen. */
function stealFromRightNeighbor(state: RoomState, actorId: PlayerId, rng: Rng = Math.random): RoomState {
  const order = getSeatOrder(state);
  const count = order.length;
  let next = state;
  for (let i = 0; i < count; i++) {
    const thief = order[i];
    const victim = order[(i + 1) % count];
    if (thief === victim) continue;
    next = victim === actorId ? stealRandom(next, victim, thief, 1, rng) : forceSteal(next, victim, thief, 1, rng);
  }
  return next;
}

/** Pools every listed player's hand, shuffles, and deals it back out evenly
 * (round-robin, so any remainder is spread one-at-a-time in playerIds order).
 * Generalizes executeHandSwapAndDeal (2-player only) to N players, for A074. */
function poolShuffleRedeal(state: RoomState, playerIds: PlayerId[], rng: Rng = Math.random): RoomState {
  const next = cloneState(state);
  const pool = shuffle(playerIds.flatMap((id) => next.players[id].hand), rng);
  for (const id of playerIds) next.players[id].hand = [];
  playerIds.forEach((id, i) => {
    for (let j = i; j < pool.length; j += playerIds.length) {
      next.players[id].hand.push(pool[j]);
    }
  });
  return next;
}

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
  return forceDiscard(state, playerId, matching.length, matching);
}

/**
 * Batch 1 — cards migrated from the old `lib/demoCards.ts` hardcoded switch.
 * Kept behaviorally identical (same primitives, same call shapes) so the
 * existing registry.test.ts assertions keep passing unchanged.
 */
export const ACTION_RULES_BATCH_1: Record<string, ActionRuleDefinition> = {
  // Was originally migrated from the old demo switch as kind:'auto'
  // ("everyone except the actor draws 2" -- a rough approximation that
  // predates the classification doc). Corrected here to real roster_select,
  // per the classification doc's Family A1 and the "who ate meat" example
  // this whole system was designed around.
  A001: {
    code: 'A001',
    name_en: 'Wrong House',
    name_th: 'ผิดบ้านแล้ว!',
    description_th: 'ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ จั่วไพ่คนละ 2 ใบ',
    kind: 'roster_select',
    needsRosterSelection: true,
    rosterPrompt: 'เลือกผู้เล่นที่ไม่ได้อาศัยอยู่ที่นี่',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 2),
  },

  A004: {
    code: 'A004',
    name_en: 'Parallel Universe',
    name_th: 'จักรวาลคู่ขนาน',
    description_th: 'จั่วไพ่เพิ่มเท่ากับจำนวนไพ่ที่คุณมีอยู่ในมือตอนนี้',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, state.players[frame.actorId].hand.length),
  },

  A091: {
    code: 'A091', name_en: "I'm A Doctor", name_th: 'ฉันเป็นหมอ',
    description_th: 'จั่วไพ่เท่ากับจำนวนไพ่ที่ถูกขโมยหรือถูกบังคับให้ทิ้งจากคุณ นับตั้งแต่เทิร์นก่อนหน้าของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, state.players[frame.actorId].forcedLossSinceLastTurn ?? 0),
  },

  A008: {
    code: 'A008',
    name_en: 'Throw The Cheese',
    name_th: 'ปาชีส!',
    description_th: 'ผู้เล่นคนอื่นทั้งหมดทิ้งไพ่คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDiscards(state, 1, frame.targetScope === 'single' ? [] : [frame.actorId], Math.random, frame.actorId, frame.targetScope === 'single' ? frame.targetIds : undefined),
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
      return forceDiscard(state, targetId, state.players[targetId].hand.length);
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
      return forceSteal(state, targetId, frame.actorId, 4);
    },
  },
  A077: {
    code: 'A077', name_en: 'Got Your Nose', name_th: 'ขโมยจมูกแล้ว!',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 1 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 1) : state;
    },
  },
  A112: {
    code: 'A112', name_en: 'Stolen Face', name_th: 'ขโมยหน้า',
    description_th: 'ขโมยไพ่ 2 ใบจากผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 2 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 2) : state;
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
      return targetId ? forceSteal(state, targetId, frame.actorId, 1) : state;
    },
  },
  A144: {
    code: 'A144', name_en: 'Chug It', name_th: 'เอาให้จบแก้ว',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ดื่มรวดเดียวจนกว่าคุณจะนับ 5 แล้วขโมยไพ่ 2 ใบจากเขา',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ 2 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 2) : state;
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
      return targetId ? forceSteal(state, targetId, frame.actorId, 1) : state;
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
      return targetId ? forceSteal(state, targetId, frame.actorId, 1) : state;
    },
  },
  A052: {
    code: 'A052', name_en: 'Is This You?', name_th: 'นี่นายเหรอ?',
    description_th: 'จั่วไพ่ 3 ใบ แล้วเลือกผู้เล่นอีก 1 คนให้จั่ว 3 ใบเช่นกัน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้จั่วไพ่ 3 ใบด้วยกัน',
    executeEffect: (state, frame) => {
      const multiplier = Number(frame.customPayload?.numericMultiplier ?? 1);
      const afterSelf = draw(state, frame.actorId, 3 * multiplier);
      const targetId = frame.targetIds[0];
      const count = 3 * (Number(frame.customPayload?.numericMultiplier ?? 1));
      return targetId ? resolveForcedDraw(afterSelf, targetId, count, frame.actorId, frame.sourceCode, frame.frameId) : afterSelf;
    },
  },
  A124: {
    code: 'A124', name_en: 'Fat Man', name_th: 'นายอ้วน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้จั่วไพ่ 5 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้จั่วไพ่ 5 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      const count = 5 * (Number(frame.customPayload?.numericMultiplier ?? 1));
      return targetId ? resolveForcedDraw(state, targetId, count, frame.actorId, frame.sourceCode, frame.frameId) : state;
    },
  },
  A140: {
    code: 'A140', name_en: 'Cheers to That', name_th: 'ชนแก้ว',
    description_th: 'เลือกผู้เล่นอีก 1 คนมาชนแก้วด้วยกัน ทั้งคู่จั่วไพ่คนละ 2 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้มาชนแก้วด้วยกัน',
    executeEffect: (state, frame) => {
      const multiplier = Number(frame.customPayload?.numericMultiplier ?? 1);
      const afterSelf = draw(state, frame.actorId, 2 * multiplier);
      const targetId = frame.targetIds[0];
      const count = 2 * (Number(frame.customPayload?.numericMultiplier ?? 1));
      return targetId ? resolveForcedDraw(afterSelf, targetId, count, frame.actorId, frame.sourceCode, frame.frameId) : afterSelf;
    },
  },
  A038: {
    code: 'A038', name_en: 'Die Potato', name_th: 'ตายซะ มันฝรั่ง!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้งไพ่ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ 3 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      const count = 3 * (Number(frame.customPayload?.numericMultiplier ?? 1));
      return targetId ? forceDiscard(state, targetId, count) : state;
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
      return targetId ? forceDiscard(state, targetId, 5) : state;
    },
  },
  A041: {
    code: 'A041', name_en: 'Feed Me Paper', name_th: 'เอากระดาษมาให้ฉันกิน',
    description_th: 'คุณและผู้เล่นอีก 1 คนที่คุณเลือก ทิ้งไพ่คนละ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะทิ้งไพ่ด้วยกัน',
    executeEffect: (state, frame) => {
      const afterSelf = discard(state, frame.actorId, 3);
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(afterSelf, targetId, 3) : afterSelf;
    },
  },
  A045: {
    code: 'A045', name_en: 'Hit By A Card', name_th: 'โดนไพ่ฟาด',
    description_th: 'บังคับผู้เล่นอีก 1 คนให้ทิ้งไพ่ทั้งหมดในมือ แล้วจั่วไพ่ใหม่ 3 ใบ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดแล้วจั่วใหม่ 3 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      const discarded = forceDiscard(state, targetId, state.players[targetId].hand.length);
      return resolveForcedDraw(discarded, targetId, 3, frame.actorId, frame.sourceCode, frame.frameId);
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
      return forceSteal(handedOff, targetId, frame.actorId, 1);
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

  // -- Family F: structural / seating & hand-redistribution (classification doc §Family F) --

  A010: {
    code: 'A010', name_en: "You're A Chair", name_th: 'นายคือเก้าอี้',
    description_th: 'ผู้เล่นทุกคนย้ายที่นั่งไปทางขวา โดยทิ้ง Trap ที่วางไว้ให้อยู่ที่เดิม',
    kind: 'auto',
    // ponytail: real card leaves placed Traps pinned to the seat rather than
    // following the player -- that reassignment isn't implemented, traps just
    // move with their owner like normal.
    executeEffect: (state) => rotateSeatOrder(state, 1),
  },
  A080: {
    code: 'A080', name_en: 'Here It Comes!', name_th: 'มาแล้ว!',
    description_th: 'ผู้เล่นทุกคนขโมยไพ่ 1 ใบจากผู้เล่นที่นั่งทางขวาของตัวเอง',
    kind: 'auto',
    executeEffect: (state, frame) => stealFromRightNeighbor(state, frame.actorId),
  },
  A087: {
    code: 'A087', name_en: 'I Like Trains', name_th: 'ฉันชอบรถไฟ',
    description_th: 'ผู้เล่นทุกคนส่งไพ่ทั้งหมดในมือให้ผู้เล่นทางซ้าย',
    kind: 'auto',
    executeEffect: (state) => passHands(state, -1),
  },
  A110: {
    code: 'A110', name_en: 'Skateboards', name_th: 'สเกตบอร์ด',
    description_th: 'ผู้เล่นทุกคนส่งไพ่ทั้งหมดในมือให้ผู้เล่นทางขวา',
    kind: 'auto',
    executeEffect: (state) => passHands(state, 1),
  },
  A156: {
    code: 'A156', name_en: 'Musical Chairs, Muffin Style', name_th: 'เก้าอี้ดนตรีฉบับมัฟฟิน',
    description_th: 'ทุกคนสลับที่นั่งไปทางซ้าย 1 ที่ พร้อมยกแก้วไปด้วย',
    kind: 'auto',
    executeEffect: (state) => rotateSeatOrder(state, -1),
  },
  A044: {
    code: 'A044', name_en: 'Grow Up Fast', name_th: 'โตไว ๆ',
    description_th: 'ผู้เล่นทุกคนปรับจำนวนไพ่ในมือให้เหลือ 7 ใบ โดยถ้ามีน้อยกว่าให้จั่วเพิ่ม และถ้ามากกว่าให้ทิ้ง',
    kind: 'auto',
    executeEffect: (state) => {
      let next = state;
      for (const id of Object.keys(next.players)) next = drawUntilCount(next, id, 7);
      return next;
    },
  },
  A129: {
    code: 'A129', name_en: 'Only One', name_th: 'เหลือแค่หนึ่ง',
    description_th: 'ผู้เล่นทุกคนทิ้งไพ่จนเหลือไพ่ในมือเพียงคนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state) => {
      let next = state;
      for (const id of Object.keys(next.players)) next = drawUntilCount(next, id, 1);
      return next;
    },
  },
  A032: {
    code: 'A032', name_en: 'Bound Together', name_th: 'ผูกติดกัน',
    description_th: 'ขโมยไพ่ทั้งหมดในมือของผู้เล่นอีก 1 คน นำมาสับรวมกับไพ่ในมือคุณ แล้วแจกกลับให้คุณทั้งสองคนเท่า ๆ กัน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะนำไพ่มารวมและแจกใหม่',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? executeHandSwapAndDeal(state, frame.actorId, targetId) : state;
    },
  },
  A074: {
    code: 'A074', name_en: 'Drunk Science', name_th: 'วิทยาศาสตร์เมา ๆ',
    description_th: 'นำไพ่ในมือของผู้เล่นทุกคนมารวมกัน สับ แล้วแจกกลับให้ทุกคนเท่า ๆ กัน',
    kind: 'auto',
    executeEffect: (state) => poolShuffleRedeal(state, Object.keys(state.players)),
  },

  // -- Family G1: Trap-card manipulation (classification doc §Family G) --

  A003: {
    code: 'A003', name_en: 'Shoot Your Problems', name_th: 'ยิงปัญหาทิ้งซะ',
    description_th: 'ทิ้ง Trap ที่วางไว้ใบใดก็ได้รวม 3 ใบ',
    kind: 'auto',
    // ponytail: "any 3 you like" is the actor's free choice; no own-traps
    // picker UI exists yet, so this discards 3 random placed traps.
    executeEffect: (state, frame) => discardTraps(state, frame.actorId, 3),
  },
  A009: {
    code: 'A009', name_en: 'Quickfire', name_th: 'ยิงรัว!',
    description_th: 'ผู้เล่นคนอื่นทั้งหมดต้องนำ Trap ทุกใบที่อยู่ในมือออกมาวางเป็น Trap',
    kind: 'auto',
    executeEffect: (state, frame) => {
      let next = state;
      for (const id of Object.keys(next.players)) {
        if (id === frame.actorId) continue;
        next = placeAllTrapsFromHand(next, id);
      }
      return next;
    },
  },
  A015: {
    code: 'A015', name_en: "Punch 'Em", name_th: 'ต่อยเลย!',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทิ้ง Trap ที่วางไว้ทั้งหมด',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้ทิ้ง Trap ที่วางไว้ทั้งหมด',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscardAllTraps(state, targetId) : state;
    },
  },
  A025: {
    code: 'A025', name_en: "Who's There?", name_th: 'ใครอยู่นั่น?',
    description_th: 'พลิก Trap ที่วางไว้ของผู้เล่นคนอื่นทุกคน คนละ 1 ใบ โดยไม่ทำให้ Trap ทำงาน',
    kind: 'no_op',
    // Architecture gap, not a simplification: this is a pure information
    // reveal (who sees what), not a state mutation -- RoomState has no
    // per-viewer "revealed to me" channel to represent it. Same gap as A030/
    // A086 below. Needs a real design (e.g. a revealedTo[] per trap) before
    // this can do more than show the card text.
    executeEffect: (state) => state,
  },
  A030: {
    code: 'A030', name_en: 'Be Careful', name_th: 'ระวังหน่อย',
    description_th: 'แอบดู Trap ที่วางไว้ของผู้เล่นคนอื่นทุกคน คนละ 1 ใบ',
    kind: 'no_op',
    executeEffect: (state) => state,
  },
  A034: {
    code: 'A034', name_en: 'Cannonball', name_th: 'ลูกปืนใหญ่!',
    description_th: 'ผู้เล่นทุกคนทิ้ง Trap ที่วางไว้คนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => {
      let next = state;
      for (const id of Object.keys(next.players)) next = id === frame.actorId ? discardTraps(next, id, 1) : forceDiscardTraps(next, id, 1);
      return next;
    },
  },
  A053: {
    code: 'A053', name_en: 'Is This Yours?', name_th: 'นี่ของนายเหรอ?',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้นำ Trap ที่วางไว้ทั้งหมดกลับเข้ามือ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้นำ Trap กลับเข้ามือ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? returnTrapsToHand(state, targetId) : state;
    },
  },
  A059: {
    code: 'A059', name_en: 'Mine Now', name_th: 'ของฉันแล้ว',
    description_th: 'ขโมย Trap ที่วางไว้ของผู้เล่นอีก 1 คน แล้วนำกลับเข้ามือคุณ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะขโมย Trap',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealRandomTrapToHand(state, targetId, frame.actorId) : state;
    },
  },
  A086: {
    code: 'A086', name_en: 'I Can Explain', name_th: 'ฉันอธิบายได้นะ',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้หงาย Trap ที่วางไว้ทั้งหมด โดยไม่ทำให้ Trap ทำงาน',
    kind: 'no_op',
    executeEffect: (state) => state,
  },
  A113: {
    code: 'A113', name_en: 'Suddenly Pineapples', name_th: 'จู่ ๆ ก็สับปะรด',
    description_th: 'ทิ้ง Trap ที่วางอยู่ทั้งหมด',
    kind: 'auto',
    executeEffect: (state, frame) => {
      let next = state;
      for (const id of Object.keys(next.players)) next = id === frame.actorId ? discardAllTraps(next, id) : forceDiscardAllTraps(next, id);
      return next;
    },
  },

  // -- Family H1: deck & discard-pile manipulation (classification doc §Family H) --

  A026: {
    code: 'A026', name_en: 'Magic Trick', name_th: 'มายากล',
    description_th: 'คุณมีเวลา 10 วินาทีในการเลือกไพ่ 1 ใบจากกองมาเก็บไว้',
    kind: 'auto',
    // ponytail: "spread the deck and pick one under time pressure" has no
    // digital equivalent (the deck isn't shown card-by-card) -- treated as a
    // plain draw of 1 from the top.
    executeEffect: (state, frame) => draw(state, frame.actorId, 1),
  },
  A046: {
    code: 'A046', name_en: 'Homework', name_th: 'การบ้าน',
    description_th: 'ดูไพ่ 5 ใบถัดไปจากกอง เลือกเก็บไว้ 1 ใบ',
    kind: 'auto',
    // ponytail: no card-picker UI exists yet, so this takes a random one of
    // the 5 peeked cards instead of letting the actor choose.
    executeEffect: (state, frame) => takeRandomFromPeek(state, frame.actorId, 5),
  },
  A106: {
    code: 'A106', name_en: 'Pie Flavor', name_th: 'พายรสอะไร?',
    description_th: 'เลือกไพ่ 1 ใบจากไพ่ 10 ใบล่าสุดในกองทิ้งมาเก็บไว้',
    kind: 'auto',
    executeEffect: (state, frame) => takeRandomFromDiscardWindow(state, frame.actorId, 10),
  },
  A116: {
    code: 'A116', name_en: 'Time Machine', name_th: 'ไทม์แมชชีน',
    description_th: 'นำไพ่ของคุณ 1 ใบจากกองทิ้งกลับมา',
    kind: 'auto',
    // Scope reduction, not just a UI simplification: discardPile has no
    // per-card "who discarded this" ownership tracking, so "one of YOUR
    // cards" can't be identified -- this takes back a random discarded card
    // from anyone's.
    executeEffect: (state, frame) => {
      if (state.discardPile.length === 0) return state;
      const code = state.discardPile[Math.floor(Math.random() * state.discardPile.length)];
      return returnCardToHand(state, code, frame.actorId);
    },
  },
  A117: {
    code: 'A117', name_en: 'What Are You Doing?!', name_th: 'นายทำอะไรเนี่ย?!',
    description_th: 'นำกองทิ้งทั้งหมดโดยไม่สับ ไปวางไว้ด้านบนของกองจั่ว',
    kind: 'auto',
    executeEffect: (state) => {
      if (state.discardPile.length === 0) return state;
      return { ...state, drawPile: [...state.drawPile, ...state.discardPile], discardPile: [] };
    },
  },
  A122: {
    code: 'A122', name_en: "You're Adopted", name_th: 'นายถูกรับเลี้ยงแล้ว',
    description_th: 'นำไพ่ 3 ใบล่าสุดจากกองทิ้งมาเป็นของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => takeTopNFromDiscard(state, frame.actorId, 3),
  },
  A133: {
    code: 'A133', name_en: 'Screw Gravity', name_th: 'ช่างหัวแรงโน้มถ่วง!',
    description_th: 'จั่วไพ่ 3 ใบจากด้านล่างของกองจั่ว',
    kind: 'auto',
    executeEffect: (state, frame) => drawFromBottom(state, frame.actorId, 3),
  },

  // -- Family I2/I5 + J2(objective)/J3: meta/global one-off, named-card refs,
  //    objective extreme-state cards (classification doc §Family I, §Family J) --

  A076: {
    code: 'A076', name_en: 'Falling Up', name_th: 'ตกขึ้นข้างบน',
    description_th: 'กลับทิศทางการเล่น',
    kind: 'auto',
    executeEffect: (state) => reverseDirection(state),
  },
  A021: {
    code: 'A021', name_en: 'Seen My Pony?', name_th: 'เห็นโพนี่ของฉันไหม?',
    description_th: 'หาก "Magical Pony" อยู่ในกองทิ้ง ให้นำไพ่ใบนั้นมาใส่ในมือคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => {
      if (!state.discardPile.includes('A097')) return state;
      return returnCardToHand(state, 'A097', frame.actorId);
    },
  },
  A048: {
    code: 'A048', name_en: 'I Want My Lemons', name_th: 'เอามะนาวฉันคืนมา!',
    description_th: 'ถามว่า "Do you have my lemons?" หากผู้เล่นคนอื่นมีไพ่ "My Lemons" ให้ขโมยไพ่ทั้งหมดในมือของผู้เล่นคนนั้น',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const holderId = Object.keys(state.players).find(
        (id) => id !== frame.actorId && state.players[id].hand.includes('A127')
      );
      return holderId ? executeFullHandTransfer(state, holderId, frame.actorId) : state;
    },
  },
  A073: {
    code: 'A073', name_en: 'Draw A Bear', name_th: 'จั่วหมี',
    description_th: 'จั่วไพ่ 3 ใบ หากหนึ่งในนั้นคือ "Desmond The Moon Bear" ให้จั่วเพิ่มอีก 3 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const gotBear = peekTopN(state, 3).includes('A070');
      const afterDraw = draw(state, frame.actorId, 3);
      return gotBear ? draw(afterDraw, frame.actorId, 3) : afterDraw;
    },
  },
  A088: {
    code: 'A088', name_en: 'I Suck At This Game', name_th: 'ฉันห่วยเกมนี้',
    description_th: 'ผู้เล่นที่มีไพ่ในมือน้อยที่สุดจั่วไพ่ 3 ใบ หากเสมอกันให้ผู้เล่นที่เสมอกันทั้งหมดจั่ว',
    kind: 'auto',
    executeEffect: (state) => rosterDraws(state, extremeByHandSize(state, 'min'), 3),
  },
  A050: {
    code: 'A050', name_en: 'Intervention', name_th: 'ต้องคุยกันหน่อยแล้ว',
    description_th: 'ผู้เล่นที่มีไพ่ในมือมากที่สุดต้องข้ามเทิร์นถัดไป หากเสมอกัน ผู้เล่นที่เสมอกันทั้งหมดข้ามเทิร์น',
    kind: 'auto',
    executeEffect: (state) => rosterSkipTurn(state, extremeByHandSize(state, 'max')),
  },

  // A158: "if you haven't drunk this round, steal 3 from whoever has drunk
  // the most" -- no per-player drink counter exists anywhere in this
  // codebase (or gets added here). Resolved live, honor-system, via
  // needsDrinkCheck's two-step UI flow (outcome toggle, then a conditional
  // target pick) -- see its doc comment in ./types.ts.
  A158: {
    code: 'A158', name_en: 'Sober Spy', name_th: 'ตาสว่างยามเมา', kind: 'auto',
    needsDrinkCheck: true,
    outcomePrompt: 'คุณดื่มไปหรือยังในรอบนี้?', outcomeYesLabel: 'ดื่มแล้ว', outcomeNoLabel: 'ยังไม่ดื่ม',
    targetPrompt: 'ใครดื่มมากที่สุดตอนนี้?',
    description_th: 'ถ้าคุณยังไม่ได้ดื่มเลยในรอบนี้ ขโมยไพ่ 3 ใบจากผู้เล่นที่ดื่มมากที่สุด',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;
    },
  },

  // A118: steal 3 from whoever suggested this game (RoomState.gameSuggesterId,
  // host-picked during setup -- see game/room.ts's setGameSuggester).
  A118: {
    code: 'A118', name_en: 'Whose Idea?', name_th: 'ไอเดียใครเนี่ย?', kind: 'auto',
    description_th: 'ขโมยไพ่ 3 ใบจากผู้เล่นที่เป็นคนเสนอให้เล่นเกมนี้',
    executeEffect: (state, frame) => {
      const suggesterId = state.gameSuggesterId;
      if (!suggesterId || !state.players[suggesterId] || suggesterId === frame.actorId) return state;
      return forceSteal(state, suggesterId, frame.actorId, 3);
    },
  },

  // A135: change the Muffin Time win target -- needs a free-form number from
  // the actor (see needsNumberInput's doc comment in ./types.ts).
  A135: {
    code: 'A135', name_en: 'Time of Death', name_th: 'เวลาแห่งความตาย', kind: 'auto',
    needsNumberInput: true,
    numberInputPrompt: 'เลือกจำนวนไพ่เป้าหมายใหม่สำหรับ Muffin Time',
    numberInputMin: 1, numberInputMax: 20,
    description_th: 'เปลี่ยนเงื่อนไขชนะของ Muffin Time จาก 10 ใบ เป็นจำนวนไพ่ที่คุณเลือก และใช้จำนวนใหม่นี้ไปจนจบเกม',
    executeEffect: (state, frame) => {
      const n = numberInputFromFrame(frame);
      if (n === undefined || n <= 0) return state;
      return changeMuffinTarget(state, n);
    },
  },

  // A023/A024/A027: win/lose evaluated at the ACTOR's own next turn, not
  // immediately -- each pushes a RoomState.pendingWinChecks entry (see its
  // doc comment in ../types.ts) consumed by game/turn.ts's
  // resolvePendingWinChecks, which lib/session.tsx's advanceAndCheckWin
  // calls on every turn transition.
  A023: {
    code: 'A023', name_en: 'Shoot Me', name_th: 'ยิงฉันสิ', kind: 'auto',
    description_th: 'หากถึงเทิร์นถัดไปของคุณแล้วยังมีไพ่เหลืออยู่ในมือ คุณชนะเกม',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      next.pendingWinChecks = [...(next.pendingWinChecks ?? []), { sourcePlayerId: frame.actorId, type: 'hand_nonempty' }];
      return next;
    },
  },
  A024: {
    code: 'A024', name_en: 'The End', name_th: 'จุดจบ', kind: 'auto',
    description_th: 'เมื่อถึงเทิร์นถัดไปของคุณ ผู้เล่นที่มีไพ่ในมือน้อยที่สุดชนะ หากเสมอกัน ให้ลองใหม่',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      next.pendingWinChecks = [...(next.pendingWinChecks ?? []), { sourcePlayerId: frame.actorId, type: 'fewest_hand' }];
      return next;
    },
  },
  A027: {
    code: 'A027', name_en: '1 Year to Live', name_th: 'เหลือเวลาอีก 1 ปี', kind: 'auto',
    description_th: 'เมื่อถึงเทิร์นถัดไปของคุณ ผู้เล่นที่มีไพ่ในมือมากที่สุดชนะ หากเสมอกัน ให้ลองใหม่',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      next.pendingWinChecks = [...(next.pendingWinChecks ?? []), { sourcePlayerId: frame.actorId, type: 'most_hand' }];
      return next;
    },
  },

  // -- Birthday cards (classification doc §I4/§J4) -- PlayerState.birthdayMMDD
  // is optional and self-reported (game/types.ts); GameTable stamps "today"
  // (the actor's own device clock, MM-DD) into customPayload before pushing
  // the frame, since executeEffect must stay pure -- see needsTodayDate's
  // doc comment in ./types.ts. --

  A037: {
    code: 'A037', name_en: 'Birthday', name_th: 'วันเกิด', kind: 'auto',
    needsTodayDate: true,
    description_th: 'หากวันนี้เป็นวันเกิดของคุณ คุณชนะเกมทันที!',
    executeEffect: (state, frame) => {
      const today = todayFromFrame(frame);
      const birthday = state.players[frame.actorId]?.birthdayMMDD;
      if (!today || !birthday || birthday !== today) return state;
      // Same gate checkWinnerAtTurnStart applies for A085's "no one can win
      // until my next turn" -- this path bypasses that turn-start check
      // entirely (it's an instant win), so it must re-check here itself.
      if (state.globalRestrictions?.some((r) => r.type === 'no_win')) return state;
      // Not state.status !== 'playing' -> already finished by something
      // else in the same resolution pass; no-op rather than clobber it.
      // Inline (not room.ts's finishGame, which throws on this precondition)
      // matches advanceAndCheckWin's existing win-declaration shape.
      if (state.status !== 'playing') return state;
      return { ...state, status: 'finished', winnerId: frame.actorId, finishReason: 'normal' };
    },
  },
  A066: {
    code: 'A066', name_en: 'Cake Day', name_th: 'วันเค้ก', kind: 'auto',
    needsTodayDate: true,
    description_th: 'ผู้เล่นทุกคนมอบไพ่คนละ 1 ใบให้ผู้เล่นที่มีวันเกิดใกล้จะถึงที่สุด',
    executeEffect: (state, frame) => {
      const today = todayFromFrame(frame);
      if (!today) return state;
      const recipients = soonestBirthdayPlayers(state, today);
      if (recipients.length === 0) return state;
      return everyoneGivesOneTo(state, recipients, frame.actorId);
    },
  },
  A137: {
    code: 'A137', name_en: 'What Did You Get?', name_th: 'ได้อะไรมา?', kind: 'auto',
    needsTodayDate: true,
    description_th: 'ผู้เล่นทุกคนขโมยไพ่ 1 ใบจากผู้เล่นที่มีวันเกิดครั้งถัดไปใกล้ที่สุด',
    executeEffect: (state, frame) => {
      const today = todayFromFrame(frame);
      if (!today) return state;
      const targets = soonestBirthdayPlayers(state, today);
      if (targets.length === 0) return state;
      return everyoneStealsOneFrom(state, targets, frame.actorId);
    },
  },

  // -- Family A: condition-filtered player selection (classification doc §Family A) --
  // "All players matching a real-world condition" -- the active player taps
  // through a roster of everyone in the room and marks who qualifies (the
  // "who ate meat in the last 24h" example this whole system was designed
  // around), then the fixed effect applies to just the ones marked.

  // A1: roster draws N
  A002: {
    code: 'A002', name_en: 'Oh No! Babies!', name_th: 'โอ้ไม่นะ! เด็กใหม่!',
    description_th: 'ผู้เล่นทุกคนที่ไม่เคยเล่นเกมนี้มาก่อน จั่วไพ่คนละ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ไม่เคยเล่นเกมนี้มาก่อน',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 3),
  },
  A011: {
    code: 'A011', name_en: 'I Am Lonely', name_th: 'ฉันเหงา',
    description_th: 'ผู้เล่นทุกคนที่ไม่ได้อยู่ในความสัมพันธ์ จั่วไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ไม่ได้อยู่ในความสัมพันธ์',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 2),
  },
  A065: {
    code: 'A065', name_en: 'Big Bee', name_th: 'ผึ้งยักษ์',
    description_th: 'ผู้เล่นทุกคนที่มีตัวอักษร "b" อยู่ในชื่อเต็ม จั่วไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่มีตัวอักษร "b" ในชื่อเต็ม',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 2),
  },
  A069: {
    code: 'A069', name_en: 'Cool Hat', name_th: 'หมวกเท่จัง',
    description_th: 'ผู้เล่นทุกคนที่สวมหมวก จั่วไพ่คนละ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่สวมหมวก',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 3),
  },
  A098: {
    code: 'A098', name_en: 'Medication', name_th: 'ยา',
    description_th: 'ผู้เล่นทุกคนที่กินยาภายใน 24 ชั่วโมงที่ผ่านมา จั่วไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่กินยาภายใน 24 ชั่วโมงที่ผ่านมา',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 2),
  },
  A138: {
    code: 'A138', name_en: "You're A Nerd", name_th: 'นายมันเด็กเนิร์ด',
    description_th: 'ผู้เล่นทุกคนที่สวมแว่น จั่วไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่สวมแว่น',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 2),
  },
  A139: {
    code: 'A139', name_en: 'Bottoms Up', name_th: 'หมดแก้ว!',
    description_th: 'ผู้เล่นทุกคนที่ยังดื่มไม่หมดแก้วในมือ ดื่มให้หมด แล้วจั่วไพ่คนละ 1 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ยังดื่มไม่หมดแก้ว',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 1),
  },

  // A2: roster discards N
  A012: {
    code: 'A012', name_en: 'Nice Hat', name_th: 'หมวกสวยนะ',
    description_th: 'ผู้เล่นทุกคนที่สวมหมวก ทิ้งไพ่คนละ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่สวมหมวก',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A013: {
    code: 'A013', name_en: 'Parked Car', name_th: 'รถจอดอยู่',
    description_th: 'ผู้เล่นทุกคนที่ขับรถเป็น ทิ้งไพ่คนละ 1 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ขับรถเป็น',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 1),
  },
  A042: {
    code: 'A042', name_en: 'Get Off My Property', name_th: 'ออกไปจากบ้านฉัน!',
    description_th: 'ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ ทิ้งไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ไม่ได้อาศัยอยู่ที่นี่',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },
  A068: {
    code: 'A068', name_en: 'Cat Allergy', name_th: 'แพ้แมว',
    description_th: 'ผู้เล่นทุกคนที่เลี้ยงแมว ทิ้งไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่เลี้ยงแมว',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },
  A102: {
    code: 'A102', name_en: 'No Dog?!', name_th: 'ไม่มีหมาเหรอ?!',
    description_th: 'ผู้เล่นทุกคนที่ไม่ได้เลี้ยงสุนัข ทิ้งไพ่คนละ 2 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ไม่ได้เลี้ยงสุนัข',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },
  A131: {
    code: 'A131', name_en: 'Rainbows', name_th: 'สายรุ้ง',
    description_th: 'เลือกสีของสายรุ้ง 1 สี ผู้เล่นทุกคนที่สวมใส่สีนั้นทิ้งไพ่คนละ 1 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกสีก่อน แล้วเลือกผู้เล่นที่สวมใส่สีนั้น',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 1),
  },

  // A3: actor steals 1 from each roster member
  A081: {
    code: 'A081', name_en: 'Hey, Are You An Angel?', name_th: 'เฮ้ เธอเป็นนางฟ้าเหรอ?',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นผู้หญิงทุกคน',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่เป็นผู้หญิง',
    executeEffect: (state, frame) => rosterStolenBy(state, frame.actorId, rosterIdsFromFrame(frame), 1),
  },
  A103: {
    code: 'A103', name_en: 'No Llama No!', name_th: 'ไม่นะ ลามะ ไม่!',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นทุกคนที่ขับรถไม่เป็น',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ขับรถไม่เป็น',
    executeEffect: (state, frame) => rosterStolenBy(state, frame.actorId, rosterIdsFromFrame(frame), 1),
  },
  A111: {
    code: 'A111', name_en: 'Snake Arms', name_th: 'แขนงู',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นผู้ชายทุกคน',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่เป็นผู้ชาย',
    executeEffect: (state, frame) => rosterStolenBy(state, frame.actorId, rosterIdsFromFrame(frame), 1),
  },

  // A4: roster skips their next turn
  A089: {
    code: 'A089', name_en: 'I Used To Be A Cow', name_th: 'ฉันเคยเป็นวัว',
    description_th: 'ผู้เล่นทุกคนที่กินเนื้อสัตว์ ข้ามเทิร์นถัดไป',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่กินเนื้อสัตว์',
    executeEffect: (state, frame) => rosterSkipTurn(state, rosterIdsFromFrame(frame)),
  },

  // -- Family E: dare / challenge / social-judgment (classification doc §Family E) --
  // The group decides the real-world outcome among themselves; the app just
  // records who it applies to. For E2/E3/E7/E8 ("steal/discard only if X
  // happened"), the target picker doubles as the outcome: pick the player it
  // applies to, or cancel if nobody triggered the effect -- no separate
  // pass/fail step needed.

  // E1: single-target contest, winner draws 3
  A006: {
    code: 'A006', name_en: 'Showdown', name_th: 'ดวลสายตา',
    description_th: 'Mini-Game: แข่งจ้องตากับผู้เล่นอีก 1 คน ผู้ชนะจั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครชนะการดวลตา?',
    executeEffect: (state, frame) => {
      const winnerId = frame.targetIds[0];
      return winnerId ? draw(state, winnerId, 3) : state;
    },
  },
  A067: {
    code: 'A067', name_en: "Can't Breathe", name_th: 'หายใจไม่ออก',
    description_th: 'Mini-Game: แข่งกลั้นหายใจ ผู้เล่นที่กลั้นได้นานที่สุดจั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครกลั้นหายใจได้นานที่สุด?',
    executeEffect: (state, frame) => {
      const winnerId = frame.targetIds[0];
      return winnerId ? draw(state, winnerId, 3) : state;
    },
  },
  A096: {
    code: 'A096', name_en: 'Joust Time', name_th: 'ถึงเวลาดวล!',
    description_th: 'Mini-Game: เป่ายิ้งฉุบกับผู้เล่นอีก 1 คน ผู้ชนะจั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครชนะเป่ายิ้งฉุบ?',
    executeEffect: (state, frame) => {
      const winnerId = frame.targetIds[0];
      return winnerId ? draw(state, winnerId, 3) : state;
    },
  },
  A114: {
    code: 'A114', name_en: 'Take It Outside', name_th: 'ไปเคลียร์กันข้างนอก!',
    description_th: 'Mini-Game: ท้าอีก 1 คนงัดข้อหรือเล่นสงครามนิ้วโป้ง ผู้ชนะจั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครชนะ?',
    executeEffect: (state, frame) => {
      const winnerId = frame.targetIds[0];
      return winnerId ? draw(state, winnerId, 3) : state;
    },
  },
  A160: {
    code: 'A160', name_en: 'Duel of Sips', name_th: 'คู่ดวลดื่ม',
    description_th: 'ท้าผู้เล่นอีกคนดื่มแข่งกัน คนที่ดื่มหมดก่อนจั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครดื่มหมดก่อน?',
    executeEffect: (state, frame) => {
      const winnerId = frame.targetIds[0];
      return winnerId ? draw(state, winnerId, 3) : state;
    },
  },

  // E2: single-target dare; success favors the ACTOR (steal from target)
  A033: {
    code: 'A033', name_en: 'Can You Do This?', name_th: 'ทำแบบนี้ได้ไหม?',
    description_th: 'Mini-Game: ทำท่าทางอย่างหนึ่ง แล้วเลือกผู้เล่นอีก 1 คนให้ทำตาม หากทำไม่ได้ ขโมยไพ่จากเขา 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครทำท่าตามไม่ได้? (ถ้าทุกคนทำได้ ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;
    },
  },
  A062: {
    code: 'A062', name_en: 'Baby Voice', name_th: 'เสียงเด็กน้อย',
    description_th: 'Mini-Game: เลือกผู้เล่นอีก 1 คนให้พูดด้วยเสียงเด็กจนถึงเทิร์นถัดไปของคุณ หากทำไม่ได้ ขโมยไพ่จากเขา 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครทำไม่ได้? (ถ้าทำได้ ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;
    },
  },
  A105: {
    code: 'A105', name_en: 'Oh No!', name_th: 'โอ้ไม่นะ!',
    description_th: 'Mini-Game: ทายจำนวน Action ที่อยู่ในมือของผู้เล่นอีก 1 คน หากทายจำนวนได้ถูกต้องพอดี ขโมย Action ทั้งหมดของผู้เล่นคนนั้น',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ทายถูกไหม? เลือกผู้เล่นที่ทายถูก (ถ้าทายผิด ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? stealAllActionCards(state, targetId, frame.actorId) : state;
    },
  },
  A136: {
    code: 'A136', name_en: "What's Their Name?", name_th: 'เขาชื่ออะไรนะ?',
    description_th: 'เลือกผู้เล่นอีก 1 คน หากผู้เล่นคนนั้นไม่รู้ชื่อเต็มของคุณ ขโมยไพ่จากเขา 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครไม่รู้ชื่อเต็มของคุณ? (ถ้ารู้หมด ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;
    },
  },
  A147: {
    code: 'A147', name_en: 'Dance for Me', name_th: 'เต้นให้ดู',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้เต้นท่าที่คุณสั่ง 10 วินาที ถ้าทำไม่ได้ ขโมยไพ่จากเขา 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครทำไม่ได้? (ถ้าทำได้ ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;
    },
  },
  A149: {
    code: 'A149', name_en: 'Whisper Dare', name_th: 'กระซิบท้าทาย',
    description_th: 'กระซิบคำสั่งอายๆ ให้ผู้เล่นอีกคนทำทันที ถ้าทำสำเร็จขโมยไพ่ 2 ใบจากเขา',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครทำสำเร็จ? (ถ้าไม่มี ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 2) : state;
    },
  },
  A170: {
    code: 'A170', name_en: 'Guess the Buzz', name_th: 'เกมทายใจ',
    description_th: 'ทายว่าผู้เล่นอีก 1 คนดื่มไปกี่แก้วแล้ว ถ้าทายถูก ขโมยไพ่ 2 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ทายถูกไหม? เลือกผู้เล่นที่ทายถูก (ถ้าทายผิด ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 2) : state;
    },
  },

  // E3: single-target dare; failure/refusal -> TARGET discards N
  A057: {
    code: 'A057', name_en: 'Lie to Me', name_th: 'โกหกฉันสิ',
    description_th: 'Mini-Game: บอกผู้เล่นอีก 1 คนด้วยเรื่องจริง 1 เรื่องและเรื่องโกหก 1 เรื่อง หากเขาแยกไม่ได้ว่าเรื่องไหนจริงหรือโกหก เขาต้องทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครแยกไม่ได้? (ถ้าแยกได้ ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 3) : state;
    },
  },
  A061: {
    code: 'A061', name_en: 'Alphabet', name_th: 'ท่องตัวอักษร',
    description_th: 'Mini-Game: เลือกผู้เล่นอีก 1 คนให้ท่องตัวอักษรภาษาอังกฤษจาก Z → A หากพูดผิด ให้ทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครพูดผิด? (ถ้าไม่มีใครพูดผิด ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 3) : state;
    },
  },
  A151: {
    code: 'A151', name_en: 'Butterfingers', name_th: 'เก็บของตกไม่ทัน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ถือแก้วด้วยมือเดียวไปจนถึงเทิร์นถัดไปของคุณ ถ้าวางแก้วลงหรือทำหล่น ให้ทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครทำแก้วหล่น/วางลง? (ถ้าไม่มี ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 3) : state;
    },
  },
  A152: {
    code: 'A152', name_en: 'Forced Karaoke', name_th: 'คาราโอเกะบังคับ',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ร้องเพลง 1 ท่อนตอนนี้เลย ถ้าปฏิเสธ ทิ้งไพ่ 4 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครปฏิเสธ? (ถ้าร้องหมด ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 4) : state;
    },
  },
  A162: {
    code: 'A162', name_en: 'Awkward Pose', name_th: 'แต๊ะอิงแขนขา',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ค้างท่าทางแปลกๆ จนกว่าจะถึงเทิร์นถัดไปของคุณ ถ้าขยับก่อน ทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครขยับก่อน? (ถ้าไม่มี ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 3) : state;
    },
  },

  // E4: self performs for the group; verdict -> self draw/discard (binary, no target)
  A148: {
    code: 'A148', name_en: 'Dad Joke Roulette', name_th: 'มุกแป้กหรือปัง',
    description_th: 'เล่ามุกตลก ถ้าไม่มีใครหัวเราะ ทิ้งไพ่ 2 ใบ ถ้ามีคนหัวเราะ จั่ว 2 ใบ',
    kind: 'outcome_entry', needsOutcomeEntry: true, outcomePrompt: 'มีใครหัวเราะไหม?', outcomeYesLabel: 'มีคนหัวเราะ', outcomeNoLabel: 'ไม่มีใครหัวเราะ',
    executeEffect: (state, frame) => {
      const laughed = outcomeFromFrame(frame);
      if (laughed === true) return draw(state, frame.actorId, 2);
      if (laughed === false) return discard(state, frame.actorId, 2);
      return state;
    },
  },
  A150: {
    code: 'A150', name_en: 'Drunk Impression', name_th: 'เลียนแบบเสียงเมา',
    description_th: 'พูดประโยคที่กำหนดด้วยเสียงเหมือนคนเมา ถ้าทำให้คนอื่นหัวเราะได้ จั่วไพ่ 3 ใบ',
    kind: 'outcome_entry', needsOutcomeEntry: true, outcomePrompt: 'ทำให้คนอื่นหัวเราะได้ไหม?', outcomeYesLabel: 'หัวเราะ', outcomeNoLabel: 'ไม่หัวเราะ',
    executeEffect: (state, frame) => (outcomeFromFrame(frame) === true ? draw(state, frame.actorId, 3) : state),
  },

  // E5: 2-3 chosen players compete, group-judged; loser(s) discard N
  A146: {
    code: 'A146', name_en: 'Red Face Loses', name_th: 'หน้าแดงก่อนแพ้',
    description_th: 'เลือกผู้เล่น 2 คนมาแข่งกันใครหน้าแดงกว่ากัน (ให้คนอื่นตัดสิน) คนแพ้ทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่แพ้ (หน้าแดงกว่า)',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A157: {
    code: 'A157', name_en: 'Stage Director', name_th: 'จอมบงการเวที',
    description_th: 'เลือกผู้เล่น 2 คนให้แสดงบทสนทนาสั้นๆ ที่คุณกำหนด คนที่แสดงได้แย่กว่าทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่แสดงแย่กว่า',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A165: {
    code: 'A165', name_en: 'Command Chain', name_th: 'เจ้าพ่อคำสั่ง',
    description_th: 'สั่งให้ผู้เล่น 3 คนทำท่าทางต่างกันพร้อมกัน คนที่ทำผิดจังหวะทิ้งไพ่ 2 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ทำผิดจังหวะ',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },

  // E6: all players do a simultaneous challenge; straggler(s) discard N
  A083: {
    code: 'A083', name_en: 'Hit The Apple', name_th: 'ตีแอปเปิล!',
    description_th: 'Mini-Game: ผู้เล่นทุกคนรวมถึงคุณต้องแตะไพ่ใบนี้ คนสุดท้ายที่แตะต้องทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่แตะช้าสุด',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A104: {
    code: 'A104', name_en: 'Okay, Draw!', name_th: 'โอเค ชักปืน!',
    description_th: 'Mini-Game: ผู้เล่นทุกคนทำมือเป็นปืนแล้วเล็งใส่กัน ผู้เล่นที่ถูกเล็งมากที่สุดทิ้งไพ่ 3 ใบ หากเสมอกันให้ผู้เล่นที่เสมอกันทั้งหมดทิ้ง',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ถูกเล็งมากที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A134: {
    code: 'A134', name_en: 'Standing Up School', name_th: 'โรงเรียนยืนขึ้น',
    description_th: 'Mini-Game: ผู้เล่นทุกคนรวมถึงคุณต้องยืนขึ้น คนสุดท้ายที่ยืนต้องทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ยืนช้าสุด',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A143: {
    code: 'A143', name_en: "King's Toast", name_th: 'ประกาศศักดา',
    description_th: 'ประกาศตัวเองเป็นราชา ผู้เล่นทุกคนต้องดื่มก่อนคุณ ไม่งั้นทิ้งไพ่ 2 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ดื่มไม่ทันก่อนคุณ',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },
  A163: {
    code: 'A163', name_en: 'Hands Up', name_th: 'ยกมือขึ้น!',
    description_th: 'ทุกคนต้องยกแก้วขึ้นเหนือหัวไปจนจบรอบนี้ คนที่ลืมทิ้งไพ่ 2 ใบ',
    kind: 'outcome_entry', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่ลืมยกแก้ว',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },

  // E7: whole group votes a target; target discards N
  A142: {
    code: 'A142', name_en: "Who's the Drunkest", name_th: 'ใครเมาสุด',
    description_th: 'โหวตกันว่าใครดูเมาที่สุดตอนนี้ คนนั้นทิ้งไพ่ 3 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครโดนโหวตว่าเมาสุด?',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 3) : state;
    },
  },
  A173: {
    code: 'A173', name_en: 'Vote to Roast', name_th: 'โหวตไล่ล่า',
    description_th: 'ทุกคนโหวตว่าใครทำตัวน่าอายที่สุดในรอบนี้ คนนั้นทิ้งไพ่ 4 ใบ',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'ใครโดนโหวตว่าน่าอายที่สุด?',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceDiscard(state, targetId, 4) : state;
    },
  },

  // E8: single target offered a choice; only one branch has a card effect
  A153: {
    code: 'A153', name_en: 'Truth Booze', name_th: 'จริงหรือดื่ม',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ตอบคำถามลับๆ หรือดื่ม ถ้าเลือกดื่ม ขโมยไพ่ 2 ใบจากเขา',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่น ถ้าเขาเลือก "ดื่ม" (ถ้าเขาตอบคำถาม ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 2) : state;
    },
  },
  A167: {
    code: 'A167', name_en: 'Drunk Confession', name_th: 'บอกความลับตอนเมา',
    description_th: 'ถามคำถามลับกับผู้เล่นอีก 1 คน ถ้าตอบ ขโมยไพ่ 1 ใบจากเขา ถ้าไม่ตอบ เขาดื่ม 1 อึก',
    kind: 'outcome_entry', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่น ถ้าเขาตอบคำถาม (ถ้าไม่ตอบ ให้กดยกเลิก)',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? forceSteal(state, targetId, frame.actorId, 1) : state;
    },
  },

  // E9: purely social/physical, zero card-state change
  A128: {
    code: 'A128', name_en: 'New Camera', name_th: 'กล้องใหม่',
    description_th: 'Mini-Game: ถ่ายรูปร่วมกับผู้เล่นทุกคน (ความทรงจำเหล่านี้มีค่านะ)',
    kind: 'no_op', executeEffect: (state) => state,
  },
  A154: {
    code: 'A154', name_en: 'The Puppet Master', name_th: 'ผู้บงการ',
    description_th: 'เลือกผู้เล่น 1 คนให้เป็นหุ่นเชิดของคุณ เขาต้องทำตามคำสั่งของคุณ 1 คำสั่งในเทิร์นถัดไปของเขา',
    kind: 'no_op', executeEffect: (state) => state,
  },
  A161: {
    code: 'A161', name_en: 'Confess or Drink', name_th: 'ยอมสารภาพ',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้สารภาพความลับเล็กๆ หรือดื่ม 2 อึก',
    kind: 'no_op', executeEffect: (state) => state,
  },
  A169: {
    code: 'A169', name_en: 'Crowd Chant', name_th: 'เสียงเรียกร้อง',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ทุกคนตะโกนชื่อเขาพร้อมกัน 3 ครั้ง เขาต้องดื่ม 1 อึก',
    kind: 'no_op', executeEffect: (state) => state,
  },

  // -- Unique/one-off cards, Phase 1 subset (classification doc §Section 3) --

  A007: {
    code: 'A007', name_en: 'Mystery Button', name_th: 'ปุ่มปริศนา',
    description_th: 'Mini-Game: โยนเหรียญ ถ้าออกหัว จั่ว 3 ใบ ถ้าออกก้อย ทิ้ง 3 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => (Math.random() < 0.5 ? draw(state, frame.actorId, 3) : discard(state, frame.actorId, 3)),
  },
  A020: {
    code: 'A020', name_en: 'New You', name_th: 'ตัวตนใหม่',
    description_th: 'ทิ้งไพ่ทั้งหมดในมือ แล้วจั่วไพ่ใหม่ในจำนวนเท่ากัน',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const count = state.players[frame.actorId].hand.length;
      return draw(discard(state, frame.actorId, count), frame.actorId, count);
    },
  },
  A022: {
    code: 'A022', name_en: 'Single', name_th: 'ตัวคนเดียว',
    description_th: 'หากไพ่ใบนี้เป็นไพ่เพียงใบเดียวในมือคุณ ให้จั่วไพ่ 10 ใบ',
    kind: 'auto',
    // By the time this runs, the played card is already discarded -- an
    // empty hand here means this WAS the only card.
    executeEffect: (state, frame) => (state.players[frame.actorId].hand.length === 0 ? draw(state, frame.actorId, 10) : state),
  },
  A036: {
    code: 'A036', name_en: 'Confession', name_th: 'คำสารภาพ',
    description_th: 'จั่วไพ่ 3 ใบ แต่ต้องเปิดให้ผู้เล่นคนอื่นทุกคนเห็น',
    kind: 'auto',
    // The "reveal your hand" half is a table-talk instruction, not tracked state.
    executeEffect: (state, frame) => draw(state, frame.actorId, 3),
  },
  A043: {
    code: 'A043', name_en: 'Got It Back In', name_th: 'เอากลับเข้าไปแล้ว',
    description_th: 'ขโมยไพ่ทั้งหมดในมือของผู้เล่นอีก 1 คน แล้วนำไพ่เหล่านั้นไปใส่ไว้ตรงไหนก็ได้ในกองจั่ว',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะยึดมือแล้วฝังไพ่กลับเข้ากอง',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      const next = cloneState(state);
      const taken = next.players[targetId].hand;
      next.players[targetId].hand = [];
      for (const code of taken) {
        const pos = Math.floor(Math.random() * (next.drawPile.length + 1));
        next.drawPile.splice(pos, 0, code);
      }
      return next;
    },
  },
  A055: {
    code: 'A055', name_en: 'Killed Us All', name_th: 'ฆ่าพวกเราหมดเลย',
    description_th: 'คุณทิ้งไพ่ 2 ใบ ผู้เล่นคนอื่นทั้งหมดทิ้งคนละ 1 ใบ',
    kind: 'auto',
    executeEffect: (state, frame) => everyoneDiscards(discard(state, frame.actorId, 2), 1, [frame.actorId]),
  },
  A063: {
    code: 'A063', name_en: 'Baby With A Gun', name_th: 'เด็กถือปืน',
    description_th: 'ขโมยไพ่กี่ใบก็ได้จากผู้เล่นคนอื่นกี่คนก็ได้',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่จะขโมยไพ่ (1 ใบต่อคน)',
    // ponytail: real card lets the actor pick both how many players AND how
    // many cards from each, fully free-form; no numeric-input UI exists yet,
    // so this steals a fixed 1 card from each player in the roster instead.
    executeEffect: (state, frame) => rosterStolenBy(state, frame.actorId, rosterIdsFromFrame(frame), 1),
  },
  A071: {
    code: 'A071', name_en: 'Do The Flop', name_th: 'ล้มตัวลง!',
    description_th: 'ผู้เล่นทุกคนวางไพ่ในมือหงายหน้าไว้จนถึงเทิร์นถัดไปของคุณ',
    kind: 'no_op',
    // Same architecture gap as A025/A030/A086: a temporary visibility change,
    // not a state mutation -- no per-viewer "what's revealed" channel exists.
    executeEffect: (state) => state,
  },
  A075: {
    code: 'A075', name_en: 'Evil Tie', name_th: 'เนกไทปีศาจ',
    description_th: 'ขโมยไพ่ 1 ใบจากผู้เล่นทุกคนที่มีจำนวนไพ่ในมือเท่ากับคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const myCount = state.players[frame.actorId].hand.length;
      const matching = Object.keys(state.players).filter(
        (id) => id !== frame.actorId && state.players[id].hand.length === myCount
      );
      return rosterStolenBy(state, frame.actorId, matching, 1);
    },
  },
  A084: {
    code: 'A084', name_en: 'Hold This!', name_th: 'ถือไว้นะ!',
    description_th: 'สลับไพ่ทั้งหมดในมือกับผู้เล่นอีก 1 คนที่คุณเลือก',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นที่จะสลับไพ่ทั้งมือด้วยกัน',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      return targetId ? swapHands(state, frame.actorId, targetId) : state;
    },
  },
  A090: {
    code: 'A090', name_en: 'I Wanna Die', name_th: 'ฉันอยากตาย',
    description_th: 'ทิ้งไพ่ทั้งหมดในมือ (จะหยุดเล่นด้วยก็ได้)',
    kind: 'auto',
    // "...or stop playing entirely" is a product decision (a permanent,
    // room-wide consequence unlike any other card's effect), not a technical
    // gap -- deliberately not wired to leaveRoom() without asking first.
    // Only the deterministic discard-whole-hand half is implemented.
    executeEffect: (state, frame) => discard(state, frame.actorId, state.players[frame.actorId].hand.length),
  },
  A109: {
    code: 'A109', name_en: 'Pointless', name_th: 'ไม่มีประโยชน์',
    description_th: 'ไม่มีอะไรเกิดขึ้น',
    kind: 'no_op',
    executeEffect: (state) => state,
  },

  // -- Family J1 + J2 (subjective): extreme-state, ties all included
  // (classification doc §Family J) -- same roster_select mechanic as Family
  // A, just for a subjective "who's the most X" instead of a yes/no condition.

  A031: {
    code: 'A031', name_en: 'Big Baby', name_th: 'เด็กยักษ์',
    description_th: 'ผู้เล่นที่อายุมากที่สุดต้องทิ้งไพ่ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่อายุมากที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A058: {
    code: 'A058', name_en: 'Little Baby', name_th: 'เด็กน้อย',
    description_th: 'ผู้เล่นที่อายุน้อยที่สุดต้องทิ้งไพ่ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่อายุน้อยที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 3),
  },
  A054: {
    code: 'A054', name_en: 'Jewellery', name_th: 'เครื่องประดับ',
    description_th: 'ผู้เล่นที่สวมเครื่องประดับมากที่สุดทิ้งไพ่ 2 ใบ หากเสมอกันให้ผู้เล่นที่เสมอกันทั้งหมดทิ้ง',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่สวมเครื่องประดับมากที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDiscards(state, rosterIdsFromFrame(frame), 2),
  },
  A095: {
    code: 'A095', name_en: 'Johnny Big Feet', name_th: 'จอห์นนี่เท้าใหญ่',
    description_th: 'ผู้เล่นที่มีเท้าใหญ่ที่สุดจั่วไพ่ 3 ใบ หากเสมอกันให้ผู้เล่นที่เสมอกันทั้งหมดจั่ว',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่เท้าใหญ่ที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 3),
  },
  A070: {
    code: 'A070', name_en: 'Desmond The Moon Bear', name_th: 'เดสมอนด์ หมีแห่งดวงจันทร์',
    description_th: 'ผู้เล่นที่อยู่ไกลจากบ้านของตัวเองมากที่สุด จั่วไพ่ 3 ใบ',
    kind: 'roster_select', needsRosterSelection: true, rosterPrompt: 'เลือกผู้เล่นที่อยู่ไกลจากบ้านมากที่สุด (เลือกได้หลายคนถ้าเสมอ)',
    executeEffect: (state, frame) => rosterDraws(state, rosterIdsFromFrame(frame), 3),
  },

  // -- Family I1: temporary global rule suspension (classification doc §Family I1) --
  // Pushes a GlobalRestriction, cleared by game/turn.ts's advanceTurn the
  // moment play returns to the actor (see game/types.ts's GlobalRestriction
  // doc comment). Enforced in lib/session.tsx's playAction/playCounter and
  // here in checkWinnerAtTurnStart for no_win.

  A019: {
    code: 'A019', name_en: "We're All Gonna Die", name_th: 'เราจะตายกันหมด!',
    description_th: 'ไพ่ Counter ไม่สามารถใช้งานได้จนถึงเทิร์นถัดไปของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => ({
      ...state,
      globalRestrictions: [...(state.globalRestrictions ?? []), { type: 'no_counters', sourcePlayerId: frame.actorId }],
    }),
  },
  A072: {
    code: 'A072', name_en: "Don't Even", name_th: 'อย่าแม้แต่จะคิด',
    description_th: 'ไม่มีผู้เล่นคนใดสามารถเล่น Action ได้จนถึงเทิร์นถัดไปของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => ({
      ...state,
      globalRestrictions: [...(state.globalRestrictions ?? []), { type: 'no_actions', sourcePlayerId: frame.actorId }],
    }),
  },
  A085: {
    code: 'A085', name_en: 'Hold Your Horses', name_th: 'ใจเย็นก่อน!',
    description_th: 'ไม่มีผู้เล่นคนใดสามารถชนะเกมได้จนถึงเทิร์นถัดไปของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => ({
      ...state,
      globalRestrictions: [...(state.globalRestrictions ?? []), { type: 'no_win', sourcePlayerId: frame.actorId }],
    }),
  },

  // -- Two-role paired pick and exact-count roster pick (added after the
  // rest of the batch -- both needed small, targeted GameTable additions
  // rather than a same-shape entry: needsDualTargetSelection for A115,
  // rosterSelectionCount for A172. See game/actionRules/types.ts. --

  A115: {
    code: 'A115', name_en: 'Tall Midget', name_th: 'คนแคระตัวสูง',
    description_th: 'ผู้เล่นที่สูงที่สุดต้องมอบไพ่ 3 ใบให้ผู้เล่นที่เตี้ยที่สุด',
    kind: 'auto',
    needsDualTargetSelection: true,
    dualTargetPrompts: { first: 'เลือกผู้เล่นที่สูงที่สุด', second: 'เลือกผู้เล่นที่เตี้ยที่สุด' },
    executeEffect: (state, frame) => {
      const { firstId: tallestId, secondId: shortestId } = dualTargetIdsFromFrame(frame);
      if (!tallestId || !shortestId || tallestId === shortestId) return state;
      return forceSteal(state, tallestId, shortestId, 3);
    },
  },
  A172: {
    code: 'A172', name_en: 'Forced Seat Swap', name_th: 'บังคับสลับที่',
    description_th: 'เลือกผู้เล่น 2 คนให้สลับที่นั่งกันพร้อมแก้วของตัวเอง',
    kind: 'roster_select', needsRosterSelection: true, rosterSelectionCount: 2,
    rosterPrompt: 'เลือกผู้เล่น 2 คนที่จะสลับที่นั่งกัน',
    // ponytail: "พร้อมแก้วของตัวเอง" (cups move with them) is flavor text --
    // the game has no drink/cup state to move (see A158's deferral note).
    executeEffect: (state, frame) => {
      const [idA, idB] = rosterIdsFromFrame(frame);
      if (!idA || !idB) return state;
      return swapSeats(state, idA, idB);
    },
  },

  // A166 "Speed Chug Bonus": both description_en and description_th are
  // silent on who draws the 3 cards -- a genuine rules ambiguity, not a
  // same-shape gap. Ruling confirmed directly with the user rather than
  // guessed: the target draws on success (beats the actor's slow count of
  // 5), the actor draws on failure. Needs needsTargetThenOutcome's two-step
  // flow since each outcome has a *different* recipient -- see its doc
  // comment in ./types.ts.
  A166: {
    code: 'A166', name_en: 'Speed Chug Bonus', name_th: 'หมดแก้วเร็วก็รวย', kind: 'auto',
    needsTargetThenOutcome: true,
    targetPrompt: 'เลือกผู้เล่นที่จะให้ดื่มให้เร็วที่สุด',
    outcomePrompt: 'เร็วกว่าที่คุณนับ 5 หรือไม่?', outcomeYesLabel: 'เร็วกว่า (ผู้เล่นที่เลือกชนะ)', outcomeNoLabel: 'ช้ากว่า (คุณชนะ)',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้ดื่มให้เร็วที่สุด ถ้าเร็วกว่าที่คุณนับ 5 จั่วไพ่ 3 ใบ',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      const outcome = outcomeFromFrame(frame);
      if (!targetId || outcome === undefined) return state;
      return draw(state, outcome ? targetId : frame.actorId, 3);
    },
  },

  // -- Group 1 Cluster A (classification doc's Phase 2 batch, spec:
  // docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md) --

  A100: {
    code: 'A100', name_en: 'Muffin Factory', name_th: 'โรงงานมัฟฟิน', kind: 'auto',
    description_th: 'คุณสามารถเล่น Action เพิ่มอีก 2 ใบในเทิร์นนี้',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      const player = next.players[frame.actorId];
      player.bonusActionPlaysRemaining = (player.bonusActionPlaysRemaining ?? 0) + 2;
      return next;
    },
  },

  A035: {
    code: 'A035', name_en: 'Come Out to Play', name_th: 'ออกมาเล่นกันเถอะ', kind: 'auto',
    description_th: 'ในเทิร์นถัดไป ผู้เล่นทุกคนที่มี Action อยู่ในมือต้องเล่น Action',
    executeEffect: (state) => {
      const next = cloneState(state);
      const existing = new Set(next.pendingActionObligations ?? []);
      for (const id of Object.keys(next.players)) existing.add(id);
      next.pendingActionObligations = [...existing];
      return next;
    },
  },

  A040: {
    code: 'A040', name_en: 'I Love It!', name_th: 'ฉันชอบมัน!', kind: 'auto',
    description_th: 'Action 3 ใบถัดไปที่ถูกเล่น เมื่อใช้เสร็จแล้วจะเข้ามาอยู่ในมือคุณแทนที่จะลงกองทิ้ง',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      next.actionRedirect = { toPlayerId: frame.actorId, remaining: 3 };
      return next;
    },
  },

  A119: {
    code: 'A119', name_en: 'Why Wait?', name_th: 'จะรอทำไม?', kind: 'auto',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่จะข้ามไปยังเทิร์นของเขา',
    description_th: 'เลือกผู้เล่นอีก 1 คน แล้วข้ามการเล่นไปยังเทิร์นถัดไปของผู้เล่นคนนั้น',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      // Explicit full no-op on self-targeting OR an invalid/nonexistent
      // target, independent of the UI's opponentCandidates filtering
      // (bots/tests/future refactors/a stale id from a race could still
      // call this that way). jumpToPlayerTurn no-ops in both cases too, but
      // only skips the jump itself (and, for an invalid target, skips
      // beginTurn) -- it still returns a state whose current player is the
      // actor, so resolveTurnArrival would run (and re-evaluate the live
      // checkWinnerAtTurnStart check) for them mid-turn without this check,
      // which can end the game prematurely if they'd already declared
      // muffin time earlier in their own turn. Validated up front against
      // the target, not the outcome after the jump -- checking currentId
      // against frame.actorId afterward would also wrongly block the
      // legitimate case where every other player is skip-flagged and the
      // jump wraps all the way back around to the actor, which SHOULD run
      // resolveTurnArrival since beginTurn genuinely fires for them then.
      const order = state.turnOrder?.length ? state.turnOrder : (state.seatOrder ?? []);
      if (targetId === frame.actorId || !order.includes(targetId)) return state;
      const jumped = jumpToPlayerTurn(state, targetId);
      const currentId = jumped.turnOrder[jumped.currentTurnIndex];
      return resolveTurnArrival(jumped, currentId);
    },
  },

  A092: {
    code: 'A092', name_en: "I'm Crazy", name_th: 'ฉันบ้าไปแล้ว!', kind: 'auto',
    description_th: 'นำไพ่ทั้งหมดกลับเข้ากอง สับไพ่ แล้วเริ่มเกมใหม่ทั้งหมด',
    executeEffect: (state) => restartGame(state),
  },

  A126: {
    code: 'A126', name_en: 'Gunman', name_th: 'มือปืน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้เป็นมือปืน จากนั้นผู้เล่นคนนั้นต้องเลือกผู้เล่นคนใดก็ได้ 1 คนให้ทิ้งไพ่ทั้งหมดในมือ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้เป็นมือปืน',
    executeEffect: (state, frame) =>
      initiateDelegatedTargetPick(state, frame, 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ'),
  },
  A130: {
    code: 'A130', name_en: 'Promotion', name_th: 'เลื่อนตำแหน่ง',
    description_th: 'เลือกผู้เล่น 1 คน ให้ผู้เล่นคนนั้นเลือกไพ่ของตัวเอง 1 ใบแล้วมอบให้ผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่น 1 คน',
    executeEffect: (state, frame) =>
      initiateDelegatedTargetPick(state, frame, 'คุณได้รับเลื่อนตำแหน่ง! เลือกผู้เล่นที่จะได้รับไพ่ 1 ใบจากคุณ (สุ่มเลือกให้)'),
  },

  A064: {
    code: 'A064', name_en: 'Banana Peel', name_th: 'เปลือกกล้วย',
    description_th: 'ใส่ไพ่ใบนี้กลับเข้าไปในกองจั่วโดยหงายหน้า ผู้เล่นที่จั่วเจอจะเก็บไพ่ใบนี้ไว้และต้องทิ้งไพ่อื่น 3 ใบ',
    kind: 'auto',
    executeEffect: (state) => {
      const next = cloneState(state);
      const i = next.discardPile.lastIndexOf('A064');
      if (i === -1) return next;
      next.discardPile.splice(i, 1);
      const pos = Math.floor(Math.random() * (next.drawPile.length + 1));
      next.drawPile.splice(pos, 0, 'A064');
      next.bananaPeelArmed = true;
      return next;
    },
  },

  // A091 "I'm A Doctor" (Family C3) intentionally NOT included here -- needs
  // a "cards lost since your last turn" counter, but the low-level primitives
  // (stealRandom/stealChosen/rosterStolenBy/executeAllDiscard/etc.) don't know
  // *why* they were called, so a forced-vs-voluntary distinction would have
  // to be threaded through every call site in transfer.ts/primitives.ts/
  // roster.ts/group.ts individually. Same risk class as the Phase 2 engine
  // batch, not a definitions-only addition. See classification doc's Phase 2 list.
};
