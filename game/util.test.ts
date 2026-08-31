import { describe, it, expect } from 'vitest';
import { cloneState, shuffle, pickRandomIndices } from './util';

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
