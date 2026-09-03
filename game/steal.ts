import { cloneState, trackForcedLoss } from './util';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';
import type { CardCode, PlayerId, RoomState, Rng } from './types';
import { pushStackFrame, getStackFrame } from './reactionStack';
import type { CreateFrameParams } from './reactionStack';
import { checkAndTriggerAutomaticTraps } from './trapRules/engine';
import { getPlayableCounters } from './counterRules/registry';
import { forceDiscard } from './pile';

export interface StealOperation {
  operationId: string;
  sourcePlayerId?: PlayerId;
  thiefId: PlayerId;
  victimId: PlayerId;
  requestedCount: number;
  stealMode: 'random' | 'chosen';
  selectedCardCode?: CardCode;
  actualCount: number;
  status: 'prepared' | 'awaiting_reaction' | 'redirected' | 'completed' | 'canceled';
  causalCode?: CardCode;
  causalFrameId?: string;
  redirectedFromId?: PlayerId;
  reactionVictimId?: PlayerId;
}

export function prepareSteal(
  state: RoomState,
  victimId: PlayerId,
  thiefId: PlayerId,
  requestedCount: number,
  stealMode: 'random' | 'chosen' = 'random',
  sourcePlayerId?: PlayerId,
  selectedCardCode?: CardCode,
  operationId = `steal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
): StealOperation {
  const victimHand = state.players[victimId]?.hand ?? [];
  const req = Math.max(0, requestedCount);
  const actualCount = Math.min(req, victimHand.length);

  return {
    operationId,
    sourcePlayerId: sourcePlayerId ?? thiefId,
    thiefId,
    victimId,
    requestedCount: req,
    stealMode,
    selectedCardCode,
    actualCount,
    status: 'prepared',
  };
}

export function getEligibleStealResponders(
  state: RoomState,
  operation: StealOperation
): PlayerId[] {
  if (operation.actualCount === 0 || operation.status === 'canceled') return [];
  const eligibleResponders: PlayerId[] = [];

  for (const pid of Object.keys(state.players)) {
    const hand = state.players[pid]?.hand ?? [];
    const context = {
      actorId: pid,
      targetPlayerId: operation.victimId,
      operationKind: 'steal' as const,
      stealOp: operation,
      roomState: state,
    };
    const playable = getPlayableCounters(hand, { kind: 'action', code: 'STEAL' }, context);
    if (playable.length > 0) {
      eligibleResponders.push(pid);
    }
  }

  return eligibleResponders;
}

export function resolveSteal(
  state: RoomState,
  victimId: PlayerId,
  thiefId: PlayerId,
  requestedCount: number,
  stealMode: 'random' | 'chosen' = 'random',
  sourcePlayerId?: PlayerId,
  selectedCardCode?: CardCode,
  rng: Rng = Math.random
): RoomState {
  const operation = prepareSteal(state, victimId, thiefId, requestedCount, stealMode, sourcePlayerId, selectedCardCode);

  if (operation.actualCount === 0) {
    const pending = preparePendingSteal(state, operation);
    return finalizePendingSteal(pending, operation.operationId, rng);
  }

  const eligibleResponders = getEligibleStealResponders(state, operation);

  if (eligibleResponders.length > 0) {
    const pending = preparePendingSteal(state, operation, 'pending');

    const frameParams: CreateFrameParams = {
      sourceType: 'action',
      sourceCode: 'STEAL',
      actorId: sourcePlayerId ?? thiefId,
      targetIds: [victimId],
      eligibleResponderIds: eligibleResponders,
      customPayload: { stealOperationId: operation.operationId },
    };

    const linked = pushStackFrame(pending, frameParams);
    const frameId = linked.reactionStack?.[linked.reactionStack.length - 1]?.frameId;
    if (!frameId) return state;

    linked.pendingSteals![operation.operationId] = {
      ...linked.pendingSteals![operation.operationId],
      causalFrameId: frameId,
      status: 'awaiting_reaction',
      reactionVictimId: victimId,
    };

    return linked;
  }

  const pending = preparePendingSteal(state, operation);
  return finalizePendingSteal(pending, operation.operationId, rng);
}

export function preparePendingSteal(
  state: RoomState,
  operation: StealOperation,
  reactionFrameId?: string
): RoomState {
  const next = cloneState(state);
  next.pendingSteals = {
    ...(next.pendingSteals ?? {}),
    [operation.operationId]: {
      ...operation,
      status: reactionFrameId ? 'awaiting_reaction' : 'prepared',
      causalFrameId: reactionFrameId ?? operation.causalFrameId,
    },
  };
  return next;
}

export function finalizePendingSteal(state: RoomState, operationId: string, rng: Rng = Math.random): RoomState {
  const operation = state.pendingSteals?.[operationId];
  if (!operation) return state;
  const next = finalizeSteal(state, operation, rng);
  const remaining = { ...(next.pendingSteals ?? {}) };
  delete remaining[operationId];
  next.pendingSteals = remaining;
  return next;
}

export function resumePendingSteal(state: RoomState, operationId: string, rng: Rng = Math.random): RoomState {
  const operation = state.pendingSteals?.[operationId];
  if (!operation) return state;

  if (operation.status === 'canceled') {
    return finalizePendingSteal(state, operationId, rng);
  }

  if (operation.status === 'redirected') {
    // If victim changed to newVictimId and this victim has not been prompted yet in this cycle:
    if (operation.reactionVictimId !== operation.victimId) {
      const eligibleResponders = getEligibleStealResponders(state, operation);
      if (eligibleResponders.length > 0) {
        const frameParams: CreateFrameParams = {
          sourceType: 'action',
          sourceCode: 'STEAL',
          actorId: operation.sourcePlayerId ?? operation.thiefId,
          targetIds: [operation.victimId],
          eligibleResponderIds: eligibleResponders,
          customPayload: { stealOperationId: operation.operationId },
        };

        const linked = pushStackFrame(state, frameParams);
        const frameId = linked.reactionStack?.[linked.reactionStack.length - 1]?.frameId;
        if (frameId) {
          linked.pendingSteals![operation.operationId] = {
            ...linked.pendingSteals![operation.operationId],
            causalFrameId: frameId,
            status: 'awaiting_reaction',
            reactionVictimId: operation.victimId,
          };
          return linked;
        }
      }
    }
  }

  if (operation.status === 'awaiting_reaction') {
    const causalFrame = operation.causalFrameId ? getStackFrame(state, operation.causalFrameId) : undefined;
    if (causalFrame && state.reactionStack?.includes(causalFrame)) {
      return state;
    }
  }

  return finalizePendingSteal(state, operationId, rng);
}

export function finalizeSteal(state: RoomState, operation: StealOperation, rng: Rng = Math.random): RoomState {
  if (operation.status === 'canceled') return state;

  const next = cloneState(state);
  const victim = next.players[operation.victimId];
  const thief = next.players[operation.thiefId];

  if (!victim || !thief) return state;

  const stolen: CardCode[] = [];

  if (operation.stealMode === 'chosen' && operation.selectedCardCode && victim.hand.includes(operation.selectedCardCode)) {
    const idx = victim.hand.indexOf(operation.selectedCardCode);
    stolen.push(...victim.hand.splice(idx, 1));
  } else {
    // Random unseen steal: pick actualCount random cards using rng
    const count = Math.min(operation.actualCount, victim.hand.length);
    for (let i = 0; i < count; i++) {
      if (victim.hand.length === 0) break;
      const idx = Math.floor(rng() * victim.hand.length);
      const [card] = victim.hand.splice(idx, 1);
      if (card) stolen.push(card);
    }
  }

  if (stolen.length > 0) {
    thief.hand.push(...stolen);
    const event = createGameEvent(
      GAME_EVENT_TYPES.CARD_STOLEN,
      operation.thiefId,
      {
        victimId: operation.victimId,
        thiefId: operation.thiefId,
        count: stolen.length,
        stolenCards: stolen,
        operationId: operation.operationId,
      },
      [operation.victimId]
    );
    appendGameEvent(next, event);
    const tracked = trackForcedLoss(next, operation.victimId, stolen.length);

    // C19 passive trigger: If C19 was stolen from victim, thief discards their entire hand
    if (stolen.includes('C19')) {
      const thiefHand = [...tracked.players[operation.thiefId].hand];
      return forceDiscard(tracked, operation.thiefId, thiefHand.length, thiefHand);
    }
    return tracked;
  }

  return next;
}
