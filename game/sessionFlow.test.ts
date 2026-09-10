import { describe, expect, it } from 'vitest';
import { advanceAndCheckWin, resolveCompletedStackFrames, drawTurnCard, endPlayerTurn, playTurnAction, respondToFrame } from './sessionFlow';
import { pushStackFrame } from './reactionStack';
import { finishByDeckExhaustion } from './turn';
import type { RoomState } from './types';
import { buildPlayableDeck } from './playableCards';
import { createRoom, addPlayer, startGame } from './room';
import { decideBotTurn, decideBotTrapPlacement } from '../lib/botTurn';
import { placeTrap, skipTrapPlacement } from './trap';
import { assertCardConservation } from './cardInvariant';

function room(): RoomState {
  return {
    status: 'playing', hostId: 'p1', turnOrder: ['p1', 'bot-1', 'p2'], currentTurnIndex: 0,
    direction: 1, muffinTimeTarget: 10, turnPhase: 'main',
    drawPile: Array.from({length: 20}, (_, i) => `D${i}`), discardPile: [],
    players: Object.fromEntries(['p1', 'bot-1', 'p2'].map(id => [id, {
      name: id, hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false,
    }])),
  };
}

describe('live session resolution', () => {
  it('executes an Action once and resolves the automatic Trap it creates', () => {
    let state = room();
    state.players.p1.hand = Array.from({length: 9}, (_, i) => `H${i}`);
    state.players.p1.traps = ['T09'];
    state = pushStackFrame(state, {sourceType: 'action', sourceCode: 'A097', actorId: 'p1', eligibleResponderIds: []});
    const next = resolveCompletedStackFrames(state);
    expect(next.players.p1.hand).toHaveLength(10);
    expect(next.drawPile).toHaveLength(16);
    expect(next.reactionStack).toEqual([]);
    expect(next.discardPile).toHaveLength(4);
    expect(state.players.p1.hand).toHaveLength(9);
  });

  it('does not give bots a bonus draw after an Action', () => {
    let state = room();
    state.currentTurnIndex = 1;
    state = pushStackFrame(state, {sourceType: 'action', sourceCode: 'A097', actorId: 'bot-1', eligibleResponderIds: []});
    const next = resolveCompletedStackFrames(state);
    expect(next.players['bot-1'].hand).toHaveLength(4);
  });

  it('does not advance while a reaction is pending', () => {
    const state = pushStackFrame(room(), {sourceType: 'action', sourceCode: 'A097', actorId: 'p1'});
    expect(advanceAndCheckWin(state)).toEqual(state);
  });

  it('finishes on an exhausted deck after resolution', () => {
    let state = room();
    state.drawPile = ['last'];
    state = pushStackFrame(state, {sourceType: 'action', sourceCode: 'A097', actorId: 'p1', eligibleResponderIds: []});
    expect(resolveCompletedStackFrames(state).gameEndReason).toBe('deck_exhausted');
  });

  it('defers deck exhaustion until responses finish', () => {
    const state = room();
    state.drawPile = [];
    const pending = pushStackFrame(state, {sourceType: 'action', sourceCode: 'A097', actorId: 'p1'});
    expect(finishByDeckExhaustion(pending).status).toBe('playing');
  });
});


it('allows either a draw or an Action, then ending the turn', () => {
  const state = room();
  state.players.p1.hand = ['A097'];
  const played = resolveCompletedStackFrames(playTurnAction(state, 'p1', 'A097'));
  // Finish responses so that the action resolves.
  for (const response of Object.values(played.reactionStack![0].responses)) response.status = 'skipped';
  const resolved = resolveCompletedStackFrames(played);
  expect(drawTurnCard(resolved, 'p1')).toEqual(resolved);
  expect(endPlayerTurn(resolved, 'p1').currentTurnIndex).toBe(1);
  const drawn = drawTurnCard(state, 'p1');
  expect(playTurnAction(drawn, 'p1', 'A097')).toEqual(drawn);
});

it('ends the game when the last normal card is drawn', () => {
  const state = room();
  state.drawPile = ['last'];
  expect(drawTurnCard(state, 'p1').status).toBe('finished');
});

it('rejects main actions outside the main phase', () => {
  const state = room();
  state.turnPhase = 'trap_placement';
  state.players.p1.hand = ['A097'];
  expect(drawTurnCard(state, 'p1')).toEqual(state);
  expect(playTurnAction(state, 'p1', 'A097')).toEqual(state);
});


it('lets each eligible responder skip exactly once and resolves after the last response', () => {
  const state = room();
  state.players.p1.hand = ['A097'];
  let next = playTurnAction(state, 'p1', 'A097');
  const id = next.pendingResponse!.responseId;
  next = respondToFrame(next, id, 'bot-1');
  expect(next.pendingResponse?.responses?.['bot-1'].status).toBe('skipped');
  expect(next.players.p1.hand).toHaveLength(0);
  expect(respondToFrame(next, id, 'bot-1')).toEqual(next);
  next = respondToFrame(next, id, 'p2');
  expect(next.pendingResponse).toBeNull();
  expect(next.players.p1.hand).toHaveLength(4);
  expect(next.currentTurnIndex).toBe(0);
});

it('rejects ineligible counters without consuming the card', () => {
  let state = room();
  state.players.p1.hand = ['C16'];
  state = pushStackFrame(state, {sourceType: 'action', sourceCode: 'A097', actorId: 'p1', targetIds: ['p2']});
  expect(respondToFrame(state, state.pendingResponse!.responseId, 'p1', 'C16')).toEqual(state);
});

it('rejects missing targets and invalid roster selections before consuming an Action', () => {
  const state = room();
  state.players.p1.hand = ['A077', 'A172'];
  expect(playTurnAction(state, 'p1', 'A077')).toEqual(state);
  expect(playTurnAction(state, 'p1', 'A172', undefined, { rosterIds: ['p2', 'missing'] })).toEqual(state);
  expect(playTurnAction(state, 'p1', 'A172', undefined, { rosterIds: ['p2', 'p2'] })).toEqual(state);
});

it('keeps a canceled Action canceled after the remaining players skip', () => {
  const state = room();
  state.players.p1.hand = ['A097'];
  state.players['bot-1'].hand = ['C17'];
  let next = playTurnAction(state, 'p1', 'A097');
  const id = next.pendingResponse!.responseId;
  next = respondToFrame(next, id, 'bot-1', 'C17');
  next = respondToFrame(next, id, 'p2');
  expect(next.players.p1.hand).toHaveLength(0);
  expect(next.players['bot-1'].hand).toHaveLength(1);
  expect(next.lastResult?.countered).toBe(true);
  expect(endPlayerTurn(next, 'p1').currentTurnIndex).toBe(1);
});


it('preserves cards and progresses through seeded bot games', () => {
  const deck = buildPlayableDeck();
  for (let seed = 1; seed <= 5; seed++) {
    let value = seed;
    const rng = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
    let state = createRoom('bot-1', 'One');
    state = addPlayer(state, 'bot-2', 'Two');
    state = addPlayer(state, 'bot-3', 'Three');
    state = startGame(state, deck, rng);
    for (let turn = 0; turn < 80 && state.status === 'playing'; turn++) {
      const id = state.turnOrder[state.currentTurnIndex];
      const placement = decideBotTrapPlacement(state, id, rng);
      state = placement.action === 'place' ? placeTrap(state, id, placement.code) : skipTrapPlacement(state, id);
      const decision = decideBotTurn(state, id, rng);
      state = decision.action === 'play' ? playTurnAction(state, id, decision.code, decision.targetId) : drawTurnCard(state, id);
      for (let responses = 0; state.pendingResponse && responses < 20; responses++) {
        const pending = state.pendingResponse;
        const responder = pending.eligibleResponderIds?.find(pid => pending.responses?.[pid]?.status === 'pending');
        state = responder ? respondToFrame(state, pending.responseId, responder) : resolveCompletedStackFrames(state);
      }
      expect(state.pendingResponse).toBeFalsy();
      assertCardConservation(state, deck);
      if (state.status === 'playing') {
        const sequence = state.sequenceNumber ?? 0;
        state = endPlayerTurn(state, id);
        expect(state.sequenceNumber).toBe(sequence + 1);
      }
    }
  }
});