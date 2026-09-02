import { cloneState } from './util';
import { draw } from './pile';
import type { CardCode, PlayerId, RoomState } from './types';
import { pushStackFrame } from './reactionStack';
import { getPlayableCounters } from './counterRules/registry';

export interface ForcedDrawOperation {
  operationId: string;
  sourcePlayerId?: PlayerId;
  targetPlayerId: PlayerId;
  requestedCount: number;
  actualCount: number;
  status: 'prepared' | 'awaiting_reaction' | 'completed' | 'canceled';
  causalCode?: CardCode;
  causalFrameId?: string;
}

export function prepareForcedDraw(
  state: RoomState,
  targetPlayerId: PlayerId,
  requestedCount: number,
  sourcePlayerId?: PlayerId,
  causalCode?: CardCode,
  causalFrameId?: string,
  operationId = `draw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
): ForcedDrawOperation {
  const req = Math.max(0, requestedCount);
  const actualCount = Math.min(req, state.drawPile.length);

  return {
    operationId,
    sourcePlayerId,
    targetPlayerId,
    requestedCount: req,
    actualCount,
    status: 'prepared',
    causalCode,
    causalFrameId,
  };
}

export function resolveForcedDraw(
  state: RoomState,
  targetPlayerId: PlayerId,
  requestedCount: number,
  sourcePlayerId?: PlayerId,
  causalCode?: CardCode,
  causalFrameId?: string
): RoomState {
  if (!state.players[targetPlayerId]) return state;

  const op = prepareForcedDraw(state, targetPlayerId, requestedCount, sourcePlayerId, causalCode, causalFrameId);
  let next = cloneState(state);
  if (!next.pendingForcedDraws) {
    next.pendingForcedDraws = {};
  }
  next.pendingForcedDraws[op.operationId] = op;

  const victimHand = next.players[targetPlayerId]?.hand ?? [];
  const eligibleCounters = getPlayableCounters(victimHand, { kind: 'action', code: 'FORCED_DRAW' }, {
    operationKind: 'forced_draw',
    forcedDrawOp: op,
    actorId: targetPlayerId,
    roomState: next,
  });

  if (eligibleCounters.length > 0) {
    op.status = 'awaiting_reaction';
    next.pendingForcedDraws[op.operationId] = op;
    return pushStackFrame(next, {
      sourceType: 'action',
      sourceCode: 'FORCED_DRAW',
      actorId: sourcePlayerId ?? targetPlayerId,
      targetIds: [targetPlayerId],
      eligibleResponderIds: [targetPlayerId],
      customPayload: {
        forcedDrawOperationId: op.operationId,
        forcedDrawCount: requestedCount,
      },
    });
  }

  return finalizeForcedDraw(next, op.operationId);
}

export function finalizeForcedDraw(state: RoomState, operationId: string): RoomState {
  if (!state.pendingForcedDraws?.[operationId]) return state;
  let next = cloneState(state);
  if (!next.pendingForcedDraws?.[operationId]) return next;
  const op = next.pendingForcedDraws[operationId];

  if (op.status === 'canceled') {
    delete next.pendingForcedDraws[operationId];
    return next;
  }

  next = draw(next, op.targetPlayerId, op.actualCount);
  op.status = 'completed';
  if (next.pendingForcedDraws) {
    delete next.pendingForcedDraws[operationId];
  }

  return next;
}

export function resumePendingForcedDraw(state: RoomState, operationId: string): RoomState {
  return finalizeForcedDraw(state, operationId);
}
