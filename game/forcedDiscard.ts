import { cloneState } from './util';
import type { CardCode, PlayerId, RoomState } from './types';

export type ForcedDiscardDestination = 'discard_pile' | { playerId: PlayerId };

export interface ForcedDiscardOperation {
  operationId: string;
  sourcePlayerId?: PlayerId;
  targetPlayerId: PlayerId;
  requestedCount: number;
  cardCodes: CardCode[];
  originalDestination: ForcedDiscardDestination;
  finalDestination?: ForcedDiscardDestination;
  intercepted: boolean;
}

export function prepareForcedDiscard(
  state: RoomState,
  targetPlayerId: PlayerId,
  requestedCount: number,
  sourcePlayerId?: PlayerId,
  operationId = `forced-discard-${Date.now()}`
): ForcedDiscardOperation {
  const hand = state.players[targetPlayerId]?.hand ?? [];
  const cardCodes = hand.slice(0, Math.max(0, requestedCount));
  return { operationId, sourcePlayerId, targetPlayerId, requestedCount: Math.max(0, requestedCount), cardCodes,
    originalDestination: 'discard_pile', intercepted: false };
}

export function finalizeForcedDiscard(state: RoomState, operation: ForcedDiscardOperation, destination: ForcedDiscardDestination = operation.originalDestination): RoomState {
  const next = cloneState(state);
  const target = next.players[operation.targetPlayerId];
  if (!target) return next;
  const moved: CardCode[] = [];
  for (const code of operation.cardCodes) {
    const index = target.hand.indexOf(code);
    if (index < 0) continue;
    target.hand.splice(index, 1);
    moved.push(code);
  }
  if (destination === 'discard_pile') next.discardPile.push(...moved);
  else next.players[destination.playerId]?.hand.push(...moved);
  return next;
}

export function completeForcedDiscard(operation: ForcedDiscardOperation, destination: ForcedDiscardDestination = operation.originalDestination) {
  return { ...operation, finalDestination: destination, intercepted: destination !== operation.originalDestination, actualCount: operation.cardCodes.length };
}
