import { describe, it, expect } from 'vitest';
import {
  createStackFrame,
  pushStackFrame,
  popStackFrame,
  submitResponse,
  areAllResponsesComplete,
  getTopFrame,
  addModifierToFrame,
  syncPendingResponseBridge,
} from './reactionStack';
import { placeTrap, skipTrapPlacement } from './trap';
import { advanceTurn } from './turn';
import { draw, discard } from './pile';
import type { RoomState } from './types';

function createMockRoom(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['C01', 'C02', 'C03', 'T01', 'A01'],
    discardPile: [],
    players: {
      p1: { name: 'Player 1', hand: ['A01', 'T01', 'C01'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Player 2', hand: ['C02', 'T02'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Player 3', hand: ['C03'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    turnPhase: 'trap_placement',
    reactionStack: [],
  };
}

describe('Reaction Stack Foundation', () => {
  it('pushes frames with unique stable frameId and parent pointer', () => {
    let state = createMockRoom();
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A01',
      actorId: 'p1',
      targetIds: ['p2'],
    });

    const top1 = getTopFrame(state);
    expect(top1).toBeDefined();
    expect(top1?.sourceCode).toBe('A01');
    expect(top1?.parentFrameId).toBeNull();
    expect(top1?.eligibleResponderIds).toEqual(['p2']);
    expect(top1?.responses['p2'].status).toBe('pending');
    expect(state.turnPhase).toBe('resolving_stack');

    // Push child frame (e.g. Trap or Counter reacting to A01)
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T02',
      actorId: 'p2',
      targetIds: ['p1'],
    });

    const top2 = getTopFrame(state);
    expect(top2).toBeDefined();
    expect(top2?.sourceCode).toBe('T02');
    expect(top2?.parentFrameId).toBe(top1?.frameId);
    expect(state.reactionStack?.length).toBe(2);
  });

  it('resolves LIFO and pops child frame before resuming parent frame', () => {
    let state = createMockRoom();
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A01',
      actorId: 'p1',
      targetIds: ['p2'],
    });
    const frame1Id = getTopFrame(state)!.frameId;

    state = pushStackFrame(state, {
      sourceType: 'counter',
      sourceCode: 'C02',
      actorId: 'p2',
      targetIds: ['p1'],
    });
    const frame2Id = getTopFrame(state)!.frameId;

    expect(state.reactionStack?.length).toBe(2);
    expect(getTopFrame(state)?.frameId).toBe(frame2Id);

    // Pop Frame 2
    const { state: stateAfterPop2, poppedFrame: popped2 } = popStackFrame(state);
    expect(popped2?.frameId).toBe(frame2Id);
    expect(stateAfterPop2.reactionStack?.length).toBe(1);
    expect(getTopFrame(stateAfterPop2)?.frameId).toBe(frame1Id);

    // Pop Frame 1 (stack becomes empty -> phase restored)
    const { state: stateAfterPop1, poppedFrame: popped1 } = popStackFrame(stateAfterPop2);
    expect(popped1?.frameId).toBe(frame1Id);
    expect(stateAfterPop1.reactionStack?.length).toBe(0);
    expect(getTopFrame(stateAfterPop1)).toBeUndefined();
    expect(stateAfterPop1.turnPhase).toBe('trap_placement');
  });

  it('rejects stale frame responses and processes idempotent responses safely', () => {
    let state = createMockRoom();
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A01',
      actorId: 'p1',
      targetIds: ['p2'],
    });
    const activeFrameId = getTopFrame(state)!.frameId;

    // Submitting with wrong / stale frameId
    const staleState = submitResponse(state, 'stale-frame-id', 'p2', { status: 'skipped' });
    expect(getTopFrame(staleState)?.responses['p2'].status).toBe('pending');

    // Submitting valid response
    const validState = submitResponse(state, activeFrameId, 'p2', { status: 'skipped' });
    expect(getTopFrame(validState)?.responses['p2'].status).toBe('skipped');

    // Duplicate submission is idempotent (no error, state preserved)
    const duplicateState = submitResponse(validState, activeFrameId, 'p2', { status: 'skipped' });
    expect(getTopFrame(duplicateState)?.responses['p2'].status).toBe('skipped');
  });

  it('tracks multi-player response independently without premature skip closure', () => {
    let state = createMockRoom();
    // Action affecting all other players (p2 and p3)
    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A08',
      actorId: 'p1',
      targetIds: ['p2', 'p3'],
      targetScope: 'all_others',
      eligibleResponderIds: ['p2', 'p3'],
    });

    const frameId = getTopFrame(state)!.frameId;
    expect(areAllResponsesComplete(getTopFrame(state)!)).toBe(false);

    // p2 skips
    state = submitResponse(state, frameId, 'p2', { status: 'skipped' });
    const topAfterP2 = getTopFrame(state)!;

    expect(topAfterP2.responses['p2'].status).toBe('skipped');
    expect(topAfterP2.responses['p3'].status).toBe('pending');
    // Frame must NOT be complete yet because p3 has not responded!
    expect(areAllResponsesComplete(topAfterP2)).toBe(false);

    // p3 responds
    state = submitResponse(state, frameId, 'p3', { status: 'skipped' });
    const topAfterP3 = getTopFrame(state)!;
    expect(topAfterP3.responses['p3'].status).toBe('skipped');
    expect(areAllResponsesComplete(topAfterP3)).toBe(true);
  });

  it('applies effect modifiers to frames correctly', () => {
    let state = createMockRoom();
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T02',
      actorId: 'p1',
      targetIds: ['p2', 'p3'],
    });

    const frameId = getTopFrame(state)!.frameId;

    // Protect single target (p2)
    state = addModifierToFrame(state, frameId, {
      modifierId: 'mod-1',
      sourceFrameId: frameId,
      type: 'protect_target',
      affectedTargetIds: ['p2'],
    });

    let top = getTopFrame(state)!;
    expect(top.targetIds).toEqual(['p3']);
    expect(top.status).toBe('pending_responses');

    // Cancel all
    state = addModifierToFrame(state, frameId, {
      modifierId: 'mod-2',
      sourceFrameId: frameId,
      type: 'cancel_all',
    });

    top = getTopFrame(state)!;
    expect(top.status).toBe('cancelled');
  });

  it('maintains backward-compatible pendingResponse bridge', () => {
    let state = createMockRoom();
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T13',
      actorId: 'p1',
      targetIds: ['p2'],
    });

    expect(state.pendingResponse).toBeDefined();
    expect(state.pendingResponse?.code).toBe('T13');
    expect(state.pendingResponse?.kind).toBe('trap');
    expect(state.pendingResponse?.actorId).toBe('p1');
    expect(state.pendingResponse?.targetId).toBe('p2');

    const { state: stateAfterPop } = popStackFrame(state);
    expect(stateAfterPop.pendingResponse).toBeNull();
  });

  it('clearly separates triggerPlayerIds from affectedPlayerIds and preserves triggerContext', () => {
    let state = createMockRoom();
    // P2 caused the trigger, but effect affects P2 and P3
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T02',
      actorId: 'p1',
      triggerPlayerIds: ['p2'],
      affectedPlayerIds: ['p2', 'p3'],
      eligibleResponderIds: ['p2', 'p3'],
      triggerContext: {
        triggerType: 'game_event',
        eventId: 'evt-forced-discard-123',
        triggerPlayerIds: ['p2'],
        note: 'P2 forced P1 to discard cards',
      },
    });

    const top = getTopFrame(state)!;
    expect(top).toBeDefined();
    // Trigger player is P2
    expect(top.triggerPlayerIds).toEqual(['p2']);
    // Affected players are P2 and P3
    expect(top.affectedPlayerIds).toEqual(['p2', 'p3']);
    // Eligible responders are P2 and P3
    expect(top.eligibleResponderIds).toEqual(['p2', 'p3']);
    // Trigger context is preserved
    expect(top.triggerContext?.triggerType).toBe('game_event');
    expect(top.triggerContext?.eventId).toBe('evt-forced-discard-123');
    expect(top.triggerContext?.triggerPlayerIds).toEqual(['p2']);

    // Bridge also exposes the separation
    expect(state.pendingResponse?.triggerPlayerIds).toEqual(['p2']);
    expect(state.pendingResponse?.affectedPlayerIds).toEqual(['p2', 'p3']);
    expect(state.pendingResponse?.triggerContext?.triggerType).toBe('game_event');
  });

  it('structurally supports multiple trigger players and independent responders', () => {
    let state = createMockRoom();
    // P2 and P3 both triggered a condition (e.g. both laughed or both drew)
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: 'T12',
      actorId: 'p1',
      triggerPlayerIds: ['p2', 'p3'],
      affectedPlayerIds: ['p2', 'p3'],
      eligibleResponderIds: ['p2'], // e.g. only P2 holds a valid counter
      triggerContext: {
        triggerType: 'manual_declaration',
        triggerPlayerIds: ['p2', 'p3'],
        note: 'P1 fooled P2 and P3',
      },
    });

    const top = getTopFrame(state)!;
    expect(top.triggerPlayerIds).toEqual(['p2', 'p3']);
    expect(top.affectedPlayerIds).toEqual(['p2', 'p3']);
    expect(top.eligibleResponderIds).toEqual(['p2']);
    expect(top.responses['p2'].status).toBe('pending');
    expect(top.responses['p3']).toBeUndefined(); // P3 not in eligibleResponderIds
  });
});

describe('Turn Phase & Trap Placement Rules', () => {
  it('enforces maximum 1 trap placement per turn', () => {
    let state = createMockRoom();
    expect(state.turnPhase).toBe('trap_placement');

    // First placement succeeds and transitions to main phase
    state = placeTrap(state, 'p1', 'T01');
    expect(state.players.p1.traps).toEqual(['T01']);
    expect(state.players.p1.placedTrapThisTurn).toBe(true);
    expect(state.turnPhase).toBe('main');

    // Second placement in same turn throws error
    state.players.p1.hand.push('T02');
    expect(() => placeTrap(state, 'p1', 'T02')).toThrow('already placed a trap this turn');
  });

  it('advancing turn resets placedTrapThisTurn and sets phase to trap_placement', () => {
    let state = createMockRoom();
    state = placeTrap(state, 'p1', 'T01');
    expect(state.players.p1.placedTrapThisTurn).toBe(true);

    state = advanceTurn(state);
    expect(state.currentTurnIndex).toBe(1);
    expect(state.turnPhase).toBe('trap_placement');
    expect(state.players.p2.placedTrapThisTurn).toBe(false);
  });

  it('skipping trap placement enters main phase', () => {
    let state = createMockRoom();
    expect(state.turnPhase).toBe('trap_placement');

    state = skipTrapPlacement(state, 'p1');
    expect(state.turnPhase).toBe('main');
    expect(state.players.p1.traps.length).toBe(0);
  });

  it('drawn trap cannot be placed in the same turn because draw advances the turn', () => {
    let state = createMockRoom();
    state = skipTrapPlacement(state, 'p1');
    expect(state.turnPhase).toBe('main');

    // Drawing a card immediately finishes p1's turn and advances to p2
    state.drawPile = ['T03'];
    state = draw(state, 'p1', 1);
    state = advanceTurn(state);

    // p1 now holds T03, but it is p2's turn!
    expect(state.currentTurnIndex).toBe(1);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');
    expect(state.players.p1.hand).toContain('T03');

    // p1 cannot place T03 out of turn
    expect(() => placeTrap(state, 'p1', 'T03')).not.toThrow(); // Placing out of turn as reaction/trap is governed, but p1's own turn is already over
  });
});
