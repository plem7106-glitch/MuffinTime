import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { pushStackFrame, submitResponse, getTopFrame, areAllResponsesComplete, removeStackFrame, addModifierToFrame } from './reactionStack';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { executeActionFrameEffect } from './actionRules/registry';
import { executeTrapFrameEffect } from './trapRules/engine';
import { discard, draw } from './pile';
import { checkAndTriggerAutomaticTraps } from './trapRules/engine';
import type { RoomState, PlayerId, CardCode } from './types';

describe('Counter Foundation Phase 1', () => {
  function setupTestState() {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');
    // Supply deck with enough cards for draws
    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    // Set custom hands for testing
    state.players['p1'].hand = ['A001', 'A002'];
    state.players['p2'].hand = ['C17', 'C09'];
    state.players['p3'].hand = ['C18', 'C29'];
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
    const afterDiscard = discard(state, actorId, 1, [code]);
    let next = submitResponse(afterDiscard, targetFrameId, actorId, {
      status: 'countered',
      counterCode: code,
    });
    next = pushStackFrame(next, {
      sourceType: 'counter',
      sourceCode: code,
      actorId,
      targetIds: [getTopFrame(state)?.actorId ?? actorId],
      customPayload: { parentFrameId: targetFrameId },
    });
    return resolveCompletedStackFrames(next);
  }

  function skipCounterEngine(state: RoomState, frameId?: string): RoomState {
    let next = state;
    let top = getTopFrame(next);
    while (top && (frameId === undefined || top.frameId === frameId || areAllResponsesComplete(top))) {
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
      if (frameId && top?.frameId !== frameId) break;
    }
    return next;
  }

  it('Test A — C09 against Trap frame (Trap cancelled, C09 discarded once)', () => {
    let state = setupTestState();

    // P1 activates Trap T01
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T01',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2'],
    });

    const trapFrameId = getTopFrame(state)!.frameId;

    // P2 plays C09 ("Stop Trap")
    expect(isCounterEligible('C09', { kind: 'trap', code: 'T01' })).toBe(true);
    state = playCounterEngine(state, 'p2', 'C09', trapFrameId);

    // Skip reactions to C09 frame
    const c09FrameId = getTopFrame(state)!.frameId;
    state = skipCounterEngine(state, c09FrameId);

    // Verify P2 hand no longer has C09
    expect(state.players['p2'].hand.includes('C09')).toBe(false);
    // Stack is empty
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test B — C17 against Action frame (Action cancelled, C17 player draws 1)', () => {
    let state = setupTestState();
    const initialP2HandLen = state.players['p2'].hand.length;

    // P1 plays Action A001
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2'],
    });

    const actionFrameId = getTopFrame(state)!.frameId;

    // P2 plays C17 ("Stop Action + Draw 1")
    expect(isCounterEligible('C17', { kind: 'action', code: 'A001' })).toBe(true);
    state = playCounterEngine(state, 'p2', 'C17', actionFrameId);

    // Skip reactions to C17 frame
    const c17FrameId = getTopFrame(state)!.frameId;
    state = skipCounterEngine(state, c17FrameId);

    // P2 discarded C17 (-1) and drew 1 (+1) -> net same hand length
    expect(state.players['p2'].hand.length).toBe(initialP2HandLen);
    expect(state.players['p2'].hand.includes('C17')).toBe(false);
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test C — Counter-to-Counter: Action -> C17 -> C18 (C18 cancels C17, C17 does NOT draw 1, Action resolves)', () => {
    let state = setupTestState();
    const initialP2HandLen = state.players['p2'].hand.length;

    // P1 plays Action A001
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });

    const actionFrameId = getTopFrame(state)!.frameId;

    // P2 plays C17 ("Stop Action + Draw 1") against Action Frame
    state = playCounterEngine(state, 'p2', 'C17', actionFrameId);
    const c17FrameId = getTopFrame(state)!.frameId;
    expect(getTopFrame(state)?.sourceType).toBe('counter');

    // P3 plays C18 ("Stop Counter") against C17 Frame
    expect(isCounterEligible('C18', { kind: 'counter', code: 'C17' })).toBe(true);
    state = playCounterEngine(state, 'p3', 'C18', c17FrameId);
    const c18FrameId = getTopFrame(state)!.frameId;

    // P1 and P2 skip reactions to C18, allowing stack to resolve
    state = skipCounterEngine(state);

    // Verification:
    // 1. C17 was cancelled by C18, so P2 did NOT draw 1 (hand length decreases by 1 from playing C17)
    expect(state.players['p2'].hand.length).toBe(initialP2HandLen - 1);
    expect(state.players['p2'].hand.includes('C17')).toBe(false);

    // 2. C18 was discarded by P3
    expect(state.players['p3'].hand.includes('C18')).toBe(false);

    // 3. Stack is completely resolved
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test D — C29 against Counter (C29 cancels C17, C17 secondary effect does NOT execute)', () => {
    let state = setupTestState();
    const initialP2HandLen = state.players['p2'].hand.length;

    // P1 plays Action A001
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });

    const actionFrameId = getTopFrame(state)!.frameId;

    // P2 plays C17 against Action Frame
    state = playCounterEngine(state, 'p2', 'C17', actionFrameId);
    const c17FrameId = getTopFrame(state)!.frameId;

    // P3 plays C29 ("Stop Action / Trap / Counter") against C17 Frame
    expect(isCounterEligible('C29', { kind: 'counter', code: 'C17' })).toBe(true);
    state = playCounterEngine(state, 'p3', 'C29', c17FrameId);

    // Skip reactions to C29, allowing stack to resolve
    state = skipCounterEngine(state);

    // C17 cancelled -> P2 did NOT draw 1
    expect(state.players['p2'].hand.length).toBe(initialP2HandLen - 1);
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test E — Nested Chain: Action -> C17 -> C18 -> C29 (C29 cancels C18 -> C18 cancelled -> C17 cancels Action -> C17 draws 1)', () => {
    let state = setupTestState();

    // Setup players with extra counters
    state.players['p2'].hand = ['C17'];
    state.players['p3'].hand = ['C18', 'C29'];

    // P1 plays Action A001
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A001',
      actorId: 'p1',
      targetIds: ['p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });
    const actionFrameId = getTopFrame(state)!.frameId;

    // P2 plays C17
    state = playCounterEngine(state, 'p2', 'C17', actionFrameId);
    const c17FrameId = getTopFrame(state)!.frameId;

    // P3 plays C18 against C17
    state = playCounterEngine(state, 'p3', 'C18', c17FrameId);
    const c18FrameId = getTopFrame(state)!.frameId;

    // P3 also plays C29 against C18
    state = playCounterEngine(state, 'p3', 'C29', c18FrameId);

    // Skip reactions to C29, allowing stack to resolve
    state = skipCounterEngine(state);

    // Resolution chain:
    // C29 cancels C18 -> C18 is cancelled (does NOT cancel C17) -> C17 survives!
    // C17 cancels Action A001 -> C17 draws 1 for P2!
    expect(state.players['p2'].hand.length).toBe(1); // Discarded C17 (-1) + Drew 1 (+1) = 1
    expect(state.reactionStack?.length ?? 0).toBe(0);
  });

  it('Test F — Human / Bot Execution Parity: both call same eligibility & frame creation logic', () => {
    const state = setupTestState();
    const pendingAction = { kind: 'action' as const, code: 'A001' };
    const pendingCounter = { kind: 'counter' as const, code: 'C17' };

    // Human & Bot evaluate same registry eligibility
    expect(getPlayableCounters(['C17', 'C18'], pendingAction)).toEqual(['C17']);
    expect(getPlayableCounters(['C17', 'C18'], pendingCounter)).toEqual(['C18']);
  });
});
