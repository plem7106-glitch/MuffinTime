import { describe, it, expect } from 'vitest';
import { finishByDeckExhaustion } from './turn';
import { draw } from './pile';
import { pushStackFrame, popStackFrame, getTopFrame, submitResponse } from './reactionStack';
import type { RoomState } from './types';

function createMockRoom(hands: Record<string, string[]>, drawPile: string[] = []): RoomState {
  const playerIds = Object.keys(hands);
  return {
    status: 'playing',
    hostId: playerIds[0],
    turnOrder: playerIds,
    seatOrder: playerIds,
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile,
    discardPile: [],
    players: Object.fromEntries(
      playerIds.map((id) => [
        id,
        { name: `Player ${id}`, hand: hands[id], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      ])
    ),
    turnPhase: 'main',
    reactionStack: [],
    sequenceNumber: 1,
  };
}

describe('Deck Exhaustion Game End Rules', () => {
  it('Test A: Exact 10 Wins (A=10, B=8, C=13 -> winner = A)', () => {
    const hands = {
      p1: Array(10).fill('H'),
      p2: Array(8).fill('H'),
      p3: Array(13).fill('H'),
    };
    const state = createMockRoom(hands, []);
    const finished = finishByDeckExhaustion(state);

    expect(finished.status).toBe('finished');
    expect(finished.gameEndReason).toBe('deck_exhausted');
    expect(finished.winnerPlayerIds).toEqual(['p1']);
    expect(finished.finalHandCounts).toEqual({ p1: 10, p2: 8, p3: 13 });
  });

  it('Test B: Closest Above 10 Wins (A=6, B=12, C=15 -> winner = B)', () => {
    const hands = {
      p1: Array(6).fill('H'),  // distance 4
      p2: Array(12).fill('H'), // distance 2
      p3: Array(15).fill('H'), // distance 5
    };
    const state = createMockRoom(hands, []);
    const finished = finishByDeckExhaustion(state);

    expect(finished.status).toBe('finished');
    expect(finished.gameEndReason).toBe('deck_exhausted');
    expect(finished.winnerPlayerIds).toEqual(['p2']);
  });

  it('Test C: Tie Joint Winners (A=9, B=11, C=14 -> winners = A + B)', () => {
    const hands = {
      p1: Array(9).fill('H'),  // distance 1
      p2: Array(11).fill('H'), // distance 1
      p3: Array(14).fill('H'), // distance 4
    };
    const state = createMockRoom(hands, []);
    const finished = finishByDeckExhaustion(state);

    expect(finished.status).toBe('finished');
    expect(finished.gameEndReason).toBe('deck_exhausted');
    expect(finished.winnerPlayerIds).toEqual(['p1', 'p2']);
  });

  it('Test D: Resolution completes before finalization (only hand cards count, stack clears)', () => {
    // 1 card left in deck
    const hands = {
      p1: Array(7).fill('H'),
      p2: Array(9).fill('H'),
      p3: Array(5).fill('H'),
    };
    let state = createMockRoom(hands, ['D_LAST']);

    // p1 draws the last card
    state = draw(state, 'p1', 1);
    expect(state.drawPile.length).toBe(0);
    expect(state.players.p1.hand.length).toBe(8);

    // Push an active stack frame to simulate ongoing reaction
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: [],
    });
    expect(state.reactionStack?.length).toBe(1);

    // Before frame pops, finishByDeckExhaustion is NOT called prematurely
    expect(state.status).toBe('playing');

    // Complete the stack frame
    const top = getTopFrame(state)!;
    state = submitResponse(state, top.frameId, 'p2', { status: 'skipped' });
    const { state: poppedState } = popStackFrame(state);
    expect(poppedState.reactionStack?.length).toBe(0);

    // Finalize after completion
    const finished = finishByDeckExhaustion(poppedState);
    expect(finished.status).toBe('finished');
    expect(finished.gameEndReason).toBe('deck_exhausted');
    // p2 has 9 cards (dist 1), p1 has 8 cards (dist 2), p3 has 5 cards (dist 5) -> winner p2
    expect(finished.winnerPlayerIds).toEqual(['p2']);
  });

  it('handles multi-card draw when drawPile has fewer cards than requested without crashing or fabricating cards', () => {
    const hands = {
      p1: Array(5).fill('H'),
      p2: Array(5).fill('H'),
      p3: Array(5).fill('H'),
    };
    let state = createMockRoom(hands, ['D1', 'D2']); // 2 cards left

    // p1 attempts to draw 5 cards
    state = draw(state, 'p1', 5);
    expect(state.drawPile.length).toBe(0);
    expect(state.players.p1.hand.length).toBe(7); // drawn 2 available cards only

    const finished = finishByDeckExhaustion(state);
    expect(finished.status).toBe('finished');
    expect(finished.gameEndReason).toBe('deck_exhausted');
  });
});
