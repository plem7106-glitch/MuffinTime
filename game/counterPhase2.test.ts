import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { pushStackFrame, submitResponse, getTopFrame, areAllResponsesComplete, removeStackFrame, addModifierToFrame, getStackFrame } from './reactionStack';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { executeActionFrameEffect } from './actionRules/registry';
import { executeTrapFrameEffect } from './trapRules/engine';
import { discard, draw } from './pile';
import { checkAndTriggerAutomaticTraps, resolveT23PreDiscardReaction } from './trapRules/engine';
import { resolveForcedDiscard, setPreDiscardReactionResolver } from './forcedDiscard';
import { executeManualRecoveryDiscard } from './recovery';
import type { RoomState, PlayerId, CardCode } from './types';

describe('Counter Phase 2 — Forced Discard Integration (C02, C03, C30)', () => {
  function setupTestState() {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');
    // Supply deck with cards
    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    // Set custom hands for testing
    state.players['p1'].hand = ['A001', 'A002', 'C18', 'C29'];
    state.players['p2'].hand = ['A003', 'A004', 'A005', 'A006', 'C03', 'C30'];
    state.players['p3'].hand = ['C02', 'C18', 'C29'];
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

  function playCounterEngine(state: RoomState, actorId: PlayerId, code: CardCode, targetFrameId: string): RoomState {
    const top = getTopFrame(state)!;
    const forcedOpId = (top.customPayload?.forcedDiscardOperationId as string | undefined)
      ?? Object.keys(state.pendingForcedDiscards ?? {})[0];
    const forcedOp = forcedOpId ? state.pendingForcedDiscards?.[forcedOpId] : undefined;

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
      customPayload: { parentFrameId: targetFrameId, forcedDiscardOperationId: forcedOpId },
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

  it('Test A — C02 Cancels Forced Discard (0 cards discarded, hand unchanged)', () => {
    let state = setupTestState();

    // P1 forces P2 to discard 3 cards
    state = resolveForcedDiscard(state, 'p2', 3, 'p1');
    expect(state.pendingForcedDiscards).toBeDefined();
    const op = Object.values(state.pendingForcedDiscards!)[0];
    expect(op.cardCodes.length).toBe(3);

    // P3 plays C02 ("Stop another player from discarding their cards.")
    const forcedFrameId = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p3', 'C02', forcedFrameId);

    // Skip remaining reactions and resolve stack
    state = skipCounterEngine(state);

    // P2's hand still has all original cards (A003, A004, A005, A006, C03, C30)
    expect(state.players['p2'].hand).toEqual(['A003', 'A004', 'A005', 'A006', 'C03', 'C30']);
    expect(state.discardPile.includes('A003')).toBe(false);
  });

  it('Test B — C02 Countered by C18 (Original Forced Discard executes)', () => {
    let state = setupTestState();

    // P1 forces P2 to discard 3 cards
    state = resolveForcedDiscard(state, 'p2', 3, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;

    // P3 plays C02 against Forced Discard
    state = playCounterEngine(state, 'p3', 'C02', forcedFrameId);
    const c02FrameId = getTopFrame(state)!.frameId;

    // P1 plays C18 ("Stop Counter") against C02 Frame
    state = playCounterEngine(state, 'p1', 'C18', c02FrameId);

    // Skip remaining reactions and resolve stack
    state = skipCounterEngine(state);

    // C02 was cancelled, so P2 discarded 3 cards
    expect(state.players['p2'].hand.length).toBe(3); // 6 original - 3 discarded = 3
    expect(state.discardPile.length).toBeGreaterThanOrEqual(3);
  });

  it('Test C — C03 Reduces Forced Discard Count (keeps 2 cards)', () => {
    let state = setupTestState();

    // P1 forces P2 to discard 4 cards
    state = resolveForcedDiscard(state, 'p2', 4, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;

    // P2 plays C03 ("If you're being forced to discard cards, keep 2 of them.")
    state = playCounterEngine(state, 'p2', 'C03', forcedFrameId);

    // Resolve stack
    state = skipCounterEngine(state);

    // P2 had 6 cards. Playing C03 (-1) left 5. Forced discard 4 reduced by 2 = 2 cards discarded.
    // Remaining hand = 5 - 2 = 3 cards.
    expect(state.players['p2'].hand.length).toBe(3);
  });

  it('Test D — C03 Clamp Edge Case (actual = 2, protects 2 -> final discard = 0)', () => {
    let state = setupTestState();
    state.players['p2'].hand = ['A003', 'C03']; // only 2 cards in hand

    // P1 forces P2 to discard 5 cards (actual count clamped to 2)
    state = resolveForcedDiscard(state, 'p2', 5, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;

    // P2 plays C03 (-1 C03 discarded from hand -> 1 card left)
    state = playCounterEngine(state, 'p2', 'C03', forcedFrameId);

    // Resolve stack
    state = skipCounterEngine(state);

    // C03 protects 2 cards (clamped to 0 discarded). P2 retains remaining card 'A003'
    expect(state.players['p2'].hand).toEqual(['A003']);
  });

  it('Test E — C30 Replacement (Stops forced discard, draws N instead)', () => {
    let state = setupTestState();
    const initialHandLen = state.players['p2'].hand.length;

    // P1 forces P2 to discard 3 cards
    state = resolveForcedDiscard(state, 'p2', 3, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;

    // P2 plays C30 ("Stop being forced to discard cards and draw that many instead.")
    state = playCounterEngine(state, 'p2', 'C30', forcedFrameId);

    // Resolve stack
    state = skipCounterEngine(state);

    // P2 played C30 (-1) and drew 3 (+3) -> net +2 cards, 0 cards discarded
    expect(state.players['p2'].hand.length).toBe(initialHandLen - 1 + 3);
  });

  it('Test F — C30 Countered by C29 (C30 cancelled, no replacement draw, forced discard executes)', () => {
    let state = setupTestState();

    // P1 forces P2 to discard 3 cards
    state = resolveForcedDiscard(state, 'p2', 3, 'p1');
    const forcedFrameId = getTopFrame(state)!.frameId;

    // P2 plays C30
    state = playCounterEngine(state, 'p2', 'C30', forcedFrameId);
    const c30FrameId = getTopFrame(state)!.frameId;

    // P3 plays C29 ("Stop Action / Trap / Counter") against C30 Frame
    state = playCounterEngine(state, 'p3', 'C29', c30FrameId);

    // Resolve stack
    state = skipCounterEngine(state);

    // C30 was cancelled. P2 did NOT draw cards, and original forced discard of 3 cards executed.
    expect(state.players['p2'].hand.length).toBe(6 - 1 - 3); // 6 - C30 - 3 discarded = 2
  });

  it('Test G — T23 Regression (T23 trap replacement continues to work)', () => {
    setPreDiscardReactionResolver(() => ({
      frameParams: { sourceType: 'trap', sourceCode: 'T23', actorId: 'p1', targetIds: ['p2'], eligibleResponderIds: [] },
      replacementDestination: { playerId: 'p1' },
    }));

    let state = setupTestState();
    state = resolveForcedDiscard(state, 'p2', 2, 'p1');
    state = skipCounterEngine(state);

    // Cards moved to P1's hand via T23 replacement
    expect(state.players['p1'].hand).toContain('A003');
    expect(state.players['p1'].hand).toContain('A004');
    expect(state.discardPile.includes('A003')).toBe(false);

    // Restore the real default (not null) -- forcedDiscard.ts's module-level
    // resolver defaults to resolveT23PreDiscardReaction in production, and a
    // later test/file relying on that real default must not see it masked
    // by a stale null left behind here.
    setPreDiscardReactionResolver(resolveT23PreDiscardReaction);
  });

  it('Test H — Manual Recovery Isolation (Manual Discard does NOT open counter window)', () => {
    let state = setupTestState();
    state = executeManualRecoveryDiscard(state, 'p2', ['A003']);

    // No pending forced discards and no stack frame
    expect(state.pendingForcedDiscards ?? {}).toEqual({});
    expect(state.reactionStack?.length ?? 0).toBe(0);
    expect(state.players['p2'].hand.includes('A003')).toBe(false);
  });
});
