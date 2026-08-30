import { cloneState } from './util.js';

export function skipTurn(state, playerId) {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state) {
  const next = cloneState(state);
  next.direction = next.direction * -1;
  return next;
}

export function changeMuffinTarget(state, n) {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}
