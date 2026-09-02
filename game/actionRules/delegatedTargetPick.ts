import { cloneState } from '../util';
import { discard } from '../pile';
import { stealRandom } from '../transfer';
import type { RoomState, PlayerId, StackFrame, Rng } from '../types';

/**
 * Pauses resolution and hands the choice to frame.targetIds[0] (the player
 * the actor already picked via the normal needsTargetSelection flow) --
 * called from inside executeEffect, so it must stay pure: the
 * interactionId is derived from frame.frameId (already unique) rather than
 * Date.now()/Math.random(), and timestamp is a placeholder -- nothing reads
 * PendingInteraction.timestamp today (it's a T10-only, write-only field).
 */
export function initiateDelegatedTargetPick(state: RoomState, frame: StackFrame, prompt: string): RoomState {
  const next = cloneState(state);
  const targetPlayerId = frame.targetIds[0];
  if (!targetPlayerId || !next.players[targetPlayerId]) return next;
  next.pendingInteraction = {
    interactionId: `interact-${frame.frameId}`,
    type: 'delegated_target_pick',
    sourceCardCode: frame.sourceCode,
    initiatorId: frame.actorId,
    targetPlayerId,
    prompt,
    timestamp: 0,
  };
  return next;
}

/**
 * Resolves a pending delegated_target_pick once the delegated player has
 * chosen. Branches on sourceCardCode for the two different outcomes -- both
 * cards in this cluster share the same pick shape (one other player).
 */
export function resolveDelegatedTargetPick(
  state: RoomState,
  interactionId: string,
  responderId: PlayerId,
  chosenTargetId: PlayerId,
  rng: Rng = Math.random
): RoomState {
  const next = cloneState(state);
  const interaction = next.pendingInteraction;
  if (!interaction || interaction.interactionId !== interactionId) return next;
  if (interaction.type !== 'delegated_target_pick') return next;
  if (interaction.targetPlayerId !== responderId) {
    throw new Error('only the delegated player can respond to this choice');
  }
  if (!next.players[chosenTargetId]) return next;

  const delegatedPlayerId = interaction.targetPlayerId;
  next.pendingInteraction = null;

  if (interaction.sourceCardCode === 'A126') {
    return discard(next, chosenTargetId, next.players[chosenTargetId].hand.length);
  }
  if (interaction.sourceCardCode === 'A130') {
    if (next.players[delegatedPlayerId].hand.length === 0) return next;
    return stealRandom(next, delegatedPlayerId, chosenTargetId, 1, rng);
  }
  return next;
}
