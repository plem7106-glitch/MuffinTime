import { describe, expect, it } from 'vitest';
import { resolveCompletedStackFrames, applyPlayDoubledAction } from './session';
import { getActionRule } from '../game/actionRules/registry';
import type { RoomState } from '../game/types';

describe('resolveCompletedStackFrames', () => {
  it('a doubled action frame invokes the card\'s effect twice', () => {
    // A127 "My Lemons" discards 4 fixed cards from the actor's hand with no target.
    const rule = getActionRule('A127')!;
    expect(rule).toBeTruthy();
    const state = {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: ['A127', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      reactionStack: [{
        frameId: 'f1', parentFrameId: null, sourceType: 'action', sourceCode: 'A127',
        actorId: 'me', targetIds: [], targetScope: 'all', eligibleResponderIds: [], responses: {},
        modifiers: [], status: 'pending_responses',
        turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
        customPayload: { doubled: true },
      }],
    } as unknown as RoomState;
    const next = resolveCompletedStackFrames(state);
    // A127 discards a fixed 4 cards; doubled should discard 8 total (if the actor has enough).
    expect(next.players.me.hand.length).toBe(9 - 8); // started with 9 cards (A127 + 8 others), discards 8 total
  });

  it('a non-doubled action frame invokes the effect exactly once', () => {
    const state = {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: ['A127', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      reactionStack: [{
        frameId: 'f1', parentFrameId: null, sourceType: 'action', sourceCode: 'A127',
        actorId: 'me', targetIds: [], targetScope: 'all', eligibleResponderIds: [], responses: {},
        modifiers: [], status: 'pending_responses',
        turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      }],
    } as unknown as RoomState;
    const next = resolveCompletedStackFrames(state);
    expect(next.players.me.hand.length).toBe(9 - 4); // discards only 4, no doubled flag
  });

  it('a doubled multi-target action frame compounds the effect for EVERY target, not just the first', () => {
    // A038 "Die Potato" discards a fixed 3 cards from frame.targetIds[0].
    // executeActionFrameEffect (game/actionRules/registry.ts) loops per-target
    // when frame.targetIds.length > 1, invoking executeEffect once per target
    // via a single-target subFrame. Doubling should make every target lose
    // 3 * 2 = 6 cards, not just the first target processed.
    const rule = getActionRule('A038')!;
    expect(rule).toBeTruthy();
    const state = {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'Three', hand: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      reactionStack: [{
        frameId: 'f1', parentFrameId: null, sourceType: 'action', sourceCode: 'A038',
        actorId: 'me', targetIds: ['p2', 'p3'], targetScope: 'all', eligibleResponderIds: [], responses: {},
        modifiers: [], status: 'pending_responses',
        turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
        customPayload: { doubled: true },
      }],
    } as unknown as RoomState;
    const next = resolveCompletedStackFrames(state);
    // Each target started with 8 cards and should lose 3 * 2 = 6 (doubled), leaving 2.
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('strips the one-shot doubled flag before persisting to recentActionPlays history', () => {
    // A038 doubled: the resolved frame's history entry must not carry
    // `doubled` forward, or a later replay (e.g. A094) would compound it
    // into a double-doubled invocation instead of repeating the effect once.
    const state = {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      reactionStack: [{
        frameId: 'f1', parentFrameId: null, sourceType: 'action', sourceCode: 'A038',
        actorId: 'me', targetIds: ['p2'], targetScope: 'single', eligibleResponderIds: [], responses: {},
        modifiers: [], status: 'pending_responses',
        turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
        customPayload: { doubled: true, numericMultiplier: 2 },
      }],
    } as unknown as RoomState;
    const next = resolveCompletedStackFrames(state);
    const entry = next.recentActionPlays?.[0];
    expect(entry?.code).toBe('A038');
    // `doubled` must not survive into history...
    expect((entry?.customPayload as Record<string, unknown> | undefined)?.doubled).toBeFalsy();
    // ...while other keys from the original customPayload are preserved.
    expect((entry?.customPayload as Record<string, unknown> | undefined)?.numericMultiplier).toBe(2);

    // A094 replaying this history entry must not inherit a truthy `doubled`
    // (which would otherwise double-double the replayed effect).
    const a094Rule = getActionRule('A094')!;
    const replayed = a094Rule.executeEffect(next, {
      frameId: 'f2', parentFrameId: null, sourceType: 'action', sourceCode: 'A094',
      actorId: 'me', targetIds: [], targetScope: 'single', eligibleResponderIds: [], responses: {},
      modifiers: [], status: 'resolving',
      turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
    } as unknown as Parameters<typeof a094Rule.executeEffect>[1]);
    const pushedFrame = replayed.reactionStack?.[replayed.reactionStack.length - 1];
    expect(pushedFrame?.customPayload?.doubled).toBeFalsy();
  });
});

describe('playDoubledAction', () => {
  function readyState(overrides: Partial<RoomState> = {}): RoomState {
    return {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      turnPhase: 'main',
      drawPile: [],
      discardPile: [],
      players: {
        me: {
          name: 'Me',
          hand: ['A028'],
          traps: [],
          connected: true,
          hasCalledMuffinTime: false,
          skipNextTurn: false,
          hasDrawnThisTurn: false,
          hasPlayedActionThisTurn: false,
        },
        p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      ...overrides,
    } as unknown as RoomState;
  }

  it('does nothing when the partner code is not a qualifying quantity card', () => {
    // A119 is confirmed excluded from QUANTITY_EFFECT_CARDS.
    const state = readyState();
    state.players.me.hand = ['A028', 'A119'];
    const next = applyPlayDoubledAction(state, 'me', 'A119');
    expect(next).toEqual(state);
    expect(next.players.me.hand).toEqual(expect.arrayContaining(['A028', 'A119']));
    expect(next.reactionStack ?? []).toEqual([]);
  });

  it('discards both A028 and the partner card, pushing one frame with doubled: true', () => {
    // A127 "My Lemons" discards a fixed 4 cards from the actor, no target needed.
    const rule = getActionRule('A127')!;
    expect(rule).toBeTruthy();
    const state = readyState();
    state.players.me.hand = ['A028', 'A127'];
    const next = applyPlayDoubledAction(state, 'me', 'A127');
    expect(next.players.me.hand).not.toContain('A028');
    expect(next.players.me.hand).not.toContain('A127');
    expect(next.reactionStack?.length).toBe(1);
    const pushed = next.reactionStack?.[0];
    expect(pushed?.sourceCode).toBe('A127');
    expect(pushed?.customPayload?.doubled).toBe(true);
  });

  it('supports a targeted partner card, passing the target through', () => {
    // A077 "Got Your Nose" steals 1 card from another player -- needsTargetSelection.
    const rule = getActionRule('A077')!;
    expect(rule).toBeTruthy();
    const state = readyState();
    state.players.me.hand = ['A028', 'A077'];
    const next = applyPlayDoubledAction(state, 'me', 'A077', 'p2');
    expect(next.players.me.hand).not.toContain('A028');
    expect(next.players.me.hand).not.toContain('A077');
    expect(next.reactionStack?.length).toBe(1);
    const pushed = next.reactionStack?.[0];
    expect(pushed?.sourceCode).toBe('A077');
    expect(pushed?.targetIds).toEqual(['p2']);
    expect(pushed?.customPayload?.doubled).toBe(true);
  });
});
