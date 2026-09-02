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

describe('Counter Phase 4C — Card Return / Card Steal Counters (C05, C21, C27)', () => {
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

  it('Test A — C05 vs Action (Action Cancelled + Exact Action Returns to Player A Hand)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C05');

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C05 against P1's action
    expect(isCounterEligible('C05', { kind: 'action', code: 'A001' })).toBe(true);
    state = playCounterEngine(state, 'p2', 'C05', f1);
    state = skipCounterEngine(state);

    // A001 cancelled & returns to P1's hand!
    expect(state.players['p1'].hand).toContain('A001');
    expect(state.discardPile).not.toContain('A001');
  });

  it('Test B — C05 vs Trap (Trap Cancelled + Exact Trap Returns to Player A Hand)', () => {
    let state = setupTestState();
    state.players['p1'].hand.push('T01');
    state.players['p2'].hand.push('C05');

    // P1 plays Trap T01
    state = discard(state, 'p1', 1, ['T01']);
    const trapState = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T01',
      actorId: 'p1',
      targetIds: ['p1'],
      eligibleResponderIds: ['p2', 'p3'],
    });
    const trapFrameId = getTopFrame(trapState)!.frameId;

    // P2 plays C05
    state = playCounterEngine(trapState, 'p2', 'C05', trapFrameId);
    state = skipCounterEngine(state);

    // T01 cancelled & returns to P1's hand!
    expect(state.players['p1'].hand).toContain('T01');
    expect(state.discardPile).not.toContain('T01');
  });

  it('Test C — C05 vs Counter (Target Counter Cancelled + Returns to P2 Hand + Action Resolves)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C29');
    state.players['p3'].hand.push('C05');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C29 countering A101
    state = playCounterEngine(state, 'p2', 'C29', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C05 against C29
    state = playCounterEngine(state, 'p3', 'C05', f2);
    state = skipCounterEngine(state);

    // C29 cancelled & returned to P2's hand!
    expect(state.players['p2'].hand).toContain('C29');
    expect(state.discardPile).not.toContain('C29');

    // A101 resolves normally! P1 draws 5 cards (started with 4 + A101 - 1 + 5 = 9 cards)
    expect(state.players['p1'].hand.length).toBe(9);
  });

  it('Test D — C05 Countered (C05 Countered by C29 -> No Return to Hand, Action Resolves)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C05');
    state.players['p3'].hand.push('C29');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C05
    state = playCounterEngine(state, 'p2', 'C05', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C05
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C05 cancelled! A101 is NOT returned to P1's hand!
    // A101 resolves normally! P1 draws 5 cards (hand length = 9)
    expect(state.players['p1'].hand.length).toBe(9);
    expect(state.discardPile).toContain('A101');
  });

  it('Test E — C21 vs Counter (Counter Cancelled + C21 Player Steals Target Counter to Hand)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C29');
    state.players['p3'].hand.push('C21');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C29 countering A101
    state = playCounterEngine(state, 'p2', 'C29', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C21 targeting C29
    expect(isCounterEligible('C21', { kind: 'counter', code: 'C29' })).toBe(true);
    expect(isCounterEligible('C21', { kind: 'action', code: 'A001' })).toBe(false);
    state = playCounterEngine(state, 'p3', 'C21', f2);
    state = skipCounterEngine(state);

    // C29 cancelled! Exact C29 physical card stolen to P3's hand!
    expect(state.players['p3'].hand).toContain('C29');
    expect(state.players['p2'].hand).not.toContain('C29');
    expect(state.discardPile).not.toContain('C29');

    // A101 resolves normally (P1 draws 5)
    expect(state.players['p1'].hand.length).toBe(9);
  });

  it('Test F — C21 Countered (C21 Countered by C18 -> No Steal Occurs, C29 Resolves)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C29');
    state.players['p3'].hand.push('C21');
    state.players['p1'].hand.push('C18');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C29
    state = playCounterEngine(state, 'p2', 'C29', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C21 targeting C29
    state = playCounterEngine(state, 'p3', 'C21', f2);
    const f3 = getTopFrame(state)!.frameId;

    // P1 plays C18 countering C21
    state = playCounterEngine(state, 'p1', 'C18', f3);
    state = skipCounterEngine(state);

    // C21 cancelled! C29 is NOT stolen by P3!
    // C29 resolves and cancels A101!
    expect(state.players['p3'].hand).not.toContain('C29');
    expect(state.players['p1'].hand.length).toBe(4); // A101 cancelled!
  });

  it('Test G — C27 vs another player\'s Action (Action Cancelled + Exact Action Moves to P2 Hand)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C27');

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C27 against P1's action
    expect(isCounterEligible('C27', { kind: 'action', code: 'A001' }, { actorId: 'p2', actionActorId: 'p1' })).toBe(true);
    state = playCounterEngine(state, 'p2', 'C27', f1);
    state = skipCounterEngine(state);

    // Action A001 cancelled & stolen to P2's hand!
    expect(state.players['p2'].hand).toContain('A001');
    expect(state.discardPile).not.toContain('A001');
    expect(state.players['p1'].hand).not.toContain('A001');
  });

  it('Test H — C27 Cannot Target Own Action', () => {
    let state = setupTestState();
    state.players['p1'].hand.push('C27');

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');

    // P1 attempts to play C27 against own action -> ineligible!
    expect(isCounterEligible('C27', { kind: 'action', code: 'A001' }, { actorId: 'p1', actionActorId: 'p1' })).toBe(false);
  });

  it('Test I — C27 Countered (C27 Countered by C29 -> No Action Steal, Action Resolves)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C27');
    state.players['p3'].hand.push('C29');

    // P1 plays A101 ("Muffin Time")
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C27
    state = playCounterEngine(state, 'p2', 'C27', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C27
    state = playCounterEngine(state, 'p3', 'C29', f2);
    state = skipCounterEngine(state);

    // C27 cancelled! A101 is NOT stolen by P2!
    // A101 resolves normally! P1 draws 5 cards (hand length = 9)
    expect(state.players['p2'].hand).not.toContain('A101');
    expect(state.players['p1'].hand.length).toBe(9);
  });

  it('Test J — Nested Counter LIFO Safety', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C29');
    state.players['p3'].hand.push('C21');
    state.players['p1'].hand.push('C29');

    // P1 plays A101
    state = resolveActionWithCounterWindow(state, 'p1', 'A101');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C29
    state = playCounterEngine(state, 'p2', 'C29', f1);
    const f2 = getTopFrame(state)!.frameId;

    // P3 plays C21 targeting C29
    state = playCounterEngine(state, 'p3', 'C21', f2);
    const f3 = getTopFrame(state)!.frameId;

    // P1 plays C29 targeting C21
    state = playCounterEngine(state, 'p1', 'C29', f3);
    state = skipCounterEngine(state);

    // LIFO resolution: P1's C29 cancels C21 -> C21 effect cancelled -> P2's C29 resolves and cancels A101!
    expect(state.players['p3'].hand).not.toContain('C29'); // C21 failed!
    expect(state.players['p1'].hand.length).toBe(4); // A101 cancelled!
  });

  it('Test K — Physical Card Conservation Across All Zones', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C27');

    const totalCardsBefore =
      state.players['p1'].hand.length +
      state.players['p2'].hand.length +
      state.players['p3'].hand.length +
      state.drawPile.length +
      state.discardPile.length;

    // P1 plays A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C27
    state = playCounterEngine(state, 'p2', 'C27', f1);
    state = skipCounterEngine(state);

    const totalCardsAfter =
      state.players['p1'].hand.length +
      state.players['p2'].hand.length +
      state.players['p3'].hand.length +
      state.drawPile.length +
      state.discardPile.length;

    // Zero cards lost, zero cards duplicated!
    expect(totalCardsAfter).toBe(totalCardsBefore);
  });
});
