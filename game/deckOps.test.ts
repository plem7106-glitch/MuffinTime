import { describe, expect, it } from 'vitest';
import { peekTopN, takeChosenFromPeek, takeTopNFromDiscard } from './deckOps';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    // "top" of the draw pile is the end of the array (draw() pops from the end)
    drawPile: ['A005', 'A004', 'A003', 'A002', 'A001'],
    discardPile: ['A010', 'A011', 'A012'],
    players: {
      p1: { name: 'One', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('peekTopN', () => {
  it('returns the next N cards in draw order without mutating state', () => {
    const state = baseState();
    expect(peekTopN(state, 3)).toEqual(['A001', 'A002', 'A003']);
    expect(state.drawPile.length).toBe(5);
  });

  it('clamps to the pile size', () => {
    expect(peekTopN(baseState(), 99).length).toBe(5);
  });
});

describe('takeChosenFromPeek', () => {
  it('moves one specific card from the draw pile into a hand', () => {
    const next = takeChosenFromPeek(baseState(), 'p1', 'A002');
    expect(next.drawPile).toEqual(['A005', 'A004', 'A003', 'A001']);
    expect(next.players.p1.hand).toEqual(['A002']);
  });

  it('is a no-op if the card is not in the draw pile', () => {
    const state = baseState();
    expect(takeChosenFromPeek(state, 'p1', 'ZZZ')).toEqual(state);
  });
});

describe('takeTopNFromDiscard', () => {
  it('takes the N most-recently-discarded cards into a hand', () => {
    const next = takeTopNFromDiscard(baseState(), 'p1', 2);
    expect(next.discardPile).toEqual(['A010']);
    expect(next.players.p1.hand).toEqual(['A011', 'A012']);
  });

  it('clamps to the pile size', () => {
    const next = takeTopNFromDiscard(baseState(), 'p1', 99);
    expect(next.discardPile).toEqual([]);
    expect(next.players.p1.hand.length).toBe(3);
  });
});
