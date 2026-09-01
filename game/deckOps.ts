import { cloneState } from './util';
import type { CardCode, PlayerId, RoomState } from './types';

/**
 * "Family H1" primitives: reach directly into drawPile/discardPile beyond a
 * normal draw. drawPile is a stack (draw() pops from the end, i.e. the "top"
 * of the pile is the end of the array); discardPile's "top"/most recent card
 * is likewise its last element (discard() pushes onto the end).
 */

/** Read-only: the next N cards that would be drawn, without mutating state. */
export function peekTopN(state: RoomState, n: number): CardCode[] {
  const count = Math.min(n, state.drawPile.length);
  return state.drawPile.slice(state.drawPile.length - count).reverse();
}

/** Takes one specific card (already seen via peekTopN) out of the draw pile into a player's hand. */
export function takeChosenFromPeek(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const pos = next.drawPile.indexOf(cardCode);
  if (pos === -1) return next;
  next.drawPile.splice(pos, 1);
  next.players[playerId].hand.push(cardCode);
  return next;
}

/** Takes the N most-recently-discarded cards into a player's hand. */
export function takeTopNFromDiscard(state: RoomState, playerId: PlayerId, n: number): RoomState {
  const next = cloneState(state);
  const count = Math.min(n, next.discardPile.length);
  const taken = next.discardPile.splice(next.discardPile.length - count, count);
  next.players[playerId].hand.push(...taken);
  return next;
}
