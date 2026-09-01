import { cloneState } from './util';
import type {
  RoomState,
  PlayerId,
  CardCode,
  StackFrame,
  FrameSourceType,
  TargetScope,
  PlayerResponseStatus,
  EffectModifier,
  PendingResponse,
  TriggerContext,
} from './types';
import { resumePendingForcedDiscard, type ForcedDiscardDestination } from './forcedDiscard';

export interface CreateFrameParams {
  sourceType: FrameSourceType;
  sourceCode: CardCode;
  actorId: PlayerId;
  triggerPlayerIds?: PlayerId[];
  affectedPlayerIds?: PlayerId[];
  targetIds?: PlayerId[];
  targetScope?: TargetScope;
  eligibleResponderIds?: PlayerId[];
  triggerContext?: TriggerContext;
  customPayload?: Record<string, unknown>;
}

/**
 * Creates a new StackFrame with a unique stable identifier.
 */
export function createStackFrame(
  state: RoomState,
  params: CreateFrameParams
): StackFrame {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  const frameId = `frame-${params.sourceType}-${params.sourceCode}-${timestamp}-${randomSuffix}`;
  const parentFrame = getTopFrame(state);

  const affectedPlayerIds = params.affectedPlayerIds ?? params.targetIds ?? [];
  const triggerPlayerIds = params.triggerPlayerIds ?? (params.targetIds ? [...params.targetIds] : []);
  const targetIds = params.targetIds ?? [...affectedPlayerIds];
  const targetScope = params.targetScope ?? (affectedPlayerIds.length > 1 ? 'multi' : 'single');

  // Default eligible responders: calculated independently from affected players (or all non-actors)
  const eligibleResponderIds =
    params.eligibleResponderIds ??
    (affectedPlayerIds.length > 0
      ? affectedPlayerIds.filter((id) => id !== params.actorId)
      : Object.keys(state.players).filter((id) => id !== params.actorId));

  const responses: Record<PlayerId, PlayerResponseStatus> = {};
  for (const pid of eligibleResponderIds) {
    responses[pid] = { status: 'pending' };
  }

  return {
    frameId,
    parentFrameId: parentFrame ? parentFrame.frameId : null,
    sourceType: params.sourceType,
    sourceCode: params.sourceCode,
    actorId: params.actorId,
    triggerPlayerIds,
    affectedPlayerIds,
    targetIds,
    targetScope,
    eligibleResponderIds,
    responses,
    modifiers: [],
    status: 'pending_responses',
    triggerContext: params.triggerContext,
    turnContext: {
      turnIndex: state.currentTurnIndex,
      phase: parentFrame?.turnContext.phase ?? (state.turnPhase && state.turnPhase !== 'resolving_stack' ? state.turnPhase : 'main'),
      roundNumber: state.roundNumber ?? 1,
    },
    customPayload: params.customPayload,
  };
}

/**
 * Returns the currently active top frame from the reaction stack (or undefined if empty).
 */
export function getTopFrame(state: RoomState): StackFrame | undefined {
  if (!state.reactionStack || state.reactionStack.length === 0) return undefined;
  return state.reactionStack[state.reactionStack.length - 1];
}

/**
 * Keeps `state.pendingResponse` in sync with the top frame for backward compatibility with UI modals.
 */
export function syncPendingResponseBridge(state: RoomState): RoomState {
  const top = getTopFrame(state);
  if (!top) {
    state.pendingResponse = null;
    return state;
  }

  const bridge: PendingResponse = {
    responseId: top.frameId,
    kind: top.sourceType === 'trap' ? 'trap' : 'action',
    code: top.sourceCode,
    actorId: top.actorId,
    triggerPlayerIds: top.triggerPlayerIds,
    affectedPlayerIds: top.affectedPlayerIds,
    targetId: top.targetIds[0] ?? top.affectedPlayerIds?.[0],
    targetIds: top.targetIds,
    targetScope: top.targetScope,
    eligibleResponderIds: top.eligibleResponderIds,
    responses: top.responses,
    triggerContext: top.triggerContext,
  };
  state.pendingResponse = bridge;
  return state;
}

/**
 * Pushes a new frame onto the reaction stack and sets phase to 'resolving_stack'.
 */
export function pushStackFrame(
  state: RoomState,
  params: CreateFrameParams
): RoomState {
  let next = cloneState(state);
  if (!next.reactionStack) {
    next.reactionStack = [];
  }

  const frame = createStackFrame(next, params);
  next.reactionStack.push(frame);
  next.turnPhase = 'resolving_stack';
  syncPendingResponseBridge(next);
  return next;
}

/**
 * Pops the top frame from the reaction stack.
 */
export function popStackFrame(state: RoomState): { state: RoomState; poppedFrame?: StackFrame } {
  let next = cloneState(state);
  if (!next.reactionStack || next.reactionStack.length === 0) {
    syncPendingResponseBridge(next);
    return { state: next };
  }

  const poppedFrame = next.reactionStack.pop();
  if (next.reactionStack.length === 0) {
    // If stack is completely empty, restore turn phase from popped frame
    next.turnPhase = poppedFrame?.turnContext.phase ?? 'main';
  }

  syncPendingResponseBridge(next);
  if (poppedFrame) {
    const linked = Object.values(next.pendingForcedDiscards ?? {}).filter((operation) => operation.causalFrameId === poppedFrame.frameId);
    for (const operation of linked) {
      const replacement = poppedFrame.customPayload?.replacementDestination as ForcedDiscardDestination | undefined;
      next = resumePendingForcedDiscard(next, operation.operationId, replacement);
    }
  }
  return { state: next, poppedFrame };
}

/**
 * Submits a player's response (counter, skip) to a specific frameId.
 * Idempotent and safely rejects stale frame submissions.
 */
export function submitResponse(
  state: RoomState,
  frameId: string,
  playerId: PlayerId,
  response: Partial<PlayerResponseStatus>
): RoomState {
  const next = cloneState(state);
  const top = getTopFrame(next);

  // Stale check: can only respond to the current top frame matching frameId
  if (!top || top.frameId !== frameId) {
    return next;
  }

  // Ensure player is among eligible responders
  if (!top.eligibleResponderIds.includes(playerId)) {
    return next;
  }

  // Idempotency: don't overwrite if already processed
  const current = top.responses[playerId];
  if (current && current.status !== 'pending' && current.status === response.status) {
    return next;
  }

  top.responses[playerId] = {
    status: response.status ?? 'skipped',
    counterCode: response.counterCode,
    selectedCards: response.selectedCards,
    submittedAt: Date.now(),
  };

  syncPendingResponseBridge(next);
  return next;
}

/**
 * Checks if all required responders for a frame have completed their response (skipped or countered).
 */
export function areAllResponsesComplete(frame: StackFrame): boolean {
  if (frame.eligibleResponderIds.length === 0) return true;
  for (const pid of frame.eligibleResponderIds) {
    const resp = frame.responses[pid];
    if (!resp || resp.status === 'pending') {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates whether any eligible responder submitted a counter to the frame.
 */
export function getCounteringResponse(frame: StackFrame): { playerId: PlayerId; counterCode: CardCode } | null {
  for (const pid of frame.eligibleResponderIds) {
    const resp = frame.responses[pid];
    if (resp && resp.status === 'countered' && resp.counterCode) {
      return { playerId: pid, counterCode: resp.counterCode };
    }
  }
  return null;
}

/**
 * Attaches an EffectModifier to a target frame in the stack.
 */
export function addModifierToFrame(
  state: RoomState,
  targetFrameId: string,
  modifier: EffectModifier
): RoomState {
  const next = cloneState(state);
  if (!next.reactionStack) return next;

  const frame = next.reactionStack.find((f) => f.frameId === targetFrameId);
  if (frame) {
    frame.modifiers.push(modifier);
    if (modifier.type === 'cancel_all') {
      frame.status = 'cancelled';
    } else if (modifier.type === 'protect_target' && modifier.affectedTargetIds) {
      frame.targetIds = frame.targetIds.filter(
        (id) => !modifier.affectedTargetIds!.includes(id)
      );
      if (frame.targetIds.length === 0) {
        frame.status = 'cancelled';
      }
    }
  }

  syncPendingResponseBridge(next);
  return next;
}
