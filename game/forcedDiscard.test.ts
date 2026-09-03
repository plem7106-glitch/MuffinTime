import { describe, expect, it } from 'vitest';
import { completeForcedDiscard, finalizeForcedDiscard, finalizePendingForcedDiscard, prepareForcedDiscard, preparePendingForcedDiscard, replacePendingForcedDiscardDestination, resolveForcedDiscard, setPreDiscardReactionResolver } from './forcedDiscard';
import { cardTitleContains } from './titleMatcher';
import { pushStackFrame, popStackFrame } from './reactionStack';
import { resolveT23PreDiscardReaction } from './trapRules/engine';
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
  it('keeps exact cards in hand while pending, then finalizes once to the replacement destination', () => {
    const operation = prepareForcedDiscard(state(), 'p2', 2, 'p1', 'op-pending');
    let pending = preparePendingForcedDiscard(state(), operation, 'frame-1');
    expect(pending.players.p2.hand).toEqual(['A001', 'A002']);
    pending = replacePendingForcedDiscardDestination(pending, 'op-pending', { playerId: 'p1' });
    const finalized = finalizePendingForcedDiscard(pending, 'op-pending');
    expect(finalized.players.p1.hand).toEqual(['A001', 'A002']);
    expect(finalized.pendingForcedDiscards).toEqual({});
    expect(finalizePendingForcedDiscard(finalized, 'op-pending')).toBe(finalized);
  });
  it('pauses production resolution when a generic pre-discard reaction matches', () => {
    setPreDiscardReactionResolver(() => ({ frameParams: { sourceType: 'trap', sourceCode: 'T23', actorId: 'p1', targetIds: ['p2'], eligibleResponderIds: [] } }));
    const pending = resolveForcedDiscard(state(), 'p2', 2, 'p1');
    expect(pending.players.p2.hand).toEqual(['A001', 'A002']);
    expect(Object.values(pending.pendingForcedDiscards ?? {})[0]?.status).toBe('awaiting_reaction');
    const operationId = Object.keys(pending.pendingForcedDiscards ?? {})[0];
    expect(pending.reactionStack?.[0]?.customPayload?.forcedDiscardOperationId).toBe(operationId);
    // Restore the real default (not null) -- forcedDiscard.ts's module-level
    // resolver defaults to resolveT23PreDiscardReaction in production, and a
    // later test in this file relying on that real default must not see it
    // masked by a stale null left behind here.
    setPreDiscardReactionResolver(resolveT23PreDiscardReaction);
  });
  it('tracks the victim\'s forced loss with the actual moved count', () => {
    const prepared = prepareForcedDiscard(state(), 'p2', 2, 'p1', 'op-track');
    const completed = completeForcedDiscard(prepared);
    const next = finalizeForcedDiscard(state(), completed, completed.finalDestination);
    expect(next.players.p2.forcedLossSinceLastTurn).toBe(2);
  });
  it('T23 intercepts a forced discard by default -- regression for T23 being dead in production because nothing but tests ever called setPreDiscardReactionResolver', () => {
    const withOwner = state();
    withOwner.players.p3 = { name: 'Three', hand: [], traps: ['T23'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false };

    let next = resolveForcedDiscard(withOwner, 'p2', 2, 'p1');
    const frame = next.reactionStack?.[0];
    expect(frame?.sourceCode).toBe('T23');
    expect(frame?.actorId).toBe('p3');
    expect(frame?.customPayload?.cardCodes).toEqual(['A001', 'A002']);

    next = popStackFrame(next).state;
    expect(next.players.p3.hand).toEqual(['A001', 'A002']);
    expect(next.players.p2.hand).toEqual([]);
    // The T23 card itself is discarded once its automatic-event half (in
    // trapRules/definitions.ts) sees the resulting FORCED_DISCARD event and
    // removes the now-spent trap from p3's placed traps.
    expect(next.discardPile).toEqual(['T23']);
    expect(next.players.p3.traps).toEqual([]);
  });
  it('resumes a linked pending operation when its reaction frame completes', () => {
    const operation = prepareForcedDiscard(state(), 'p2', 2, 'p1', 'op-linked');
    let pending = preparePendingForcedDiscard(state(), { ...operation, causalFrameId: 'frame-link' }, 'frame-link');
    pending = pushStackFrame(pending, { sourceType: 'trap', sourceCode: 'T23', actorId: 'p1', targetIds: ['p2'], eligibleResponderIds: [], customPayload: { replacementDestination: { playerId: 'p1' } } });
    pending.reactionStack![0].frameId = 'frame-link';
    const resumed = popStackFrame(pending).state;
    expect(resumed.players.p1.hand).toEqual(['A001', 'A002']);
    expect(resumed.discardPile).toEqual([]);
    expect(resumed.pendingForcedDiscards).toEqual({});
  });
});
