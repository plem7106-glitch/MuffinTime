import { draw } from '../pile';
import { discardAllTraps } from '../trapPile';
import { resolveForcedDiscard } from '../forcedDiscard';
import { getStackFrame, addModifierToFrame } from '../reactionStack';
import { skipTurn } from '../turnFlow';
import { getNextPlayerId } from '../turn';
import { cloneState } from '../util';
import { executeRandomSteal } from '../primitives';
import { resolveSteal } from '../steal';
import type { CardCode, PlayerId, RoomState, StackFrame } from '../types';

function redirectFrameTarget(state: RoomState, frameId: string, newTargetId: PlayerId): RoomState {
  const next = cloneState(state);
  const frame = next.reactionStack?.find((f) => f.frameId === frameId);
  if (frame) {
    frame.targetIds = [newTargetId];
    frame.affectedPlayerIds = [newTargetId];
  }
  return next;
}

function addTargetToFrame(state: RoomState, frameId: string, newTargetId: PlayerId): RoomState {
  const next = cloneState(state);
  const frame = next.reactionStack?.find((f) => f.frameId === frameId);
  if (frame) {
    if (!frame.targetIds) frame.targetIds = [];
    if (!frame.affectedPlayerIds) frame.affectedPlayerIds = [];
    if (!frame.targetIds.includes(newTargetId)) {
      frame.targetIds.push(newTargetId);
    }
    if (!frame.affectedPlayerIds.includes(newTargetId)) {
      frame.affectedPlayerIds.push(newTargetId);
    }
  }
  return next;
}

function setFrameTargets(state: RoomState, frameId: string, newTargetIds: PlayerId[], targetScope?: 'single' | 'multi' | 'all'): RoomState {
  const next = cloneState(state);
  const frame = next.reactionStack?.find((f) => f.frameId === frameId);
  if (frame) {
    frame.targetIds = [...newTargetIds];
    frame.affectedPlayerIds = [...newTargetIds];
    if (targetScope) frame.targetScope = targetScope;
  }
  return next;
}

function banishCardFromDiscard(state: RoomState, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  if (!next.banishedCards) {
    next.banishedCards = [];
  }
  const discardIdx = next.discardPile.lastIndexOf(cardCode);
  if (discardIdx !== -1) {
    next.discardPile.splice(discardIdx, 1);
    next.banishedCards.push(cardCode);
  }
  return next;
}

function transferCardFromDiscardToHand(
  state: RoomState,
  cardCode: CardCode,
  destinationPlayerId: PlayerId
): RoomState {
  if (!state.players[destinationPlayerId]) return state;
  const next = cloneState(state);
  const discardIdx = next.discardPile.lastIndexOf(cardCode);
  if (discardIdx !== -1) {
    next.discardPile.splice(discardIdx, 1);
    next.players[destinationPlayerId].hand.push(cardCode);
  }
  return next;
}

export function resolveCounterEffect(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  resolvingFrame?: StackFrame
): RoomState {
  switch (code) {
    case 'C16': return draw(state, actorId, 3);
    case 'C17': return draw(state, actorId, 1);
    case 'C10': return discardAllTraps(state, actorId);
    case 'C14': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      const targetActionPlayerId = parentFrame?.actorId;
      if (!targetActionPlayerId || !state.players[targetActionPlayerId]) return state;
      return resolveForcedDiscard(state, targetActionPlayerId, 3, actorId);
    }
    case 'C37': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      const targetActionPlayerId = parentFrame?.actorId;
      if (!targetActionPlayerId || !state.players[targetActionPlayerId]) return state;
      const currentHandCount = state.players[targetActionPlayerId].hand.length;
      return resolveForcedDiscard(state, targetActionPlayerId, currentHandCount, actorId);
    }
    case 'C20': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      const targetPlayerId = parentFrame?.actorId;
      if (!targetPlayerId || !state.players[targetPlayerId]) return state;
      return skipTurn(state, targetPlayerId);
    }
    case 'C24': {
      if (!state.players[actorId]) return state;
      return skipTurn(state, actorId);
    }
    case 'C38': {
      if (!state.players[actorId]) return state;
      let next = skipTurn(state, actorId);
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const opId = (resolvingFrame?.customPayload?.stealOperationId as string | undefined)
        ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.stealOperationId as string | undefined) : undefined)
        ?? Object.keys(next.pendingSteals ?? {})[0];
      if (opId && next.pendingSteals?.[opId]) {
        next.pendingSteals[opId] = {
          ...next.pendingSteals[opId],
          status: 'canceled',
        };
      }
      return next;
    }
    case 'C05': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      return transferCardFromDiscardToHand(state, parentFrame.sourceCode, parentFrame.actorId);
    }
    case 'C21': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame || parentFrame.sourceType !== 'counter') return state;
      return transferCardFromDiscardToHand(state, parentFrame.sourceCode, actorId);
    }
    case 'C27': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame || parentFrame.sourceType !== 'action') return state;
      return transferCardFromDiscardToHand(state, parentFrame.sourceCode, actorId);
    }
    case 'C25': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame || parentFrame.sourceType !== 'action') return state;
      return banishCardFromDiscard(state, parentFrame.sourceCode);
    }
    case 'C06': {
      if (!state.players[actorId]) return state;
      let next = cloneState(state);
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);

      const stealOpId = (resolvingFrame?.customPayload?.stealOperationId as string | undefined)
        ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.stealOperationId as string | undefined) : undefined)
        ?? Object.keys(next.pendingSteals ?? {})[0];
      if (stealOpId && next.pendingSteals?.[stealOpId]) {
        next.pendingSteals[stealOpId] = {
          ...next.pendingSteals[stealOpId],
          status: 'canceled',
        };
      }

      const drawOpId = (resolvingFrame?.customPayload?.forcedDrawOperationId as string | undefined)
        ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.forcedDrawOperationId as string | undefined) : undefined)
        ?? Object.keys(next.pendingForcedDraws ?? {})[0];
      if (drawOpId && next.pendingForcedDraws?.[drawOpId]) {
        next.pendingForcedDraws[drawOpId] = {
          ...next.pendingForcedDraws[drawOpId],
          status: 'canceled',
        };
      }

      return next;
    }
    case 'C34': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const nextPlayerId = getNextPlayerId(state.seatOrder ?? state.turnOrder, actorId);
      return redirectFrameTarget(state, parentFrame.frameId, nextPlayerId);
    }
    case 'C35':
    case 'C45': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const newTargetId = (resolvingFrame?.customPayload?.newTargetId as PlayerId | undefined)
        ?? (resolvingFrame?.customPayload?.targetPlayerId as PlayerId | undefined);
      if (!newTargetId || !state.players[newTargetId] || newTargetId === actorId) return state;
      return redirectFrameTarget(state, parentFrame.frameId, newTargetId);
    }
    case 'C11': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      if (!parentId) return state;
      return addModifierToFrame(state, parentId, {
        modifierId: `mod-C11-${Date.now()}`,
        sourceFrameId: resolvingFrame?.frameId ?? '',
        type: 'cancel_all',
        affectedTargetIds: [actorId],
      });
    }
    case 'C40': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      return redirectFrameTarget(state, parentFrame.frameId, parentFrame.actorId);
    }
    case 'C07': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      return addTargetToFrame(state, parentFrame.frameId, actorId);
    }
    case 'C15': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const allPlayers = Object.keys(state.players);
      return setFrameTargets(state, parentFrame.frameId, allPlayers, 'all');
    }
    case 'C22': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const newTargetId = (resolvingFrame?.customPayload?.newTargetId as PlayerId | undefined)
        ?? (resolvingFrame?.customPayload?.targetPlayerId as PlayerId | undefined);
      if (!newTargetId || !state.players[newTargetId]) return state;
      return setFrameTargets(state, parentFrame.frameId, [newTargetId], 'single');
    }
    case 'C36': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      return addTargetToFrame(state, parentFrame.frameId, parentFrame.actorId);
    }
    case 'C39': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const newTargetId = (resolvingFrame?.customPayload?.newTargetId as PlayerId | undefined)
        ?? (resolvingFrame?.customPayload?.targetPlayerId as PlayerId | undefined);
      if (!newTargetId || !state.players[newTargetId] || newTargetId === actorId) return state;
      return addTargetToFrame(state, parentFrame.frameId, newTargetId);
    }
    case 'C47': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      return setFrameTargets(state, parentFrame.frameId, [parentFrame.actorId], 'single');
    }
    case 'C01': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const count = Math.max(0, Number(resolvingFrame?.customPayload?.stealCount ?? 1));
      return resolveSteal(state, parentFrame.actorId, actorId, count, 'random', actorId, 'C01');
    }
    case 'C13': {
      let next = cloneState(state);
      const order = [...(next.turnOrder ?? Object.keys(next.players))];
      const curIdx = next.currentTurnIndex ?? 0;
      const actorPos = order.indexOf(actorId);
      if (actorPos !== -1 && actorPos !== (curIdx + 1) % order.length) {
        order.splice(actorPos, 1);
        const insertIdx = (curIdx + 1) % (order.length + 1);
        order.splice(insertIdx, 0, actorId);
        next.turnOrder = order;
      }
      return next;
    }
    case 'C23': {
      const parentId = resolvingFrame?.parentFrameId ?? (resolvingFrame?.customPayload?.parentFrameId as string | undefined);
      const parentFrame = parentId ? getStackFrame(state, parentId) : undefined;
      if (!parentFrame) return state;
      const next = cloneState(state);
      const frameToMod = next.reactionStack?.find((f) => f.frameId === parentFrame.frameId);
      if (frameToMod) {
        frameToMod.customPayload = { ...(frameToMod.customPayload ?? {}), numericMultiplier: 2 };
      }
      return next;
    }
    case 'C32': {
      const next = cloneState(state);
      if (next.players[actorId]) {
        next.players[actorId].trapImmunityUntilTurn = true;
      }
      return next;
    }
    case 'C31':
    case 'C33':
    case 'C02':
    case 'C03':
    case 'C04':
    case 'C08':
    case 'C09':
    case 'C12':
    case 'C18':
    case 'C26':
    case 'C28':
    case 'C29':
    case 'C30':
    default: return state;
  }
}
