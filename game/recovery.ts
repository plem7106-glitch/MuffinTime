import { cloneState } from './util';
import type { RoomState, PlayerId, CardCode } from './types';
import { createGameEvent, appendGameEvent, GAME_EVENT_TYPES } from './events';

/**
 * Pure Manual Recovery Discard primitive.
 * Manually corrects game state by moving exact selected physical cards from a player's hand to the discard pile.
 * 
 * Safety & Non-Reactive Rules:
 * - Does NOT trigger FORCED_DISCARD gameplay rules, interception, or replacement.
 * - Does NOT emit CARD_PLAYED or ACTION_PLAYED.
 * - Does NOT push StackFrames or open Reaction Windows.
 * - Does NOT trigger automatic traps.
 * - Emits a lightweight MANUAL_RECOVERY_DISCARD audit event.
 */
export function executeManualRecoveryDiscard(
  state: RoomState,
  actorId: PlayerId,
  cardCodes: CardCode[]
): RoomState {
  if (!actorId || !cardCodes || cardCodes.length === 0) {
    return state;
  }

  const player = state.players[actorId];
  if (!player) {
    return state;
  }

  // Reject requests with duplicate card code selections in a single call to prevent accidental over-discarding
  const uniqueSelected = new Set(cardCodes);
  if (uniqueSelected.size !== cardCodes.length) {
    return state;
  }

  // Validate that EVERY selected card code currently exists in the player's hand
  const currentHandCopy = [...player.hand];
  for (const code of cardCodes) {
    const idx = currentHandCopy.indexOf(code);
    if (idx === -1) {
      // Missing card: atomic rejection, return unchanged state
      return state;
    }
    currentHandCopy.splice(idx, 1);
  }

  // Perform atomic card movement
  const next = cloneState(state);
  const targetHand = next.players[actorId].hand;

  for (const code of cardCodes) {
    const idx = targetHand.indexOf(code);
    if (idx !== -1) {
      targetHand.splice(idx, 1);
      next.discardPile.push(code);
    }
  }

  // Append lightweight public audit event
  appendGameEvent(
    next,
    createGameEvent(
      GAME_EVENT_TYPES.MANUAL_RECOVERY_DISCARD,
      actorId,
      { actorId, count: cardCodes.length },
      [actorId]
    )
  );

  return next;
}

/**
 * Pure Manual Recovery Give Card primitive.
 * Manually corrects game state by transferring exact selected physical cards from sender's hand to recipient's hand.
 * 
 * Safety & Non-Reactive Rules:
 * - Sender cannot be recipient.
 * - Does NOT trigger STEAL gameplay rules or emits EVENT_CARD_STOLEN.
 * - Does NOT emit CARD_PLAYED or ACTION_PLAYED.
 * - Does NOT push StackFrames or open Reaction Windows.
 * - Does NOT trigger automatic traps.
 * - Emits a lightweight MANUAL_RECOVERY_TRANSFER audit event (without private card codes).
 */
export function executeManualRecoveryGive(
  state: RoomState,
  senderId: PlayerId,
  recipientId: PlayerId,
  cardCodes: CardCode[]
): RoomState {
  if (!senderId || !recipientId || senderId === recipientId || !cardCodes || cardCodes.length === 0) {
    return state;
  }

  const sender = state.players[senderId];
  const recipient = state.players[recipientId];
  if (!sender || !recipient) {
    return state;
  }

  // Reject requests with duplicate card code selections in a single call
  const uniqueSelected = new Set(cardCodes);
  if (uniqueSelected.size !== cardCodes.length) {
    return state;
  }

  // Validate that EVERY selected card code currently exists in the sender's hand
  const currentHandCopy = [...sender.hand];
  for (const code of cardCodes) {
    const idx = currentHandCopy.indexOf(code);
    if (idx === -1) {
      // Missing card: atomic rejection, return unchanged state
      return state;
    }
    currentHandCopy.splice(idx, 1);
  }

  // Perform atomic card transfer
  const next = cloneState(state);
  const senderHand = next.players[senderId].hand;
  const recipientHand = next.players[recipientId].hand;

  for (const code of cardCodes) {
    const idx = senderHand.indexOf(code);
    if (idx !== -1) {
      senderHand.splice(idx, 1);
      recipientHand.push(code);
    }
  }

  // Append lightweight public audit event (private card codes omitted)
  appendGameEvent(
    next,
    createGameEvent(
      GAME_EVENT_TYPES.MANUAL_RECOVERY_TRANSFER,
      senderId,
      { actorId: senderId, recipientId, count: cardCodes.length },
      [senderId, recipientId]
    )
  );

  return next;
}
