import { describe, it, expect } from 'vitest';
import { skipTurn, reverseDirection, changeMuffinTarget, applyActionRedirect } from './turnFlow';
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

describe('applyActionRedirect', () => {
  it('discards normally when no redirect is active', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      discardPile: [],
      actionRedirect: null,
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.discardPile).toEqual(['A001']);
  });

  it("redirects the played card into the redirect target's hand instead of discarding", () => {
    const state = {
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 3 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p2.hand).toEqual(['A001']);
    expect(next.discardPile).toEqual([]);
    expect(next.actionRedirect).toEqual({ toPlayerId: 'p2', remaining: 2 });
  });

  it('clears the redirect once its count reaches 0', () => {
    const state = {
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 1 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.actionRedirect).toBeNull();
  });

  it('discards normally once remaining is already 0, even if the redirect object is still present', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 0 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.discardPile).toEqual(['A001']);
  });

  it('falls back to a normal discard (without throwing) when the redirect target has left the room', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 3 },
    } as unknown as RoomState;
    let next: RoomState | undefined;
    expect(() => {
      next = applyActionRedirect(state, 'p1', 'A001');
    }).not.toThrow();
    expect(next!.players.p1.hand).toEqual([]);
    expect(next!.discardPile).toEqual(['A001']);
    expect(next!.actionRedirect).toBeNull();
  });
});
