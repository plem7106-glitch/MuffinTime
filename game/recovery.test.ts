import { describe, it, expect } from 'vitest';
import { executeManualRecoveryDiscard, executeManualRecoveryGive } from './recovery';
import { createRoom, addPlayer, startGame } from './room';
import { GAME_EVENT_TYPES } from './events';

describe('Manual Bug Recovery System', () => {
  function setupTestState() {
    let state = createRoom('host-p1', 'Player 1', 3);
    state = addPlayer(state, 'p2', 'Player 2');
    state = addPlayer(state, 'p3', 'Player 3');
    state = startGame(state, ['A001', 'A002', 'A003', 'T01', 'T02', 'C01', 'C02', 'C03', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010']);
    return state;
  }

  describe('Manual Discard (executeManualRecoveryDiscard)', () => {
    it('moves exact selected physical cards from hand to discardPile', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      expect(p1Hand.length).toBeGreaterThanOrEqual(2);

      const cardsToDiscard = [p1Hand[0], p1Hand[1]];
      const initialDiscardLen = state.discardPile.length;

      const next = executeManualRecoveryDiscard(state, 'host-p1', cardsToDiscard);

      // Verify exact cards removed from hand
      expect(next.players['host-p1'].hand.length).toBe(p1Hand.length - 2);
      expect(next.players['host-p1'].hand.includes(cardsToDiscard[0])).toBe(false);
      expect(next.players['host-p1'].hand.includes(cardsToDiscard[1])).toBe(false);

      // Verify exact cards appended to discardPile
      expect(next.discardPile.length).toBe(initialDiscardLen + 2);
      expect(next.discardPile.slice(-2)).toEqual(cardsToDiscard);
    });

    it('preserves non-selected cards in hand', () => {
      const state = setupTestState();
      const p1Hand = [...state.players['host-p1'].hand];
      const cardToDiscard = p1Hand[0];
      const remainingExpected = p1Hand.slice(1);

      const next = executeManualRecoveryDiscard(state, 'host-p1', [cardToDiscard]);
      expect(next.players['host-p1'].hand).toEqual(remainingExpected);
    });

    it('rejects invalid/non-existent card codes with no state mutation', () => {
      const state = setupTestState();
      const next = executeManualRecoveryDiscard(state, 'host-p1', ['INVALID_CODE_999']);
      expect(next).toBe(state);
    });

    it('rejects duplicate card code selection in a single request', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const card = p1Hand[0];

      // Requesting the same card code twice in array
      const next = executeManualRecoveryDiscard(state, 'host-p1', [card, card]);
      expect(next).toBe(state);
    });

    it('rejects empty selection with no state mutation', () => {
      const state = setupTestState();
      const next = executeManualRecoveryDiscard(state, 'host-p1', []);
      expect(next).toBe(state);
    });

    it('does NOT emit FORCED_DISCARD, ACTION_PLAYED, or open Reaction Stack', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const next = executeManualRecoveryDiscard(state, 'host-p1', [p1Hand[0]]);

      // Reaction Stack is empty
      expect(next.reactionStack ?? []).toEqual([]);

      // Events contain ONLY MANUAL_RECOVERY_DISCARD
      const events = next.gameEvents ?? [];
      expect(events.some((e) => e.type === GAME_EVENT_TYPES.FORCED_DISCARD)).toBe(false);
      expect(events.some((e) => e.type === GAME_EVENT_TYPES.ACTION_PLAYED)).toBe(false);
      expect(events.some((e) => e.type === GAME_EVENT_TYPES.CARD_STOLEN)).toBe(false);

      const recoveryEvent = events.find((e) => e.type === GAME_EVENT_TYPES.MANUAL_RECOVERY_DISCARD);
      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent?.payload).toEqual({ actorId: 'host-p1', count: 1 });
    });
  });

  describe('Manual Give (executeManualRecoveryGive)', () => {
    it('transfers exact selected cards from sender.hand to recipient.hand', () => {
      const state = setupTestState();
      const p1Hand = [...state.players['host-p1'].hand];
      const p2HandLen = state.players['p2'].hand.length;

      const cardsToGive = [p1Hand[0]];
      const next = executeManualRecoveryGive(state, 'host-p1', 'p2', cardsToGive);

      // Verify removed from sender
      expect(next.players['host-p1'].hand.length).toBe(p1Hand.length - 1);
      expect(next.players['host-p1'].hand.includes(cardsToGive[0])).toBe(false);

      // Verify added to recipient
      expect(next.players['p2'].hand.length).toBe(p2HandLen + 1);
      expect(next.players['p2'].hand.slice(-1)).toEqual(cardsToGive);
    });

    it('rejects sender === recipient with no state mutation', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const next = executeManualRecoveryGive(state, 'host-p1', 'host-p1', [p1Hand[0]]);
      expect(next).toBe(state);
    });

    it('rejects invalid recipient ID with no state mutation', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const next = executeManualRecoveryGive(state, 'host-p1', 'non-existent-player', [p1Hand[0]]);
      expect(next).toBe(state);
    });

    it('rejects duplicate card code selection in a single request', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const card = p1Hand[0];

      const next = executeManualRecoveryGive(state, 'host-p1', 'p2', [card, card]);
      expect(next).toBe(state);
    });

    it('does NOT emit CARD_STOLEN, ACTION_PLAYED, or open Reaction Stack', () => {
      const state = setupTestState();
      const p1Hand = state.players['host-p1'].hand;
      const next = executeManualRecoveryGive(state, 'host-p1', 'p2', [p1Hand[0]]);

      // Reaction Stack is empty
      expect(next.reactionStack ?? []).toEqual([]);

      // Events contain ONLY MANUAL_RECOVERY_TRANSFER
      const events = next.gameEvents ?? [];
      expect(events.some((e) => e.type === GAME_EVENT_TYPES.CARD_STOLEN)).toBe(false);
      expect(events.some((e) => e.type === GAME_EVENT_TYPES.FORCED_DISCARD)).toBe(false);

      const recoveryEvent = events.find((e) => e.type === GAME_EVENT_TYPES.MANUAL_RECOVERY_TRANSFER);
      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent?.payload).toEqual({ actorId: 'host-p1', recipientId: 'p2', count: 1 });
    });
  });
});
