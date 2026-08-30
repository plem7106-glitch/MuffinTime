import { cloneState, shuffle, pickRandomIndices } from './util.js';

export function reshuffleDiscardIntoDraw(state, rng = Math.random) {
  const next = cloneState(state);
  if (next.discardPile.length <= 1) return next;
  const top = next.discardPile[next.discardPile.length - 1];
  const rest = next.discardPile.slice(0, -1);
  next.drawPile = [...next.drawPile, ...shuffle(rest, rng)];
  next.discardPile = [top];
  return next;
}

export function draw(state, playerId, n, rng = Math.random) {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) {
      next = reshuffleDiscardIntoDraw(next, rng);
      if (next.drawPile.length === 0) break;
    }
    const card = next.drawPile.pop();
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function drawFromBottom(state, playerId, n) {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.shift();
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function discard(state, playerId, n, cardCodes = null, rng = Math.random) {
  const next = cloneState(state);
  const hand = next.players[playerId].hand;
  let toDiscard;
  if (cardCodes) {
    toDiscard = cardCodes.slice(0, n);
  } else {
    const indices = pickRandomIndices(hand.length, Math.min(n, hand.length), rng);
    toDiscard = indices.map((i) => hand[i]);
  }
  for (const code of toDiscard) {
    const pos = hand.indexOf(code);
    if (pos !== -1) {
      hand.splice(pos, 1);
      next.discardPile.push(code);
    }
  }
  return next;
}
