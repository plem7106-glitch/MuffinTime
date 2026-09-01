import { describe, it, expect } from 'vitest';
import {
  evaluateCardCount,
  executeDraw,
  executeAllDraw,
  executeDiscard,
  executeAllDiscard,
  executeDiscardDownTo,
  executeRandomSteal,
  executeAllRandomSteal,
  executeFullHandTransfer,
  executeHandSwapAndDeal,
  applyEffectModifier,
} from './primitives';
import type { RoomState, StackFrame } from './types';

function createMockRoom(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['D1', 'D2', 'D3', 'D4', 'D5'],
    discardPile: [],
    players: {
      p1: { name: 'P1', hand: ['A1', 'A2', 'A3'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'P2', hand: ['B1', 'B2'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'P3', hand: ['C1'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Insufficient-Card Policy & Effect Primitives', () => {
  describe('evaluateCardCount', () => {
    it('evaluates clamp_to_available policy', () => {
      const res = evaluateCardCount(5, 2, 'clamp_to_available');
      expect(res.requestedCount).toBe(5);
      expect(res.availableCount).toBe(2);
      expect(res.resolvedCount).toBe(2);
      expect(res.unfulfilledCount).toBe(3);
    });

    it('evaluates all_or_nothing policy when insufficient', () => {
      const res = evaluateCardCount(5, 2, 'all_or_nothing');
      expect(res.requestedCount).toBe(5);
      expect(res.availableCount).toBe(2);
      expect(res.resolvedCount).toBe(0);
      expect(res.unfulfilledCount).toBe(5);
    });

    it('evaluates all_or_nothing policy when sufficient', () => {
      const res = evaluateCardCount(3, 4, 'all_or_nothing');
      expect(res.resolvedCount).toBe(3);
      expect(res.unfulfilledCount).toBe(0);
    });
  });

  describe('executeDraw & executeAllDraw', () => {
    it('draws requested cards into player hand', () => {
      const state = createMockRoom();
      const next = executeDraw(state, 'p1', 2);
      expect(next.players.p1.hand).toEqual(['A1', 'A2', 'A3', 'D5', 'D4']);
      expect(next.drawPile).toEqual(['D1', 'D2', 'D3']);
    });

    it('draws cards for all players', () => {
      const state = createMockRoom();
      const next = executeAllDraw(state, 1);
      expect(next.players.p1.hand.length).toBe(4);
      expect(next.players.p2.hand.length).toBe(3);
      expect(next.players.p3.hand.length).toBe(2);
    });
  });

  describe('executeDiscard & executeAllDiscard', () => {
    it('discards specified amount and returns evaluation', () => {
      const state = createMockRoom();
      const res = executeDiscard(state, 'p1', 2);
      expect(res.evaluation.resolvedCount).toBe(2);
      expect(res.discardedCards.length).toBe(2);
      expect(res.state.players.p1.hand.length).toBe(1);
      expect(res.state.discardPile.length).toBe(2);
    });

    it('discards all players with optional excluded player', () => {
      const state = createMockRoom();
      const next = executeAllDiscard(state, 1, ['p1']);
      expect(next.players.p1.hand.length).toBe(3); // excluded
      expect(next.players.p2.hand.length).toBe(1);
      expect(next.players.p3.hand.length).toBe(0);
    });

    it('discards down to threshold', () => {
      const state = createMockRoom();
      // p1 has 3 cards, discard down to 1
      const res = executeDiscardDownTo(state, 'p1', 1);
      expect(res.discardedCount).toBe(2);
      expect(res.state.players.p1.hand.length).toBe(1);
    });
  });

  describe('executeRandomSteal & executeAllRandomSteal', () => {
    it('steals random cards from victim into thief hand', () => {
      const state = createMockRoom();
      const fixedRng = () => 0; // always pick first
      const res = executeRandomSteal(state, 'p1', 'p2', 2, fixedRng);
      expect(res.evaluation.resolvedCount).toBe(2);
      expect(res.stolenCards.length).toBe(2);
      expect(res.state.players.p1.hand.length).toBe(1);
      expect(res.state.players.p2.hand.length).toBe(4);
    });

    it('steals 1 card from all other players', () => {
      const state = createMockRoom();
      const next = executeAllRandomSteal(state, 'p3', 1);
      expect(next.players.p1.hand.length).toBe(2);
      expect(next.players.p2.hand.length).toBe(1);
      expect(next.players.p3.hand.length).toBe(3); // 1 original + 2 stolen
    });
  });

  describe('executeFullHandTransfer & executeHandSwapAndDeal', () => {
    it('transfers full hand from victim to receiver', () => {
      const state = createMockRoom();
      const next = executeFullHandTransfer(state, 'p1', 'p3');
      expect(next.players.p1.hand).toEqual([]);
      expect(next.players.p3.hand).toEqual(['C1', 'A1', 'A2', 'A3']);
    });

    it('swaps and deals hands evenly', () => {
      const state = createMockRoom();
      // p1 (3 cards) and p2 (2 cards) -> total 5 cards. Deal 3 to p1 and 2 to p2
      const next = executeHandSwapAndDeal(state, 'p1', 'p2');
      expect(next.players.p1.hand.length).toBe(3);
      expect(next.players.p2.hand.length).toBe(2);
    });
  });

  describe('applyEffectModifier', () => {
    it('modifies frame properties cleanly', () => {
      const frame: StackFrame = {
        frameId: 'f1',
        parentFrameId: null,
        sourceType: 'action',
        sourceCode: 'A01',
        actorId: 'p1',
        targetIds: ['p2'],
        targetScope: 'single',
        eligibleResponderIds: ['p2'],
        responses: {},
        modifiers: [],
        status: 'pending_responses',
        turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      };

      const redirected = applyEffectModifier(frame, {
        modifierId: 'm1',
        sourceFrameId: 'f1',
        type: 'redirect',
        newTargetIds: ['p3'],
      });
      expect(redirected.targetIds).toEqual(['p3']);

      const reflected = applyEffectModifier(frame, {
        modifierId: 'm2',
        sourceFrameId: 'f1',
        type: 'reflect',
      });
      expect(reflected.targetIds).toEqual(['p1']);
    });
  });
});
