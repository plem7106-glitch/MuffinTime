import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { discard } from './pile';
import { resolveCounterEffect } from './counterRules/engine';
import { isCounterEligible } from './counterRules/registry';
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

describe('Counter Phase 4D — C25 Banish / Removed-From-Game Destination', () => {
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

  it('Test A — C25 Eligibility (Action only; not Trap, Counter, Steal, or Forced Discard)', () => {
    expect(isCounterEligible('C25', { kind: 'action', code: 'A001' })).toBe(true);
    expect(isCounterEligible('C25', { kind: 'trap', code: 'T01' })).toBe(false);
    expect(isCounterEligible('C25', { kind: 'counter', code: 'C29' })).toBe(false);
    expect(isCounterEligible('C25', { kind: 'action', code: 'STEAL' })).toBe(false);
    expect(isCounterEligible('C25', { kind: 'action', code: 'FORCED_DISCARD' })).toBe(false);
  });

  it('Test B — C25 Survives (Action Cancelled + AX Banished to banishedCards)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C25');

    // P1 plays Action A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C25
    state = playCounterEngine(state, 'p2', 'C25', f1);
    state = skipCounterEngine(state);

    // A001 effect cancelled, A001 absent from discardPile and present in banishedCards!
    expect(state.discardPile).not.toContain('A001');
    expect(state.banishedCards).toContain('A001');
    expect(state.banishedCards!.filter((code) => code === 'A001')).toHaveLength(1);
  });

  it('Test C — C25 Countered (C25 Countered by C29 -> Action Resolves Normally, AX NOT Banished)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C25');
    state.players['p3'].hand.push('C29');

    // P1 plays Action A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C25
    state = playCounterEngine(state, 'p2', 'C25', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C25
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C25 cancelled! A101 resolves normally (P1 draws 5)
    // A101 remains in discardPile, NOT in banishedCards!
    expect(state.players['p1'].hand.length).toBe(9);
    expect(state.discardPile).toContain('A101');
    expect(state.banishedCards ?? []).not.toContain('A101');
  });

  it('Test D — Nested LIFO (C25 -> C18 -> C29 -> C25 Ultimately Survives & Banishes AX)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C25');
    state.players['p3'].hand.push('C18');
    state.players['p1'].hand.push('C29');

    // P1 plays Action A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C25
    state = playCounterEngine(state, 'p2', 'C25', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C18 targeting C25
    state = playCounterEngine(state, 'p3', 'C18', f2);
    const f3 = getTopFrame(state)!.frameId;

    // P1 plays C29 targeting C18
    state = playCounterEngine(state, 'p1', 'C29', f3);
    state = skipCounterEngine(state);

    // LIFO: C29 cancels C18 -> C18 cancelled -> C25 survives and banishes A001!
    expect(state.discardPile).not.toContain('A001');
    expect(state.banishedCards).toContain('A001');
    expect(state.banishedCards!.filter((c) => c === 'A001')).toHaveLength(1);
  });

  it('Test E — Physical Card Conservation Across All Zones', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C25');

    const getPhysicalTotal = (s: RoomState) =>
      s.players['p1'].hand.length +
      s.players['p2'].hand.length +
      s.players['p3'].hand.length +
      s.drawPile.length +
      s.discardPile.length +
      (s.banishedCards?.length ?? 0);

    const totalBefore = getPhysicalTotal(state);

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C25
    state = playCounterEngine(state, 'p2', 'C25', f1);
    state = skipCounterEngine(state);

    const totalAfter = getPhysicalTotal(state);
    expect(totalAfter).toBe(totalBefore);
  });

  it('Test F — No Reappearance (AX Exists ONLY in banishedCards)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C25');

    // P1 plays Action A101
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C25
    state = playCounterEngine(state, 'p2', 'C25', f1);
    state = skipCounterEngine(state);

    // Verify A101 is nowhere in hands, drawPile, discardPile, or traps!
    expect(state.discardPile).not.toContain('A101');
    expect(state.drawPile).not.toContain('A101');
    expect(state.players['p1'].hand).not.toContain('A101');
    expect(state.players['p2'].hand).not.toContain('A101');
    expect(state.players['p3'].hand).not.toContain('A101');

    // Exists ONLY in banishedCards!
    expect(state.banishedCards).toContain('A101');
  });
});
