import { cloneState, pickRandomIndices } from './util.js';

export function stealRandom(state, fromId, toId, n, rng = Math.random) {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const count = Math.min(n, fromHand.length);
  const indices = pickRandomIndices(fromHand.length, count, rng).sort((a, b) => b - a);
  const stolenCards = [];
  for (const i of indices) {
    stolenCards.push(fromHand.splice(i, 1)[0]);
  }
  next.players[toId].hand.push(...stolenCards);
  return next;
}

export function stealChosen(state, fromId, toId, cardCode) {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const pos = fromHand.indexOf(cardCode);
  if (pos === -1) return next;
  fromHand.splice(pos, 1);
  next.players[toId].hand.push(cardCode);
  return next;
}

export function giveCard(state, fromId, toId, cardCode) {
  return stealChosen(state, fromId, toId, cardCode);
}

export function swapHands(state, aId, bId) {
  const next = cloneState(state);
  const aHand = next.players[aId].hand;
  const bHand = next.players[bId].hand;
  next.players[aId].hand = bHand;
  next.players[bId].hand = aHand;
  return next;
}
