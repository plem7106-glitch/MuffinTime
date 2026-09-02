import { describe, expect, it } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { executeActionFrameEffect } from './actionRules/registry';
import { executeTrapFrameEffect } from './trapRules/engine';
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

describe('Counter Phase 5C — Multi-Target & Scope Resolution Foundation (C07, C15, C22, C36, C39, C47)', () => {
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
            const isRedirectOrScope = ['C34', 'C35', 'C45', 'C40', 'C11', 'C07', 'C15', 'C22', 'C36', 'C39', 'C47'].includes(resolvingFrame.sourceCode);
            if (!isRedirectOrScope) {
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

  it('Test A — C07 (Wannabe Adds P3 as Affected Target to A124)', () => {
    let state = setupTestState();
    state.players['p3'].hand.push('C07');

    // P1 plays A124 ("Fat Man", force target to draw 5) targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P3 plays C07 to also be affected
    state = playCounterEngine(state, 'p3', 'C07', f1);
    state = skipCounterEngine(state);

    // Both P2 AND P3 draw 5 cards!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4 + 5);
  });

  it('Test B — C15 (Beep Beep I\'m a Sheep Expands Targeted A124 to All Players)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C15');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C15
    state = playCounterEngine(state, 'p2', 'C15', f1);
    state = skipCounterEngine(state);

    // All 3 players (P1, P2, P3) receive forced draw 5!
    expect(state.players['p1'].hand.length).toBe(4 + 5);
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4 + 5);
  });

  it('Test C — C22 Real Global Action Proof (Meow Meow I\'m a Cow Narrows Real Global Action A008 to Chosen Target P3)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C22');

    // P1 plays REAL global Action A008 ("Throw The Cheese", forces all other players to discard 1)
    state = resolveActionWithCounterWindow(state, 'p1', 'A008', [], 'all');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C22 choosing P3 as sole target
    state = playCounterEngine(state, 'p2', 'C22', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    // ONLY P3 discards 1 card! P1 and P2 discard 0!
    expect(state.players['p3'].hand.length).toBe(4 - 1); // 4 initial - 1 discarded = 3
    expect(state.players['p1'].hand.length).toBe(4);     // P1 untouched
    expect(state.players['p2'].hand.length).toBe(4);     // P2 untouched (C22 spent from 5 = 4)
  });

  it('Test D — C36 Real Trap Effect Proof (Thanks, You Too Causes REAL Trap T01 to Affect BOTH Victim P2 and Trap Owner P1)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C36');
    state.players['p1'].hand.push('T01');

    // P1 sets/activates REAL targeted Trap T01 ("Where Is It?", target discards 3 cards) targeting P2
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

    // P2 plays C36
    state = playCounterEngine(state, 'p2', 'C36', trapFrameId);
    state = skipCounterEngine(state);

    // REAL Trap T01 executes against BOTH P2 (victim) AND P1 (Trap owner)!
    // P2 discards 3 cards (4 initial + C36 spent - 3 discarded = 1 card remaining)
    // P1 discards 3 cards (4 initial + T01 spent - 3 discarded = 1 card remaining)
    expect(state.players['p2'].hand.length).toBe(1);
    expect(state.players['p1'].hand.length).toBe(1);

    // Physical Trap card T01 exists EXACTLY ONCE in discardPile
    expect(state.discardPile.filter((c) => c === 'T01')).toHaveLength(1);
  });

  it('Test E — C39 (We Failed Adds Chosen Player P3 to Targeted A124)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C39');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C39 choosing P3
    state = playCounterEngine(state, 'p2', 'C39', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    // BOTH P2 and P3 receive forced draw 5!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4 + 5);
  });

  it('Test F — C47 Real Global Action Proof (Party Pooper Narrows Real Global Action A008 to Only Source Actor P1)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C47');

    // P1 plays REAL global Action A008 ("Throw The Cheese")
    state = resolveActionWithCounterWindow(state, 'p1', 'A008', [], 'all');
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C47
    state = playCounterEngine(state, 'p2', 'C47', f1);
    state = skipCounterEngine(state);

    // ONLY P1 (Action source actor) discards 1 card! P2 and P3 discard 0!
    expect(state.players['p1'].hand.length).toBe(4 - 1); // P1 discards 1 = 3
    expect(state.players['p2'].hand.length).toBe(4);     // P2 untouched (C47 spent from 5 = 4)
    expect(state.players['p3'].hand.length).toBe(4);     // P3 untouched
  });

  it('Test G — Counter Cancelled (C15 Countered by C29 -> Target Remains Single Victim P2)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C15');
    state.players['p3'].hand.push('C29');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C15
    state = playCounterEngine(state, 'p2', 'C15', f1);
    const fC15 = getTopFrame(state)!.frameId;

    // P3 plays C29 countering C15
    state = playCounterEngine(state, 'p3', 'C29', fC15);
    state = skipCounterEngine(state);

    // C15 cancelled! Original single target P2 remains -> P2 draws 5; P1 and P3 draw 0!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p1'].hand.length).toBe(4);
    expect(state.players['p3'].hand.length).toBe(4);
  });

  it('Test H — Human Target Validation (C39 Self Choice Rejected)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C39');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 attempts to play C39 targeting self (P2)
    state = playCounterEngine(state, 'p2', 'C39', f1, { newTargetId: 'p2' });
    state = skipCounterEngine(state);

    // C39 self-target rejected in engine -> target remains P2 only -> P2 draws 5; P3 draws 0!
    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4);
  });

  it('Test I — Bot Path (Bot Passes Valid newTargetId via customPayload)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C39');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // Bot P2 plays C39 targeting P3
    state = playCounterEngine(state, 'p2', 'C39', f1, { newTargetId: 'p3' });
    state = skipCounterEngine(state);

    expect(state.players['p2'].hand.length).toBe(4 + 5);
    expect(state.players['p3'].hand.length).toBe(4 + 5);
  });

  it('Test J — Physical Integrity (Multi-Target Resolution Does Not Duplicate Source Card)', () => {
    let state = setupTestState();
    state.players['p2'].hand.push('C15');

    // P1 plays A124 targeting P2
    state = resolveActionWithCounterWindow(state, 'p1', 'A124', ['p2']);
    const f1 = getTopFrame(state)!.frameId;

    // P2 plays C15 (expands to all players)
    state = playCounterEngine(state, 'p2', 'C15', f1);
    state = skipCounterEngine(state);

    // Source card A124 appears EXACTLY ONCE in discardPile
    expect(state.discardPile.filter((c) => c === 'A124')).toHaveLength(1);
  });
});
