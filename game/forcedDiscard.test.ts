import { describe, expect, it } from 'vitest';
import { completeForcedDiscard, finalizeForcedDiscard, prepareForcedDiscard } from './forcedDiscard';
import { cardTitleContains } from './titleMatcher';
import type { RoomState } from './types';

const state = (): RoomState => ({ status: 'playing', hostId: 'p1', turnOrder: ['p1','p2'], currentTurnIndex: 0, direction: 1, muffinTimeTarget: 10,
  drawPile: [], discardPile: [], players: {
    p1: { name: 'One', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    p2: { name: 'Two', hand: ['A001','A002'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
  } });

describe('forced discard foundation', () => {
  it('selects actual physical cards before movement and supports replacement destinations', () => {
    const prepared = prepareForcedDiscard(state(), 'p2', 5, 'p1', 'op-1');
    expect(prepared.cardCodes).toEqual(['A001','A002']);
    const completed = completeForcedDiscard(prepared, { playerId: 'p1' });
    const next = finalizeForcedDiscard(state(), completed, completed.finalDestination);
    expect(completed.actualCount).toBe(2);
    expect(next.players.p2.hand).toEqual([]);
    expect(next.players.p1.hand).toEqual(['A001','A002']);
    expect(next.discardPile).toEqual([]);
  });
  it('matches canonical English titles case-insensitively by substring', () => {
    expect(cardTitleContains('A001', 'baby')).toBe(false);
    expect(cardTitleContains('A031', 'BABY')).toBe(true);
  });
});
