import { describe, it, expect } from 'vitest';
import { removeCardFromDiscard, returnCardToHand, drawUntilCount } from './misc';
import type { RoomState } from './types';

describe('removeCardFromDiscard', () => {
  it('permanently removes a card from the discard pile', () => {
    const state = { discardPile: ['A01', 'A02'] } as unknown as RoomState;
    const next = removeCardFromDiscard(state, 'A01');
    expect(next.discardPile).toEqual(['A02']);
  });
});

describe('returnCardToHand', () => {
  it('moves a card from the discard pile back into a hand', () => {
    const state = { discardPile: ['A01', 'A02'], players: { p1: { hand: [] } } } as unknown as RoomState;
    const next = returnCardToHand(state, 'A02', 'p1');
    expect(next.discardPile).toEqual(['A01']);
    expect(next.players.p1.hand).toEqual(['A02']);
  });
});

describe('drawUntilCount', () => {
  it('draws up to the target count when the hand is smaller', () => {
    const state = {
      drawPile: ['A01', 'A02'],
      discardPile: [],
      players: { p1: { hand: ['A03'] } },
    } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 3);
    expect(next.players.p1.hand.length).toBe(3);
  });

  it('discards down to the target count when the hand is larger', () => {
    const state = {
      drawPile: [],
      discardPile: [],
      players: { p1: { hand: ['A01', 'A02', 'A03', 'A04'] } },
    } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 2, () => 0);
    expect(next.players.p1.hand.length).toBe(2);
  });

  it('does nothing when the hand already matches the target', () => {
    const state = { drawPile: [], discardPile: [], players: { p1: { hand: ['A01', 'A02'] } } } as unknown as RoomState;
    const next = drawUntilCount(state, 'p1', 2);
    expect(next.players.p1.hand).toEqual(['A01', 'A02']);
  });
});
