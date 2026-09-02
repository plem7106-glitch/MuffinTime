import { describe, expect, it } from 'vitest';
import { discardTraps, discardAllTraps, returnTrapsToHand, stealTrap, stealTrapToHand } from './trapPile';
import type { RoomState } from './types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      p1: { name: 'One', hand: [], traps: ['T01', 'T02', 'T03'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: ['T04'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('discardTraps', () => {
  it('discards specific trap codes into the discard pile', () => {
    const next = discardTraps(baseState(), 'p1', 2, ['T01', 'T02']);
    expect(next.players.p1.traps).toEqual(['T03']);
    expect(next.discardPile).toEqual(expect.arrayContaining(['T01', 'T02']));
  });

  it('discards a random N when no specific codes are given', () => {
    const next = discardTraps(baseState(), 'p1', 1, null, () => 0);
    expect(next.players.p1.traps.length).toBe(2);
    expect(next.discardPile.length).toBe(1);
  });

  it('throws if a requested code is not actually on the player', () => {
    expect(() => discardTraps(baseState(), 'p1', 1, ['T99'])).toThrow();
  });
});

describe('discardAllTraps', () => {
  it('moves every trap to the discard pile', () => {
    const next = discardAllTraps(baseState(), 'p1');
    expect(next.players.p1.traps).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(['T01', 'T02', 'T03']));
  });
});

describe('returnTrapsToHand', () => {
  it('returns all traps to hand by default', () => {
    const next = returnTrapsToHand(baseState(), 'p1');
    expect(next.players.p1.traps).toEqual([]);
    expect(next.players.p1.hand).toEqual(expect.arrayContaining(['T01', 'T02', 'T03']));
  });

  it('returns only the specified codes', () => {
    const next = returnTrapsToHand(baseState(), 'p1', ['T02']);
    expect(next.players.p1.traps).toEqual(['T01', 'T03']);
    expect(next.players.p1.hand).toEqual(['T02']);
  });
});

describe('stealTrap', () => {
  it('moves a specific trap card from one player to another', () => {
    const next = stealTrap(baseState(), 'p1', 'p2', 'T02');
    expect(next.players.p1.traps).toEqual(['T01', 'T03']);
    expect(next.players.p2.traps).toEqual(expect.arrayContaining(['T04', 'T02']));
  });

  it('is a no-op if the card is not found', () => {
    const state = baseState();
    expect(stealTrap(state, 'p1', 'p2', 'T99')).toEqual(state);
  });
});

describe('stealTrapToHand', () => {
  it('moves a specific trap card from a player\'s traps into another player\'s hand', () => {
    const next = stealTrapToHand(baseState(), 'p1', 'p2', 'T02');
    expect(next.players.p1.traps).toEqual(['T01', 'T03']);
    expect(next.players.p2.hand).toEqual(['T02']);
    expect(next.players.p2.traps).toEqual(['T04']);
  });

  it('is a no-op if the card is not found', () => {
    const state = baseState();
    expect(stealTrapToHand(state, 'p1', 'p2', 'T99')).toEqual(state);
  });
});
