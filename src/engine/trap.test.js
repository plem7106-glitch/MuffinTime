import { describe, it, expect } from 'vitest';
import { placeTrap, removeTrap } from './trap.js';

describe('placeTrap', () => {
  it('moves a card from hand to face-down traps', () => {
    const state = { players: { p1: { hand: ['A01', 'A02'], traps: [] } } };
    const next = placeTrap(state, 'p1', 'A01');
    expect(next.players.p1.hand).toEqual(['A02']);
    expect(next.players.p1.traps).toEqual(['A01']);
  });

  it('throws if the player already has 3 traps', () => {
    const state = { players: { p1: { hand: ['A01'], traps: ['T01', 'T02', 'T03'] } } };
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });

  it('throws if the card is not in hand', () => {
    const state = { players: { p1: { hand: [], traps: [] } } };
    expect(() => placeTrap(state, 'p1', 'A01')).toThrow();
  });
});

describe('removeTrap', () => {
  it('moves a trap card to the discard pile', () => {
    const state = { discardPile: [], players: { p1: { traps: ['T01', 'T02'] } } };
    const next = removeTrap(state, 'p1', 'T01');
    expect(next.players.p1.traps).toEqual(['T02']);
    expect(next.discardPile).toEqual(['T01']);
  });

  it('throws if the trap is not found', () => {
    const state = { discardPile: [], players: { p1: { traps: [] } } };
    expect(() => removeTrap(state, 'p1', 'T01')).toThrow();
  });
});
