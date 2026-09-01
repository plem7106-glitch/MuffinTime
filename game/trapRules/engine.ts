import { cloneState } from '../util';
import { removeTrap } from '../trap';
import { pushStackFrame } from '../reactionStack';
import { getTrapRule } from './registry';
import type { RoomState, PlayerId, CardCode, StackFrame } from '../types';
import type { GameEvent } from '../events';

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
  const triggerPlayerIds = targetPlayerIds;
  const affectedPlayerIds = rule
    ? rule.resolveAffectedPlayers(state, ownerId, triggerPlayerIds)
    : triggerPlayerIds;
  const eligibleResponderIds = rule?.resolveEligibleResponders
    ? rule.resolveEligibleResponders(state, ownerId, affectedPlayerIds, triggerPlayerIds)
    : affectedPlayerIds.filter((id) => id !== ownerId);

  const afterRemove = removeTrap(state, ownerId, trapCode);

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
    },
  });
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

  const triggerPlayerIds = [responderId];
  const affectedPlayerIds = rule
    ? rule.resolveAffectedPlayers(next, ownerId, triggerPlayerIds)
    : triggerPlayerIds;
  const eligibleResponderIds = rule?.resolveEligibleResponders
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
    return rule.executeEffect(state, frame);
  }
  return state;
}
