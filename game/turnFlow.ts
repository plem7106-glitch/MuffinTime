import { cloneState } from './util';
import type { RoomState, PlayerId } from './types';

export function skipTurn(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state: RoomState): RoomState {
  const next = cloneState(state);
  next.direction = (next.direction * -1) as 1 | -1;
  return next;
}

export function changeMuffinTarget(state: RoomState, n: number): RoomState {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}
