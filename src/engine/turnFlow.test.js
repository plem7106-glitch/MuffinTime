import { describe, it, expect } from 'vitest';
import { skipTurn, reverseDirection, changeMuffinTarget } from './turnFlow.js';

describe('skipTurn', () => {
  it('marks the player to skip their next turn', () => {
    const state = { players: { p1: { skipNextTurn: false } } };
    const next = skipTurn(state, 'p1');
    expect(next.players.p1.skipNextTurn).toBe(true);
  });
});

describe('reverseDirection', () => {
  it('flips the play direction', () => {
    expect(reverseDirection({ direction: 1 }).direction).toBe(-1);
    expect(reverseDirection({ direction: -1 }).direction).toBe(1);
  });
});

describe('changeMuffinTarget', () => {
  it('sets a new muffin time target hand size', () => {
    const next = changeMuffinTarget({ muffinTimeTarget: 10 }, 7);
    expect(next.muffinTimeTarget).toBe(7);
  });
});
