import { cloneState } from './util.js';
import { draw, discard } from './pile.js';

export function removeCardFromDiscard(state, cardCode) {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos !== -1) next.discardPile.splice(pos, 1);
  return next;
}

export function returnCardToHand(state, cardCode, toPlayerId) {
  const next = cloneState(state);
  const pos = next.discardPile.indexOf(cardCode);
  if (pos === -1) return next;
  next.discardPile.splice(pos, 1);
  next.players[toPlayerId].hand.push(cardCode);
  return next;
}

export function drawUntilCount(state, playerId, targetCount, rng = Math.random) {
  const hand = state.players[playerId].hand;
  if (hand.length < targetCount) {
    return draw(state, playerId, targetCount - hand.length, rng);
  }
  if (hand.length > targetCount) {
    return discard(state, playerId, hand.length - targetCount, null, rng);
  }
  return cloneState(state);
}
