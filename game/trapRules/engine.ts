import { cloneState } from '../util';
import { removeTrap } from '../trap';
import { pushStackFrame } from '../reactionStack';
import { getTrapRule } from './registry';
import type { RoomState, PlayerId, CardCode, StackFrame } from '../types';
import type { GameEvent } from '../events';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from '../events';
import type { ForcedDiscardOperation, PreDiscardReaction } from '../forcedDiscard';

/**
 * Checks all active placed traps across all players for automatic triggers (event or state based).
 * If any trap triggers, it is removed from active traps and pushed onto the Reaction Stack.
 */
export function checkAndTriggerAutomaticTraps(
  state: RoomState,
  event?: GameEvent
): RoomState {
  let next = cloneState(state);

  for (const ownerId of Object.keys(next.players)) {
    const player = next.players[ownerId];
    if (!player || !player.traps || player.traps.length === 0) continue;

    // Clone traps array to avoid indexing mutations while iterating
    const currentTraps = [...player.traps];

    for (const trapCode of currentTraps) {
      const rule = getTrapRule(trapCode);
      if (!rule) continue;

      if (rule.mode === 'automatic_event' || rule.mode === 'automatic_state') {
        const triggerRes = rule.checkTrigger ? rule.checkTrigger(next, ownerId, event) : { triggered: false };
        if (triggerRes.triggered) {
          const triggerPlayerIds = triggerRes.triggerPlayerIds ?? [];
          const affectedPlayerIds = rule.resolveAffectedPlayers(
            next,
            ownerId,
            triggerPlayerIds,
            triggerRes.customPayload
          );
          const eligibleResponderIds = rule.resolveEligibleResponders
            ? rule.resolveEligibleResponders(next, ownerId, affectedPlayerIds, triggerPlayerIds)
            : affectedPlayerIds.filter((id) => id !== ownerId);

          // 1. Remove trap from active placed traps
          const afterRemove = removeTrap(next, ownerId, trapCode);
          appendGameEvent(afterRemove, createGameEvent(GAME_EVENT_TYPES.TRAP_ACTIVATED, ownerId, {
            ownerId, trapCode, triggerPlayerIds, affectedPlayerIds, targetIds: affectedPlayerIds,
          }, affectedPlayerIds));

          // 2. Push onto Reaction Stack
          next = pushStackFrame(afterRemove, {
            sourceType: 'trap',
            sourceCode: trapCode,
            actorId: ownerId,
            triggerPlayerIds,
            affectedPlayerIds,
            targetIds: affectedPlayerIds,
            eligibleResponderIds,
            triggerContext: {
              triggerType: 'game_event',
              eventId: event?.eventId,
              triggerPlayerIds,
              note: triggerRes.note,
            },
            customPayload: triggerRes.customPayload,
          });

          // Only trigger one automatic trap per event cycle to prevent cascading race conditions
          return next;
        }
      }
    }
  }

  return next;
}

/**
 * Evaluates whether a placed trap can currently be manually activated by its owner.
 * Returns false if:
 * - Trap is not in owner's active placed traps
 * - Trap rule is missing
 * - T52 or T53 is claimed before the owner's next turn (same turn placed or during other players' turns)
 */
export function canActivateManualTrap(
  state: RoomState,
  ownerId: PlayerId,
  trapCode: CardCode
): boolean {
  const player = state.players[ownerId];
  if (!player || !player.traps || !player.traps.includes(trapCode)) {
    return false;
  }

  const rule = getTrapRule(trapCode);
  if (!rule) return false;

  if (trapCode === 'T52' || trapCode === 'T53') {
    const meta = state.placedTrapMeta?.[`${ownerId}_${trapCode}`];
    if (meta) {
      const activePlayerId = state.turnOrder[state.currentTurnIndex];
      const isOwnerTurnNow = activePlayerId === ownerId;
      const currentSeq = state.sequenceNumber ?? 0;
      const hasTurnAdvanced = currentSeq > meta.placedSequence;
      if (!isOwnerTurnNow || !hasTurnAdvanced) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Manually activates an active placed trap by its owner (e.g. for Manual / Honor System traps T01, T06, T07, T08).
 */
export function activateManualTrap(
  state: RoomState,
  ownerId: PlayerId,
  trapCode: CardCode,
  targetPlayerIds: PlayerId[]
): RoomState {
  const player = state.players[ownerId];
  if (!player || !player.traps.includes(trapCode)) {
    throw new Error('trap not found in owner active traps');
  }

  const rule = getTrapRule(trapCode);
  if (!rule) return cloneState(state);

  if (trapCode === 'T52' || trapCode === 'T53') {
    if (!canActivateManualTrap(state, ownerId, trapCode)) {
      throw new Error(`${trapCode} cannot be claimed until your next turn`);
    }
  }
  const triggerPlayerIds = targetPlayerIds;
  const affectedPlayerIds = rule.resolveAffectedPlayers(state, ownerId, triggerPlayerIds);
  const eligibleResponderIds = rule.resolveEligibleResponders
    ? rule.resolveEligibleResponders(state, ownerId, affectedPlayerIds, triggerPlayerIds)
    : affectedPlayerIds.filter((id) => id !== ownerId);

  const afterRemove = removeTrap(state, ownerId, trapCode);

  const trapEvent = createGameEvent(GAME_EVENT_TYPES.TRAP_ACTIVATED, ownerId, {
    ownerId, trapCode, triggerPlayerIds, affectedPlayerIds, targetIds: affectedPlayerIds,
  }, affectedPlayerIds);
  appendGameEvent(afterRemove, trapEvent);

  let next = pushStackFrame(afterRemove, {
    sourceType: 'trap',
    sourceCode: trapCode,
    actorId: ownerId,
    triggerPlayerIds,
    affectedPlayerIds,
    targetIds: affectedPlayerIds,
    eligibleResponderIds,
    triggerContext: {
      triggerType: 'manual_declaration',
      triggerPlayerIds,
    },
  });

  return checkAndTriggerAutomaticTraps(next, trapEvent);
}

/**
 * Initiates an interactive trap invitation (e.g. T10 date invite).
 */
export function initiateTrapInteraction(
  state: RoomState,
  ownerId: PlayerId,
  trapCode: CardCode,
  targetPlayerId: PlayerId
): RoomState {
  const player = state.players[ownerId];
  if (!player || !player.traps.includes(trapCode)) {
    throw new Error('trap not found in owner active traps');
  }

  const next = cloneState(state);
  const interactionId = `interact-${trapCode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  next.pendingInteraction = {
    interactionId,
    type: 'date_invite',
    sourceCardCode: trapCode,
    initiatorId: ownerId,
    targetPlayerId,
    prompt: `${player.name} ชวนคุณไปเดต`,
    timestamp: Date.now(),
  };

  return next;
}

/**
 * Responds to a pending interactive trap prompt (e.g. T10 Accept or Refuse).
 */
export function respondToTrapInteraction(
  state: RoomState,
  interactionId: string,
  responderId: PlayerId,
  decision: 'accept' | 'refuse'
): RoomState {
  const next = cloneState(state);
  const interaction = next.pendingInteraction;

  if (!interaction || interaction.interactionId !== interactionId) {
    return next;
  }

  if (interaction.targetPlayerId !== responderId) {
    throw new Error('only the invited player can respond to this invitation');
  }

  // Clear the pending interaction
  next.pendingInteraction = null;

  if (decision === 'accept') {
    // Condition fails: Date accepted! Do not trigger effect, trap remains placed.
    return next;
  }

  // Refuse: Condition succeeds! Activate T10
  const ownerId = interaction.initiatorId;
  const trapCode = interaction.sourceCardCode;
  const rule = getTrapRule(trapCode);
  if (!rule) return cloneState(state);

  const triggerPlayerIds = [responderId];
  const affectedPlayerIds = rule.resolveAffectedPlayers(next, ownerId, triggerPlayerIds);
  const eligibleResponderIds = rule.resolveEligibleResponders
    ? rule.resolveEligibleResponders(next, ownerId, affectedPlayerIds, triggerPlayerIds)
    : affectedPlayerIds.filter((id) => id !== ownerId);

  const afterRemove = removeTrap(next, ownerId, trapCode);

  return pushStackFrame(afterRemove, {
    sourceType: 'trap',
    sourceCode: trapCode,
    actorId: ownerId,
    triggerPlayerIds,
    affectedPlayerIds,
    targetIds: affectedPlayerIds,
    eligibleResponderIds,
    triggerContext: {
      triggerType: 'manual_declaration',
      triggerPlayerIds,
      note: `${responderId} refused the date invitation`,
    },
  });
}

/**
 * Executes a resolved trap stack frame effect using declarative rule definitions.
 */
export function executeTrapFrameEffect(
  state: RoomState,
  frame: StackFrame
): RoomState {
  const rule = getTrapRule(frame.sourceCode);
  if (rule) {
    if (frame.targetIds && frame.targetIds.length > 1 && rule.needsTargetSelection) {
      let next = state;
      for (const tid of frame.targetIds) {
        if (!next.players[tid] || next.players[tid].trapImmunityUntilTurn) continue;
        const subFrame: StackFrame = {
          ...frame,
          targetIds: [tid],
          affectedPlayerIds: [tid],
        };
        next = rule.executeEffect(next, subFrame);
      }
      return next;
    }
    const mainTargetId = frame.targetIds?.[0] ?? frame.affectedPlayerIds?.[0];
    if (mainTargetId && state.players[mainTargetId]?.trapImmunityUntilTurn) {
      return state;
    }
    return rule.executeEffect(state, frame);
  }
  return state;
}

export function resolveT23PreDiscardReaction(
  state: RoomState,
  operation: ForcedDiscardOperation
): PreDiscardReaction | null {
  const ownerId = Object.keys(state.players).find((id) =>
    id !== operation.targetPlayerId && state.players[id]?.traps.includes('T23')
  );
  if (!ownerId) return null;
  return {
    frameParams: {
      sourceType: 'trap', sourceCode: 'T23', actorId: ownerId,
      targetIds: [operation.targetPlayerId],
      affectedPlayerIds: [operation.targetPlayerId],
      triggerPlayerIds: [operation.targetPlayerId],
      eligibleResponderIds: [operation.targetPlayerId],
      customPayload: { cardCodes: operation.cardCodes },
    },
    replacementDestination: { playerId: ownerId },
  };
}
