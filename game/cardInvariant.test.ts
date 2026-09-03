import { describe, expect, it } from 'vitest';
import { buildCanonicalDeck } from '../data/cards/deck';
import { addPlayer, createRoom, restartGame, startGame } from './room';
import { inspectCardConservation, assertCardConservation } from './cardInvariant';
import { draw, discard, forceDiscard } from './pile';
import { resolveActionEffect } from './actionRules/registry';
import { placeTrap, removeTrap } from './trap';
import { stealRandom, swapHands, forceSteal } from './transfer';
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

  it('preserves every card through A064 being played, planted, drawn by someone else, and its own discard-3 trigger', () => {
    let state = startedRoom();
    // Give p1 an A064 to play, wherever it currently sits.
    const a064Index = state.drawPile.indexOf('A064');
    state.drawPile.splice(a064Index, 1);
    state.players.p1.hand.push('A064');
    assertCardConservation(state);

    // Simulate the normal play-a-card flow: A064 moves to the top of discardPile
    // (as lib/session.tsx's playAction already does for every Action card), then
    // its own executeEffect plants it into drawPile.
    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A064');
    state.discardPile.push('A064');
    state = resolveActionEffect(state, 'A064', 'p1');
    assertCardConservation(state);
    expect(state.drawPile).toContain('A064');

    // Move A064 to the very top of drawPile (drawPile.pop() reads the end) so the
    // next draw deterministically draws it, then have p2 draw it.
    const plantedIndex = state.drawPile.indexOf('A064');
    state.drawPile.splice(plantedIndex, 1);
    state.drawPile.push('A064');
    state = draw(state, 'p2', 1);
    assertCardConservation(state);
    expect(state.players.p2.hand).toEqual(['A064']);
  });

  it('preserves every card through restartGame with A064 sitting mid-drawPile', () => {
    let state = startedRoom();
    // A064 is already somewhere in drawPile from buildCanonicalDeck() -- confirm
    // that, then restart mid-game and verify conservation still holds.
    expect(state.drawPile).toContain('A064');
    state = restartGame(state, () => 0.5);
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

  it('preserves every card through a forced discard, a forced steal, and an A091 draw', () => {
    let state = startedRoom();
    const [p1, p2] = state.turnOrder;
    assertCardConservation(state);

    state = forceDiscard(state, p2, Math.min(1, state.players[p2].hand.length));
    assertCardConservation(state);

    if (state.players[p1].hand.length > 0) {
      state = forceSteal(state, p1, p2, 1, () => 0);
      assertCardConservation(state);
    }

    const expectedDraw = state.players[p2].forcedLossSinceLastTurn ?? 0;
    const drawPileBefore = state.drawPile.length;
    const handBefore = state.players[p2].hand.length;
    state = resolveActionEffect(state, 'A091', p2);
    assertCardConservation(state);
    const actualDrawn = state.players[p2].hand.length - handBefore;
    expect(actualDrawn).toBe(Math.min(expectedDraw, drawPileBefore));
  });
});
