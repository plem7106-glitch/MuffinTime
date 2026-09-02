import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { executeTrapFrameEffect } from './trapRules/engine';
import { discard } from './pile';
import { resolveCounterEffect } from './counterRules/engine';
import { resolveSteal } from './steal';
import { beginTurn } from './turn';
import {
  areAllResponsesComplete,
  addModifierToFrame,
  getTopFrame,
  pushStackFrame,
  removeStackFrame,
  submitResponse,
} from './reactionStack';
import type { CardCode, PlayerId, RoomState } from './types';

describe('Counter Phase 6A — Special Digital Counters (C01, C13, C19, C23, C32)', () => {
  function setupTestState(): RoomState {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');

    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    state.players['p1'].hand = ['A001', 'A002', 'A003', 'A004'];
    state.players['p2'].hand = ['A005', 'A006', 'A007', 'A008'];
    state.players['p3'].hand = ['A009', 'A010', 'A011', 'A012'];

    return state;
  }

  function resolveActionWithCounterWindow(
    state: RoomState,
    actorId: PlayerId,
    code: CardCode,
    targetIds: PlayerId[] = [],
    targetScope: 'single' | 'multi' | 'all' = 'single'
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
      targetScope,
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
            const isRedirectOrScope = ['C34', 'C35', 'C45', 'C40', 'C11', 'C07', 'C15', 'C22', 'C36', 'C39', 'C47', 'C01', 'C13', 'C23', 'C32'].includes(resolvingFrame.sourceCode);
            if (!isRedirectOrScope) {
              next = addModifierToFrame(next, parentId, {
                modifierId: `mod-${resolvingFrame.sourceCode}-${Date.now()}`,
                sourceFrameId: resolvingFrame.frameId,
                type: 'cancel_all',
                affectedTargetIds: [resolvingFrame.actorId],
              });
            } else if (['C01', 'C13', 'C32'].includes(resolvingFrame.sourceCode)) {
              // Named cancels stop the parent frame directly
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
        } else if (resolvingFrame.sourceType === 'trap') {
          next = executeTrapFrameEffect(next, resolvingFrame);
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

  it('C01 — Baby with Two Guns (Stops A063 and Steals N Cards from Actor)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C01');

    // P1 plays A063 ("Baby With A Gun")
    state = resolveActionWithCounterWindow(state, 'p1', 'A063', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C01 requesting to steal 2 cards from P1
    state = playCounterEngine(state, 'p2', 'C01', f1, { stealCount: 2 });
    state = skipCounterEngine(state);

    // A063 cancelled. P2 stole 2 cards from P1!
    // P1 started with 4 cards - 2 stolen = 2 remaining cards!
    expect(state.players['p1'].hand.length).toBe(2);
    expect(state.players['p2'].hand.length).toBe(6); // 4 initial + C01 added - C01 spent + 2 stolen = 6
  });

  it('C01 — canonical steal lifecycle is intercepted by C28 and then finalized', () => {
    let state = setupTestState();
    state.players.p2.hand.push('C01');
    state.players.p1.hand = ['A001', 'A002', 'A003', 'A004', 'C28'];

    state = resolveActionWithCounterWindow(state, 'p1', 'A063', ['p2']);
    const actionFrameId = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p2', 'C01', actionFrameId, { stealCount: 2 });
    const c01Frame = getTopFrame(state)!;
    for (const pid of c01Frame.eligibleResponderIds) {
      if (c01Frame.responses[pid]?.status === 'pending') {
        state = submitResponse(state, c01Frame.frameId, pid, { status: 'skipped' });
      }
    }
    state = resolveCompletedStackFrames(state);

    const stealFrame = getTopFrame(state)!;
    expect(stealFrame.sourceCode).toBe('STEAL');
    const operationId = Object.keys(state.pendingSteals ?? {})[0];
    expect(operationId).toBeTruthy();
    expect(state.players.p2.hand).not.toContain('C01');
    expect(state.discardPile.filter((code) => code === 'C01')).toHaveLength(1);

    state = playCounterEngine(state, 'p1', 'C28', stealFrame.frameId);
    state = skipCounterEngine(state);

    expect(state.pendingSteals?.[operationId!]).toBeUndefined();
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.players.p1.hand).toHaveLength(2);
    expect(state.players.p2.hand).toHaveLength(6);
    expect(state.discardPile.filter((code) => code === 'C28')).toHaveLength(1);
    expect(state.discardPile.filter((code) => code === 'A063')).toHaveLength(1);
    expect(state.players.p1.hand).not.toContain('C28');
  });

  it.each([
    ['3 requested / 3 available', 3, 3],
    ['4 requested / 2 available', 4, 2],
    ['requested >0 / 0 available', 2, 0],
  ])('C01 edge — %s clamps in canonical resolveSteal', (_label, requested, available) => {
    let state = setupTestState();
    state.players.p1.hand = Array.from({ length: available }, (_, i) => `A${String(i + 1).padStart(3, '0')}` as CardCode);
    state.players.p2.hand = ['C01'];
    state = resolveActionWithCounterWindow(state, 'p1', 'A063', ['p2']);
    const actionFrameId = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p2', 'C01', actionFrameId, { stealCount: requested });
    state = skipCounterEngine(state);

    expect(state.players.p1.hand).toHaveLength(available - Math.min(requested, available));
    expect(state.players.p2.hand).toHaveLength(Math.min(requested, available));
    expect(state.pendingSteals ?? {}).toEqual({});
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.discardPile.filter((code) => code === 'C01')).toHaveLength(1);
  });

  it('C01 — Countered by C29 (A063 Resumes, 0 Cards Stolen)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C01');
    state.players['p3'].hand.push('C29');

    // P1 plays A063
    state = resolveActionWithCounterWindow(state, 'p1', 'A063', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C01
    state = playCounterEngine(state, 'p2', 'C01', f1, { stealCount: 2 });
    const fC01 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C01
    state = playCounterEngine(state, 'p3', 'C29', fC01);
    state = skipCounterEngine(state);

    // C01 cancelled! P1 hand is untouched by C01 steal!
    expect(state.players['p1'].hand.length).toBe(4);
  });

  it('C13 — Me! Me! Me! (Stops Action and Grants Next Turn to Actor P3)', () => {
    let state = setupTestState();
    state.turnOrder = ['p1', 'p2', 'p3'];
    state.currentTurnIndex = 0; // P1 turn
    state.players['p3'].hand.push('C13');

    // P1 plays Action A001
    state = resolveActionWithCounterWindow(state, 'p1', 'A001', []);
    const f1 = getTopFrame(state)!.frameId;

    // P3 plays C13
    state = playCounterEngine(state, 'p3', 'C13', f1);
    state = skipCounterEngine(state);

    // Turn order reordered so P3 is immediately next after currentTurnIndex 0!
    expect(state.turnOrder[1]).toBe('p3');
  });

  it('C19 — Chase Me! (Stealing C19 Forces Thief to Discard Entire Hand)', () => {
    let state = setupTestState();
    state.players['p2'].hand = ['C19']; // P2 only has C19
    state.players['p1'].hand = ['A001', 'A002', 'A003'];

    // P1 steals 1 card from P2 (which MUST be C19)
    state = resolveSteal(state, 'p2', 'p1', 1, 'random');

    // P1 stole C19 and immediately discarded their entire hand!
    expect(state.players['p1'].hand.length).toBe(0);
    // C19 is now in discard pile
    expect(state.discardPile).toContain('C19');
  });

  it('C19 — Non-Stolen Card Does Not Trigger Discard', () => {
    let state = setupTestState();
    state.players['p2'].hand = ['A005']; // P2 does NOT have C19
    state.players['p1'].hand = ['A001', 'A002'];

    state = resolveSteal(state, 'p2', 'p1', 1, 'random');

    // P1 stole A005; normal steal occurs; P1 hand size becomes 3!
    expect(state.players['p1'].hand.length).toBe(3);
  });

  it('C23 — My Favorite (Doubles Numeric Action Effect of A124 from 5 to 10)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C23');

    // P1 plays A124 ("Fat Man", force target to draw 5) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C23
    state = playCounterEngine(state, 'p2', 'C23', f1);
    state = skipCounterEngine(state);

    // A124 numeric effect doubled ×2! P2 draws 10 cards instead of 5!
    // P2 started with 4 initial + 1 (C23 spent = 4) + 10 drawn = 14 cards!
    expect(state.players['p2'].hand.length).toBe(4 + 10);

    // Physical A124 appears ONCE in discard pile
    expect(state.discardPile.filter((c) => c === 'A124')).toHaveLength(1);
  });

  it('C23 — Countered by C29 (Normal Count 5 Applied)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C23');
    state.players['p3'].hand.push('C29');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C23
    state = playCounterEngine(state, 'p2', 'C23', f1);
    const fC23 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C23
    state = playCounterEngine(state, 'p3', 'C29', fC23);
    state = skipCounterEngine(state);

    // C23 cancelled! Normal count 5 applied -> P2 draws 5!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
  });

  it('C23 — A052 doubles both the actor draw branch and target request', () => {
    let state = setupTestState();
    state.players.p2.hand.push('C06');
    state = executeActionFrameEffect(state, {
      frameId: 'a052-c23', parentFrameId: null, sourceType: 'action', sourceCode: 'A052', actorId: 'p1',
      targetIds: ['p2'], targetScope: 'single', eligibleResponderIds: [], responses: {},
      modifiers: [], status: 'resolving', turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      customPayload: { numericMultiplier: 2 },
    });
    expect(state.players.p1.hand).toHaveLength(10);
    expect(state.pendingForcedDraws).toBeDefined();
    expect(Object.values(state.pendingForcedDraws ?? {})[0]?.requestedCount).toBe(6);
  });

  it('C32 — Really Far Away (Stops Trap T01 & Grants Trap Immunity Until Next Turn)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C32');
    state.players['p1'].hand.push('T01');

    // P1 activates Trap T01 targeting P2
    state = discard(state, 'p1', 1, ['T01']);
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T01',
      actorId: 'p1',
      targetIds: ['p2'],
      affectedPlayerIds: ['p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });
    const trapFrameId = getTopFrame(state)!.frameId;

    // P2 plays C32
    state = playCounterEngine(state, 'p2', 'C32', trapFrameId);
    state = skipCounterEngine(state);

    // T01 stopped! P2 hand untouched by T01 discard. P2 receives trapImmunityUntilTurn = true!
    expect(state.players['p2'].hand.length).toBe(4);
    expect(state.players['p2'].trapImmunityUntilTurn).toBe(true);

    // Subsequent Trap T01 activated against P2 produces 0 effect while immune
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T01',
      actorId: 'p1',
      targetIds: ['p2'],
      affectedPlayerIds: ['p2'],
      eligibleResponderIds: ['p2', 'p3'],
    });
    state = skipCounterEngine(state);
    expect(state.players['p2'].hand.length).toBe(4);

    // When P2 begins their next turn, immunity expires automatically
    state = beginTurn(state, 'p2');
    expect(state.players['p2'].trapImmunityUntilTurn).toBe(false);
  });
});
