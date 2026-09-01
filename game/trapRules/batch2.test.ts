import { describe, expect, it } from 'vitest';
import { activateManualTrap, executeTrapFrameEffect } from './engine';
import { getTopFrame } from '../reactionStack';
import type { RoomState } from '../types';

function room(): RoomState {
  return { status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2', 'p3'], currentTurnIndex: 0, direction: 1, muffinTimeTarget: 10,
    drawPile: [], discardPile: [], turnPhase: 'main', reactionStack: [],
    players: {
      p1: { name: 'One', hand: ['a','b','c'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['d','e','f','g','h'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['i','j','k','l'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    } };
}

describe('Trap Batch 2 (T11-T20)', () => {
  it.each(['T11','T13','T14','T17','T18','T19','T20'])('%s steals from its declared target', (code) => {
    const state = room(); state.players.p1.traps = [code];
    const activated = activateManualTrap(state, 'p1', code, ['p2']);
    const frame = getTopFrame(activated)!;
    expect(frame.triggerPlayerIds).toEqual(['p2']);
    expect(frame.affectedPlayerIds).toEqual(['p2']);
    expect(executeTrapFrameEffect(activated, frame).players.p2.hand).toHaveLength(code === 'T14' ? 1 : 2);
  });

  it.each(['T15','T16'])('%s makes its declared target discard', (code) => {
    const state = room(); state.players.p1.traps = [code];
    const activated = activateManualTrap(state, 'p1', code, ['p2']);
    expect(executeTrapFrameEffect(activated, getTopFrame(activated)!).players.p2.hand).toHaveLength(2);
  });

  it('T12 preserves one multi-target activation and steals one from each target', () => {
    const state = room(); state.players.p1.traps = ['T12'];
    const activated = activateManualTrap(state, 'p1', 'T12', ['p2', 'p3']);
    const frame = getTopFrame(activated)!;
    expect(frame.triggerPlayerIds).toEqual(['p2', 'p3']);
    expect(frame.affectedPlayerIds).toEqual(['p2', 'p3']);
    const resolved = executeTrapFrameEffect(activated, frame);
    expect(resolved.players.p2.hand).toHaveLength(4);
    expect(resolved.players.p3.hand).toHaveLength(3);
  });
});
