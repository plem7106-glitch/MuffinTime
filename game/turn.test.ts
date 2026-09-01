import { describe, it, expect } from 'vitest';
import {
  advanceTurn,
  isMuffinTimeEligible,
  declareMuffinTime,
  checkWinnerAtTurnStart,
  clearMuffinTimeDeclaration,
  emergencyForceSkipTurn,
} from './turn';
import type { RoomState } from './types';

describe('advanceTurn', () => {
  it('moves to the next player in turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(1);
  });

  it('wraps around at the end of turn order', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 2,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(0);
  });

  it('moves backward when direction is -1', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: -1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
  });

  it('skips a player whose skipNextTurn flag is set and clears the flag', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: true }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(2);
    expect(next.players.p2.skipNextTurn).toBe(false);
  });

  it('terminates and clears every flag when all players are skipped', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: true }, p2: { skipNextTurn: true }, p3: { skipNextTurn: true } },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.currentTurnIndex).toBe(1);
    expect(next.players.p1.skipNextTurn).toBe(false);
    expect(next.players.p2.skipNextTurn).toBe(false);
    expect(next.players.p3.skipNextTurn).toBe(false);
  });

  it('clears a globalRestriction once play returns to its source player', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
      globalRestrictions: [{ type: 'no_actions', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;
    const stillActive = advanceTurn(state); // -> p2's turn starts: restriction lifts now
    expect(stillActive.globalRestrictions).toEqual([]);
  });

  it('leaves a globalRestriction in place until its source player\'s turn arrives', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p3' }],
    } as unknown as RoomState;
    const next = advanceTurn(state); // -> p2's turn, not p3's yet
    expect(next.globalRestrictions).toEqual([{ type: 'no_win', sourcePlayerId: 'p3' }]);
  });
});

describe('emergencyForceSkipTurn', () => {
  it('advances exactly one player in reverse direction, even when the next player is flagged', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1', 'p2', 'p3'],
      seatOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: -1,
      players: {
        p1: { hand: [], traps: [], skipNextTurn: false },
        p2: { hand: [], traps: [], skipNextTurn: false },
        p3: { hand: [], traps: [], skipNextTurn: true },
      },
      drawPile: [],
      discardPile: [],
      reactionStack: [],
    } as unknown as RoomState;

    const next = emergencyForceSkipTurn(state);
    expect(next.currentTurnIndex).toBe(2);
    expect(next.turnPhase).toBe('trap_placement');
    expect(next.players.p3.skipNextTurn).toBe(true);
  });

  it('also clears a globalRestriction once play returns to its source player', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1', 'p2', 'p3'],
      seatOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { hand: [], traps: [], skipNextTurn: false },
        p2: { hand: [], traps: [], skipNextTurn: false },
        p3: { hand: [], traps: [], skipNextTurn: false },
      },
      drawPile: [],
      discardPile: [],
      reactionStack: [],
      globalRestrictions: [{ type: 'no_actions', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;

    const next = emergencyForceSkipTurn(state);
    expect(next.currentTurnIndex).toBe(1); // p2's turn
    expect(next.globalRestrictions).toEqual([]);
  });
});

describe('isMuffinTimeEligible', () => {
  it('is true when the hand size exactly matches the target', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01') } } } as unknown as RoomState;
    expect(isMuffinTimeEligible(state, 'p1')).toBe(true);
  });

  it('is false otherwise', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(9).fill('A01') } } } as unknown as RoomState;
    expect(isMuffinTimeEligible(state, 'p1')).toBe(false);
  });
});

describe('declareMuffinTime', () => {
  it('sets hasCalledMuffinTime when eligible', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } } } as unknown as RoomState;
    const next = declareMuffinTime(state, 'p1');
    expect(next.players.p1.hasCalledMuffinTime).toBe(true);
  });

  it('throws when not eligible', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: [], hasCalledMuffinTime: false } } } as unknown as RoomState;
    expect(() => declareMuffinTime(state, 'p1')).toThrow();
  });
});

describe('checkWinnerAtTurnStart', () => {
  it('is true when the player declared previously and still has the target count', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } } } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(true);
  });

  it('is false if the player never declared', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: false } } } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });

  it('is false if the hand count changed since declaring', () => {
    const state = { muffinTimeTarget: 10, players: { p1: { hand: Array(9).fill('A01'), hasCalledMuffinTime: true } } } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });

  it('is false while a no_win globalRestriction is active, even if otherwise eligible', () => {
    const state = {
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;
    expect(checkWinnerAtTurnStart(state, 'p1')).toBe(false);
  });
});

describe('clearMuffinTimeDeclaration', () => {
  it('resets hasCalledMuffinTime to false', () => {
    const state = { players: { p1: { hasCalledMuffinTime: true } } } as unknown as RoomState;
    const next = clearMuffinTimeDeclaration(state, 'p1');
    expect(next.players.p1.hasCalledMuffinTime).toBe(false);
  });

  it('does not mutate the original state', () => {
    const state = { players: { p1: { hasCalledMuffinTime: true } } } as unknown as RoomState;
    clearMuffinTimeDeclaration(state, 'p1');
    expect(state.players.p1.hasCalledMuffinTime).toBe(true);
  });
});
