import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { discard, draw } from './pile';
import { resolveCounterEffect } from './counterRules/engine';
import { getPlayableCounters, isCounterEligible } from './counterRules/registry';
import { resolveForcedDraw } from './forcedDraw';
import { prepareSteal, resolveSteal } from './steal';
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

describe('Counter Phase 4E — Forced Draw Operation + Complete C06', () => {
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

  it('Test A — Voluntary Turn Draw Not Intercepted', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');

    // P2 performs ordinary turn Draw 1
    const p2HandLenBefore = state.players['p2'].hand.length;
    state = draw(state, 'p2', 1);

    // Draw completes normally; no forced draw operation created; no counter window!
    expect(state.players['p2'].hand.length).toBe(p2HandLenBefore + 1);
    expect(Object.keys(state.pendingForcedDraws ?? {})).toHaveLength(0);
  });

  it('Test B — Forced Draw Opens C06 Opportunity (Real Production Action A124)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');

    // P1 plays Action A124 ("Fat Man") targeting P2 (force P2 to draw 5)
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    state = skipSingleFrameWindow(state); // resolve A124 frame -> triggers resolveForcedDraw

    // After A124 resolves, ForcedDrawOperation is created & awaiting reaction from P2!
    expect(Object.keys(state.pendingForcedDraws ?? {})).toHaveLength(1);
    const op = Object.values(state.pendingForcedDraws!)[0];
    expect(op.targetPlayerId).toBe('p2');
    expect(op.requestedCount).toBe(5);
    expect(op.status).toBe('awaiting_reaction');

    // P2 hand has drawn 0 cards yet (hand still has initial 4 + C06)!
    expect(state.players['p2'].hand).toContain('C06');
    expect(getTopFrame(state)?.sourceCode).toBe('FORCED_DRAW');
  });

  it('Test C — C06 Survives (Forced Draw Cancelled, P2 Draws 0 Cards)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');

    // P1 plays Action A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    state = skipSingleFrameWindow(state);

    const fDraw = getTopFrame(state)!.frameId;
    const initialP2HandLen = state.players['p2'].hand.length - 1; // minus C06

    // P2 plays C06 against Forced Draw
    state = playCounterEngine(state, 'p2', 'C06', fDraw);
    state = skipCounterEngine(state);

    // Forced Draw cancelled! P2 draws 0 cards from A124!
    expect(state.players['p2'].hand.length).toBe(initialP2HandLen);
    expect(Object.keys(state.pendingForcedDraws ?? {})).toHaveLength(0);
  });

  it('Test D — C06 Countered (C06 Countered by C29 -> Forced Draw Resumes, P2 Draws 5)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');
    state.players['p3'].hand.push('C29');

    // P1 plays Action A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    state = skipSingleFrameWindow(state);

    const fDraw = getTopFrame(state)!.frameId;

    // P2 plays C06
    state = playCounterEngine(state, 'p2', 'C06', fDraw);
    const fC06 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C06
    state = playCounterEngine(state, 'p3', 'C29', fC06);
    state = skipCounterEngine(state);

    // C06 cancelled! Forced Draw resumes! P2 draws 5 cards!
    expect(state.players['p2'].hand).not.toContain('C06');
    expect(state.players['p2'].hand.length).toBe(4 + 5); // 4 initial + 5 drawn
    expect(Object.keys(state.pendingForcedDraws ?? {})).toHaveLength(0);
  });

  it('Test E — Existing Steal Branch Regression (C06 Cancels Steal Operation)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');

    // P1 attempts to steal 1 card from P2
    state = resolveSteal(state, 'p2', 'p1', 1, 'random');
    const fSteal = getTopFrame(state)!.frameId;

    // P2 plays C06
    state = playCounterEngine(state, 'p2', 'C06', fSteal);
    state = skipCounterEngine(state);

    // Steal cancelled! 0 cards stolen!
    expect(state.players['p2'].hand.length).toBe(4); // 4 initial (C06 spent)
    expect(Object.keys(state.pendingSteals ?? {})).toHaveLength(0);
  });

  it('Test F — Privacy / Hidden Information Safety (Cards Stay in Draw Pile Until Finalization)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C06');
    const drawPileTopBefore = state.drawPile.slice(-5);

    // P1 plays Action A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    state = skipSingleFrameWindow(state);

    // While awaiting reaction: drawPile top 5 cards remain in drawPile!
    expect(state.drawPile.slice(-5)).toEqual(drawPileTopBefore);

    const fDraw = getTopFrame(state)!.frameId;
    state = playCounterEngine(state, 'p2', 'C06', fDraw);
    state = skipCounterEngine(state);

    // After C06 cancels: drawPile top 5 cards STILL remain in drawPile untouched!
    expect(state.drawPile.slice(-5)).toEqual(drawPileTopBefore);
  });

  it('Test G — Deck Clamping & Exhaustion Safety (Request > Draw Pile Size)', () => {
    let state = setupTestState();
    state.drawPile = ['A098', 'A099']; // Only 2 cards in drawPile!

    // P1 plays Action A124 targeting P2 (requests 5 cards)
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    state = skipSingleFrameWindow(state);

    // Finalize forced draw (P2 skips counter)
    state = skipSingleFrameWindow(state);

    // Clamped to 2 cards! P2 receives 2 cards; drawPile reaches 0 cleanly!
    expect(state.players['p2'].hand).toContain('A098');
    expect(state.players['p2'].hand).toContain('A099');
    expect(state.drawPile).toHaveLength(0);
  });

  it('Test H — Bot Victim Uses Same Authoritative C06 Counter Path', () => {
    let state = createRoom('p1', 'Player 1', 3);
    state = addPlayer(state, 'bot-1', 'Bot Player');
    state = addPlayer(state, 'p3', 'Player 3');

    const deck = Array.from({ length: 30 }, (_, i) => `A${String(i + 1).padStart(3, '0')}`);
    state = startGame(state, deck);

    state.players['bot-1'].hand = ['C06', 'A001'];

    // P1 plays Action A124 targeting bot-1
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['bot-1']);
    state = skipSingleFrameWindow(state);

    // Bot-1 receives forced draw operation and is eligible for C06
    const op = Object.values(state.pendingForcedDraws!)[0];
    expect(op.targetPlayerId).toBe('bot-1');
    const eligible = getPlayableCounters(
      state.players['bot-1'].hand,
      { kind: 'action', code: 'FORCED_DRAW' },
      { operationKind: 'forced_draw', forcedDrawOp: op, actorId: 'bot-1', roomState: state }
    );
    expect(eligible).toContain('C06');
  });
});
