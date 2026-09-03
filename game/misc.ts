import { cloneState } from './util';
import { draw, discard, forceDiscard } from './pile';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function removeCardFromDiscard(state: RoomState, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos !== -1) next.discardPile.splice(pos, 1);
  return next;
}

export function returnCardToHand(state: RoomState, cardCode: CardCode, toPlayerId: PlayerId): RoomState {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos === -1) return next;
  next.discardPile.splice(pos, 1);
  next.players[toPlayerId].hand.push(cardCode);
  return next;
}

/**
 * Adjusts playerId's hand toward targetCount (A044, A129, ...).
 *
 * `actorId` is whoever played the card driving the adjustment: trimming
 * anyone else's hand is a forced loss (A091 counts it), while the actor's own
 * trim is the self-inflicted cost of their own card and is never tracked --
 * the same `id === actorId ? untracked : tracked` split A034/A113 use. Omit it
 * and nothing is tracked, which is right for a self-directed call.
 */
export function drawUntilCount(
  state: RoomState,
  playerId: PlayerId,
  targetCount: number,
  rng: Rng = Math.random,
  actorId?: PlayerId
): RoomState {
  const hand = state.players[playerId].hand;
  if (hand.length < targetCount) {
    return draw(state, playerId, targetCount - hand.length, rng);
  }
  if (hand.length > targetCount) {
    const n = hand.length - targetCount;
    return actorId !== undefined && actorId !== playerId
      ? forceDiscard(state, playerId, n, null, rng)
      : discard(state, playerId, n, null, rng);
  }
  return cloneState(state);
}
