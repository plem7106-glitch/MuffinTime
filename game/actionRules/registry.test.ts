import { describe, expect, it } from 'vitest';
import { getActionStatus, getImplementedActions, isActionImplemented, resolveActionEffect } from './registry';
import type { RoomState } from '../types';

const state = (): RoomState => ({
  status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
  direction: 1, muffinTimeTarget: 0, drawPile: ['A064'], discardPile: [],
  players: {
    p1: { name: 'One', hand: ['A064'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
  },
});

describe('production action capabilities', () => {
  it('classifies implemented demo Actions and rejects unsupported Actions', () => {
    // All 173/173 Action cards are implemented as of the Cluster D + Cluster F
    // merge, so there is no longer any real card code to use as a "not
    // implemented" negative example -- 'A999' below is a synthetic code that
    // doesn't appear in data/cards.json at all.
    expect(getImplementedActions()).toEqual(expect.arrayContaining(['A001', 'A004', 'A008', 'A014', 'A016', 'A064', 'A017', 'A091']));
    expect(isActionImplemented('A064')).toBe(true);
    expect(getActionStatus('A064')).toBe('implemented');
    expect(isActionImplemented('A017')).toBe(true);
    expect(getActionStatus('A017')).toBe('implemented');
    expect(isActionImplemented('A091')).toBe(true);
    expect(getActionStatus('A091')).toBe('implemented');
    expect(isActionImplemented('A999')).toBe(false);
    expect(getActionStatus('A999')).toBe('not_implemented');
    expect(resolveActionEffect(state(), 'A999', 'p1')).toEqual(state());
  });
});
