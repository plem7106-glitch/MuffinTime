import { cloneState } from './util';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';
import type { CardCode, PlayerId, RoomState } from './types';
import { pushStackFrame } from './reactionStack';
import type { CreateFrameParams } from './reactionStack';
import { checkAndTriggerAutomaticTraps } from './trapRules/engine';

export type ForcedDiscardDestination = 'discard_pile' | { playerId: PlayerId };
export type ForcedDiscardStatus = 'prepared' | 'awaiting_reaction' | 'ready_to_finalize' | 'completed' | 'canceled';
export interface PreDiscardReaction {
  frameParams: CreateFrameParams;
  replacementDestination?: ForcedDiscardDestination;
}
export type PreDiscardReactionResolver = (state: RoomState, operation: ForcedDiscardOperation) => PreDiscardReaction | null;

let preDiscardReactionResolver: PreDiscardReactionResolver | null = null;

export function setPreDiscardReactionResolver(resolver: PreDiscardReactionResolver | null): void {
  preDiscardReactionResolver = resolver;
}

export interface ForcedDiscardOperation {
  operationId: string;
  sourcePlayerId?: PlayerId;
  targetPlayerId: PlayerId;
  requestedCount: number;
  cardCodes: CardCode[];
  originalDestination: ForcedDiscardDestination;
  finalDestination?: ForcedDiscardDestination;
  intercepted: boolean;
  status: ForcedDiscardStatus;
  causalCode?: CardCode;
  causalFrameId?: string;
}

export function prepareForcedDiscard(
  state: RoomState,
  targetPlayerId: PlayerId,
  requestedCount: number,
  sourcePlayerId?: PlayerId,
  operationId = `forced-discard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selectedCardCodes?: CardCode[]
): ForcedDiscardOperation {
  const hand = state.players[targetPlayerId]?.hand ?? [];
  const cardCodes = (selectedCardCodes ?? hand).filter((code) => hand.includes(code)).slice(0, Math.max(0, requestedCount));
  return { operationId, sourcePlayerId, targetPlayerId, requestedCount: Math.max(0, requestedCount), cardCodes,
    originalDestination: 'discard_pile', intercepted: false, status: 'prepared' };
}

export function resolveForcedDiscard(state: RoomState, targetPlayerId: PlayerId, requestedCount: number, sourcePlayerId?: PlayerId, selectedCardCodes?: CardCode[]): RoomState {
  const operation = prepareForcedDiscard(state, targetPlayerId, requestedCount, sourcePlayerId, undefined, selectedCardCodes);
  const reaction = preDiscardReactionResolver?.(state, operation) ?? null;
  if (reaction) {
    const pending = preparePendingForcedDiscard(state, operation, 'pending');
    const linked = pushStackFrame(pending, {
      ...reaction.frameParams,
      customPayload: { ...(reaction.frameParams.customPayload ?? {}), forcedDiscardOperationId: operation.operationId },
    });
    const frameId = linked.reactionStack?.[linked.reactionStack.length - 1]?.frameId;
    if (!frameId) return state;
    linked.pendingForcedDiscards![operation.operationId] = {
      ...linked.pendingForcedDiscards![operation.operationId], causalFrameId: frameId,
    };
    if (reaction.replacementDestination) {
      linked.pendingForcedDiscards![operation.operationId] = {
        ...linked.pendingForcedDiscards![operation.operationId],
        finalDestination: reaction.replacementDestination,
        intercepted: reaction.replacementDestination !== operation.originalDestination,
        status: 'awaiting_reaction',
      };
    }
    return linked;
  }
  const pending = preparePendingForcedDiscard(state, operation);
  return finalizePendingForcedDiscard(pending, operation.operationId);
}

export function preparePendingForcedDiscard(state: RoomState, operation: ForcedDiscardOperation, reactionFrameId?: string): RoomState {
  const next = cloneState(state);
  next.pendingForcedDiscards = { ...(next.pendingForcedDiscards ?? {}), [operation.operationId]: {
    ...operation,
    status: reactionFrameId ? 'awaiting_reaction' : 'ready_to_finalize',
    causalFrameId: reactionFrameId ?? operation.causalFrameId,
  } };
  return next;
}

export function replacePendingForcedDiscardDestination(state: RoomState, operationId: string, destination: ForcedDiscardDestination): RoomState {
  const operation = state.pendingForcedDiscards?.[operationId];
  if (!operation || operation.status === 'completed' || operation.status === 'canceled') return state;
  const next = cloneState(state);
  next.pendingForcedDiscards![operationId] = { ...operation, finalDestination: destination, intercepted: destination !== operation.originalDestination, status: 'ready_to_finalize' };
  return next;
}

export function finalizePendingForcedDiscard(state: RoomState, operationId: string): RoomState {
  const operation = state.pendingForcedDiscards?.[operationId];
  if (!operation || operation.status !== 'ready_to_finalize') return state;
  const next = finalizeForcedDiscard(state, operation, operation.finalDestination ?? operation.originalDestination);
  if (next === state) return state;
  const remaining = { ...(next.pendingForcedDiscards ?? {}) };
  delete remaining[operationId];
  next.pendingForcedDiscards = remaining;
  return next;
}

export function resumePendingForcedDiscard(state: RoomState, operationId: string, replacementDestination?: ForcedDiscardDestination): RoomState {
  let next = state;
  if (replacementDestination) next = replacePendingForcedDiscardDestination(next, operationId, replacementDestination);
  const operation = next.pendingForcedDiscards?.[operationId];
  if (!operation || operation.status === 'canceled') return next;
  if (operation.status === 'awaiting_reaction') {
    next = cloneState(next);
    next.pendingForcedDiscards![operationId] = { ...operation, status: 'ready_to_finalize' };
  }
  return finalizePendingForcedDiscard(next, operationId);
}

export function clearPendingForcedDiscards(state: RoomState): RoomState {
  if (!state.pendingForcedDiscards || Object.keys(state.pendingForcedDiscards).length === 0) return state;
  const next = cloneState(state);
  next.pendingForcedDiscards = {};
  return next;
}

export function finalizeForcedDiscard(state: RoomState, operation: ForcedDiscardOperation, destination: ForcedDiscardDestination = operation.originalDestination): RoomState {
  if (operation.status === 'canceled') return state;
  const next = cloneState(state);
  const target = next.players[operation.targetPlayerId];
  if (!target) return next;
  if (operation.cardCodes.some((code) => !target.hand.includes(code))) return state;
  const moved: CardCode[] = [];
  for (const code of operation.cardCodes) {
    const index = target.hand.indexOf(code);
    if (index < 0) continue;
    target.hand.splice(index, 1);
    moved.push(code);
  }
  if (destination === 'discard_pile') next.discardPile.push(...moved);
  else if (next.players[destination.playerId]) next.players[destination.playerId].hand.push(...moved);
  else return state;
  const completed = completeForcedDiscard(operation, destination);
  const event = createGameEvent(GAME_EVENT_TYPES.FORCED_DISCARD, operation.sourcePlayerId ?? operation.targetPlayerId, {
    victimId: operation.targetPlayerId, actorId: operation.sourcePlayerId ?? operation.targetPlayerId, count: moved.length,
    operationId: completed.operationId, sourcePlayerId: completed.sourcePlayerId, targetPlayerId: completed.targetPlayerId,
    requestedCount: completed.requestedCount, actualCount: completed.actualCount, cardCodes: moved,
    originalDestination: completed.originalDestination, finalDestination: completed.finalDestination,
    intercepted: completed.intercepted,
  }, [operation.targetPlayerId]);
  appendGameEvent(next, event);
  return checkAndTriggerAutomaticTraps(next, event);
}

export function completeForcedDiscard(operation: ForcedDiscardOperation, destination: ForcedDiscardDestination = operation.originalDestination) {
  return { ...operation, finalDestination: destination, intercepted: destination !== operation.originalDestination, actualCount: operation.cardCodes.length, status: 'completed' as const };
}
