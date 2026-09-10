import { getPlayableCounters } from './counterRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { isCardSupported } from './playableCards';
import { draw, discard } from './pile';
import { getActionRule, executeActionFrameEffect } from './actionRules/registry';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';
import type { RoomState, PlayerId, CardCode } from './types';
import { advanceTurn, checkWinnerAtTurnStart, finishByDeckExhaustion } from './turn';
import { cloneState } from './util';
import { getTopFrame, areAllResponsesComplete, popStackFrame, pushStackFrame, submitResponse, addModifierToFrame } from './reactionStack';
import { checkAndTriggerAutomaticTraps, executeTrapFrameEffect } from './trapRules/engine';

export function advanceAndCheckWin(room: RoomState): RoomState {
  if (room.status !== 'playing' || room.reactionStack?.length || room.pendingResponse || room.pendingInteraction) return room;
  const finished = finishByDeckExhaustion(room);
  if (finished.status === 'finished') return finished;
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  if (checkWinnerAtTurnStart(advanced, currentId)) {
    return { ...advanced, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return advanced;
}

export function resolveCompletedStackFrames(state: RoomState): RoomState {
  let next = cloneState(state);
  let top = getTopFrame(next);
  while (top && areAllResponsesComplete(top)) {
    if (top.status !== 'cancelled' && top.status !== 'resolved') {
      // Effects can push a child reaction. Keep the parent, but never execute it twice.
      top.status = 'resolved';
      next = top.sourceType === 'trap'
        ? executeTrapFrameEffect(next, top)
        : executeActionFrameEffect(next, top);
    }
    if (getTopFrame(next)?.frameId === top.frameId) {
      next = popStackFrame(next).state;
      next = checkAndTriggerAutomaticTraps(next);
    }
    top = getTopFrame(next);
  }
  return finishByDeckExhaustion(next);
}

export function drawTurnCard(state: RoomState, myPlayerId: PlayerId): RoomState {
  if (state.status !== 'playing' || state.turnPhase !== 'main') return state;
  if (state.reactionStack && state.reactionStack.length > 0) return state;
  if (state.pendingResponse || state.pendingInteraction) return state;
  if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
  const pid = myPlayerId!;
  const player = state.players[pid];
  if (!player || player.hasDrawnThisTurn || player.hasPlayedActionThisTurn) return state;
  let next = state;
  if (next.drawPile.length === 0) {
    return finishByDeckExhaustion(next);
  }
  next = draw(next, pid, 1);
  if (next.players[pid]) {
    next.players[pid].hasDrawnThisTurn = true;
  }
  next.turnPhase = 'main';
  // Check automatic state traps (e.g. T09 Card Sick > 10 cards)
  next = checkAndTriggerAutomaticTraps(next);
  return resolveCompletedStackFrames(next);
}

export function endPlayerTurn(state: RoomState, myPlayerId: PlayerId): RoomState {
  if (state.status !== 'playing' || state.turnPhase !== 'main') return state;
  if (state.reactionStack && state.reactionStack.length > 0) return state;
  if (state.pendingResponse || state.pendingInteraction) return state;
  if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
  const pid = myPlayerId!;
  const player = state.players[pid];
  if (!player || (!player.hasDrawnThisTurn && !player.hasPlayedActionThisTurn)) return state;
  return advanceAndCheckWin(state);
}

export function playTurnAction(state: RoomState, myPlayerId: PlayerId, code: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>): RoomState {
  if (state.status !== 'playing' || state.turnPhase !== 'main') return state;
  if (state.reactionStack && state.reactionStack.length > 0) return state;
  if (state.pendingResponse || state.pendingInteraction) return state;
  if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
  if (state.globalRestrictions?.some((r) => r.type === 'no_actions')) return state;
  const actorId = myPlayerId!;
  const player = state.players[actorId];
  if (!player || player.hasPlayedActionThisTurn || player.hasDrawnThisTurn) return state;
  const rule = getActionRule(code);
  if (!rule || !isCardSupported(code) || !player.hand.includes(code)) return state;
  if (rule.needsTargetSelection && !targetId) return state;
  if (targetId && (!state.players[targetId] || targetId === actorId)) return state;
  if (rule.needsRosterSelection) {
    const ids = customPayload?.rosterIds;
    if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== 'string' || !state.players[id]) ||
        (rule.rosterSelectionCount !== undefined && ids.length !== rule.rosterSelectionCount)) return state;
  }
  if (rule.needsOutcomeEntry && typeof customPayload?.outcome !== 'boolean') return state;
  if (rule.needsDualTargetSelection) {
    const first = customPayload?.firstId;
    const second = customPayload?.secondId;
    if (typeof first !== 'string' || typeof second !== 'string' || first === second ||
        !state.players[first] || !state.players[second]) return state;
  }
  const afterDiscard = discard(state, actorId, 1, [code]);
  if (afterDiscard.players[actorId]) {
    afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
  }
  const next = pushStackFrame(afterDiscard, {
    sourceType: 'action',
    sourceCode: code,
    actorId,
    targetIds: targetId ? [targetId] : [],
    ...(customPayload ? { customPayload } : {}),
  });
  appendGameEvent(next, createGameEvent(GAME_EVENT_TYPES.ACTION_PLAYED, actorId, { actorId, actionCode: code }, [actorId]));
  return resolveCompletedStackFrames(next);
}

export function respondToFrame(state: RoomState, frameId: string, playerId: PlayerId, counterCode?: CardCode): RoomState {
  const top = getTopFrame(state);
  if (state.status !== 'playing' || !top || top.frameId !== frameId ||
      !top.eligibleResponderIds.includes(playerId) || top.responses[playerId]?.status !== 'pending') return state;
  if (counterCode && (state.globalRestrictions?.some(r => r.type === 'no_counters') ||
      !getPlayableCounters(state.players[playerId]?.hand ?? [], state.pendingResponse ?? null).includes(counterCode))) return state;

  let next = counterCode ? discard(state, playerId, 1, [counterCode]) : state;
  next = submitResponse(next, frameId, playerId, { status: counterCode ? 'countered' : 'skipped', counterCode });
  if (counterCode) {
    next = resolveCounterEffect(next, counterCode, playerId);
    next = addModifierToFrame(next, frameId, {
      modifierId: `mod-${counterCode}-${frameId}`, sourceFrameId: frameId, type: 'cancel_all',
    });
  }
  next = resolveCompletedStackFrames(next);
  return {
    ...next,
    lastResult: !counterCode && state.lastResult?.responseId === frameId && state.lastResult.countered
      ? state.lastResult : {
      responseId: frameId, kind: top.sourceType === 'trap' ? 'trap' : 'action',
      code: top.sourceCode, actorId: top.actorId, targetId: top.targetIds[0],
      countered: Boolean(counterCode), counteredBy: counterCode ? playerId : undefined, counterCode,
    },
  };
}
