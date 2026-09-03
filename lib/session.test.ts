import { describe, expect, it } from 'vitest';
import { resolveCompletedStackFrames } from './session';
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
});
