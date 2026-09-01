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

function threePlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A001', 'A002', 'A003', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010'],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: ['H1'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['H2', 'H3', 'H4'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['H5', 'H6', 'H7'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Family B/C batch (via resolveActionEffect)', () => {
  it.each(['A145', 'A168', 'A171'])('%s makes every player, including the actor, draw 1', (code) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(4);
    expect(next.players.p3.hand.length).toBe(4);
  });

  it('A099 makes every player, including the actor, discard 3', () => {
    const next = resolveActionEffect(threePlayerState(), 'A099', 'me');
    expect(next.players.me.hand.length).toBe(0);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(0);
    expect(next.discardPile.length).toBe(7);
  });

  it('A121 steals 1 card from every other player to the actor', () => {
    const next = resolveActionEffect(threePlayerState(), 'A121', 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('A005 steals 1 from every other player, then keeps only 1 of the stolen cards', () => {
    const next = resolveActionEffect(threePlayerState(), 'A005', 'me');
    // started with 1, stole 2 (one from each other player), discarded 1 of the stolen -> net 2
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
    expect(next.discardPile.length).toBe(1);
  });

  it.each(['A132', 'A159'])('%s draws the actor 2 and everyone else 1', (code) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(4);
    expect(next.players.p3.hand.length).toBe(4);
  });

  it('A097 draws the actor 4', () => {
    const next = resolveActionEffect(threePlayerState(), 'A097', 'me');
    expect(next.players.me.hand.length).toBe(5);
  });

  it('A101 draws the actor 5', () => {
    const next = resolveActionEffect(threePlayerState(), 'A101', 'me');
    expect(next.players.me.hand.length).toBe(6);
  });

  it('A155 draws the actor 2 (named target has no card-state effect)', () => {
    const next = resolveActionEffect(threePlayerState(), 'A155', 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
  });

  it('A127 discards the actor 4', () => {
    const state = threePlayerState();
    state.players.me.hand = ['H1', 'H2', 'H3', 'H4', 'H5'];
    const next = resolveActionEffect(state, 'A127', 'me');
    expect(next.players.me.hand.length).toBe(1);
  });

  it('A056 discards exactly 1 card from the actor', () => {
    const next = resolveActionEffect(threePlayerState(), 'A056', 'me');
    expect(next.players.me.hand.length).toBe(0);
    expect(next.discardPile).toEqual(['H1']);
  });
});
