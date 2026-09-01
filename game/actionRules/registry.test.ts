import { describe, expect, it } from 'vitest';
import { getActionStatus, getImplementedActions, isActionImplemented, resolveActionEffect } from './registry';
import type { RoomState } from '../types';

const state = (): RoomState => ({
  status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
  direction: 1, muffinTimeTarget: 0, drawPile: ['A173'], discardPile: [],
  players: {
    p1: { name: 'One', hand: ['A173'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
  },
});

describe('production action capabilities', () => {
  it('classifies implemented demo Actions and rejects unsupported Actions', () => {
    expect(getImplementedActions()).toEqual(expect.arrayContaining(['A001', 'A004', 'A008', 'A014', 'A016']));
    expect(isActionImplemented('A173')).toBe(false);
    expect(getActionStatus('A173')).toBe('not_implemented');
    expect(resolveActionEffect(state(), 'A173', 'p1')).toEqual(state());
  });
});
