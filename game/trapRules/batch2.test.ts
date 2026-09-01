import { describe, expect, it } from 'vitest';
import { activateManualTrap, executeTrapFrameEffect, checkAndTriggerAutomaticTraps } from './engine';
import { getTrapRule, isTrapImplemented } from './registry';
import { getTopFrame, pushStackFrame, popStackFrame } from '../reactionStack';
import { createGameEvent, GAME_EVENT_TYPES } from '../events';
import { placeTrap } from '../trap';
import { advanceTurn } from '../turn';
import type { RoomState } from '../types';

function room(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    seatOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'],
    discardPile: [],
    turnPhase: 'trap_placement',
    reactionStack: [],
    sequenceNumber: 1,
    players: {
      p1: { name: 'One', hand: ['a', 'b', 'c', 'T52', 'T53'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['d', 'e', 'f', 'g', 'h'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['i', 'j', 'k', 'l'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Trap Batch 2 & 3 (T11-T66) Declarative Rules', () => {
  it('Registry Completeness: T01 through T66 must all be implemented in registry', () => {
    for (let i = 1; i <= 66; i++) {
      const code = `T${i.toString().padStart(2, '0')}`;
      expect(isTrapImplemented(code), `Trap ${code} should be implemented in registry`).toBe(true);
      expect(getTrapRule(code), `Trap rule ${code} should exist`).toBeDefined();
    }
  });

  it.each(['T11', 'T13', 'T14', 'T17', 'T18', 'T19', 'T20', 'T38', 'T51', 'T54', 'T56', 'T57', 'T59', 'T61', 'T62', 'T66'])(
    '%s manual steal from target',
    (code) => {
      const state = room();
      state.players.p1.traps = [code];
      const activated = activateManualTrap(state, 'p1', code, ['p2']);
      const frame = getTopFrame(activated)!;
      expect(frame.triggerPlayerIds).toEqual(['p2']);
      expect(frame.affectedPlayerIds).toEqual(['p2']);
      const resolved = executeTrapFrameEffect(activated, frame);
      expect(resolved.players.p2.hand.length).toBeLessThan(5);
    }
  );

  it.each(['T15', 'T16', 'T33', 'T34', 'T35', 'T36', 'T37', 'T40', 'T41', 'T44', 'T47', 'T48', 'T49', 'T50', 'T55', 'T58', 'T60', 'T63', 'T64', 'T65'])(
    '%s manual discard from target',
    (code) => {
      const state = room();
      state.players.p1.traps = [code];
      const activated = activateManualTrap(state, 'p1', code, ['p2']);
      const frame = getTopFrame(activated)!;
      const resolved = executeTrapFrameEffect(activated, frame);
      expect(resolved.players.p2.hand.length).toBeLessThan(5);
    }
  );

  it('T31: Action played on T31 owner triggers automatic trap and applies effect to actor', () => {
    const state = room();
    state.players.p1.traps = ['T31'];
    const event = createGameEvent(
      GAME_EVENT_TYPES.ACTION_PLAYED,
      'p2',
      { actorId: 'p2', actionCode: 'A001', targetId: 'p1' },
      ['p1']
    );
    const triggered = checkAndTriggerAutomaticTraps(state, event);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T31');
    expect(top.triggerPlayerIds).toEqual(['p2']);
  });

  it('T32: Steals target\'s entire hand', () => {
    const state = room();
    state.players.p1.traps = ['T32'];
    const activated = activateManualTrap(state, 'p1', 'T32', ['p2']);
    const frame = getTopFrame(activated)!;
    const resolved = executeTrapFrameEffect(activated, frame);
    expect(resolved.players.p2.hand).toHaveLength(0);
    expect(resolved.players.p1.hand).toEqual(['a', 'b', 'c', 'T52', 'T53', 'd', 'e', 'f', 'g', 'h']);
  });

  it('T39: Counter played against T39 owner triggers automatic trap and neutralizes counter (Regression Smoke)', () => {
    let state = room();
    state.players.p1.traps = ['T39'];
    state = pushStackFrame(state, { sourceType: 'action', sourceCode: 'A001', actorId: 'p1', targetIds: ['p2'] });
    const targetFrame = getTopFrame(state)!;

    // 1. Counter played against p1's frame -> T39 MUST trigger
    const validEvent = createGameEvent(
      GAME_EVENT_TYPES.COUNTER_PLAYED,
      'p2',
      { actorId: 'p2', counterCode: 'C01', targetFrameId: targetFrame.frameId },
      ['p1']
    );
    const triggered = checkAndTriggerAutomaticTraps(state, validEvent);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T39');
    const resolved = executeTrapFrameEffect(triggered, top);
    expect(resolved.reactionStack?.find((f) => f.frameId === targetFrame.frameId)?.status).toBe('cancelled');

    // 2. Counter played against unrelated p3's frame -> T39 MUST NOT trigger
    let state2 = room();
    state2.players.p1.traps = ['T39'];
    state2 = pushStackFrame(state2, { sourceType: 'action', sourceCode: 'A002', actorId: 'p3', targetIds: ['p2'] });
    const unrelatedFrame = getTopFrame(state2)!;
    const unrelatedEvent = createGameEvent(
      GAME_EVENT_TYPES.COUNTER_PLAYED,
      'p2',
      { actorId: 'p2', counterCode: 'C01', targetFrameId: unrelatedFrame.frameId },
      ['p3']
    );
    const notTriggered = checkAndTriggerAutomaticTraps(state2, unrelatedEvent);
    expect(notTriggered.reactionStack?.length).toBe(1); // Only the action frame remains
  });

  it('T42: Activating another owner trap triggers T42 without self-recursion', () => {
    const state = room();
    state.players.p1.traps = ['T06', 'T42'];
    const event = createGameEvent(
      GAME_EVENT_TYPES.TRAP_ACTIVATED,
      'p1',
      { ownerId: 'p1', trapCode: 'T06', targetIds: ['p2'] },
      ['p2']
    );
    const triggered = checkAndTriggerAutomaticTraps(state, event);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T42');
    const resolved = executeTrapFrameEffect(triggered, top);
    expect(resolved.players.p2.hand).toHaveLength(4);
    expect(resolved.players.p3.hand).toHaveLength(3);

    const { state: popped } = popStackFrame(resolved);

    const t42Event = createGameEvent(
      GAME_EVENT_TYPES.TRAP_ACTIVATED,
      'p1',
      { ownerId: 'p1', trapCode: 'T42', targetIds: ['p2', 'p3'] },
      ['p2', 'p3']
    );
    const noRecurse = checkAndTriggerAutomaticTraps(popped, t42Event);
    expect(noRecurse.reactionStack?.length).toBe(0);
  });

  it('T43: Triggering another player\'s trap redirects effect to trap owner (Regression Smoke)', () => {
    let state = room();
    state.players.p1.traps = ['T43'];
    state.players.p2.traps = ['T01'];

    state = pushStackFrame(state, { sourceType: 'trap', sourceCode: 'T01', actorId: 'p2', targetIds: ['p1'], affectedPlayerIds: ['p1'] });
    const originalTrapFrame = getTopFrame(state)!;

    const event = createGameEvent(
      GAME_EVENT_TYPES.TRAP_ACTIVATED,
      'p2',
      { ownerId: 'p2', trapCode: 'T01', triggerPlayerIds: ['p1'] },
      ['p1']
    );
    const triggered = checkAndTriggerAutomaticTraps(state, event);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T43');

    const resolved = executeTrapFrameEffect(triggered, top);
    expect(resolved.reactionStack?.find((f) => f.frameId === originalTrapFrame.frameId)?.targetIds).toEqual(['p2']);
  });

  it('T45: 0 cards in hand triggers automatic draw 10', () => {
    const state = room();
    state.players.p1.traps = ['T45'];
    state.players.p1.hand = [];
    const triggered = checkAndTriggerAutomaticTraps(state);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T45');
    const resolved = executeTrapFrameEffect(triggered, top);
    expect(resolved.players.p1.hand.length).toBe(10);
  });

  it('T46: 0 cards in hand triggers automatic state detection and target steal', () => {
    const state = room();
    state.players.p1.traps = ['T46'];
    state.players.p1.hand = [];
    const triggered = checkAndTriggerAutomaticTraps(state);
    const top = getTopFrame(triggered)!;
    expect(top.sourceCode).toBe('T46');

    // Target choice (e.g. owner or bot selects p2)
    top.targetIds = ['p2'];
    top.affectedPlayerIds = ['p2'];
    const resolved = executeTrapFrameEffect(triggered, top);
    expect(resolved.players.p2.hand).toHaveLength(0);
    expect(resolved.players.p1.hand).toEqual(['d', 'e', 'f', 'g', 'h']);
  });

  it('T52 & T53: Next-turn timing enforcement (cannot activate during same turn, only on/after next turn)', () => {
    let state = room();
    // 1. Place T52 on Turn 1 (p1's turn)
    state = placeTrap(state, 'p1', 'T52');
    expect(state.players.p1.traps).toContain('T52');

    // 2. Attempt immediate activation during same turn -> MUST throw Error
    expect(() => activateManualTrap(state, 'p1', 'T52', [])).toThrowError(/cannot be claimed until your next turn/);

    // 3. Advance turn to p2 (Turn 2)
    state = advanceTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');
    // Attempt activation during p2's turn -> MUST throw Error
    expect(() => activateManualTrap(state, 'p1', 'T52', [])).toThrowError(/cannot be claimed until your next turn/);

    // 4. Advance turn to p3 (Turn 3)
    state = advanceTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p3');
    expect(() => activateManualTrap(state, 'p1', 'T52', [])).toThrowError(/cannot be claimed until your next turn/);

    // 5. Advance turn back to p1 (p1's NEXT turn!)
    state = advanceTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p1');

    // 6. Activation on p1's NEXT turn -> MUST succeed!
    const activated = activateManualTrap(state, 'p1', 'T52', []);
    const frame = getTopFrame(activated)!;
    const resolved = executeTrapFrameEffect(activated, frame);
    expect(resolved.players.p1.hand).toHaveLength(4); // p1 untouched ('a', 'b', 'c', 'T53')
    expect(resolved.players.p2.hand).toHaveLength(2); // 5 - 3 = 2
    expect(resolved.players.p3.hand).toHaveLength(1); // 4 - 3 = 1
  });

  it('T53: Draws 2 for all players including owner at or after next turn', () => {
    let state = room();
    state = placeTrap(state, 'p1', 'T53');
    state = advanceTurn(state); // p2
    state = advanceTurn(state); // p3
    state = advanceTurn(state); // p1 (next turn)

    const activated = activateManualTrap(state, 'p1', 'T53', []);
    const frame = getTopFrame(activated)!;
    const resolved = executeTrapFrameEffect(activated, frame);
    expect(resolved.players.p1.hand).toHaveLength(6); // 4 + 2 = 6 ('a', 'b', 'c', 'T52', +2 drawn)
    expect(resolved.players.p2.hand).toHaveLength(7); // 5 + 2 = 7
    expect(resolved.players.p3.hand).toHaveLength(6); // 4 + 2 = 6
  });
});
