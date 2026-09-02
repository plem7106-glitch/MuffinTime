import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { discard } from './pile';
import { resolveForcedDiscard } from './forcedDiscard';
import { resolveCounterEffect } from './counterRules/engine';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import {
  areAllResponsesComplete,
  addModifierToFrame,
  getStackFrame,
  getTopFrame,
  pushStackFrame,
  removeStackFrame,
  submitResponse,
} from './reactionStack';
import type { CardCode, PlayerId, RoomState } from './types';

describe('Counter Phase 4A — Low-Risk Existing-Foundation Counters (C10, C14, C31, C33, C37)', () => {
  function setupTestState(): RoomState {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');

    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    // Setup clear hand state for tests
    state.players['p1'].hand = ['A001', 'A002', 'A003', 'A004'];
    state.players['p2'].hand = ['A005', 'A006', 'A007', 'A008'];
    state.players['p3'].hand = ['A009', 'A010', 'A011', 'A012'];
    state.players['p1'].traps = [];
    state.players['p2'].traps = [];
    state.players['p3'].traps = [];

    return state;
  }

  function resolveActionWithCounterWindow(
    state: RoomState,
    actorId: PlayerId,
    code: CardCode,
    targetIds: PlayerId[] = []
  ): RoomState {
    let next = state;
    if (!next.players[actorId].hand.includes(code)) {
      next.players[actorId].hand.push(code);
    }
    // Remove action card from actor hand
    next = discard(next, actorId, 1, [code]);
    // Push Action stack frame
    return pushStackFrame(next, {
      sourceType: 'action',
      sourceCode: code,
      actorId,
      targetIds,
      eligibleResponderIds: Object.keys(next.players).filter((id) => id !== actorId),
    });
  }

  function resolveCompletedStackFrames(state: RoomState): RoomState {
    let next = state;
    let currentTop = getTopFrame(next);

    while (currentTop && areAllResponsesComplete(currentTop)) {
      const resolvingFrame = currentTop;
      if (resolvingFrame.status !== 'cancelled') {
        if (resolvingFrame.sourceType === 'counter') {
          const parentId = resolvingFrame.parentFrameId ?? (resolvingFrame.customPayload?.parentFrameId as string | undefined);
          if (parentId) {
            next = addModifierToFrame(next, parentId, {
              modifierId: `mod-${resolvingFrame.sourceCode}-${Date.now()}`,
              sourceFrameId: resolvingFrame.frameId,
              type: 'cancel_all',
              affectedTargetIds: [resolvingFrame.actorId],
            });
          }

          // Forced Discard Operation modification for C02, C03, C30
          const opId = (resolvingFrame.customPayload?.forcedDiscardOperationId as string | undefined)
            ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.forcedDiscardOperationId as string | undefined) : undefined)
            ?? Object.keys(next.pendingForcedDiscards ?? {})[0];

          if (opId && next.pendingForcedDiscards?.[opId]) {
            const op = next.pendingForcedDiscards[opId];
            if (resolvingFrame.sourceCode === 'C02') {
              next.pendingForcedDiscards[opId] = { ...op, status: 'canceled' };
            } else if (resolvingFrame.sourceCode === 'C03') {
              const newCount = Math.max(0, op.cardCodes.length - 2);
              const newCardCodes = op.cardCodes.slice(0, newCount);
              next.pendingForcedDiscards[opId] = {
                ...op,
                cardCodes: newCardCodes,
                requestedCount: newCount,
                status: newCount === 0 ? 'canceled' : op.status,
              };
            } else if (resolvingFrame.sourceCode === 'C30') {
              const drawCount = op.cardCodes.length;
              next.pendingForcedDiscards[opId] = { ...op, status: 'canceled' };
              next = resolveForcedDiscard(next, op.targetPlayerId, 0, op.sourcePlayerId); // resolve draw in session
            }
          }

          next = resolveCounterEffect(next, resolvingFrame.sourceCode, resolvingFrame.actorId, resolvingFrame);
        } else if (resolvingFrame.sourceType === 'action') {
          // Execute Action effect if not cancelled
          next = executeActionFrameEffect(next, resolvingFrame);
        }
      }

      const { state: removedState } = removeStackFrame(next, resolvingFrame.frameId);
      next = removedState;
      const newTop = getTopFrame(next);
      if (newTop === resolvingFrame) break;
      currentTop = newTop;
    }

    return next;
  }

  function playCounterEngine(
    state: RoomState,
    actorId: PlayerId,
    code: CardCode,
    targetFrameId: string,
    customPayload?: Record<string, unknown>
  ): RoomState {
    const afterDiscard = discard(state, actorId, 1, [code]);
    const next = submitResponse(afterDiscard, targetFrameId, actorId, {
      status: 'countered',
      counterCode: code,
    });
    return pushStackFrame(next, {
      sourceType: 'counter',
      sourceCode: code,
      actorId,
      targetIds: [actorId],
      eligibleResponderIds: Object.keys(next.players).filter((id) => id !== actorId),
      customPayload: { ...customPayload, parentFrameId: targetFrameId },
    });
  }

  function skipSingleFrame(state: RoomState): RoomState {
    let next = state;
    const top = getTopFrame(next);
    if (!top) return state;
    for (const pid of top.eligibleResponderIds) {
      if (top.responses[pid]?.status === 'pending') {
        next = submitResponse(next, top.frameId, pid, { status: 'skipped' });
      }
    }
    return resolveCompletedStackFrames(next);
  }

  function skipCounterEngine(state: RoomState): RoomState {
    let next = state;
    let top = getTopFrame(next);
    while (top) {
      const targetId = top.frameId;
      for (const pid of top.eligibleResponderIds) {
        if (top.responses[pid]?.status === 'pending') {
          next = submitResponse(next, targetId, pid, { status: 'skipped' });
        }
      }
      next = resolveCompletedStackFrames(next);
      const newTop = getTopFrame(next);
      if (newTop === top) break;
      top = newTop;
    }
    return next;
  }

  it('Test A — C31 Named Cancel (Stops A101 "Muffin Time")', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C31');

    // Verify C31 eligibility: NOT eligible against A001, ELIGIBLE against A101
    expect(isCounterEligible('C31', { kind: 'action', code: 'A001' })).toBe(false);
    expect(isCounterEligible('C31', { kind: 'action', code: 'A101' })).toBe(true);

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C31 ("Out Of Muffins")
    state = playCounterEngine(state, 'p2', 'C31', f1);
    state = skipCounterEngine(state);

    // A101 cancelled! P1 did NOT draw 5 cards (ended up with 4 cards instead of 9).
    expect(state.players['p1'].hand.length).toBe(4);
    // P2 lost C31 (-1) = 4 cards.
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test B — C33 Named Cancel (Stops A097 "Magical Pony")', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C33');

    // Verify C33 eligibility: NOT eligible against A001, ELIGIBLE against A097
    expect(isCounterEligible('C33', { kind: 'action', code: 'A001' })).toBe(false);
    expect(isCounterEligible('C33', { kind: 'action', code: 'A097' })).toBe(true);

    // P1 plays A097 ("Magical Pony")
    state = resolveActionWithCounterWindow(state, 'p1', 'A097');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C33 ("Shoot It Down")
    state = playCounterEngine(state, 'p2', 'C33', f1);
    state = skipCounterEngine(state);

    // A097 cancelled! P1 did NOT draw 4 cards (ended up with 4 cards instead of 8).
    expect(state.players['p1'].hand.length).toBe(4);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test C — C14 Aw, Come On! (Action Cancelled + Forced Discard 3 Against Action Player)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C14');

    // P1 plays A001 (P1 has 3 remaining cards in hand: A002, A003, A004)
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C14 against P1's action
    state = playCounterEngine(state, 'p2', 'C14', f1);
    state = skipCounterEngine(state); // Resolve C14 and forced discard

    // P1 has no forced discard counters (C03/C30) -> 3 cards forced discarded!
    expect(state.players['p1'].hand.length).toBe(0);
  });

  it('Test D — C14 Countered (C14 Countered by C29 -> Action Continues, No Forced Discard)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C14');
    state.players['p3'].hand.push('C29');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C14
    state = playCounterEngine(state, 'p2', 'C14', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C14
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C14 cancelled! A101 resolves normally!
    // P1 started with 4 + A101 (5) - 1 (A101) + 5 (A101 draw) = 9 cards!
    expect(state.players['p1'].hand.length).toBe(9);
    expect(state.pendingForcedDiscards ?? {}).toEqual({}); // No forced discard operation created!
  });

  it('Test E — C37 The Hole (Action Cancelled + Forced Discard Entire Hand)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C37');

    // P1 plays A001 (P1 has 3 remaining cards in hand)
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C37
    state = playCounterEngine(state, 'p2', 'C37', f1);
    state = skipCounterEngine(state); // C37 resolves -> P1 forced discards entire remaining hand

    expect(state.players['p1'].hand.length).toBe(0);
  });

  it('Test F — C37 + Phase 2 C03 Modifier (P1 Plays C03 to Keep 2 Cards)', () => {
    let state = setupTestState();
    state.players['p1'].hand.push('C03'); // P1 has 4 remaining cards (A002, A003, A004, C03)
    state.players['p2'].hand.push('C37');

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C37
    state = playCounterEngine(state, 'p2', 'C37', f1);
    state = skipSingleFrame(state); // C37 resolves -> opens Forced Discard for P1 (4 cards)

    const forcedFrameId = getTopFrame(state)!.frameId;

    // P1 plays C03 ("Keep 2")
    state = playCounterEngine(state, 'p1', 'C03', forcedFrameId);
    state = skipCounterEngine(state);

    // P1 started with 4 remaining cards - 1 (C03) = 3 cards.
    // C03 reduced discard from 4 to max(0, 4 - 2) = 2.
    // P1 discarded 2 cards, kept 1 remaining card!
    expect(state.players['p1'].hand.length).toBe(1);
  });

  it('Test G — C10 I\'m A Ghost (Exact Placed Trap Discard Without Activation)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C10');
    state.players['p2'].traps = ['T01', 'T02']; // P2 has 2 placed traps

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C10
    state = playCounterEngine(state, 'p2', 'C10', f1);
    state = skipCounterEngine(state);

    // Assert: Action A001 cancelled.
    // P2's placed traps cleared to [] and exact codes T01, T02 appended to discard pile!
    expect(state.players['p2'].traps).toEqual([]);
    expect(state.discardPile).toContain('T01');
    expect(state.discardPile).toContain('T02');
  });

  it('Test H — C10 Countered (C10 Countered by C29 -> Traps Remain Untouched)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C10');
    state.players['p2'].traps = ['T01', 'T02'];
    state.players['p3'].hand.push('C29');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C10
    state = playCounterEngine(state, 'p2', 'C10', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C10
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C10 cancelled! P2's placed traps remain ['T01', 'T02']!
    expect(state.players['p2'].traps).toEqual(['T01', 'T02']);
    // A101 resolves normally (P1 gets 4 + 1 - 1 + 5 = 9 cards)
    expect(state.players['p1'].hand.length).toBe(9);
  });
});
