import { cloneState } from './util';
import { draw } from './pile';
import { executeDiscard } from './primitives';
import type { RoomState, PlayerId, Rng } from './types';

export function everyoneDraws(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  rng: Rng = Math.random,
  targetIds?: PlayerId[]
): RoomState {
  let next = cloneState(state);
  const targets = targetIds && targetIds.length > 0 ? targetIds : Object.keys(next.players);
  for (const playerId of targets) {
    if (excludeIds.includes(playerId)) continue;
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function everyoneDiscards(
  state: RoomState,
  n: number,
  excludeIds: PlayerId[] = [],
  _rng: Rng = Math.random,
  sourcePlayerId?: PlayerId,
  targetIds?: PlayerId[]
): RoomState {
  let next = cloneState(state);
  const targets = targetIds && targetIds.length > 0 ? targetIds : Object.keys(next.players).filter((id) => !excludeIds.includes(id));
  for (const playerId of targets) {
    next = executeDiscard(next, playerId, n, undefined, 'clamp_to_available', sourcePlayerId).state;
  }
  return next;
}

export function passHands(state: RoomState, steps: number): RoomState {
  const next = cloneState(state);
  const order = next.seatOrder && next.seatOrder.length > 0 ? next.seatOrder : next.turnOrder;
  const count = order.length;
  const hands = order.map((id) => next.players[id].hand);
  for (let i = 0; i < count; i++) {
    const targetIndex = ((i + steps) % count + count) % count;
    next.players[order[targetIndex]].hand = hands[i];
  }
  return next;
}
