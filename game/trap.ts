import { cloneState } from './util';
import type { RoomState, PlayerId, CardCode } from './types';

export function placeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  if (player.traps.length >= 3) {
    throw new Error('trap limit reached: discard an existing trap first');
  }
  const pos = player.hand.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('card not in hand');
  }
  player.hand.splice(pos, 1);
  player.traps.push(cardCode);
  return next;
}

export function removeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  const pos = player.traps.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('trap not found');
  }
  player.traps.splice(pos, 1);
  next.discardPile.push(cardCode);
  return next;
}
