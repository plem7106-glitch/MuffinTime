import { describe, expect, it } from 'vitest';
import { prepareSteal, finalizeSteal } from './steal';
import type { RoomState } from './types';

const state = (): RoomState => ({
  status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
  direction: 1, muffinTimeTarget: 10, drawPile: [], discardPile: [],
  players: {
    p1: { name: 'One', hand: ['A001', 'A002'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
  },
});

describe('finalizeSteal forced-loss tracking', () => {
  it('tracks the victim\'s forced loss with the actual stolen count', () => {
    const operation = prepareSteal(state(), 'p1', 'p2', 2);
    const next = finalizeSteal(state(), operation, () => 0);
    expect(next.players.p1.forcedLossSinceLastTurn).toBe(2);
  });

  it('does not track when nothing was stolen (empty victim hand)', () => {
    let empty = state();
    empty.players.p1.hand = [];
    const operation = prepareSteal(empty, 'p1', 'p2', 2);
    const next = finalizeSteal(empty, operation, () => 0);
    expect(next.players.p1.forcedLossSinceLastTurn).toBeUndefined();
  });

  it('tracks the thief\'s forced loss when stealing C19 triggers its passive discard-hand', () => {
    let seeded = state();
    seeded.players.p1.hand = ['C19'];
    seeded.players.p2.hand = ['A001', 'A002'];
    const operation = prepareSteal(seeded, 'p1', 'p2', 1);
    const next = finalizeSteal(seeded, operation, () => 0);
    expect(next.players.p1.forcedLossSinceLastTurn).toBe(1); // the C19 stolen from p1
    // p2's whole hand at discard time is 3: its original A001/A002 plus the just-stolen
    // C19 (thief.hand.push(...stolen) runs before the C19 check), forced by p1's C19.
    expect(next.players.p2.forcedLossSinceLastTurn).toBe(3);
  });
});
