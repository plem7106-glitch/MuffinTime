import { cloneState } from './util';
import { draw, discard } from './pile';
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

export function drawUntilCount(
  state: RoomState,
  playerId: PlayerId,
  targetCount: number,
  rng: Rng = Math.random
): RoomState {
  const hand = state.players[playerId].hand;
  if (hand.length < targetCount) {
    return draw(state, playerId, targetCount - hand.length, rng);
  }
  if (hand.length > targetCount) {
    return discard(state, playerId, hand.length - targetCount, null, rng);
  }
  return cloneState(state);
}
