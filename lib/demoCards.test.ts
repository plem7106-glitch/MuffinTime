import { describe, it, expect } from 'vitest';
import {
  getDemoCard,
  demoCardsOfType,
  buildDemoDeck,
  resolveActionCard,
  resolveTrapCard,
  resolveCounterCard,
} from './demoCards';
import type { RoomState } from '../game/types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A001', 'A002', 'A003', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010'],
    discardPile: ['T01', 'T02', 'T03', 'T04', 'T05'],
    players: {
      me: { name: 'Tee', hand: ['A014', 'A016'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bank', hand: ['C09', 'C16'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('getDemoCard', () => {
  it('returns the card metadata for a known code', () => {
    expect(getDemoCard('A001').th).toBe('ผิดบ้านแล้ว!');
  });

  it('throws for an unknown code', () => {
    expect(() => getDemoCard('Z999')).toThrow();
  });
});

describe('demoCardsOfType', () => {
  it('filters by type and returns the expected counts', () => {
    expect(demoCardsOfType('action').length).toBe(5);
    expect(demoCardsOfType('counter').length).toBe(3);
    expect(demoCardsOfType('trap').length).toBe(15);
    expect(demoCardsOfType('trap').every((c) => c.type === 'trap')).toBe(true);
  });
});

describe('buildDemoDeck', () => {
  it('repeats each of the 23 codes the given number of times', () => {
    const deck = buildDemoDeck(2);
    expect(deck.length).toBe(46);
    expect(deck.filter((c) => c === 'A001').length).toBe(2);
  });

  it('defaults to 10 copies per card', () => {
    expect(buildDemoDeck().length).toBe(230);
  });
});

describe('resolveActionCard', () => {
  it('A001 makes everyone except the actor draw 2', () => {
    const next = resolveActionCard(baseState(), 'A001', 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players['bot-1'].hand.length).toBe(4);
  });

  it('A004 draws the actor a number of cards equal to their current hand size', () => {
    const next = resolveActionCard(baseState(), 'A004', 'me');
    expect(next.players.me.hand.length).toBe(4);
  });

  it('A008 makes everyone except the actor discard 1', () => {
    const next = resolveActionCard(baseState(), 'A008', 'me');
    expect(next.players['bot-1'].hand.length).toBe(1);
  });

  it('A014 requires a target and steals 1 card from the actor to them', () => {
    const next = resolveActionCard(baseState(), 'A014', 'me', 'bot-1');
    expect(next.players.me.hand.length).toBe(1);
    expect(next.players['bot-1'].hand.length).toBe(3);
  });

  it('A014 throws without a target', () => {
    expect(() => resolveActionCard(baseState(), 'A014', 'me')).toThrow();
  });

  it('A016 requires a target and discards their whole hand', () => {
    const next = resolveActionCard(baseState(), 'A016', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
  });

  it('throws for a non-action code', () => {
    expect(() => resolveActionCard(baseState(), 'C09', 'me')).toThrow();
  });
});

describe('resolveTrapCard', () => {
  it('T13 steals up to 3 cards from the target to the owner', () => {
    const next = resolveTrapCard(baseState(), 'T13', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
    expect(next.players.me.hand.length).toBe(4);
  });

  it('T16 makes the target discard 3', () => {
    const next = resolveTrapCard(baseState(), 'T16', 'me', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(0);
  });

  it('T45 draws the owner 10 cards regardless of target', () => {
    const next = resolveTrapCard(baseState(), 'T45', 'me');
    expect(next.players.me.hand.length).toBe(12);
  });

  it('T13 throws without a target', () => {
    expect(() => resolveTrapCard(baseState(), 'T13', 'me')).toThrow();
  });
});

describe('resolveCounterCard', () => {
  it('C16 draws the actor 3 cards', () => {
    const next = resolveCounterCard(baseState(), 'C16', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(5);
  });

  it('C17 draws the actor 1 card', () => {
    const next = resolveCounterCard(baseState(), 'C17', 'bot-1');
    expect(next.players['bot-1'].hand.length).toBe(3);
  });

  it('C09 is a pure cancel with no state change', () => {
    const state = baseState();
    const next = resolveCounterCard(state, 'C09', 'bot-1');
    expect(next).toEqual(state);
  });
});
