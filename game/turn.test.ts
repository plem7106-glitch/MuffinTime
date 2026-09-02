import { describe, it, expect } from 'vitest';
import {
  advanceTurn,
  isMuffinTimeEligible,
  declareMuffinTime,
  checkWinnerAtTurnStart,
  clearMuffinTimeDeclaration,
  emergencyForceSkipTurn,
  finishByDeckExhaustion,
  resolvePendingWinChecks,
  resolvePendingActionObligations,
  canEndTurn,
  resolveTurnArrival,
  jumpToPlayerTurn,
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

  it('walks turnOrder, not seatOrder, once a seat-shuffle Action card has diverged them', () => {
    // Shape left behind by A010 ("rotate seats right"): seatOrder shifted,
    // turnOrder untouched. turnOrder[currentTurnIndex] (p1) is still the
    // player whose gameplay-gate checks and UI treat as active -- advanceTurn
    // must resolve "next" and reset per-turn flags against that same array,
    // not seatOrder (where index 0 now holds p3).
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      seatOrder: ['p3', 'p1', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false, placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true },
        p2: { skipNextTurn: false, placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true },
        p3: { skipNextTurn: false, placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true },
      },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    // Next player after p1 in turnOrder is p2, not seatOrder's index-1 (p1 itself).
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p2');
    expect(next.players.p2.placedTrapThisTurn).toBe(false);
    expect(next.players.p2.hasDrawnThisTurn).toBe(false);
    expect(next.players.p2.hasPlayedActionThisTurn).toBe(false);
    // p3 (whoever seatOrder would have named) must be untouched.
    expect(next.players.p3.hasPlayedActionThisTurn).toBe(true);
  });

  it('resets bonusActionPlaysRemaining to 0 for the incoming player', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, bonusActionPlaysRemaining: 2 },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.players.p2.bonusActionPlaysRemaining).toBe(0);
  });

  it('resets mustPlayActionThisTurn to false for the incoming player', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, mustPlayActionThisTurn: true },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.players.p2.mustPlayActionThisTurn).toBe(false);
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

describe('finishByDeckExhaustion', () => {
  it('selects every player tied closest to ten cards and records final counts', () => {
    const state = {
      status: 'playing', drawPile: [], seatOrder: ['p1', 'p2', 'p3'], turnOrder: ['p1', 'p2', 'p3'],
      players: {
        p1: { hand: Array(8).fill('A001'), traps: ['T01'] },
        p2: { hand: Array(12).fill('A002'), traps: [] },
        p3: { hand: Array(5).fill('A003'), traps: ['T02', 'T03'] },
      },
    } as unknown as RoomState;
    const next = finishByDeckExhaustion(state);
    expect(next.status).toBe('finished');
    expect(next.gameEndReason).toBe('deck_exhausted');
    expect(next.winnerPlayerIds).toEqual(['p1', 'p2']);
    expect(next.finalHandCounts).toEqual({ p1: 8, p2: 12, p3: 5 });
    expect(next.players.p1.traps).toEqual(['T01']);
  });

  it('does not end a game while drawable cards remain', () => {
    const state = { status: 'playing', drawPile: ['A001'], seatOrder: ['p1'], turnOrder: ['p1'], players: { p1: { hand: [] } } } as unknown as RoomState;
    expect(finishByDeckExhaustion(state).status).toBe('playing');
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

describe('resolvePendingWinChecks', () => {
  it('is a no-op when there are no pending checks', () => {
    const state = { status: 'playing', players: { p1: { hand: [] } } } as unknown as RoomState;
    expect(resolvePendingWinChecks(state, 'p1')).toEqual(state);
  });

  it('is a no-op when the current player has no matching pending check', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: [] }, p2: { hand: [] } },
      pendingWinChecks: [{ sourcePlayerId: 'p2', type: 'hand_nonempty' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.pendingWinChecks).toEqual([{ sourcePlayerId: 'p2', type: 'hand_nonempty' }]);
  });

  it('hand_nonempty: declares the source player winner when they still hold cards', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1');
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('hand_nonempty: no winner and the check is still consumed when the hand is empty', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: [] }, p2: { hand: [] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('fewest_hand: declares the single player with the fewest cards winner', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001', 'A002'] }, p2: { hand: ['A003'] }, p3: { hand: ['A004', 'A005', 'A006'] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'fewest_hand' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p2');
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('fewest_hand: a tie declares no winner but still consumes the check', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001'] }, p2: { hand: ['A002'] }, p3: { hand: ['A003', 'A004'] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'fewest_hand' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.winnerId).toBeUndefined();
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('most_hand: declares the single player with the most cards winner', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001'] }, p2: { hand: ['A002', 'A003', 'A004'] }, p3: { hand: ['A005'] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'most_hand' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p2');
  });

  it('most_hand: a tie declares no winner but still consumes the check', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001', 'A002'] }, p2: { hand: ['A003', 'A004'] }, p3: { hand: [] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'most_hand' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('respects a no_win globalRestriction: no winner declared, but the check is still consumed', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('does not clobber a winner already declared by an earlier check in the same batch', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      pendingWinChecks: [
        { sourcePlayerId: 'p1', type: 'hand_nonempty' },
        { sourcePlayerId: 'p1', type: 'most_hand' },
      ],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1'); // hand_nonempty's winner, not most_hand's
    expect(next.pendingWinChecks).toEqual([]);
  });

  it('only consumes entries for the current player, leaving others queued', () => {
    const state = {
      status: 'playing',
      players: { p1: { hand: [] }, p2: { hand: [] } },
      pendingWinChecks: [
        { sourcePlayerId: 'p1', type: 'hand_nonempty' },
        { sourcePlayerId: 'p2', type: 'most_hand' },
      ],
    } as unknown as RoomState;
    const next = resolvePendingWinChecks(state, 'p1');
    expect(next.pendingWinChecks).toEqual([{ sourcePlayerId: 'p2', type: 'most_hand' }]);
  });
});

describe('resolvePendingActionObligations', () => {
  it('is a no-op when there are no pending obligations', () => {
    const state = { players: { p1: { hand: [] } } } as unknown as RoomState;
    expect(resolvePendingActionObligations(state, 'p1')).toEqual(state);
  });

  it('is a no-op when the current player has no matching obligation', () => {
    const state = {
      players: { p1: { hand: [] }, p2: { hand: [] } },
      pendingActionObligations: ['p2'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.pendingActionObligations).toEqual(['p2']);
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
  });

  it('sets mustPlayActionThisTurn when the player holds an Action card, and consumes the obligation', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBe(true);
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not set the flag when the player holds no Action card (exempt), but still consumes the obligation', () => {
    const state = {
      players: { p1: { hand: ['T01'] } }, // T01 is a Trap card, not an Action
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not set the flag while a no_actions restriction is active table-wide (avoids a soft-lock)', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      pendingActionObligations: ['p1'],
      globalRestrictions: [{ type: 'no_actions', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
    expect(next.pendingActionObligations).toEqual([]);
  });
});

describe('resolveTurnArrival', () => {
  it('is a no-op when there is nothing pending and no muffin-time win', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: [], hasCalledMuffinTime: false } },
    } as unknown as RoomState;
    expect(resolveTurnArrival(state, 'p1')).toEqual(state);
  });

  it('declares a winner from a pending win check', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1');
  });

  it('declares a winner when the player already called muffin time and still qualifies', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } },
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1');
  });

  it('resolves a pending action obligation when there is no win', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.players.p1.mustPlayActionThisTurn).toBe(true);
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not resolve obligations once a pending win check already finished the game', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    // Untouched -- resolveTurnArrival returns immediately once a win check
    // finishes the game, same short-circuit advanceAndCheckWin had inline.
    expect(next.pendingActionObligations).toEqual(['p1']);
  });
});

describe('jumpToPlayerTurn (A119)', () => {
  it('lands on the target and resets their per-turn flags via beginTurn', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false },
        p3: { skipNextTurn: false, placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.currentTurnIndex).toBe(2);
    expect(next.turnPhase).toBe('trap_placement');
    expect(next.players.p3.placedTrapThisTurn).toBe(false);
    expect(next.players.p3.hasDrawnThisTurn).toBe(false);
    expect(next.players.p3.hasPlayedActionThisTurn).toBe(false);
  });

  it('leaves players strictly between the current position and the target untouched', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3', 'p4'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, hasDrawnThisTurn: true },
        p3: { skipNextTurn: false, hasPlayedActionThisTurn: true },
        p4: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p4');
    // p2 and p3 were jumped over -- their pre-existing per-turn state must
    // survive untouched, same treatment advanceTurn gives a skipNextTurn'd
    // player it steps past.
    expect(next.players.p2.hasDrawnThisTurn).toBe(true);
    expect(next.players.p3.hasPlayedActionThisTurn).toBe(true);
  });

  it('honors an existing skipNextTurn flag on the target itself, continuing past them', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: true },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p2');
    expect(next.currentTurnIndex).toBe(2); // landed on p3, not p2
    expect(next.players.p2.skipNextTurn).toBe(false); // cleared on the way past
  });

  it('bumps roundNumber when the jump crosses the start-of-lap boundary', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 2, // p3's turn
      direction: 1,
      roundNumber: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p1'); // wraps past index 0
    expect(next.currentTurnIndex).toBe(0);
    expect(next.roundNumber).toBe(2);
  });

  it('does not bump roundNumber when the jump stays within the current lap', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      roundNumber: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.roundNumber).toBe(1);
  });

  it("clears a GlobalRestriction sourced by the landed-on player", () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p3' }],
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.globalRestrictions).toEqual([]);
  });

  it('is a no-op when targetId is not found in turnOrder', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: {}, p2: {}, p3: {} },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'nobody');
    expect(next.currentTurnIndex).toBe(0);
  });
});

describe('canEndTurn (A035 interaction with the draw-XOR-play-Action rule)', () => {
  function obligatedState(overrides: Partial<RoomState['players'][string]> = {}): RoomState {
    return {
      status: 'playing',
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      turnPhase: 'main',
      players: {
        p1: { mustPlayActionThisTurn: true, hasPlayedActionThisTurn: false, ...overrides },
        p2: {},
      },
    } as unknown as RoomState;
  }

  it('blocks ending the turn while obligated and no Action has been played yet', () => {
    const state = obligatedState({ hasDrawnThisTurn: true });
    expect(canEndTurn(state, 'p1')).toBe(false);
  });

  it('allows ending the turn once the obligated player has played an Action', () => {
    const state = obligatedState({ hasPlayedActionThisTurn: true });
    expect(canEndTurn(state, 'p1')).toBe(true);
  });

  it('is unaffected by mustPlayActionThisTurn when it is false', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      turnPhase: 'main',
      players: { p1: { mustPlayActionThisTurn: false, hasDrawnThisTurn: true }, p2: {} },
    } as unknown as RoomState;
    expect(canEndTurn(state, 'p1')).toBe(true);
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
