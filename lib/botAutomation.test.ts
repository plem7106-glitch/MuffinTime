import { describe, it, expect } from 'vitest';
import {
  decideBotTurn,
  decideBotTrapPlacement,
  decideBotCounter,
  decideBotInteraction,
  decideBotManualTrapActivation,
} from './botTurn';
import { emergencyForceSkipTurn } from '../game/turn';
import { pushStackFrame, popStackFrame, getTopFrame, submitResponse } from '../game/reactionStack';
import { placeTrap, skipTrapPlacement } from '../game/trap';
import { draw, discard } from '../game/pile';
import { activateManualTrap, initiateTrapInteraction, respondToTrapInteraction, checkAndTriggerAutomaticTraps } from '../game/trapRules/engine';
import { createGameEvent, GAME_EVENT_TYPES } from '../game/events';
import type { RoomState, PendingInteraction } from '../game/types';

function createMockRoom(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'bot-1', 'bot-2'],
    currentTurnIndex: 1, // bot-1's turn
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'],
    discardPile: [],
    players: {
      p1: { name: 'Player 1', hand: ['H1', 'H2'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Tee (Bot)', hand: ['T01', 'A001', 'C09'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-2': { name: 'Bank (Bot)', hand: ['T06', 'A008', 'C16'], traps: ['T04'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    turnPhase: 'trap_placement',
    reactionStack: [],
    sequenceNumber: 1,
  };
}

describe('Complete Bot Automation Suite', () => {
  it('handles automatic Bot Trap placement and phase transition to main', () => {
    let state = createMockRoom();
    expect(state.turnPhase).toBe('trap_placement');

    // Bot decides trap placement with deterministic RNG
    const decision = decideBotTrapPlacement(state, 'bot-1', () => 0.1); // low RNG -> place trap
    expect(decision.action).toBe('place');
    if (decision.action === 'place') {
      expect(decision.code).toBe('T01');
      state = placeTrap(state, 'bot-1', decision.code);
    }

    expect(state.players['bot-1'].traps).toEqual(['T01']);
    expect(state.players['bot-1'].placedTrapThisTurn).toBe(true);
    expect(state.turnPhase).toBe('main');
  });

  it('handles automatic Bot skipping trap placement when no traps or RNG decides to skip', () => {
    let state = createMockRoom();
    state.players['bot-1'].hand = ['A001', 'C09']; // no traps

    const decision = decideBotTrapPlacement(state, 'bot-1');
    expect(decision.action).toBe('skip');

    state = skipTrapPlacement(state, 'bot-1');
    expect(state.turnPhase).toBe('main');
    expect(state.players['bot-1'].traps).toEqual([]);
  });

  it('handles automatic Bot normal turn (Action vs Draw)', () => {
    let state = createMockRoom();
    state.turnPhase = 'main';

    // 1. Draw decision
    const drawDecision = decideBotTurn(state, 'bot-1', () => 0.9); // high RNG -> draw
    expect(drawDecision.action).toBe('draw');

    // 2. Play Action decision
    const playDecision = decideBotTurn(state, 'bot-1', () => 0.1); // low RNG -> play action
    expect(playDecision.action).toBe('play');
    if (playDecision.action === 'play') {
      expect(playDecision.code).toBe('A001');
    }
  });

  it('handles Bot Manual Trap activation and target selection', () => {
    let state = createMockRoom();
    state.players['bot-1'].traps = ['T06']; // Inappropriate

    const activation = decideBotManualTrapActivation(state, 'bot-1', () => 0.1);
    expect(activation).toBeDefined();
    expect(activation?.code).toBe('T06');
    expect(activation?.targetId).toBeDefined();

    // Activating trap through standard API
    state = activateManualTrap(state, 'bot-1', activation!.code, [activation!.targetId!]);
    const top = getTopFrame(state)!;
    expect(top.sourceCode).toBe('T06');
    expect(top.actorId).toBe('bot-1');
    expect(top.triggerPlayerIds).toEqual([activation!.targetId!]);
    expect(top.affectedPlayerIds).toEqual([activation!.targetId!]);
  });

  it('handles Bot Counter vs Skip decisions', () => {
    const state = createMockRoom();
    // C09 is a trap-only counter, so we need a trap pending response
    const pendingTrap = {
      responseId: 'frame-trap-1',
      kind: 'trap' as const,
      code: 'T06',
      actorId: 'bot-2',
      targetId: 'bot-1',
      eligibleResponderIds: ['bot-1'],
    };

    // bot-1 has C09 (trap-only counter), low RNG -> counter
    const counterDecision = decideBotCounter(state, 'bot-1', pendingTrap, () => 0.1);
    expect(counterDecision.action).toBe('counter');
    if (counterDecision.action === 'counter') {
      expect(counterDecision.code).toBe('C09');
    }

    // bot-1 chooses to skip with high RNG (> 0.8 = COUNTER_PLAY_PROBABILITY)
    const skipDecision = decideBotCounter(state, 'bot-1', pendingTrap, () => 0.99);
    expect(skipDecision.action).toBe('skip');
  });

  it('handles Bot T10 interactive invitation response (Accept vs Refuse)', () => {
    const interaction: PendingInteraction = {
      interactionId: 'interact-123',
      type: 'date_invite',
      sourceCardCode: 'T10',
      initiatorId: 'p1',
      targetPlayerId: 'bot-1',
      timestamp: Date.now(),
    };

    const refuseDecision = decideBotInteraction(interaction, () => 0.5); // < 0.7 -> refuse
    expect(refuseDecision).toBe('refuse');

    const acceptDecision = decideBotInteraction(interaction, () => 0.85); // >= 0.7 -> accept
    expect(acceptDecision).toBe('accept');
  });

  it('handles nested Reaction Stack without deadlock in bot matches', () => {
    let state = createMockRoom();
    // bot-1 plays Action A016 (force discard) on bot-2 who has active T02 (Sniper Pug)
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A016',
      actorId: 'bot-1',
      targetIds: ['bot-2'],
    });

    const actionFrame = getTopFrame(state)!;
    expect(actionFrame.sourceCode).toBe('A016');

    // Simulate forced discard on bot-2 which springs bot-2's T02
    state.players['bot-2'].traps = ['T02'];
    const event = createGameEvent(
      GAME_EVENT_TYPES.FORCED_DISCARD,
      'bot-1',
      { victimId: 'bot-2', actorId: 'bot-1', count: 1 },
      ['bot-2']
    );

    state = checkAndTriggerAutomaticTraps(state, event);
    expect(state.reactionStack?.length).toBe(2);
    expect(getTopFrame(state)?.sourceCode).toBe('T02');

    // Bot resolves top trap frame, then pops back to action frame cleanly
    const { state: afterTrapPop } = popStackFrame(state);
    expect(getTopFrame(afterTrapPop)?.sourceCode).toBe('A016');

    const { state: afterActionPop } = popStackFrame(afterTrapPop);
    expect(afterActionPop.reactionStack?.length).toBe(0);
  });
});

describe('Emergency Force Skip Turn Recovery', () => {
  it('force skips during a normal turn, advancing turn exactly once and resetting phase to trap_placement', () => {
    let state = createMockRoom();
    expect(state.currentTurnIndex).toBe(1); // bot-1
    expect(state.turnPhase).toBe('trap_placement');

    state = emergencyForceSkipTurn(state);
    expect(state.currentTurnIndex).toBe(2); // bot-2
    expect(state.turnPhase).toBe('trap_placement');
    expect(state.reactionStack?.length).toBe(0);
    expect(state.sequenceNumber).toBe(2);
  });

  it('force skips during an active Counter window, clearing the stuck window without executing unfulfilled effects', () => {
    let state = createMockRoom();
    // P1 plays Action A016 targeting bot-1
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A016',
      actorId: 'p1',
      targetIds: ['bot-1'],
    });
    expect(state.reactionStack?.length).toBe(1);
    expect(state.pendingResponse).toBeDefined();

    // Host triggers emergency force skip
    state = emergencyForceSkipTurn(state);

    // Verified: Stack & pendingResponse are wiped, no cards discarded from unfulfilled A016, turn advances
    expect(state.reactionStack?.length).toBe(0);
    expect(state.pendingResponse).toBeNull();
    expect(state.players['bot-1'].hand.length).toBe(3); // untouched!
    expect(state.currentTurnIndex).toBe(2); // advanced to bot-2
    expect(state.turnPhase).toBe('trap_placement');
  });

  it('force skips during a pending T10 date invitation, clearing the interaction and advancing turn', () => {
    let state = createMockRoom();
    state.players.p1.traps = ['T10'];
    state = initiateTrapInteraction(state, 'p1', 'T10', 'bot-1');
    expect(state.pendingInteraction).toBeDefined();

    state = emergencyForceSkipTurn(state);
    expect(state.pendingInteraction).toBeNull();
    expect(state.players['bot-1'].hand.length).toBe(3); // untouched!
    expect(state.currentTurnIndex).toBe(2);
  });

  it('force skips with multiple nested Reaction Stack frames without executing any pending effects', () => {
    let state = createMockRoom();
    // Action -> Trap -> Counter
    state = pushStackFrame(state, { sourceType: 'action', sourceCode: 'A001', actorId: 'p1', targetIds: ['bot-1'] });
    state = pushStackFrame(state, { sourceType: 'trap', sourceCode: 'T06', actorId: 'bot-1', targetIds: ['p1'] });
    state = pushStackFrame(state, { sourceType: 'counter', sourceCode: 'C09', actorId: 'p1', targetIds: ['bot-1'] });
    expect(state.reactionStack?.length).toBe(3);

    state = emergencyForceSkipTurn(state);
    expect(state.reactionStack?.length).toBe(0);
    expect(state.pendingResponse).toBeNull();
    expect(state.currentTurnIndex).toBe(2);
    expect(state.turnPhase).toBe('trap_placement');
  });

  it('increments sequenceNumber to invalidate stale Bot callbacks after force skip', () => {
    let state = createMockRoom();
    const initialSeq = state.sequenceNumber ?? 0;

    state = emergencyForceSkipTurn(state);
    expect(state.sequenceNumber).toBe(initialSeq + 1);

    state = emergencyForceSkipTurn(state);
    expect(state.sequenceNumber).toBe(initialSeq + 2);
  });
});

describe('Idempotency & Duplicate Scheduling Regression', () => {
  it('Bot places exactly one Trap per turn — second placement silently aborts', () => {
    let state = createMockRoom();
    expect(state.turnPhase).toBe('trap_placement');

    // First placement succeeds
    state = placeTrap(state, 'bot-1', 'T01');
    expect(state.players['bot-1'].traps).toContain('T01');
    expect(state.players['bot-1'].placedTrapThisTurn).toBe(true);
    expect(state.turnPhase).toBe('main');

    // Second placement throws at engine level — this is correct
    expect(() => placeTrap(state, 'bot-1', 'A001')).toThrow('already placed a trap this turn');
  });

  it('Simulated double effect execution: only the first run() callback places a trap', () => {
    const state = createMockRoom();
    // Simulate what run() does internally: two sequential state updater calls
    // The first should place, the second should see placedTrapThisTurn=true and abort

    // First updater: succeeds
    const state1 = (() => {
      const s = state;
      const player = s.players['bot-1'];
      if (!player || player.placedTrapThisTurn || s.turnPhase !== 'trap_placement') return s;
      return placeTrap(s, 'bot-1', 'T01');
    })();
    expect(state1.players['bot-1'].placedTrapThisTurn).toBe(true);
    expect(state1.turnPhase).toBe('main');

    // Second updater: same guard as session.tsx placeTrapCard — silently aborts
    const state2 = (() => {
      const s = state1;
      const player = s.players['bot-1'];
      if (!player || player.placedTrapThisTurn || s.turnPhase !== 'trap_placement') return s;
      return placeTrap(s, 'bot-1', 'T01');
    })();
    // State unchanged — no crash, no double placement
    expect(state2).toBe(state1);
  });

  it('Stale Bot placement timer after phase already changed to main does nothing', () => {
    let state = createMockRoom();

    // Simulate: bot already placed trap and phase is now 'main'
    state = placeTrap(state, 'bot-1', 'T01');
    expect(state.turnPhase).toBe('main');

    // Stale timer fires with outdated decision — guard prevents crash
    const staleResult = (() => {
      const s = state;
      const player = s.players['bot-1'];
      if (!player || player.placedTrapThisTurn || s.turnPhase !== 'trap_placement') return s;
      return placeTrap(s, 'bot-1', 'T01');
    })();
    expect(staleResult).toBe(state); // silently aborted
  });

  it('Stale Bot timer after emergency Skip Turn does nothing (sequenceNumber changed)', () => {
    let state = createMockRoom();
    const capturedSeq = state.sequenceNumber ?? 0;

    // Emergency skip changes sequenceNumber
    state = emergencyForceSkipTurn(state);
    expect(state.sequenceNumber).toBe(capturedSeq + 1);

    // Stale timer from before the skip would check sequenceNumber
    const staleResult = (() => {
      const s = state;
      if ((s.sequenceNumber ?? 0) !== capturedSeq) return s; // stale!
      return placeTrap(s, 'bot-1', 'T01');
    })();
    expect(staleResult).toBe(state); // silently aborted by seq guard
  });

  it('Duplicate human placeTrap command does not crash the app', () => {
    let state = createMockRoom();
    state.currentTurnIndex = 0; // p1's turn
    state.players.p1.hand = ['T01', 'T06', 'H1'];

    // First command succeeds
    state = placeTrap(state, 'p1', 'T01');
    expect(state.players.p1.traps).toContain('T01');

    // Second command: session guard prevents the throw
    const afterDupe = (() => {
      const s = state;
      const player = s.players.p1;
      if (!player || player.placedTrapThisTurn || s.turnPhase !== 'trap_placement') return s;
      return placeTrap(s, 'p1', 'T06');
    })();
    expect(afterDupe).toBe(state); // silently aborted
    expect(afterDupe.players.p1.traps).toEqual(['T01']); // only one trap placed
  });

  it('Bot proceeds to main phase after placing a trap', () => {
    let state = createMockRoom();
    state = placeTrap(state, 'bot-1', 'T01');

    expect(state.turnPhase).toBe('main');
    expect(state.players['bot-1'].placedTrapThisTurn).toBe(true);
    // Bot main-phase code can now execute (turnPhase !== 'trap_placement')
  });

  it('Bot proceeds to main phase after skipping trap placement', () => {
    let state = createMockRoom();
    state = skipTrapPlacement(state, 'bot-1');

    expect(state.turnPhase).toBe('main');
    expect(state.players['bot-1'].traps).toEqual([]);
  });

  it('Engine-level 1-Trap-per-turn rule is still enforced (placeTrap throws)', () => {
    let state = createMockRoom();
    state = placeTrap(state, 'bot-1', 'T01');

    // The engine still throws — this proves the rule is intact.
    // The session layer's job is to prevent this throw from reaching React.
    expect(() => placeTrap(state, 'bot-1', 'A001')).toThrow('already placed a trap this turn');
  });
});

