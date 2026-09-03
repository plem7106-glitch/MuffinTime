import { describe, it, expect } from 'vitest';
import { draw, drawFromBottom, discard, reshuffleDiscardIntoDraw } from './pile';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    drawPile: ['A01', 'A02', 'A03'],
    discardPile: ['A10'],
    players: { p1: { hand: [] } },
  } as unknown as RoomState;
}

describe('draw', () => {
  it('moves n cards from the top of the draw pile into the hand', () => {
    const next = draw(baseState(), 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A03', 'A02']);
    expect(next.drawPile).toEqual(['A01']);
  });

  it('stops drawing when drawPile runs out without fabricating cards', () => {
    const state = {
      drawPile: ['A01'],
      discardPile: ['A10', 'A11', 'A12'],
      players: { p1: { hand: [] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 3);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.drawPile.length).toBe(0);
    expect(next.discardPile).toEqual(['A10', 'A11', 'A12']);
  });

  it('stops drawing early if both piles are exhausted', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: [] } } } as unknown as RoomState;
    const next = draw(state, 'p1', 3);
    expect(next.players.p1.hand).toEqual([]);
  });

  it('drawing A064 also discards 3 other random cards from the same hand, keeping A064', () => {
    // pop() takes 'A064' (the last element) on the only draw.
    const state = {
      drawPile: ['H1', 'H2', 'H3', 'H4', 'A064'],
      discardPile: [],
      players: { p1: { hand: ['H5', 'H6', 'H7'] } },
      bananaPeelArmed: true,
    } as unknown as RoomState;
    const next = draw(state, 'p1', 1);
    expect(next.players.p1.hand).toEqual(['A064']);
    expect(next.discardPile.length).toBe(3);
    expect(next.discardPile).not.toContain('A064');
    expect(new Set(next.discardPile)).toEqual(new Set(['H5', 'H6', 'H7']));
  });

  it('A064 hook clamps to however many other cards are actually in hand (fewer than 3)', () => {
    const state = {
      drawPile: ['A064'],
      discardPile: [],
      players: { p1: { hand: ['H1'] } },
      bananaPeelArmed: true,
    } as unknown as RoomState;
    const next = draw(state, 'p1', 1);
    expect(next.players.p1.hand).toEqual(['A064']);
    expect(next.discardPile).toEqual(['H1']);
  });

  it('a multi-card draw where A064 is drawn mid-batch only discards cards already in hand at that moment -- a card drawn afterward in the same batch is untouched', () => {
    // pop() order for this drawPile, 4 draws: 'H2', 'H1', 'A064', 'LATER2' --
    // A064 is the 3rd draw, LATER2 the 4th (drawn strictly after A064's
    // discard-3 trigger already ran).
    const state = {
      drawPile: ['LATER1', 'LATER2', 'A064', 'H1', 'H2'],
      discardPile: [],
      players: { p1: { hand: [] } },
      bananaPeelArmed: true,
    } as unknown as RoomState;
    const next = draw(state, 'p1', 4);
    expect(next.players.p1.hand).toEqual(['A064', 'LATER2']);
    expect(next.discardPile.length).toBe(2);
    expect(new Set(next.discardPile)).toEqual(new Set(['H1', 'H2']));
  });

  it('drawing A064 when it has never been planted (bananaPeelArmed unset) is an ordinary draw -- no discard triggered', () => {
    const state = {
      drawPile: ['H1', 'H2', 'H3', 'A064'],
      discardPile: [],
      players: { p1: { hand: ['K1', 'K2', 'K3'] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 1);
    expect(next.players.p1.hand).toEqual(['K1', 'K2', 'K3', 'A064']);
    expect(next.discardPile).toEqual([]);
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
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', 2, ['A01', 'A03']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.discardPile).toEqual(['A01', 'A03']);
  });

  it('discards n random cards when no cards are specified', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', 2, null, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.discardPile.length).toBe(2);
  });

  it('does nothing when n is negative or zero', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } },
    } as unknown as RoomState;
    const next = discard(state, 'p1', -1, null, () => 0);
    expect(next.players.p1.hand).toEqual(['A01', 'A02', 'A03', 'A04']);
  });

  it('throws when cardCodes length does not match n', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03'] } },
    } as unknown as RoomState;
    expect(() => discard(state, 'p1', 3, ['A01'])).toThrow();
  });

  it('throws when a card in cardCodes is not actually in the hand (e.g. a duplicate)', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } } as unknown as RoomState;
    expect(() => discard(state, 'p1', 2, ['A01', 'A01'])).toThrow();
  });
});

describe('reshuffleDiscardIntoDraw', () => {
  it('keeps the top discard card in place and shuffles the rest into the draw pile', () => {
    const state = { drawPile: [], discardPile: ['A10', 'A11', 'A12'] } as unknown as RoomState;
    const next = reshuffleDiscardIntoDraw(state, () => 0);
    expect(next.discardPile).toEqual(['A12']);
    expect(next.drawPile.sort()).toEqual(['A10', 'A11']);
  });

  it('does nothing when the discard pile has 0 or 1 cards', () => {
    const state = { drawPile: [], discardPile: ['A10'] } as unknown as RoomState;
    const next = reshuffleDiscardIntoDraw(state);
    expect(next).toEqual(state);
  });
});
