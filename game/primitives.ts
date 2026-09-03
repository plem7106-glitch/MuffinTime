import { cloneState, trackForcedLoss } from './util';
import { reshuffleDiscardIntoDraw } from './pile';
import type {
  RoomState,
  PlayerId,
  CardCode,
  Rng,
  StackFrame,
  EffectModifier,
  UnderCountPolicy,
  CardCountEvaluation,
} from './types';
import { resolveForcedDiscard } from './forcedDiscard';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';

/**
 * Evaluates how an effect handles situations where available cards differ from requested count.
 */
export function evaluateCardCount(
  requestedCount: number,
  availableCount: number,
  policy: UnderCountPolicy = 'clamp_to_available'
): CardCountEvaluation {
  const req = Math.max(0, requestedCount);
  const avail = Math.max(0, availableCount);

  let resolvedCount = 0;
  if (policy === 'clamp_to_available') {
    resolvedCount = Math.min(req, avail);
  } else if (policy === 'all_or_nothing') {
    resolvedCount = avail >= req ? req : 0;
  } else if (policy === 'penalize_if_unable') {
    resolvedCount = Math.min(req, avail);
  } else {
    resolvedCount = Math.min(req, avail);
  }

  return {
    requestedCount: req,
    availableCount: avail,
    resolvedCount,
    policy,
    unfulfilledCount: Math.max(0, req - resolvedCount),
  };
}

/**
 * Pure draw primitive: draws N cards from drawPile into player's hand.
 * Automatically reshuffles discard pile into draw pile if draw pile runs out.
 */
export function executeDraw(
  state: RoomState,
  playerId: PlayerId,
  count: number
): RoomState {
  if (count <= 0) return state;
  let next = cloneState(state);
  const player = next.players[playerId];
  if (!player) return next;

  for (let i = 0; i < count; i++) {
    if (next.drawPile.length === 0) {
      if (next.discardPile.length === 0) break;
      next = reshuffleDiscardIntoDraw(next);
    }
    const card = next.drawPile.pop();
    if (card) {
      next.players[playerId].hand.push(card);
    }
  }
  return next;
}

/**
 * Pure all-player draw primitive.
 */
export function executeAllDraw(
  state: RoomState,
  count: number,
  excludedIds: PlayerId[] = []
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (!excludedIds.includes(playerId)) {
      next = executeDraw(next, playerId, count);
    }
  }
  return next;
}

/**
 * Pure discard primitive with explicit card-count policy evaluation.
 */
export function executeDiscard(
  state: RoomState,
  playerId: PlayerId,
  count: number,
  specificCardCodes?: CardCode[],
  policy: UnderCountPolicy = 'clamp_to_available',
  sourcePlayerId?: PlayerId
): { state: RoomState; evaluation: CardCountEvaluation; discardedCards: CardCode[] } {
  if (specificCardCodes) return { state: resolveForcedDiscard(state, playerId, count, sourcePlayerId, specificCardCodes), evaluation: evaluateCardCount(count, state.players[playerId]?.hand.length ?? 0, policy), discardedCards: specificCardCodes.slice(0, count) };
  const next = cloneState(state);
  const player = next.players[playerId];
  if (!player) {
    const evalResult = evaluateCardCount(count, 0, policy);
    return { state: next, evaluation: evalResult, discardedCards: [] };
  }

  const evaluation = evaluateCardCount(count, player.hand.length, policy);
  const discarded: CardCode[] = [];

  while (discarded.length < evaluation.resolvedCount && player.hand.length > 0) {
    const card = player.hand.shift();
    if (card) {
      discarded.push(card);
      next.discardPile.push(card);
    }
  }

  return { state: resolveForcedDiscard(state, playerId, count, sourcePlayerId, discarded), evaluation, discardedCards: discarded };
}

/**
 * Pure all-player discard primitive.
 */
export function executeAllDiscard(
  state: RoomState,
  count: number,
  excludedIds: PlayerId[] = [],
  policy: UnderCountPolicy = 'clamp_to_available'
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (!excludedIds.includes(playerId)) {
      const res = executeDiscard(next, playerId, count, undefined, policy);
      next = res.state;
    }
  }
  return next;
}

/**
 * Discards down to a target hand threshold (e.g. T09 Card Sick: discard extras over 10).
 */
export function executeDiscardDownTo(
  state: RoomState,
  playerId: PlayerId,
  targetThreshold: number
): { state: RoomState; discardedCount: number } {
  let next = cloneState(state);
  const player = next.players[playerId];
  if (!player || player.hand.length <= targetThreshold) {
    return { state: next, discardedCount: 0 };
  }

  const excess = player.hand.length - targetThreshold;
  const res = executeDiscard(next, playerId, excess);
  return { state: res.state, discardedCount: res.discardedCards.length };
}

import { resolveSteal } from './steal';

/**
 * Pure random unseen steal primitive.
 */
export function executeRandomSteal(
  state: RoomState,
  victimId: PlayerId,
  thiefId: PlayerId,
  count: number,
  _rng: Rng = Math.random,
  policy: UnderCountPolicy = 'clamp_to_available'
): { state: RoomState; evaluation: CardCountEvaluation; stolenCards: CardCode[] } {
  const victimHand = state.players[victimId]?.hand.length ?? 0;
  const evaluation = evaluateCardCount(count, victimHand, policy);

  const resolvedState = resolveSteal(state, victimId, thiefId, count, 'random');
  const lastEvent = resolvedState.gameEvents?.[resolvedState.gameEvents.length - 1];
  const stolenCards = (lastEvent?.type === GAME_EVENT_TYPES.CARD_STOLEN ? (lastEvent.payload as any)?.stolenCards : undefined) ?? [];

  return { state: resolvedState, evaluation, stolenCards };
}

/**
 * Pure all-other-players random steal primitive (e.g. T42 Jack in the Box).
 */
export function executeAllRandomSteal(
  state: RoomState,
  thiefId: PlayerId,
  countPerPlayer: number,
  rng: Rng = Math.random,
  policy: UnderCountPolicy = 'clamp_to_available'
): RoomState {
  let next = cloneState(state);
  for (const victimId of Object.keys(next.players)) {
    if (victimId !== thiefId) {
      const res = executeRandomSteal(next, victimId, thiefId, countPerPlayer, rng, policy);
      next = res.state;
    }
  }
  return next;
}

/**
 * Pure full-hand transfer primitive (e.g. T32 Gonna Eat That?, T46 Don't Beat Me).
 */
export function executeFullHandTransfer(
  state: RoomState,
  victimId: PlayerId,
  receiverId: PlayerId
): RoomState {
  const next = cloneState(state);
  const victim = next.players[victimId];
  const receiver = next.players[receiverId];
  if (!victim || !receiver) return next;

  const count = victim.hand.length;
  if (count > 0) {
    const stolen = [...victim.hand];
    receiver.hand.push(...stolen);
    victim.hand = [];
    appendGameEvent(next, createGameEvent(GAME_EVENT_TYPES.CARD_STOLEN, receiverId, {
      victimId, thiefId: receiverId, count, stolenCards: stolen,
    }, [victimId]));
    return trackForcedLoss(next, victimId, count);
  }
  return next;
}

/**
 * Pure hand swap and deal primitive (combines both hands, shuffles, deals evenly).
 */
export function executeHandSwapAndDeal(
  state: RoomState,
  playerA: PlayerId,
  playerB: PlayerId,
  rng: Rng = Math.random
): RoomState {
  const next = cloneState(state);
  const pA = next.players[playerA];
  const pB = next.players[playerB];
  if (!pA || !pB) return next;

  const pool = [...pA.hand, ...pB.hand];
  pA.hand = [];
  pB.hand = [];

  // Fisher-Yates shuffle with provided rng
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let dealToA = true;
  for (const card of pool) {
    if (dealToA) {
      pA.hand.push(card);
    } else {
      pB.hand.push(card);
    }
    dealToA = !dealToA;
  }

  return next;
}

/**
 * Pure modifier applicator that adjusts a stack frame based on a counter or trap reaction.
 */
export function applyEffectModifier(
  frame: StackFrame,
  modifier: EffectModifier
): StackFrame {
  const updated: StackFrame = {
    ...frame,
    modifiers: [...frame.modifiers, modifier],
  };

  switch (modifier.type) {
    case 'cancel_all':
      updated.status = 'cancelled';
      break;

    case 'protect_target':
      if (modifier.affectedTargetIds && modifier.affectedTargetIds.length > 0) {
        updated.targetIds = updated.targetIds.filter(
          (id) => !modifier.affectedTargetIds!.includes(id)
        );
        if (updated.targetIds.length === 0) {
          updated.status = 'cancelled';
        }
      }
      break;

    case 'redirect':
      if (modifier.newTargetIds && modifier.newTargetIds.length > 0) {
        updated.targetIds = [...modifier.newTargetIds];
      }
      break;

    case 'reflect':
      updated.targetIds = [frame.actorId];
      break;

    case 'negate_counter':
      // Negates an earlier modifier
      updated.status = 'pending_responses';
      break;

    default:
      break;
  }

  return updated;
}
