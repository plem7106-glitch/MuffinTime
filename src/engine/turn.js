import { cloneState } from './util.js';

export function advanceTurn(state) {
  const next = cloneState(state);
  const order = next.turnOrder;
  const count = order.length;
  let index = next.currentTurnIndex;
  let attempts = 0;
  // attempts <= count is a defensive backstop; in practice the loop always exits via the
  // inner `break` once it revisits a player whose flag it already cleared this call.
  do {
    index = ((index + next.direction) % count + count) % count;
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

export function isMuffinTimeEligible(state, playerId) {
  return state.players[playerId].hand.length === state.muffinTimeTarget;
}

export function declareMuffinTime(state, playerId) {
  if (!isMuffinTimeEligible(state, playerId)) {
    throw new Error('player does not have the target hand count');
  }
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = true;
  return next;
}

export function checkWinnerAtTurnStart(state, playerId) {
  const player = state.players[playerId];
  return player.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget;
}

export function clearMuffinTimeDeclaration(state, playerId) {
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = false;
  return next;
}
