import { describe, expect, it } from 'vitest';
import { buildCanonicalDeck } from '../data/cards/deck';
import { addPlayer, createRoom, restartGame, startGame } from './room';
import { inspectCardConservation, assertCardConservation } from './cardInvariant';
import { draw, discard } from './pile';
import { placeTrap, removeTrap } from './trap';
import { stealRandom, swapHands } from './transfer';
import { pushStackFrame, popStackFrame } from './reactionStack';

function startedRoom() {
  let room = createRoom('p1', 'P1');
  room = addPlayer(room, 'p2', 'P2');
  room = addPlayer(room, 'p3', 'P3');
  return startGame(room, buildCanonicalDeck(), () => 0.999999);
}

describe('card conservation invariant', () => {
  it('detects duplicate, missing, and unknown physical cards', () => {
    const state = startedRoom();
    state.players.p1.hand.push(state.drawPile[0]);
    state.drawPile.splice(1, 1);
    state.drawPile.push('UNKNOWN');

    const report = inspectCardConservation(state);
    expect(report.total).toBe(290);
    expect(report.duplicateCodes).toHaveLength(1);
    expect(report.missingCodes).toHaveLength(1);
    expect(report.unknownCodes).toEqual(['UNKNOWN']);
    expect(report.isValid).toBe(false);
    expect(() => assertCardConservation(state)).toThrow('card conservation violated');
  });

  it('preserves every card through draw, discard, trap, transfer, swap, and reaction metadata', () => {
    let state = startedRoom();
    assertCardConservation(state);

    state = draw(state, 'p1', 2);
    assertCardConservation(state);
    state = discard(state, 'p1', 1);
    assertCardConservation(state);

    const trapIndex = state.drawPile.findIndex((code) => code.startsWith('T'));
    const trapCode = state.drawPile.splice(trapIndex, 1)[0];
    state.players.p1.hand.push(trapCode);
    state = placeTrap(state, 'p1', trapCode);
    assertCardConservation(state);
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: trapCode,
      actorId: 'p1',
      targetIds: ['p2'],
      targetScope: 'single',
      eligibleResponderIds: ['p2'],
    });
    assertCardConservation(state);
    state = removeTrap(state, 'p1', trapCode);
    assertCardConservation(state);
    state = popStackFrame(state).state;
    assertCardConservation(state);

    state = stealRandom(state, 'p1', 'p2', 1, () => 0);
    assertCardConservation(state);
    state = swapHands(state, 'p1', 'p2');
    assertCardConservation(state);
  });

  it('preserves every card through restartGame, including a placed trap and reaction-stack metadata', () => {
    let state = startedRoom();
    const trapIndex = state.drawPile.findIndex((code) => code.startsWith('T'));
    const trapCode = state.drawPile.splice(trapIndex, 1)[0];
    state.players.p1.hand.push(trapCode);
    state = placeTrap(state, 'p1', trapCode);
    assertCardConservation(state);
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: trapCode,
      actorId: 'p1',
      targetIds: ['p2'],
      targetScope: 'single',
      eligibleResponderIds: ['p2'],
    });
    assertCardConservation(state);

    const next = restartGame(state, () => 0.5);
    assertCardConservation(next);
    expect(next.reactionStack).toEqual([]);
  });
});
