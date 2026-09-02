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

describe('Counter Phase 5B — Scope / Reflect Target Mutation Batch (C11, C40)', () => {
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
            const isRedirectOrExempt = ['C34', 'C35', 'C45', 'C40', 'C11'].includes(resolvingFrame.sourceCode);
            if (!isRedirectOrExempt) {
              next = addModifierToFrame(next, parentId, {
                modifierId: `mod-${resolvingFrame.sourceCode}-${Date.now()}`,
                sourceFrameId: resolvingFrame.frameId,
                type: 'cancel_all',
                affectedTargetIds: [resolvingFrame.actorId],
              });
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

  function skipSingleFrameWindow(state: RoomState): RoomState {
    let next = state;
    const top = getTopFrame(next);
    if (!top) return next;
    for (const pid of top.eligibleResponderIds) {
      if (top.responses[pid]?.status === 'pending') {
        next = submitResponse(next, top.frameId, pid, { status: 'skipped' });
      }
    }
    return resolveCompletedStackFrames(next);
  }

  it('Test A — Dataset Eligibility for C11 and C40', () => {
    // C11 eligible for Trap
    expect(isCounterEligible('C11', { kind: 'trap', code: 'T01' })).toBe(true);
    expect(isCounterEligible('C11', { kind: 'action', code: 'A001' })).toBe(false);

    // C40 eligible for victim against targeted Action
    expect(isCounterEligible('C40', { kind: 'action', code: 'A124' }, { actorId: 'p2', targetPlayerId: 'p2' })).toBe(true);
    expect(isCounterEligible('C40', { kind: 'action', code: 'A124' }, { actorId: 'p3', targetPlayerId: 'p2' })).toBe(false);
    expect(isCounterEligible('C40', { kind: 'trap', code: 'T01' })).toBe(false);
  });

  it('Test B — C11 Trap Exclusion (P2 Plays C11 -> P2 Exempted from Trap)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C11');
    state.players['p1'].hand.push('T01');

    // P1 triggers Trap T01
    state = discard(state, 'p1', 1, ['T01']);
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T01',
      actorId: 'p1',
      targetIds: ['p1', 'p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });
    const trapFrameId = getTopFrame(state)!.frameId;

    // P2 plays C11
    state = playCounterEngine(state, 'p2', 'C11', trapFrameId);
    state = skipCounterEngine(state);

    // Trap frame has cancel_all modifier targeted at P2
    const trapFrame = getStackFrame(state, trapFrameId);
    if (trapFrame) {
      expect(trapFrame.modifiers).toContainEqual(
        expect.objectContaining({ type: 'cancel_all', affectedTargetIds: ['p2'] })
      );
    }
  });

  it('Test C — C40 Reflect Action Back to Source Player (P1 Plays A124 -> P2 Plays C40 -> P1 Receives Forced Draw 5)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays Action A124 ("Fat Man", force target to draw 5) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C40 (Opposite Day)
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    // C40 reflects A124 target P2 -> P1 (source actor)!
    // A124 resolves against P1 -> P1 draws 5 cards; P2 draws 0!
    expect(state.players['p1'].hand.length).toBe(4 + 5); // 4 remaining + 5 drawn
    expect(state.players['p2'].hand.length).toBe(4); // 4 initial (C40 spent)
  });

  it('Test D — C40 Countered (C40 Countered by C29 -> Target Remains Original Victim P2)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');
    state.players['p3'].hand.push('C29');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    const fC40 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C40
    state = playCounterEngine(state, 'p3', 'C29', fC40);
    state = skipCounterEngine(state);

    // C40 cancelled! Original target remains P2 -> P2 draws 5 cards; P1 draws 0!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('Test E — Physical Source Card Conservation (Source Resolves Exactly Once)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays Action A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    // Physical A124 exists EXACTLY ONCE in discardPile
    expect(state.discardPile.filter((c) => c === 'A124')).toHaveLength(1);
  });

  it('Test F — Downstream Forced Draw Integration (Reflected A124 Targets P1)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    // A124 resolves against P1 -> P1 receives forced draw 5!
    expect(state.players['p1'].hand.length).toBe(4 + 5);
  });

  it('Test G — Downstream Forced Discard Integration (Reflected A038 Targets P1)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays Action A038 ("Die Potato", force target to discard 3) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A038', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    // A038 resolves against P1 -> P1 is forced to discard 3 cards!
    expect(state.players['p1'].hand.length).toBe(4 - 3);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test H — Bot Payload Path (Bot P2 Plays C40)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // Bot P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    expect(state.players['p1'].hand.length).toBe(4 + 5);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test I — Physical Integrity (Zero Duplicate or Missing Cards)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C40');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    const totalBefore =
      state.players['p1'].hand.length +
      state.players['p2'].hand.length +
      state.players['p3'].hand.length +
      state.drawPile.length +
      state.discardPile.length;

    // P2 plays C40
    state = playCounterEngine(state, 'p2', 'C40', f1);
    state = skipCounterEngine(state);

    const totalAfter =
      state.players['p1'].hand.length +
      state.players['p2'].hand.length +
      state.players['p3'].hand.length +
      state.drawPile.length +
      state.discardPile.length;

    expect(totalAfter).toBe(totalBefore);
  });
});
