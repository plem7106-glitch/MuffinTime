import { cloneState } from './util';
import { discard } from './pile';
import type { RoomState, PlayerId, CardCode } from './types';

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

/** Where a played Action card's post-resolution destination goes -- normally
 * the discard pile, but redirected into actionRedirect.toPlayerId's hand for
 * A040's "next 3 played Actions enter my hand" effect (any player's play
 * counts, decremented here). Falls back to a normal discard once the
 * redirect is inactive or exhausted. Called from lib/session.tsx's
 * playAction at the exact point the played card leaves the actor's hand. */
export function applyActionRedirect(state: RoomState, actorId: PlayerId, code: CardCode): RoomState {
  const redirect = state.actionRedirect;
  if (!redirect || redirect.remaining <= 0) {
    return discard(state, actorId, 1, [code]);
  }
  const next = cloneState(state);
  const hand = next.players[actorId].hand;
  const pos = hand.indexOf(code);
  if (pos === -1) {
    throw new Error(`applyActionRedirect: card ${code} not found in hand`);
  }
  hand.splice(pos, 1);
  next.players[redirect.toPlayerId].hand.push(code);
  next.actionRedirect = redirect.remaining - 1 > 0 ? { ...redirect, remaining: redirect.remaining - 1 } : null;
  return next;
}
