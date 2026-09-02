import { describe, expect, it } from 'vitest';
import { initiateDelegatedTargetPick, resolveDelegatedTargetPick } from './delegatedTargetPick';
import type { RoomState, StackFrame } from '../types';

function threePlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: ['A126'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['H1', 'H2', 'H3'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['H4', 'H5'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

function testFrame(overrides: Partial<StackFrame> = {}): StackFrame {
  return {
    frameId: 'frame-1', parentFrameId: null, sourceType: 'action', sourceCode: 'A126',
    actorId: 'me', targetIds: ['p2'], targetScope: 'single', eligibleResponderIds: [],
    responses: {}, modifiers: [], status: 'resolving',
    turnContext: { turnIndex: 0, phase: 'main', roundNumber: 0 },
    ...overrides,
  };
}

describe('initiateDelegatedTargetPick', () => {
  it('sets pendingInteraction from the frame, keyed off frameId for a deterministic interactionId', () => {
    const state = threePlayerState();
    const next = initiateDelegatedTargetPick(state, testFrame(), 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ');
    expect(next.pendingInteraction).toEqual({
      interactionId: 'interact-frame-1',
      type: 'delegated_target_pick',
      sourceCardCode: 'A126',
      initiatorId: 'me',
      targetPlayerId: 'p2',
      prompt: 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ',
      timestamp: 0,
    });
  });

  it('no-ops when the frame has no target', () => {
    const state = threePlayerState();
    const next = initiateDelegatedTargetPick(state, testFrame({ targetIds: [] }), 'prompt');
    expect(next.pendingInteraction).toBeUndefined();
  });
});

describe('resolveDelegatedTargetPick', () => {
  function pending(sourceCardCode: string, targetPlayerId = 'p2') {
    let state = threePlayerState();
    state = initiateDelegatedTargetPick(state, testFrame({ sourceCode: sourceCardCode, targetIds: [targetPlayerId] }), 'prompt');
    return state;
  }

  it('A126: the chosen target discards their entire hand, pendingInteraction clears', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3');
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p3.hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(['H4', 'H5']));
  });

  it('A130: exactly one card moves from the delegated player to the chosen target', () => {
    const state = pending('A130', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3', () => 0);
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(3);
    const movedCard = next.players.p3.hand.find((c) => !['H4', 'H5'].includes(c));
    expect(movedCard).toBeDefined();
    expect(['H1', 'H2', 'H3']).toContain(movedCard);
  });

  it('A130: no-ops the card transfer (but still clears pendingInteraction) when the delegated player has an empty hand', () => {
    let state = pending('A130', 'p2');
    state.players.p2.hand = [];
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3', () => 0);
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p3.hand).toEqual(['H4', 'H5']);
  });

  it('throws when the responder is not the delegated player', () => {
    const state = pending('A126', 'p2');
    expect(() => resolveDelegatedTargetPick(state, 'interact-frame-1', 'p3', 'me')).toThrow(
      'only the delegated player can respond to this choice'
    );
  });

  it('no-ops on a stale/mismatched interactionId', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'not-the-real-id', 'p2', 'p3');
    expect(next.pendingInteraction).toEqual(state.pendingInteraction);
    expect(next.players.p3.hand).toEqual(['H4', 'H5']);
  });

  it('no-ops when chosenTargetId does not exist', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'not-a-real-player');
    expect(next.pendingInteraction).toEqual(state.pendingInteraction);
  });
});
