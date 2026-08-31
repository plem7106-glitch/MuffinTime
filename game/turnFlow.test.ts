import { describe, it, expect } from 'vitest';
import { skipTurn, reverseDirection, changeMuffinTarget } from './turnFlow';
import type { RoomState } from './types';

describe('skipTurn', () => {
  it('marks the player to skip their next turn', () => {
    const state = { players: { p1: { skipNextTurn: false } } } as unknown as RoomState;
    const next = skipTurn(state, 'p1');
    expect(next.players.p1.skipNextTurn).toBe(true);
  });
});

describe('reverseDirection', () => {
  it('flips the play direction', () => {
    expect(reverseDirection({ direction: 1 } as unknown as RoomState).direction).toBe(-1);
    expect(reverseDirection({ direction: -1 } as unknown as RoomState).direction).toBe(1);
  });
});

describe('changeMuffinTarget', () => {
  it('sets a new muffin time target hand size', () => {
    const next = changeMuffinTarget({ muffinTimeTarget: 10 } as unknown as RoomState, 7);
    expect(next.muffinTimeTarget).toBe(7);
  });
});
