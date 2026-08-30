import { cloneState } from './util.js';
import { draw, discard } from './pile.js';

export function everyoneDraws(state, n, excludeIds = [], rng = Math.random) {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function everyoneDiscards(state, n, excludeIds = [], rng = Math.random) {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = discard(next, playerId, n, null, rng);
  }
  return next;
}

export function passHands(state, steps) {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  const hands = order.map((id) => next.players[id].hand);
  for (let i = 0; i < count; i++) {
    const targetIndex = (((i + steps) % count) + count) % count;
    next.players[order[targetIndex]].hand = hands[i];
  }
  return next;
}
