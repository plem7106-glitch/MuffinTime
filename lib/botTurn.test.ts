import { describe, it, expect } from 'vitest';
import { decideBotTurn } from './botTurn';
import type { RoomState } from '../game/types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 1,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Tee', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bank', hand: ['A014', 'C09'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('decideBotTurn', () => {
  it('draws when the rng rolls above the play threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0.9);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('draws when the bot has no playable action cards in hand', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['C09'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('plays a targeted action against the human when the rng rolls below the threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'play', code: 'A014', targetId: 'me' });
  });

  it('plays a no-target action without picking a targetId', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['A001'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'play', code: 'A001' });
  });

  it('falls back to draw when there is nobody eligible to target', () => {
    const state = baseState();
    state.turnOrder = ['bot-1'];
    state.players = { 'bot-1': state.players['bot-1'] };
    state.players['bot-1'].hand = ['A014'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('selects from other players when multiple bots and a human are in a 5-player game', () => {
    const state = baseState();
    state.turnOrder = ['me', 'bot-1', 'bot-2', 'bot-3', 'bot-4'];
    state.players = {
      me: { name: 'Human', hand: ['A001'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bot 1', hand: ['A014'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-2': { name: 'Bot 2', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-3': { name: 'Bot 3', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-4': { name: 'Bot 4', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    };
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision.action).toBe('play');
    if (decision.action === 'play') {
      expect(decision.code).toBe('A014');
      expect(decision.targetId).toBe('me');
    }
  });

  it('handles bot vs bot targeting when no humans remain in candidates', () => {
    const state = baseState();
    state.turnOrder = ['bot-1', 'bot-2', 'bot-3'];
    state.players = {
      'bot-1': { name: 'Bot 1', hand: ['A014'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-2': { name: 'Bot 2', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-3': { name: 'Bot 3', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    };
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision.action).toBe('play');
    if (decision.action === 'play') {
      expect(decision.code).toBe('A014');
      expect(['bot-2', 'bot-3']).toContain(decision.targetId);
    }
  });
});
