import { describe, expect, it } from 'vitest';
import { rosterDraws, rosterDiscards, rosterStolenBy, rosterSkipTurn } from './roster';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A001', 'A002', 'A003', 'A004', 'A005', 'A006'],
    discardPile: [],
    players: {
      p1: { name: 'One', hand: ['A101'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['A102', 'A103'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['A104'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('rosterDraws', () => {
  it('only draws for the players in the roster', () => {
    const next = rosterDraws(baseState(), ['p2', 'p3'], 2);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(4);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it('empty roster is a no-op', () => {
    const state = baseState();
    expect(rosterDraws(state, [], 2)).toEqual(state);
  });
});

describe('rosterDiscards', () => {
  it('only discards for the players in the roster', () => {
    const next = rosterDiscards(baseState(), ['p2'], 1);
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p3.hand.length).toBe(1);
  });
});

describe('rosterStolenBy', () => {
  it('the thief gains 1 card from each victim in the roster', () => {
    const next = rosterStolenBy(baseState(), 'p1', ['p2', 'p3'], 1);
    expect(next.players.p1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p3.hand.length).toBe(0);
  });

  it('skips the thief if they appear in their own roster', () => {
    const next = rosterStolenBy(baseState(), 'p1', ['p1', 'p2'], 1);
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(1);
  });
});

describe('rosterSkipTurn', () => {
  it('flags every roster player to skip their next turn', () => {
    const next = rosterSkipTurn(baseState(), ['p2', 'p3']);
    expect(next.players.p1.skipNextTurn).toBe(false);
    expect(next.players.p2.skipNextTurn).toBe(true);
    expect(next.players.p3.skipNextTurn).toBe(true);
  });
});
