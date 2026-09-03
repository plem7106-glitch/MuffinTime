import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { discard } from './pile';
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

describe('Counter Phase 5A — Target Mutation Redirect Foundation (C34, C35, C45)', () => {
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
            const isRedirect = ['C34', 'C35', 'C45'].includes(resolvingFrame.sourceCode);
            if (!isRedirect) {
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

  it('Test A — Dataset Eligibility for C34, C35, C45', () => {
    // Eligible when played by victim against targeted action/trap
    expect(isCounterEligible('C34', { kind: 'action', code: 'A124' }, { actorId: 'p2', targetPlayerId: 'p2' })).toBe(true);
    expect(isCounterEligible('C35', { kind: 'action', code: 'A124' }, { actorId: 'p2', targetPlayerId: 'p2' })).toBe(true);
    expect(isCounterEligible('C45', { kind: 'action', code: 'A124' }, { actorId: 'p2', targetPlayerId: 'p2' })).toBe(true);

    // Ineligible when played by third party
    expect(isCounterEligible('C34', { kind: 'action', code: 'A124' }, { actorId: 'p3', targetPlayerId: 'p2' })).toBe(false);
    expect(isCounterEligible('C35', { kind: 'action', code: 'A124' }, { actorId: 'p3', targetPlayerId: 'p2' })).toBe(false);
    expect(isCounterEligible('C45', { kind: 'action', code: 'A124' }, { actorId: 'p3', targetPlayerId: 'p2' })).toBe(false);
  });

  it('Test B — Basic Redirect (C34 Deflects Action Target to Next Player P3)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C34');

    // P1 plays Action A124 ("Fat Man", force target to draw 5) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C34 (Static)
    state = playCounterEngine(state, 'p2', 'C34', f1);
    state = skipCounterEngine(state);

    // C34 resolves -> A124 target mutated P2 -> P3 (next player in seat order)
    // A124 resolves against P3 -> P3 draws 5 cards! P2 draws 0!
    expect(state.players['p3'].hand.length).toBe(4 + 5);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('C34 deflects to the player behind (P1), not P3, once play direction is reversed -- regression for hardcoding clockwise regardless of state.direction', () => {
    let state = setupTestState();
    state.direction = -1;
    state.players['p2'].hand.push('C34');

    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    state = playCounterEngine(state, 'p2', 'C34', f1);
    state = skipCounterEngine(state);

    // Counterclockwise from P2 in ['p1','p2','p3'] is P1, not P3.
    expect(state.players['p1'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test C — Redirect Countered (C35 Countered by C29 -> Target Remains Original Victim P2)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C35');
    state.players['p3'].hand.push('C29');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C35 targeting P3
    state = playCounterEngine(state, 'p2', 'C35', f1, { newTargetId: 'p3' });
    const fC35 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C35
    state = playCounterEngine(state, 'p3', 'C29', fC35);
    state = skipCounterEngine(state);

    // C35 cancelled! Original target remains P2 -> P2 draws 5 cards! P3 draws 0!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4); // 4 initial cards (C29 spent from 5 = 4)
  });

  it('Test D — Physical Source Card Conservation (Source Resolves Exactly Once)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C35');

    // P1 plays Action A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C35 targeting P3
    state = playCounterEngine(state, 'p2', 'C35', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    // Physical A124 exists EXACTLY ONCE in discardPile
    expect(state.discardPile.filter((c) => c === 'A124')).toHaveLength(1);
  });

  it('Test E — Human Target Validation (Self Target Rejected)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C35');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 attempts to play C35 targeting self (P2)
    state = playCounterEngine(state, 'p2', 'C35', f1, { newTargetId: 'p2' });
    state = skipCounterEngine(state);

    // C35 self-target rejected in engine -> target remains P2 -> P2 draws 5!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
  });

  it('Test F — Forced Discard Integration (C35 Redirects A038 Forced Discard to P3)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C35');

    // P1 plays Action A038 ("Die Potato", force target to discard 3) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A038', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C35 targeting P3
    state = playCounterEngine(state, 'p2', 'C35', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    // A038 resolves against P3 -> P3 discards 3 cards!
    expect(state.players['p3'].hand.length).toBe(4 - 3);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test G — Forced Draw Integration (C45 Redirects A124 Forced Draw to P3)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C45');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C45 targeting P3
    state = playCounterEngine(state, 'p2', 'C45', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    // A124 forced draw resolves against P3 -> P3 draws 5 cards!
    expect(state.players['p3'].hand.length).toBe(4 + 5);
    expect(state.players['p2'].hand.length).toBe(4);
  });

  it('Test H — Bot Payload (Passes valid newTargetId via customPayload)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C35');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // Bot P2 plays C35 with customPayload: { newTargetId: 'p3' }
    state = playCounterEngine(state, 'p2', 'C35', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    expect(state.players['p3'].hand.length).toBe(4 + 5);
    expect(state.players['p2'].hand.length).toBe(4);
  });
});
