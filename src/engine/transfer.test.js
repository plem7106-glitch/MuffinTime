import { describe, it, expect } from 'vitest';
import { stealRandom, stealChosen, giveCard, swapHands } from './transfer.js';

function baseState() {
  return {
    players: {
      p1: { hand: ['A01', 'A02', 'A03'] },
      p2: { hand: ['B01'] },
    },
  };
}

describe('stealRandom', () => {
  it('moves n random cards from one hand to another', () => {
    const next = stealRandom(baseState(), 'p1', 'p2', 2, () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(3);
  });

  it('caps at the number of cards actually available', () => {
    const next = stealRandom(baseState(), 'p2', 'p1', 5, () => 0);
    expect(next.players.p2.hand).toEqual([]);
    expect(next.players.p1.hand.length).toBe(4);
  });

  it('does nothing when n is negative or zero', () => {
    const next = stealRandom(baseState(), 'p1', 'p2', -1, () => 0);
    expect(next.players.p1.hand).toEqual(['A01', 'A02', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01']);
  });
});

describe('stealChosen', () => {
  it('moves a specific card from one hand to another', () => {
    const next = stealChosen(baseState(), 'p1', 'p2', 'A02');
    expect(next.players.p1.hand).toEqual(['A01', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01', 'A02']);
  });

  it('does nothing if the card is not in the source hand', () => {
    const state = baseState();
    const next = stealChosen(state, 'p1', 'p2', 'ZZZ');
    expect(next).toEqual(state);
  });
});

describe('giveCard', () => {
  it('moves the given card from giver to receiver', () => {
    const next = giveCard(baseState(), 'p1', 'p2', 'A01');
    expect(next.players.p1.hand).toEqual(['A02', 'A03']);
    expect(next.players.p2.hand).toEqual(['B01', 'A01']);
  });
});

describe('swapHands', () => {
  it('swaps the entire hands of two players', () => {
    const next = swapHands(baseState(), 'p1', 'p2');
    expect(next.players.p1.hand).toEqual(['B01']);
    expect(next.players.p2.hand).toEqual(['A01', 'A02', 'A03']);
  });
});
