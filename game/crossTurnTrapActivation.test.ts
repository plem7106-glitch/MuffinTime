import { describe, it, expect } from 'vitest';
import { placeTrap } from './trap';
import { activateManualTrap, initiateTrapInteraction } from './trapRules/engine';
import { getTopFrame } from './reactionStack';
import type { RoomState } from './types';

function createMockRoom(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0, // p1's turn
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['D1', 'D2', 'D3'],
    discardPile: [],
    players: {
      p1: { name: 'Player A', hand: ['T06', 'T10'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Player B', hand: ['H1', 'H2'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    turnPhase: 'trap_placement',
    reactionStack: [],
    sequenceNumber: 1,
  };
}

describe('Cross-Turn Manual Trap Activation', () => {
  it('allows Player A to place a Trap on their own turn, then activate it during Player B turn', () => {
    let state = createMockRoom();

    // 1. Player A places T06 during Player A's trap_placement phase
    state = placeTrap(state, 'p1', 'T06');
    expect(state.players.p1.traps).toEqual(['T06']);
    expect(state.turnPhase).toBe('main');

    // 2. Advance turn to Player B
    state.currentTurnIndex = 1; // Now Player B's turn!
    state.turnPhase = 'main';
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');

    // 3. Player B performs an action in real life (e.g. speaks rudely).
    // Player A activates their placed T06 targeting Player B DURING PLAYER B'S TURN!
    const afterActivation = activateManualTrap(state, 'p1', 'T06', ['p2']);

    // 4. Verification:
    // - T06 is removed from Player A's active traps
    expect(afterActivation.players.p1.traps).toEqual([]);
    
    // - StackFrame is pushed onto reactionStack with actorId: 'p1' (Player A), targeting 'p2' (Player B)
    const topFrame = getTopFrame(afterActivation)!;
    expect(topFrame).toBeDefined();
    expect(topFrame.sourceCode).toBe('T06');
    expect(topFrame.actorId).toBe('p1');
    expect(topFrame.triggerPlayerIds).toEqual(['p2']);
    expect(topFrame.affectedPlayerIds).toEqual(['p2']);

    // - Player B remains the active turn player around the reaction stack
    expect(afterActivation.turnOrder[afterActivation.currentTurnIndex]).toBe('p2');
  });

  it('allows Player A to initiate T10 date invitation during Player B turn', () => {
    let state = createMockRoom();
    state = placeTrap(state, 'p1', 'T10');

    // Turn advances to Player B
    state.currentTurnIndex = 1;
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');

    // Player A initiates T10 date invitation targeting Player B during Player B's turn
    const afterInteraction = initiateTrapInteraction(state, 'p1', 'T10', 'p2');
    expect(afterInteraction.pendingInteraction).toBeDefined();
    expect(afterInteraction.pendingInteraction?.initiatorId).toBe('p1');
    expect(afterInteraction.pendingInteraction?.targetPlayerId).toBe('p2');

    // Player B remains active turn player
    expect(afterInteraction.turnOrder[afterInteraction.currentTurnIndex]).toBe('p2');
  });

  it('rejects opponent attempting to activate Player A placed trap', () => {
    let state = createMockRoom();
    state = placeTrap(state, 'p1', 'T06');
    state.currentTurnIndex = 1; // Player B's turn

    // Player B tries to activate Player A's trap -> throws
    expect(() => activateManualTrap(state, 'p2', 'T06', ['p1'])).toThrow('trap not found in owner active traps');
  });
});
