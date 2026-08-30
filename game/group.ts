import { cloneState } from './util';
import { draw, discard } from './pile';
import type { RoomState, PlayerId, Rng } from './types';

export function everyoneDraws(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function everyoneDiscards(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const playerId of Object.keys(next.players)) {
    if (excludeIds.includes(playerId)) continue;
    next = discard(next, playerId, n, null, rng);
  }
  return next;
}

export function passHands(state: RoomState, steps: number): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  const hands = order.map((id) => next.players[id].hand);
  for (let i = 0; i < count; i++) {
    const targetIndex = ((i + steps) % count + count) % count;
    next.players[order[targetIndex]].hand = hands[i];
  }
  return next;
}
