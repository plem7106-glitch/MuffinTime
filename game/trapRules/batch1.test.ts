import { describe, it, expect } from 'vitest';
import {
  activateManualTrap,
  checkAndTriggerAutomaticTraps,
  initiateTrapInteraction,
  respondToTrapInteraction,
  executeTrapFrameEffect,
} from './engine';
import { getTrapRule } from './registry';
import { pushStackFrame, popStackFrame, getTopFrame, submitResponse } from '../reactionStack';
import { createGameEvent, GAME_EVENT_TYPES } from '../events';
import type { RoomState } from '../types';

function createMockRoom(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'],
    discardPile: [],
    players: {
      p1: { name: 'Player 1', hand: ['H1', 'H2', 'H3'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Player 2', hand: ['H4', 'H5', 'H6', 'H7', 'H8'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Player 3', hand: ['H9', 'H10', 'H11'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    turnPhase: 'main',
    reactionStack: [],
  };
}

describe('Trap Batch 1 (T01 - T10) Declarative Rules', () => {
  describe('T01 — Where Is It?', () => {
    it('activates manually with selected target and forces target to discard 3 cards upon resolution', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T01'];

      // Owner p1 manually activates T01 targeting p2
      state = activateManualTrap(state, 'p1', 'T01', ['p2']);
      expect(state.players.p1.traps).toEqual([]);

      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T01');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p2']);
      expect(top.eligibleResponderIds).toEqual(['p2']);

      // Execute resolved effect
      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(2); // 5 - 3 = 2
      expect(state.discardPile.length).toBe(4); // 1 (T01 trap card) + 3 (discarded cards)
    });
  });

  describe('T02 — Sniper Pug', () => {
    it('triggers automatically on forced discard and forces all other players to discard 1 card', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T02'];

      // p2 forces p1 to discard 2 cards
      const event = createGameEvent(
        GAME_EVENT_TYPES.FORCED_DISCARD,
        'p2',
        { victimId: 'p1', actorId: 'p2', count: 2 },
        ['p1']
      );

      state = checkAndTriggerAutomaticTraps(state, event);
      expect(state.players.p1.traps).toEqual([]);

      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T02');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p2', 'p3']); // all other players except p1
      expect(top.eligibleResponderIds).toEqual(['p2', 'p3']);

      // Execute resolved effect
      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(4); // 5 - 1 = 4
      expect(state.players.p3.hand.length).toBe(2); // 3 - 1 = 2
      expect(state.players.p1.hand.length).toBe(3); // untouched by T02
    });
  });

  describe('T03 — That\'s a Shame', () => {
    it('triggers automatically on forced discard and forces all players to discard the same count', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T03'];

      const event = createGameEvent(
        GAME_EVENT_TYPES.FORCED_DISCARD,
        'p2',
        { victimId: 'p1', actorId: 'p2', count: 2 },
        ['p1']
      );

      state = checkAndTriggerAutomaticTraps(state, event);
      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T03');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p1', 'p2', 'p3']); // all players

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p1.hand.length).toBe(1); // 3 - 2 = 1
      expect(state.players.p2.hand.length).toBe(3); // 5 - 2 = 3
      expect(state.players.p3.hand.length).toBe(1); // 3 - 2 = 1
    });
  });

  describe('T04 & T05 — Nice To Me / Needles', () => {
    it('triggers automatically when cards are stolen from owner and forces thief to discard 5 cards', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T04'];

      const event = createGameEvent(
        GAME_EVENT_TYPES.CARD_STOLEN,
        'p2',
        { victimId: 'p1', thiefId: 'p2', count: 1 },
        ['p1']
      );

      state = checkAndTriggerAutomaticTraps(state, event);
      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T04');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p2']);

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(0); // 5 - 5 = 0
      expect(state.discardPile.length).toBe(6); // 1 (T04 trap card) + 5 (discarded cards)
    });
  });

  describe('T06 — Inappropriate', () => {
    it('activates manually and steals 3 random unseen cards from target player', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T06'];

      state = activateManualTrap(state, 'p1', 'T06', ['p2']);
      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T06');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p2']);

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(2); // 5 - 3 = 2
      expect(state.players.p1.hand.length).toBe(6); // 3 + 3 = 6
    });
  });

  describe('T07 — Did Somebody Say _____?', () => {
    it('activates manually and forces target to discard 3 cards', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T07'];

      state = activateManualTrap(state, 'p1', 'T07', ['p2']);
      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T07');

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(2); // 5 - 3 = 2
    });
  });

  describe('T08 — 日本語テキスト', () => {
    it('activates manually and forces target to discard 3 cards', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T08'];

      state = activateManualTrap(state, 'p1', 'T08', ['p3']);
      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T08');
      expect(top.affectedPlayerIds).toEqual(['p3']);

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p3.hand.length).toBe(0); // 3 - 3 = 0
    });
  });

  describe('T09 — Card Sick', () => {
    it('triggers automatically when owner hand exceeds 10 cards and discards down to 10', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T09'];
      // P1 holds 13 cards (excess 3)
      state.players.p1.hand = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13'];

      state = checkAndTriggerAutomaticTraps(state);
      expect(state.players.p1.traps).toEqual([]);

      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T09');
      expect(top.triggerPlayerIds).toEqual(['p1']);
      expect(top.affectedPlayerIds).toEqual(['p1']);

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p1.hand.length).toBe(10); // exactly 10 cards
      expect(state.discardPile.length).toBe(4); // 1 (T09 trap card) + 3 (excess discarded cards)
    });
  });

  describe('T10 — Just Friends (Interactive Date Invite)', () => {
    it('Branch 1: Target accepts date -> condition fails, 0 cards stolen, trap remains placed', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T10'];

      // P1 initiates T10 asking P2 on a date
      state = initiateTrapInteraction(state, 'p1', 'T10', 'p2');
      expect(state.pendingInteraction).toBeDefined();
      expect(state.pendingInteraction?.type).toBe('date_invite');
      expect(state.pendingInteraction?.targetPlayerId).toBe('p2');

      // P2 accepts the invitation
      state = respondToTrapInteraction(state, state.pendingInteraction!.interactionId, 'p2', 'accept');
      expect(state.pendingInteraction).toBeNull();
      // Condition failed: trap was not sprung and remains in p1 active traps
      expect(state.players.p1.traps).toEqual(['T10']);
      expect(state.players.p2.hand.length).toBe(5);
      expect(state.players.p1.hand.length).toBe(3);
    });

    it('Branch 2: Target refuses date -> condition succeeds, activates T10 on stack and steals 3 cards', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T10'];

      // P1 initiates T10 asking P2 on a date
      state = initiateTrapInteraction(state, 'p1', 'T10', 'p2');
      const interactionId = state.pendingInteraction!.interactionId;

      // P2 refuses the date!
      state = respondToTrapInteraction(state, interactionId, 'p2', 'refuse');
      expect(state.pendingInteraction).toBeNull();
      expect(state.players.p1.traps).toEqual([]);

      const top = getTopFrame(state)!;
      expect(top.sourceCode).toBe('T10');
      expect(top.triggerPlayerIds).toEqual(['p2']);
      expect(top.affectedPlayerIds).toEqual(['p2']);

      state = executeTrapFrameEffect(state, top);
      expect(state.players.p2.hand.length).toBe(2); // 5 - 3 = 2
      expect(state.players.p1.hand.length).toBe(6); // 3 + 3 = 6
    });

    it('does not overwrite an already-pending interaction (single-slot occupancy guard)', () => {
      let state = createMockRoom();
      state.players.p1.traps = ['T10'];
      state.players.p3.traps = ['T10'];

      // P1 initiates T10 asking P2 on a date
      state = initiateTrapInteraction(state, 'p1', 'T10', 'p2');
      const firstInteractionId = state.pendingInteraction!.interactionId;

      // While that's still pending, P3 tries to initiate a second T10 -- should no-op
      // and leave the first interaction (same interactionId) untouched.
      state = initiateTrapInteraction(state, 'p3', 'T10', 'p2');
      expect(state.pendingInteraction?.interactionId).toBe(firstInteractionId);
    });
  });

  describe('Nested Traps Execution', () => {
    it('supports a Trap effect triggering a subsequent automatic Trap', () => {
      let state = createMockRoom();
      // P1 has T06 ("Inappropriate" steal 3), P2 has T04 ("Nice To Me" discard 5 on steal)
      state.players.p1.traps = ['T06'];
      state.players.p2.traps = ['T04'];

      // P1 activates T06 on P2
      state = activateManualTrap(state, 'p1', 'T06', ['p2']);
      const t06Frame = getTopFrame(state)!;

      // Resolve T06 (P1 steals 3 cards from P2)
      state = executeTrapFrameEffect(state, t06Frame);
      const { state: stateAfterPop } = popStackFrame(state);

      // Emitted steal event
      const stealEvent = createGameEvent(
        GAME_EVENT_TYPES.CARD_STOLEN,
        'p1',
        { victimId: 'p2', thiefId: 'p1', count: 3 },
        ['p2']
      );

      // Automatic trap check triggers P2's T04!
      state = checkAndTriggerAutomaticTraps(stateAfterPop, stealEvent);
      expect(state.players.p2.traps).toEqual([]);

      const t04Frame = getTopFrame(state)!;
      expect(t04Frame.sourceCode).toBe('T04');
      expect(t04Frame.triggerPlayerIds).toEqual(['p1']);
      expect(t04Frame.affectedPlayerIds).toEqual(['p1']);

      // Resolve T04 (P1 must discard 5 cards)
      state = executeTrapFrameEffect(state, t04Frame);
      expect(state.players.p1.hand.length).toBe(1); // 6 - 5 = 1
    });
  });
});
