import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { discard } from './pile';
import { resolveSteal } from './steal';
import { resolveForcedDiscard } from './forcedDiscard';
import { resolveCounterEffect } from './counterRules/engine';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import { advanceTurn } from './turn';
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

describe('Counter Phase 4B — Turn-Skip Foundation & Counters (C20, C24, C38)', () => {
  function setupTestState(): RoomState {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');

    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

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
    next = discard(next, actorId, 1, [code]);
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

          // Steal Operation modification for C04, C06, C08, C12, C26, C28, C38
          const stealOpId = (resolvingFrame.customPayload?.stealOperationId as string | undefined)
            ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.stealOperationId as string | undefined) : undefined)
            ?? Object.keys(next.pendingSteals ?? {})[0];

          if (stealOpId && next.pendingSteals?.[stealOpId]) {
            const op = next.pendingSteals[stealOpId];
            if (['C06', 'C12', 'C28', 'C38'].includes(resolvingFrame.sourceCode)) {
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
                const newRes = pushStackFrame(next, {
                  sourceType: 'action',
                  sourceCode: 'STEAL',
                  actorId: op.thiefId,
                  targetIds: [newVictimId],
                  eligibleResponderIds: Object.keys(next.players).filter((id) => id !== op.thiefId),
                  customPayload: { stealOperationId: stealOpId },
                });
                next = newRes;
              } else {
                next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
              }
            }
          }

          next = resolveCounterEffect(next, resolvingFrame.sourceCode, resolvingFrame.actorId, resolvingFrame);
        } else if (resolvingFrame.sourceType === 'action') {
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

  it('Test A — C20 Dead To Me (Action Cancelled + P1 Marked Skip Next Turn)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C20');

    // P1 plays A001 on P1's turn (index 0)
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C20 against P1's action
    state = playCounterEngine(state, 'p2', 'C20', f1);
    state = skipCounterEngine(state);

    // P1 action cancelled, P1 marked to skip next turn!
    expect(state.players['p1'].skipNextTurn).toBe(true);

    // Advance turns:
    // P1's turn 1 ends -> P2 takes turn (index 1)
    state.currentTurnIndex = 0;
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p2');

    // P2's turn ends -> P3 takes turn (index 2)
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p3');

    // P3's turn ends -> advanceTurn reaches P1 (index 0) -> P1 IS SKIPPED -> turn goes to P2 (index 1)!
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p2');
    expect(state.players['p1'].skipNextTurn).toBe(false);
  });

  it('Test B — C20 Countered (C20 Countered by C29 -> Action Continues, P1 NOT Marked Skip)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C20');
    state.players['p3'].hand.push('C29');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C20
    state = playCounterEngine(state, 'p2', 'C20', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C20
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C20 cancelled! A101 resolves, P1 is NOT marked skip!
    expect(state.players['p1'].skipNextTurn).toBe(false);
    expect(state.players['p1'].hand.length).toBe(9); // 4 + A101 - 1 + 5 = 9 cards
  });

  it('Test C — C24 Never Take Me Alive (Action Cancelled + P2 Skips Own Next Turn)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C24');

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C24
    state = playCounterEngine(state, 'p2', 'C24', f1);
    state = skipCounterEngine(state);

    // Action cancelled, P2 (C24 player) marked to skip next turn!
    expect(state.players['p1'].skipNextTurn).toBe(false);
    expect(state.players['p2'].skipNextTurn).toBe(true);

    // Turn 1: P1 finishes turn -> advance -> P2 is skipped -> turn goes to P3!
    state.currentTurnIndex = 0;
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p3');
    expect(state.players['p2'].skipNextTurn).toBe(false);

    // Turn 2: P3 finishes turn -> advance -> P1 gets turn!
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p1');

    // Turn 3: P1 finishes turn -> advance -> P2 now gets normal turn!
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p2');
  });

  it('Test D — C38 Tree Powers (Steal Cancelled + 0 Cards Stolen + P2 Skips Next Turn)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C38');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 (victim) plays C38
    expect(isCounterEligible('C38', { kind: 'action', code: 'STEAL' }, { actorId: 'p2', targetPlayerId: 'p2', operationKind: 'steal', stealOp: state.pendingSteals![Object.keys(state.pendingSteals!)[0]] })).toBe(true);
    state = playCounterEngine(state, 'p2', 'C38', stealFrameId);
    state = skipCounterEngine(state);

    // Steal cancelled, 0 cards stolen from P2!
    expect(state.players['p2'].hand.length).toBe(4); // P2 started with 4 + C38 - C38 = 4 cards
    expect(state.players['p2'].skipNextTurn).toBe(true);
  });

  it('Test E — C38 Countered (C38 Countered by C29 -> Steal Continues, P2 NOT Marked Skip)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C38');
    state.players['p3'].hand.push('C29');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const stealFrameId = getTopFrame(state)!.frameId;

    // P2 plays C38
    state = playCounterEngine(state, 'p2', 'C38', stealFrameId);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C38
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C38 cancelled! Steal continues, P2 lost 2 cards, P2 is NOT marked skip!
    expect(state.players['p2'].skipNextTurn).toBe(false);
    expect(state.players['p2'].hand.length).toBe(2);
  });

  it('Test F — C04 -> C38 Redirect Integration (C Redirects & Plays C38 -> C Marked Skip, B Untouched)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C04');
    state.players['p3'].hand.push('C38');

    // P1 steals 2 from P2
    state = resolveSteal(state, 'p2', 'p1', 2, 'random');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C04 redirecting victim to P3
    state = playCounterEngine(state, 'p2', 'C04', f1, { newVictimId: 'p3' });
    state = skipSingleFrame(state); // C04 resolves -> Steal victim updated to P3

    const newStealFrameId = getTopFrame(state)!.frameId;

    // P3 (new victim) plays C38
    expect(isCounterEligible('C38', { kind: 'action', code: 'STEAL' }, { actorId: 'p3', targetPlayerId: 'p3', operationKind: 'steal', stealOp: state.pendingSteals![Object.keys(state.pendingSteals!)[0]] })).toBe(true);
    state = playCounterEngine(state, 'p3', 'C38', newStealFrameId);
    state = skipCounterEngine(state);

    // Steal cancelled, 0 cards stolen!
    // P3 (C38 player) marked skip, P2 (B) NOT marked skip!
    expect(state.players['p2'].skipNextTurn).toBe(false);
    expect(state.players['p3'].skipNextTurn).toBe(true);
    expect(state.players['p2'].hand.length).toBe(4);
    expect(state.players['p3'].hand.length).toBe(4);
  });

  it('Test G — Skip Consumption & Multiple Skips', () => {
    let state = setupTestState();
    state.players['p2'].skipNextTurn = true;
    state.players['p3'].skipNextTurn = true;

    // P1's turn (index 0) finishes -> advance -> P2 (index 1) skipped, P3 (index 2) skipped -> turn goes back to P1 (index 0)!
    state.currentTurnIndex = 0;
    state = advanceTurn(state);

    expect(state.turnOrder![state.currentTurnIndex]).toBe('p1');
    expect(state.players['p2'].skipNextTurn).toBe(false);
    expect(state.players['p3'].skipNextTurn).toBe(false);

    // Next round: P1 finishes turn -> P2 gets normal turn!
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p2');

    // P2 finishes turn -> P3 gets normal turn!
    state = advanceTurn(state);
    expect(state.turnOrder![state.currentTurnIndex]).toBe('p3');
  });
});
