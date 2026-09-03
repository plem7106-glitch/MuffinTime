import { cloneState, pickRandomIndices, trackForcedLoss } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function stealRandom(
  state: RoomState,
  fromId: PlayerId,
  toId: PlayerId,
  n: number,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const count = Math.min(n, fromHand.length);
  const indices = pickRandomIndices(fromHand.length, count, rng).sort((a, b) => b - a);
  const stolenCards: CardCode[] = [];
  for (const i of indices) {
    stolenCards.push(fromHand.splice(i, 1)[0]);
  }
  next.players[toId].hand.push(...stolenCards);
  return next;
}

export function forceSteal(
  state: RoomState,
  victimId: PlayerId,
  thiefId: PlayerId,
  n: number,
  rng: Rng = Math.random
): RoomState {
  const before = state.players[victimId]?.hand.length ?? 0;
  const stolen = stealRandom(state, victimId, thiefId, n, rng);
  const after = stolen.players[victimId]?.hand.length ?? 0;
  return trackForcedLoss(stolen, victimId, before - after);
}

export function stealChosen(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const fromHand = next.players[fromId].hand;
  const pos = fromHand.indexOf(cardCode);
  if (pos === -1) return next;
  fromHand.splice(pos, 1);
  next.players[toId].hand.push(cardCode);
  return next;
}

export function giveCard(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  return stealChosen(state, fromId, toId, cardCode);
}

export function swapHands(state: RoomState, aId: PlayerId, bId: PlayerId): RoomState {
  const next = cloneState(state);
  const aHand = next.players[aId].hand;
  const bHand = next.players[bId].hand;
  next.players[aId].hand = bHand;
  next.players[bId].hand = aHand;
  return next;
}
