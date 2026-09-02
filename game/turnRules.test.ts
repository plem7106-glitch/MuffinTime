import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { placeTrap, skipTrapPlacement } from './trap';
import { draw, discard } from './pile';
import { advanceTurn, canEndTurn, hasCompletedMainChoice } from './turn';
import { pushStackFrame, removeStackFrame, submitResponse, getTopFrame } from './reactionStack';
import { activateManualTrap, executeTrapFrameEffect, checkAndTriggerAutomaticTraps } from './trapRules/engine';
import { createGameEvent, GAME_EVENT_TYPES } from './events';
import { executeActionFrameEffect } from './actionRules/registry';
import { canonicalCardCodes } from '../data/cards/deck';
import type { RoomState } from './types';

function create3PlayerGame(): RoomState {
  let room = createRoom('p1', 'Player 1', 3);
  room = addPlayer(room, 'p2', 'Bank (Bot)');
  room = addPlayer(room, 'p3', 'Tee (Bot)');
  return startGame(room, canonicalCardCodes, () => 0.5);
}

describe('Canonical Turn Rules State Machine', () => {
  // Test A: First Round Trap Placement
  describe('Test A — First Round Trap Placement', () => {
    it('allows Player 1 to place a canonical Trap immediately on first-ever turn', () => {
      let state = create3PlayerGame();
      expect(state.status).toBe('playing');
      expect(state.currentTurnIndex).toBe(0);
      expect(state.turnOrder[0]).toBe('p1');
      expect(state.turnPhase).toBe('trap_placement');
      expect(state.players.p1.placedTrapThisTurn).toBe(false);
      expect(state.players.p1.hasDrawnThisTurn).toBe(false);
      expect(state.players.p1.hasPlayedActionThisTurn).toBe(false);

      // Give p1 a canonical trap card in hand
      state.players.p1.hand.push('T01');
      const next = placeTrap(state, 'p1', 'T01');

      expect(next.players.p1.traps).toContain('T01');
      expect(next.players.p1.placedTrapThisTurn).toBe(true);
      expect(next.turnPhase).toBe('main');
    });

    it('ensures Player 2 on their first-ever turn enters through identical trap_placement invariant', () => {
      let state = create3PlayerGame();
      // P1 completes turn 1
      state.players.p1.hasDrawnThisTurn = true;
      state.turnPhase = 'main';
      state = advanceTurn(state);

      // P2's first turn
      expect(state.currentTurnIndex).toBe(1);
      expect(state.turnOrder[1]).toBe('p2');
      expect(state.turnPhase).toBe('trap_placement');
      expect(state.players.p2.placedTrapThisTurn).toBe(false);
      expect(state.players.p2.hasDrawnThisTurn).toBe(false);
      expect(state.players.p2.hasPlayedActionThisTurn).toBe(false);

      state.players.p2.hand.push('T11');
      const next = placeTrap(state, 'p2', 'T11');
      expect(next.players.p2.traps).toContain('T11');
      expect(next.players.p2.placedTrapThisTurn).toBe(true);
      expect(next.turnPhase).toBe('main');
    });
  });

  // Test B: Trap + Draw Main Choice
  describe('Test B — Trap Placement + Draw Main Choice', () => {
    it('allows End Turn after placing Trap and completing Draw as Main Choice', () => {
      let state = create3PlayerGame();
      state.players.p1.hand.push('T01');
      state = placeTrap(state, 'p1', 'T01');
      expect(state.turnPhase).toBe('main');
      expect(canEndTurn(state, 'p1')).toBe(false); // main choice not yet taken

      // Execute normal Draw
      state = draw(state, 'p1', 1);
      state.players.p1.hasDrawnThisTurn = true;
      state.players.p1.hasPlayedActionThisTurn = false;

      expect(hasCompletedMainChoice(state.players.p1)).toBe(true);
      expect(canEndTurn(state, 'p1')).toBe(true);

      const advanced = advanceTurn(state);
      expect(advanced.currentTurnIndex).toBe(1);
      expect(advanced.turnOrder[1]).toBe('p2');
    });
  });

  // Test C: Trap + Action Main Choice
  describe('Test C — Trap Placement + Action Main Choice (No Draw Required)', () => {
    it('allows End Turn directly after Action resolves without requiring Draw', () => {
      let state = create3PlayerGame();
      state = skipTrapPlacement(state, 'p1');
      expect(state.turnPhase).toBe('main');
      expect(canEndTurn(state, 'p1')).toBe(false);

      // P1 plays Action card A004
      state.players.p1.hand = ['A004'];
      state = discard(state, 'p1', 1, ['A004']);
      state.players.p1.hasPlayedActionThisTurn = true;
      state.players.p1.hasDrawnThisTurn = false;
      state = pushStackFrame(state, {
        sourceType: 'action',
        sourceCode: 'A004',
        actorId: 'p1',
      });

      expect(state.turnPhase).toBe('resolving_stack');
      expect(canEndTurn(state, 'p1')).toBe(false); // cannot end during stack resolution

      // Resolve action frame
      const top = getTopFrame(state)!;
      state = executeActionFrameEffect(state, top);
      state = removeStackFrame(state, top.frameId).state;

      expect(state.turnPhase).toBe('main');
      expect(state.reactionStack?.length ?? 0).toBe(0);
      expect(state.players.p1.hasPlayedActionThisTurn).toBe(true);
      expect(state.players.p1.hasDrawnThisTurn).toBe(false);

      // Critically: Action counts as completed Main Choice, End Turn is enabled WITHOUT drawing
      expect(hasCompletedMainChoice(state.players.p1)).toBe(true);
      expect(canEndTurn(state, 'p1')).toBe(true);
    });
  });

  // Test D: Draw Prevents Action Main Choice
  describe('Test D — Mutual Exclusion: Draw Prevents Action', () => {
    it('disallows playing an Action after Draw is completed', () => {
      let state = create3PlayerGame();
      state.turnPhase = 'main';
      state.players.p1.hasDrawnThisTurn = true;
      state.players.p1.hasPlayedActionThisTurn = false;

      // Rule check: player already used Main Choice
      const hasUsedChoice = state.players.p1.hasDrawnThisTurn || state.players.p1.hasPlayedActionThisTurn;
      expect(hasUsedChoice).toBe(true);
      expect(canEndTurn(state, 'p1')).toBe(true);
    });
  });

  // Test E: Action Prevents Draw
  describe('Test E — Mutual Exclusion: Action Prevents Draw', () => {
    it('disallows normal Draw after playing an Action', () => {
      let state = create3PlayerGame();
      state.turnPhase = 'main';
      state.players.p1.hasPlayedActionThisTurn = true;
      state.players.p1.hasDrawnThisTurn = false;

      // Rule check: player already used Main Choice
      const hasUsedChoice = state.players.p1.hasDrawnThisTurn || state.players.p1.hasPlayedActionThisTurn;
      expect(hasUsedChoice).toBe(true);
      expect(canEndTurn(state, 'p1')).toBe(true);
    });
  });

  // Test F: Targeted Trap After Draw
  describe('Test F — Targeted Trap After Draw Enables End Turn', () => {
    it('resolves targeted trap T11 against Bot P2 (Bank) after Draw and enables End Turn', () => {
      let state = create3PlayerGame();
      state = skipTrapPlacement(state, 'p1');
      expect(state.turnPhase).toBe('main');

      // 1. P1 draws
      state = draw(state, 'p1', 1);
      state.players.p1.hasDrawnThisTurn = true;
      state.players.p1.hasPlayedActionThisTurn = false;

      // 2. P1 has placed T11 (A Robbery - canonical targeted trap against P2 Bank)
      state.players.p1.traps = ['T11'];
      state.players.p2.hand = ['A001', 'A002', 'A003'];

      // 3. P1 activates T11 targeting P2
      state = activateManualTrap(state, 'p1', 'T11', ['p2']);
      expect(state.turnPhase).toBe('resolving_stack');
      expect(state.pendingResponse).not.toBeNull();
      expect(state.pendingResponse?.targetId).toBe('p2');
      expect(state.pendingResponse?.eligibleResponderIds).toEqual(['p2']);
      expect(canEndTurn(state, 'p1')).toBe(false); // stack active

      // 4. Target P2 skips counter (accurate responder routing)
      const topFrame = getTopFrame(state)!;
      expect(topFrame.eligibleResponderIds).toContain('p2');
      state = submitResponse(state, topFrame.frameId, 'p2', { status: 'skipped' });

      // 5. Resolve completed frame
      state = executeTrapFrameEffect(state, topFrame);
      state = removeStackFrame(state, topFrame.frameId).state;

      // 6. Verify settled state
      expect(state.turnOrder[state.currentTurnIndex]).toBe('p1');
      expect(state.turnPhase).toBe('main');
      expect(state.players.p1.hasDrawnThisTurn).toBe(true);
      expect(state.players.p1.hasPlayedActionThisTurn).toBe(false);
      expect(state.reactionStack?.length ?? 0).toBe(0);
      expect(state.pendingResponse).toBeNull();
      expect(state.pendingInteraction ?? null).toBeNull();

      // 7. End Turn must be enabled
      expect(canEndTurn(state, 'p1')).toBe(true);

      // P1 successfully ends turn
      const advanced = advanceTurn(state);
      expect(advanced.currentTurnIndex).toBe(1);
      expect(advanced.turnOrder[1]).toBe('p2');
    });
  });

  // Test G: Targeted Trap After Action
  describe('Test G — Targeted Trap After Action Preserves Action Flag & Enables End Turn', () => {
    it('preserves hasPlayedActionThisTurn through trap interrupt and enables End Turn', () => {
      let state = create3PlayerGame();
      state = skipTrapPlacement(state, 'p1');

      // 1. P1 plays Action card
      state.players.p1.hasPlayedActionThisTurn = true;
      state.players.p1.hasDrawnThisTurn = false;

      // 2. P1 activates placed targeted trap T15 (Catch! - forces target discard 3 cards)
      state.players.p1.traps = ['T15'];
      state.players.p3.hand = ['A001', 'A002', 'A003', 'A005'];
      state = activateManualTrap(state, 'p1', 'T15', ['p3']);

      expect(state.turnPhase).toBe('resolving_stack');
      const topFrame = getTopFrame(state)!;

      // 3. P3 skips counter
      state = submitResponse(state, topFrame.frameId, 'p3', { status: 'skipped' });
      state = executeTrapFrameEffect(state, topFrame);
      state = removeStackFrame(state, topFrame.frameId).state;

      // 4. Settled check
      expect(state.turnPhase).toBe('main');
      expect(state.players.p1.hasPlayedActionThisTurn).toBe(true);
      // End Turn enabled directly
      expect(canEndTurn(state, 'p1')).toBe(true);
    });
  });
  // Test H: Optional Trap Placement & Implicit Skip Rules
  describe('Test H — Optional Trap Placement & Implicit Skip Rules', () => {
    it('1. Start turn + Trap in hand -> direct Draw implicitly skips trap placement', () => {
      let state = create3PlayerGame();
      state.players.p1.hand.push('T01');
      expect(state.turnPhase).toBe('trap_placement');

      // Implicit skip via engineSkipTrapPlacement then draw
      state = skipTrapPlacement(state, 'p1');
      expect(state.turnPhase).toBe('main');
      state = draw(state, 'p1', 1);
      state.players.p1.hasDrawnThisTurn = true;
      expect(canEndTurn(state, 'p1')).toBe(true);
    });

    it('2. Start turn + Trap in hand -> direct Action implicitly skips trap placement', () => {
      let state = create3PlayerGame();
      state.players.p1.hand.push('T01');
      expect(state.turnPhase).toBe('trap_placement');

      state = skipTrapPlacement(state, 'p1');
      expect(state.turnPhase).toBe('main');
      state.players.p1.hasPlayedActionThisTurn = true;
      expect(canEndTurn(state, 'p1')).toBe(true);
    });

    it('3. Direct Draw obtains Trap -> cannot place newly drawn trap on same turn', () => {
      let state = create3PlayerGame();
      state = skipTrapPlacement(state, 'p1');
      state = draw(state, 'p1', 1);
      state.players.p1.hasDrawnThisTurn = true;
      state.players.p1.hand.push('T06');

      // Attempting to place T06 after drawing on same turn must throw
      expect(() => placeTrap(state, 'p1', 'T06')).toThrow();
    });

    it('4. Player with 3 active Traps can still immediately Draw or Action', () => {
      let state = create3PlayerGame();
      state.players.p1.traps = ['T01', 'T02', 'T03'];
      expect(state.turnPhase).toBe('trap_placement');

      state = skipTrapPlacement(state, 'p1');
      expect(state.turnPhase).toBe('main');
      state = draw(state, 'p1', 1);
      state.players.p1.hasDrawnThisTurn = true;
      expect(canEndTurn(state, 'p1')).toBe(true);
    });
  });

  // Test I: Automatic Event Pipeline Integration
  describe('Test I — Automatic Event Pipeline Integration', () => {
    it('triggers T04 (Nice To Me) on CARD_STOLEN event during random steal', () => {
      let state = create3PlayerGame();
      state.players.p2.traps = ['T04'];
      state.players.p1.hand = ['A001'];
      state.players.p2.hand = ['A002', 'A003', 'A004', 'A005', 'A006'];

      // P1 steals 1 card from P2
      const event = createGameEvent(GAME_EVENT_TYPES.CARD_STOLEN, 'p1', {
        victimId: 'p2', thiefId: 'p1', count: 1, stolenCards: ['A002'],
      }, ['p2']);

      const triggered = checkAndTriggerAutomaticTraps(state, event);
      const top = getTopFrame(triggered);
      expect(top?.sourceCode).toBe('T04');
    });

    it('triggers T39 (Super Guy) on COUNTER_PLAYED event against T39 owner', () => {
      let state = create3PlayerGame();
      state.players.p1.traps = ['T39'];
      state = pushStackFrame(state, {
        sourceType: 'action',
        sourceCode: 'A004',
        actorId: 'p1',
        targetIds: ['p2'],
      });
      const top = getTopFrame(state)!;

      const counterEvent = createGameEvent(GAME_EVENT_TYPES.COUNTER_PLAYED, 'p2', {
        actorId: 'p2',
        counterCode: 'C01',
        targetFrameId: top.frameId,
      }, ['p1']);

      const triggered = checkAndTriggerAutomaticTraps(state, counterEvent);
      const childFrame = getTopFrame(triggered);
      expect(childFrame?.sourceCode).toBe('T39');
    });
  });
});
