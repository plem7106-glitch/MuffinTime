import { describe, it, expect } from 'vitest';
import { everyoneDraws, everyoneDiscards, passHands } from './group';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    turnOrder: ['p1', 'p2', 'p3'],
    drawPile: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'],
    discardPile: [],
    players: {
      p1: { hand: [] },
      p2: { hand: [] },
      p3: { hand: [] },
    },
  } as unknown as RoomState;
}

describe('everyoneDraws', () => {
  it('every player draws n cards', () => {
    const next = everyoneDraws(baseState(), 2);
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('skips excluded player ids', () => {
    const next = everyoneDraws(baseState(), 2, ['p2']);
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(2);
  });
});

describe('everyoneDiscards', () => {
  it('every player discards up to n cards', () => {
    const state = baseState();
    state.players.p1.hand = ['A01', 'A02'];
    state.players.p2.hand = ['A03'];
    state.players.p3.hand = ['A04', 'A05'];
    const next = everyoneDiscards(state, 1, [], () => 0);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(1);
  });
});

describe('passHands', () => {
  it('rotates every hand forward by one seat when steps is +1', () => {
    const state = baseState();
    state.players.p1.hand = ['A01'];
    state.players.p2.hand = ['A02'];
    state.players.p3.hand = ['A03'];
    const next = passHands(state, 1);
    expect(next.players.p2.hand).toEqual(['A01']);
    expect(next.players.p3.hand).toEqual(['A02']);
    expect(next.players.p1.hand).toEqual(['A03']);
  });

  it('rotates every hand backward by one seat when steps is -1', () => {
    const state = baseState();
    state.players.p1.hand = ['A01'];
    state.players.p2.hand = ['A02'];
    state.players.p3.hand = ['A03'];
    const next = passHands(state, -1);
    expect(next.players.p3.hand).toEqual(['A01']);
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.players.p2.hand).toEqual(['A03']);
  });
});
