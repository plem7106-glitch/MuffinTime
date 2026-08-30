import { describe, it, expect } from 'vitest';
import { draw, drawFromBottom, discard, reshuffleDiscardIntoDraw } from './pile.js';

function baseState() {
  return {
    drawPile: ['A01', 'A02', 'A03'],
    discardPile: ['A10'],
    players: { p1: { hand: [] } },
  };
}

describe('draw', () => {
  it('moves n cards from the top of the draw pile into the hand', () => {
    const next = draw(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A03', 'A02']);
    expect(next.drawPile).toEqual(['A01']);
  });

  it('reshuffles the discard pile into the draw pile when it runs out', () => {
    const state = { drawPile: ['A01'], discardPile: ['A10', 'A11', 'A12'], players: { p1: { hand: [] } } };
    const next = draw(state, 'p1', 3, () => 0);
    expect(next.players.p1.hand.length).toBe(3);
    expect(next.discardPile).toEqual(['A12']);
  });

  it('stops drawing early if both piles are exhausted', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: [] } } };
    const next = draw(state, 'p1', 3);
    expect(next.players.p1.hand).toEqual([]);
  });
});

describe('drawFromBottom', () => {
  it('moves n cards from the start of the draw pile into the hand', () => {
    const next = drawFromBottom(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A01', 'A02']);
    expect(next.drawPile).toEqual(['A03']);
  });
});

describe('discard', () => {
  it('discards specific chosen cards from the hand', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03'] } } };
    const next = discard(state, 'p1', 2, ['A01', 'A03']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.discardPile).toEqual(['A01', 'A03']);
  });

  it('discards n random cards when no cards are specified', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03'] } } };
    const next = discard(state, 'p1', 2, null, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.discardPile.length).toBe(2);
  });

  it('does nothing when n is negative or zero', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } } };
    const next = discard(state, 'p1', -1, null, () => 0);
    expect(next.players.p1.hand).toEqual(['A01', 'A02', 'A03', 'A04']);
  });

  it('throws when cardCodes length does not match n', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02', 'A03'] } } };
    expect(() => discard(state, 'p1', 3, ['A01'])).toThrow();
  });

  it('throws when a card in cardCodes is not actually in the hand (e.g. a duplicate)', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } };
    expect(() => discard(state, 'p1', 2, ['A01', 'A01'])).toThrow();
  });
});

describe('reshuffleDiscardIntoDraw', () => {
  it('keeps the top discard card in place and shuffles the rest into the draw pile', () => {
    const state = { drawPile: [], discardPile: ['A10', 'A11', 'A12'] };
    const next = reshuffleDiscardIntoDraw(state, () => 0);
    expect(next.discardPile).toEqual(['A12']);
    expect(next.drawPile.sort()).toEqual(['A10', 'A11']);
  });

  it('does nothing when the discard pile has 0 or 1 cards', () => {
    const state = { drawPile: [], discardPile: ['A10'] };
    const next = reshuffleDiscardIntoDraw(state);
    expect(next).toEqual(state);
  });
});
