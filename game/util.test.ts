import { describe, it, expect } from 'vitest';
import { cloneState, shuffle, pickRandomIndices, trackForcedLoss } from './util';
import type { RoomState } from './types';

describe('cloneState', () => {
  it('returns a deep copy that does not share references', () => {
    const state = { players: { p1: { hand: ['A01'] } } };
    const clone = cloneState(state);
    clone.players.p1.hand.push('A02');
    expect(state.players.p1.hand).toEqual(['A01']);
  });
});

describe('shuffle', () => {
  it('is deterministic given a fixed rng and does not mutate the input', () => {
    const input = [1, 2, 3, 4];
    const result = shuffle(input, () => 0);
    expect(result).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('uses an inclusive upper bound so every position can stay in place', () => {
    const result = shuffle([1, 2, 3, 4], () => 0.999999);
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe('pickRandomIndices', () => {
  it('returns n distinct indices in [0, length) using the given rng', () => {
    const result = pickRandomIndices(4, 2, () => 0);
    expect(result).toEqual([1, 2]);
  });

  it('caps at length when n exceeds length', () => {
    const result = pickRandomIndices(2, 5, () => 0);
    expect(result.sort()).toEqual([0, 1]);
  });
});

function forcedLossState(): RoomState {
  return {
    status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
    direction: 1, muffinTimeTarget: 10, drawPile: [], discardPile: [],
    players: {
      p1: { name: 'One', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('trackForcedLoss', () => {
  it('increments from undefined and accumulates across calls', () => {
    let state = forcedLossState();
    state = trackForcedLoss(state, 'p2', 2);
    expect(state.players.p2.forcedLossSinceLastTurn).toBe(2);
    state = trackForcedLoss(state, 'p2', 1);
    expect(state.players.p2.forcedLossSinceLastTurn).toBe(3);
  });

  it('no-ops for count <= 0', () => {
    const state = forcedLossState();
    const next = trackForcedLoss(state, 'p2', 0);
    expect(next.players.p2.forcedLossSinceLastTurn).toBeUndefined();
  });

  it('no-ops for an unknown player id', () => {
    const state = forcedLossState();
    const next = trackForcedLoss(state, 'ghost', 3);
    expect(next.players.p1.forcedLossSinceLastTurn).toBeUndefined();
    expect(next.players.p2.forcedLossSinceLastTurn).toBeUndefined();
  });

  it('leaves other players untouched', () => {
    const state = trackForcedLoss(forcedLossState(), 'p2', 5);
    expect(state.players.p1.forcedLossSinceLastTurn).toBeUndefined();
  });
});
