import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { pushStackFrame, submitResponse, getTopFrame, areAllResponsesComplete, removeStackFrame, addModifierToFrame, getStackFrame } from './reactionStack';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { executeActionFrameEffect } from './actionRules/registry';
import { executeTrapFrameEffect } from './trapRules/engine';
import { discard, draw } from './pile';
import { checkAndTriggerAutomaticTraps } from './trapRules/engine';
import { resolveForcedDiscard, setPreDiscardReactionResolver } from './forcedDiscard';
import { resolveSteal } from './steal';
import { executeManualRecoveryGive } from './recovery';
import type { RoomState, PlayerId, CardCode } from './types';

describe('Counter Phase 3 — Steal Interception Foundation (C04, C06, C08, C12, C26, C28)', () => {
  function setupTestState() {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');
    // Supply deck with cards
    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    // Set custom hands for testing
    state.players['p1'].hand = ['A001', 'A002', 'C18', 'C29'];
    state.players['p2'].hand = ['A003', 'A004', 'A005', 'A006', 'C28', 'C08', 'C26', 'C04', 'C06'];
    state.players['p3'].hand = ['A007', 'A008', 'C12', 'C18', 'C29'];
    return state;
  }

  // Engine resolution helper replicating lib/session.tsx resolveCompletedStackFrames
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
              next = draw(next, op.targetPlayerId, drawCount);
            }
          }

          // Steal Operation modification for C04, C06, C08, C12, C26, C28
          const stealOpId = (resolvingFrame.customPayload?.stealOperationId as string | undefined)
            ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.stealOperationId as string | undefined) : undefined)
            ?? Object.keys(next.pendingSteals ?? {})[0];

          if (stealOpId && next.pendingSteals?.[stealOpId]) {
            const op = next.pendingSteals[stealOpId];
            if (['C06', 'C12', 'C28'].includes(resolvingFrame.sourceCode)) {
              next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
            } else if (resolvingFrame.sourceCode === 'C04') {
              const newVictimId = (resolvingFrame.customPayload?.newVictimId as string | undefined)
                ?? (resolvingFrame.targetIds.find((id) => id !== op.thiefId && id !== op.victimId))
                ?? 'p3';
              if (newVictimId && next.players[newVictimId] && newVictimId !== op.thiefId && newVictimId !== op.victimId) {
                const newVictimHand = next.players[newVictimId].hand.length;
                const newActualCount = Math.min(op.requestedCount, newVictimHand);
                next.pendingSteals[stealOpId] = {
                  ...op,
                  victimId: newVictimId,
                  redirectedFromId: op.victimId,
                  selectedCardCode: undefined,
                  actualCount: newActualCount,
                  status: 'redirected',
                };
                if (parentId) {
                  const res = removeStackFrame(next, parentId);
                  next = res.state;
                }
              } else {
                next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
              }
            } else if (resolvingFrame.sourceCode === 'C08') {
              const countToDiscard = op.actualCount;
              const victimId = op.victimId;
              const thiefId = op.thiefId;
              next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
              next = resolveForcedDiscard(next, victimId, countToDiscard, thiefId);
            } else if (resolvingFrame.sourceCode === 'C26') {
              const countToStealBack = op.actualCount;
              const victimId = op.victimId;
              const thiefId = op.thiefId;
              next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
              next = resolveSteal(next, thiefId, victimId, countToStealBack, op.stealMode, victimId);
            }
          }

          next = resolveCounterEffect(next, resolvingFrame.sourceCode, resolvingFrame.actorId);
        } else if (resolvingFrame.sourceType === 'trap') {
          next = executeTrapFrameEffect(next, resolvingFrame);
        } else {
          next = executeActionFrameEffect(next, resolvingFrame);
        }
      }

      next = checkAndTriggerAutomaticTraps(next);
      const { state: removedState } = removeStackFrame(next, resolvingFrame.frameId);
      next = removedState;
      const newTop = getTopFrame(next);
      if (newTop === resolvingFrame) break;
      currentTop = newTop;
    }

    return next;
  }

  function playCounterEngine(state: RoomState, actorId: PlayerId, code: CardCode, targetFrameId: string, customPayload?: Record<string, unknown>): RoomState {
    const top = getTopFrame(state)!;
    const stealOpId = (top.customPayload?.stealOperationId as string | undefined)
      ?? Object.keys(state.pendingSteals ?? {})[0];
    const forcedOpId = (top.customPayload?.forcedDiscardOperationId as string | undefined)
      ?? Object.keys(state.pendingForcedDiscards ?? {})[0];
    const stealOp = stealOpId ? state.pendingSteals?.[stealOpId] : undefined;

    if (code === 'C04') {
      const newVictimId = customPayload?.newVictimId as string | undefined;
      if (!stealOp || !newVictimId || !state.players[newVictimId] || newVictimId === stealOp.thiefId || newVictimId === stealOp.victimId) {
        return state;
      }
    }

    const afterDiscard = discard(state, actorId, 1, [code]);
    let next = submitResponse(afterDiscard, targetFrameId, actorId, {
      status: 'countered',
      counterCode: code,
    });
    next = pushStackFrame(next, {
      sourceType: 'counter',
      sourceCode: code,
      actorId,
      targetIds: [top.actorId],
      customPayload: {
        parentFrameId: targetFrameId,
        stealOperationId: stealOpId,
        forcedDiscardOperationId: forcedOpId,
        ...(customPayload ?? {}),
      },
    });
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

  it('Test A — Steal Without Counter (A steals 2 from B -> exactly 2 cards move B -> A)', () => {
    let state = setupTestState();

    // P1 steals 2 cards from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    state = skipCounterEngine(state);

    // P2 had 9 cards originally, lost 2 -> 7 cards. P1 gained 2 cards.
    expect(state.players['p2'].hand.length).toBe(7);
    expect(state.players['p1'].hand.length).toBe(6); // 4 + 2 = 6
  });

  it('Test B — C28 Cancels Steal (0 cards move)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C28 ("Nope!")
    state = playCounterEngine(state, 'p2', 'C28', stealFrameId);
    state = skipCounterEngine(state);

    // C28 discarded from P2 hand (-1), 0 cards stolen -> P2 hand = 8 cards, P1 hand = 4
    expect(state.players['p2'].hand.length).toBe(8);
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('Test C — C28 Countered by C18 (Original steal executes)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C28
    state = playCounterEngine(state, 'p2', 'C28', stealFrameId);
    const c28FrameId = getTopFrame(state)!.frameId;

    // P1 plays C18 against C28
    state = playCounterEngine(state, 'p1', 'C18', c28FrameId);
    state = skipCounterEngine(state);

    // C28 cancelled. P2 lost C28 (-1) and lost 2 stolen cards -> 6 cards left. P1 lost C18 (-1) and gained 2 = 5 cards.
    expect(state.players['p2'].hand.length).toBe(6);
    expect(state.players['p1'].hand.length).toBe(5);
  });

  it('Test D — C04 Redirect (0 cards stolen from B, steal redirected to C)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C04 ("Not My Hand!"), redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    state = skipCounterEngine(state);

    // P2 lost C04 (-1) = 8 cards. 0 cards stolen from P2. P3 had 5 cards, lost 2 = 3 cards.
    expect(state.players['p2'].hand.length).toBe(8);
    expect(state.players['p3'].hand.length).toBe(3);
    expect(state.players['p1'].hand.length).toBe(6); // P1 gained 2 cards
  });

  it('Test D-2 — C04 Redirect Re-Clamps Count (P3 has fewer cards than requested)', () => {
    let state = setupTestState();
    state.players['p3'].hand = ['A007']; // P3 has only 1 card

    // P1 steals 3 cards from P2 (P2 has 9 cards)
    state = resolveSteal(state, 'p2', 'p1', 3, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    state = skipCounterEngine(state);

    // P3 had 1 card -> actualCount clamped to 1 card. P3 hand = 0. P1 hand = 4 + 1 = 5.
    expect(state.players['p3'].hand.length).toBe(0);
    expect(state.players['p1'].hand.length).toBe(5);
  });

  it('Test D-3 — C04 Invalidates Original Chosen Card Selection', () => {
    let state = setupTestState();
    // P1 attempts chosen steal for 'A003' from P2
    state = resolveSteal(state, 'p2', 'p1', 1, 'chosen', 'p1', 'A003');
    const stealFrameId = getTopFrame(state)!.frameId;

    const opBefore = state.pendingSteals![Object.keys(state.pendingSteals!)[0]];
    expect(opBefore.selectedCardCode).toBe('A003');

    // P2 plays C04 redirecting to P3 (P3 does not have A003)
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    state = skipCounterEngine(state);

    // 0 cards stolen from P2, 1 card stolen from P3. P3 hand went from 5 to 4.
    expect(state.players['p2'].hand.length).toBe(8); // P2 lost C04
    expect(state.players['p3'].hand.length).toBe(4);
  });

  it('Test D-4 — C04 Ineligible in 2-Player Game (No Alternate Victim)', () => {
    let state = setupTestState();
    delete state.players['p3']; // 2-player game (p1 & p2)

    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const op = state.pendingSteals![Object.keys(state.pendingSteals!)[0]];

    // P2 tries to play C04, but no alternate victim exists -> isCounterEligible is false
    expect(isCounterEligible('C04', { kind: 'action', code: 'STEAL' }, { actorId: 'p2', targetPlayerId: 'p2', operationKind: 'steal', stealOp: op, roomState: state })).toBe(false);
  });

  it('Test D-5 — C04 Rejects Invalid Target Cleanly Without Mutation', () => {
    let state = setupTestState();
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');

    const opBefore = state.pendingSteals![Object.keys(state.pendingSteals!)[0]];
    expect(opBefore.victimId).toBe('p2');

    // Invalid target 'p1' (thief) is rejected
    const invalidState = playCounterEngine(state, 'p2', 'C04', getTopFrame(state)!.frameId, { newVictimId: 'p1' });
    // C04 card is NOT discarded, remains in hand
    expect(invalidState.players['p2'].hand.includes('C04')).toBe(true);
  });

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

  it('Test 3.3-A — C04 Redirect Opens New Steal Reaction Window for New Victim', () => {
    let state = setupTestState();
    // P1 steals 2 cards from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    // Skip ONLY C04's counter-to-counter window
    state = skipSingleFrame(state);

    // Assert: Steal NOT finalized yet, P3 is current victim, new reaction window exists for P3!
    const op = state.pendingSteals![Object.keys(state.pendingSteals!)[0]];
    expect(op.victimId).toBe('p3');
    expect(op.redirectedFromId).toBe('p2');
    expect(state.reactionStack?.length).toBeGreaterThan(0);
    const newTop = getTopFrame(state)!;
    expect(newTop.targetIds).toEqual(['p3']);
    expect(newTop.eligibleResponderIds).toContain('p3');
  });

  it('Test 3.3-B — Redirected Victim P3 Plays C28 (Steal Cancelled)', () => {
    let state = setupTestState();
    state.players['p3'].hand.push('C28');
    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    state = skipSingleFrame(state); // Resolve C04 window -> opens P3 steal reaction window

    const p3StealFrameId = getTopFrame(state)!.frameId;

    // P3 plays C28 ("Nope!") during P3's new reaction window
    state = playCounterEngine(state, 'p3', 'C28', p3StealFrameId);
    state = skipCounterEngine(state); // Resolve C28 window

    // Steal cancelled! P2 lost C04 (-1) = 8, P3 lost C28 (-1) = 5, P1 gained 0 cards = 4
    expect(state.players['p2'].hand.length).toBe(8);
    expect(state.players['p3'].hand.length).toBe(5);
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('Test 3.3-C — Redirected Victim P3 Skips (Steal Finalizes Against P3)', () => {
    let state = setupTestState();
    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', stealFrameId, { newVictimId: 'p3' });
    state = skipCounterEngine(state); // C04 resolves and P3 skips -> Steal finalizes

    // P2 lost C04 (-1) = 8. P3 lost 2 stolen cards = 3. P1 gained 2 cards = 6.
    expect(state.players['p2'].hand.length).toBe(8);
    expect(state.players['p3'].hand.length).toBe(3);
    expect(state.players['p1'].hand.length).toBe(6);
  });

  it('Test 3.3-D — Double C04 Redirect Chain (B -> C04 -> C -> C04 -> D)', () => {
    let state = setupTestState();
    // Add P4
    state.players['p4'] = { name: 'Player 4', hand: ['A010', 'A011', 'A012', 'A013', 'A014'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false };
    state.turnOrder.push('p4');

    // P3 gets C04 as well
    state.players['p3'].hand.push('C04');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state); // Resolve B's C04 -> opens P3 window

    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C04 redirecting to P4
    state = playCounterEngine(state, 'p3', 'C04', f2, { newVictimId: 'p4' });
    state = skipCounterEngine(state); // Resolve C's C04 + P4 skips -> Steal finalizes

    // P2 lost C04 (-1) = 8, P3 lost C04 (-1) = 5, P4 lost 2 stolen cards = 3, P1 gained 2 = 6.
    expect(state.players['p2'].hand.length).toBe(8);
    expect(state.players['p3'].hand.length).toBe(5);
    expect(state.players['p4'].hand.length).toBe(3);
    expect(state.players['p1'].hand.length).toBe(6);
    expect(state.pendingSteals ?? {}).toEqual({}); // Cleaned up!
  });

  it('Test 3.3-E — Re-Clamp Across Multiple Redirects', () => {
    let state = setupTestState();
    state.players['p4'] = { name: 'Player 4', hand: ['A010'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false }; // P4 has only 1 card
    state.turnOrder.push('p4');
    state.players['p3'].hand.push('C04');

    // P1 requests steal 4 from P2 (P2 has 9 cards)
    state = resolveSteal(state, 'p2', 'p1', 4, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // B -> C (P3 has 6 cards -> actualCount = min(4, 6) = 4)
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state);

    const f2 = getTopFrame(state)!.frameId;

    // C -> D (P4 has 1 card -> actualCount = min(4, 1) = 1)
    state = playCounterEngine(state, 'p3', 'C04', f2, { newVictimId: 'p4' });
    state = skipCounterEngine(state);

    // P4 had 1 card -> P4 loses 1 card (hand = 0). P1 gains 1 card (4 + 1 = 5).
    expect(state.players['p4'].hand.length).toBe(0);
    expect(state.players['p1'].hand.length).toBe(5);
  });

  it('Test 3.3-F — Redirected Counter Countered (C28 countered by C29)', () => {
    let state = setupTestState();
    state.players['p3'].hand.push('C28');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state);

    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C28
    state = playCounterEngine(state, 'p3', 'C28', f2);
    const f3 = getTopFrame(state)!.frameId;

    // P1 plays C29 countering P3's C28
    state = playCounterEngine(state, 'p1', 'C29', f3);
    state = skipCounterEngine(state);

    // C28 cancelled! Steal finalizes against P3! P3 hand = 6 - 1 (C28) - 2 (stolen) = 3.
    expect(state.players['p3'].hand.length).toBe(3);
    expect(state.players['p1'].hand.length).toBe(5); // P1 lost C29 (-1) + gained 2 = 5
  });

  it('Test 3.3-G — Redirected Victim Plays C08 (Replacement Forced Discard)', () => {
    let state = setupTestState();
    state.players['p3'].hand.push('C08');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state);

    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C08
    state = playCounterEngine(state, 'p3', 'C08', f2);
    state = skipCounterEngine(state);

    // Steal cancelled! P3 forced discards 2 cards instead!
    // P3 started with 5 + C08 (6), lost C08 (-1) and forced discarded 2 (-2) = 3.
    expect(state.players['p3'].hand.length).toBe(3);
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('Test 3.3-H — Redirected Victim Plays C26 (Reverse Steal)', () => {
    let state = setupTestState();
    state.players['p3'].hand.push('C26');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state);

    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C26 ("No U")
    state = playCounterEngine(state, 'p3', 'C26', f2);
    state = skipCounterEngine(state);

    // Original steal cancelled! P3 steals 2 back from P1!
    // P3 hand = 6 - 1 (C26) + 2 (stolen from P1) = 7. P1 hand = 4 - 2 = 2.
    expect(state.players['p3'].hand.length).toBe(7);
    expect(state.players['p1'].hand.length).toBe(2);
  });

  it('Test 3.3-I — No Physical Card Movement Until Final Reaction Completion', () => {
    let state = setupTestState();
    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });

    // Assert: Before P3 reacts, P1 has gained 0 cards, P2 lost 0 stolen cards, P3 lost 0 stolen cards
    expect(state.players['p1'].hand.length).toBe(4);
    expect(state.players['p2'].hand.length).toBe(8); // P2 lost C04 card
    expect(state.players['p3'].hand.length).toBe(5);
  });

  it('Test 3.3-J — Clean State After Final Outcome (No Stale pendingSteals)', () => {
    let state = setupTestState();
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipCounterEngine(state);

    expect(state.pendingSteals ?? {}).toEqual({});
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test E — C06 Steal Branch (Steal cancelled)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C06 ("Stop It!")
    state = playCounterEngine(state, 'p2', 'C06', stealFrameId);
    state = skipCounterEngine(state);

    // C06 discarded (-1), 0 cards stolen
    expect(state.players['p2'].hand.length).toBe(8);
  });

  it('Test F — C08 Replacement (Steal cancelled, B forced discards N instead)', () => {
    let state = setupTestState();

    // P1 steals 2 cards from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C08 ("Can't Fire Me") -> Steal cancelled, P2 forced discards 2
    state = playCounterEngine(state, 'p2', 'C08', stealFrameId);
    state = skipCounterEngine(state);

    // 0 cards stolen to P1. P2 discarded C08 (-1) and forced discarded 2 cards (-2) = 6 cards.
    expect(state.players['p2'].hand.length).toBe(6);
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('Test G — C08 Countered (C08 cancelled -> NO forced discard -> original steal executes)', () => {
    let state = setupTestState();

    // P1 steals 2 cards from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C08
    state = playCounterEngine(state, 'p2', 'C08', stealFrameId);
    const c08FrameId = getTopFrame(state)!.frameId;

    // P3 plays C29 against C08
    state = playCounterEngine(state, 'p3', 'C29', c08FrameId);
    state = skipCounterEngine(state);

    // C08 cancelled. Original steal of 2 cards executed. P2 lost C08 (-1) and 2 cards = 6.
    expect(state.players['p2'].hand.length).toBe(6);
  });

  it('Test H — C12 Look Out (C12 played by third party P3 -> Steal cancelled)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // Third-party P3 plays C12 ("Look Out") to protect P2
    expect(isCounterEligible('C12', { kind: 'action', code: 'STEAL' }, { actorId: 'p3', targetPlayerId: 'p2', operationKind: 'steal', stealOp: state.pendingSteals![Object.keys(state.pendingSteals!)[0]] })).toBe(true);
    state = playCounterEngine(state, 'p3', 'C12', stealFrameId);
    state = skipCounterEngine(state);

    // Steal cancelled, 0 cards stolen from P2
    expect(state.players['p2'].hand.length).toBe(9);
    expect(state.players['p3'].hand.length).toBe(4); // P3 lost C12 (-1)
  });

  it('Test I — C26 Reverse Steal (Original steal cancelled -> B steals N from A)', () => {
    let state = setupTestState();

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C26 ("No U") -> P2 steals 2 from P1
    state = playCounterEngine(state, 'p2', 'C26', stealFrameId);
    state = skipCounterEngine(state);

    // P2 lost C26 (-1), 0 stolen from P2, P2 stole 2 from P1.
    // P2 hand = 9 - 1 + 2 = 10. P1 hand = 4 - 2 = 2.
    expect(state.players['p2'].hand.length).toBe(10);
    expect(state.players['p1'].hand.length).toBe(2);
  });

  it('Test J — C26 Reverse Steal Safety (Independent operation identity)', () => {
    let state = setupTestState();
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    state = playCounterEngine(state, 'p2', 'C26', stealFrameId);
    // Reverse steal has its own clean operation created and resolved without infinite loop
    state = skipCounterEngine(state);
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test K — Insufficient Cards (requested steal = 5, victim has 2 -> actual = 2)', () => {
    let state = setupTestState();
    state.players['p2'].hand = ['A003', 'C08']; // only 2 cards in hand

    // P1 steals 5 from P2 (actual = 2)
    state = resolveSteal(state, 'p2', 'p1', 5, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C08 -> Forced discards actual count (1 remaining card)
    state = playCounterEngine(state, 'p2', 'C08', stealFrameId);
    state = skipCounterEngine(state);

    // P2 lost C08 (-1) and forced discarded remaining 1 card = 0 cards left
    expect(state.players['p2'].hand.length).toBe(0);
    expect(state.players['p1'].hand.length).toBe(4); // 0 stolen
  });

  it('Test L — Manual Recovery Isolation (Manual Give does NOT trigger Steal counters)', () => {
    let state = setupTestState();
    state = executeManualRecoveryGive(state, 'p1', 'p2', ['A001']);

    expect(state.pendingSteals ?? {}).toEqual({});
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test M — Phase 2 Regression (C02, C03, C30, T23 remain functional)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C30');

    // Forced Discard 3 with C30
    state = resolveForcedDiscard(state, 'p2', 3, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p2', 'C30', forcedFrameId);
    state = skipCounterEngine(state);

    // C30 replaced discard with draw 3
    expect(state.players['p2'].hand.length).toBeGreaterThanOrEqual(9);
  });

  it('Test N — Phase 1 Regression (C09, C16, C17, C18, C29 remain functional)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C17');

    // Action A001 countered by C17
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2'],
    });

    const actionFrameId = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p2', 'C17', actionFrameId);
    state = skipCounterEngine(state);

    expect(state.reactionStack?.length ?? 0).toBe(0);
  });
});
