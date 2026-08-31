import { cloneState } from './util';
import type { RoomState, PlayerId } from './types';

export function advanceTurn(state: RoomState): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  let index = next.currentTurnIndex;
  let attempts = 0;
  // attempts <= count is a defensive backstop; in practice the loop always exits via the
  // inner `break` once it revisits a player whose flag it already cleared this call.
  do {
    index = (((index + next.direction) % count) + count) % count;
    attempts++;
    const playerId = order[index];
    if (next.players[playerId].skipNextTurn) {
      next.players[playerId].skipNextTurn = false;
      continue;
    }
    break;
  } while (attempts <= count);
  next.currentTurnIndex = index;
  return next;
}

export function isMuffinTimeEligible(state: RoomState, playerId: PlayerId): boolean {
  return state.players[playerId].hand.length === state.muffinTimeTarget;
}

export function declareMuffinTime(state: RoomState, playerId: PlayerId): RoomState {
  if (!isMuffinTimeEligible(state, playerId)) {
    throw new Error('player does not have the target hand count');
  }
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = true;
  return next;
}

export function checkWinnerAtTurnStart(state: RoomState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return player.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget;
}

export function clearMuffinTimeDeclaration(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = false;
  return next;
}
