import { describe, expect, it } from 'vitest';
import { resolveActionEffect } from './registry';
import type { RoomState } from '../types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A001', 'A002', 'A003', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010'],
    discardPile: [],
    players: {
      me: { name: 'Tee', hand: ['A014', 'A016'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bot', hand: ['A011', 'A012'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('ACTION_RULES_BATCH_1 (via resolveActionEffect)', () => {
  it('A001 makes everyone except the actor draw 2', () => {
    const next = resolveActionEffect(baseState(), 'A001', 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players['bot-1'].hand.length).toBe(4);
  });

  it('A004 draws the actor a number of cards equal to their current hand size', () => {
    const next = resolveActionEffect(baseState(), 'A004', 'me');
    expect(next.players.me.hand.length).toBe(4);
  });

  it('A008 makes everyone except the actor discard 1', () => {
    const next = resolveActionEffect(baseState(), 'A008', 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players['bot-1'].hand.length).toBe(1);
  });

  it('A014 steals 1 card from the actor to the chosen target', () => {
    const next = resolveActionEffect(baseState(), 'A014', 'me', 'bot-1');
    expect(next.players.me.hand.length).toBe(1);
    expect(next.players['bot-1'].hand.length).toBe(3);
  });

  it('A014 is a no-op without a target', () => {
    const state = baseState();
    expect(resolveActionEffect(state, 'A014', 'me')).toEqual(state);
  });

  it('A016 discards the target\'s whole hand', () => {
    const next = resolveActionEffect(baseState(), 'A016', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
    expect(next.discardPile).toEqual(expect.arrayContaining(['A011', 'A012']));
  });
});
