import { cloneState, shuffle, pickRandomIndices } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function reshuffleDiscardIntoDraw(state: RoomState, rng: Rng = Math.random): RoomState {
  const next = cloneState(state);
  if (next.discardPile.length <= 1) return next;
  const top = next.discardPile[next.discardPile.length - 1];
  const rest = next.discardPile.slice(0, -1);
  next.drawPile = [...next.drawPile, ...shuffle(rest, rng)];
  next.discardPile = [top];
  return next;
}

export function draw(state: RoomState, playerId: PlayerId, n: number, rng: Rng = Math.random): RoomState {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) {
      next = reshuffleDiscardIntoDraw(next, rng);
      if (next.drawPile.length === 0) break;
    }
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function drawFromBottom(state: RoomState, playerId: PlayerId, n: number): RoomState {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.shift()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function discard(
  state: RoomState,
  playerId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const hand = next.players[playerId].hand;
  let toDiscard: CardCode[];
  if (cardCodes) {
    if (cardCodes.length !== n) {
      throw new Error(`discard: cardCodes length (${cardCodes.length}) does not match n (${n})`);
    }
    toDiscard = cardCodes;
  } else {
    const indices = pickRandomIndices(hand.length, Math.min(n, hand.length), rng);
    toDiscard = indices.map((i) => hand[i]);
  }
  for (const code of toDiscard) {
    const pos = hand.indexOf(code);
    if (pos === -1) {
      throw new Error(`discard: card ${code} not found in hand`);
    }
    hand.splice(pos, 1);
    next.discardPile.push(code);
  }
  return next;
}
