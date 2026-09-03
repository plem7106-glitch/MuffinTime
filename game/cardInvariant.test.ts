import { describe, expect, it } from 'vitest';
import { buildCanonicalDeck } from '../data/cards/deck';
import { getCardById } from '../data/cards/index';
import { addPlayer, createRoom, restartGame, startGame } from './room';
import { inspectCardConservation, assertCardConservation } from './cardInvariant';
import { draw, discard } from './pile';
import { resolveActionEffect, executeActionFrameEffect, isActionImplemented } from './actionRules/registry';
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
});

describe('Cluster D card conservation (A017, A108, A028, A094)', () => {
  it('preserves every card when A017 finds and relocates an Action card from the draw pile', () => {
    let state = startedRoom();
    // Force A017 into p1's hand, wherever it currently sits.
    const a017Index = state.drawPile.indexOf('A017');
    state.drawPile.splice(a017Index, 1);
    state.players.p1.hand.push('A017');
    assertCardConservation(state);

    // Simulate the normal play-a-card flow (as the A064 test above does):
    // A017 leaves p1's hand onto discardPile before its own executeEffect runs.
    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A017');
    state.discardPile.push('A017');
    const before = inspectCardConservation(state);

    state = resolveActionEffect(state, 'A017', 'p1', 'p2');
    assertCardConservation(state);

    // No actionRedirect is active in a freshly-started room, so
    // resolvePostPlayDestination always lands the found card on top of
    // discardPile (pushed there strictly after any trap/counter cards
    // discarded while searching) -- see game/turnFlow.ts.
    const foundCode = state.discardPile[state.discardPile.length - 1];
    expect(foundCode).not.toBe('A017');
    expect(getCardById(foundCode)?.type).toBe('action');

    const after = inspectCardConservation(state);
    expect(after.total).toBe(before.total);
    expect(after.isValid).toBe(true);
  });

  it('preserves every card when A108 forces a target to play a real Action card out of hand', () => {
    let state = startedRoom();
    const a108Index = state.drawPile.indexOf('A108');
    state.drawPile.splice(a108Index, 1);
    state.players.p1.hand.push('A108');

    // Make p2's implemented-Action candidate set deterministic: relocate any
    // pre-existing implemented Action cards already dealt to p2 out to the
    // draw pile (still conserved, just moved), then force in one known
    // implemented Action card so A108's random pick among candidates has
    // only one possible outcome.
    const relocated: string[] = [];
    state.players.p2.hand = state.players.p2.hand.filter((code) => {
      if (isActionImplemented(code)) {
        relocated.push(code);
        return false;
      }
      return true;
    });
    state.drawPile.push(...relocated);
    const forcedIndex = state.drawPile.indexOf('A014');
    state.drawPile.splice(forcedIndex, 1);
    state.players.p2.hand.push('A014');
    assertCardConservation(state);

    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A108');
    state.discardPile.push('A108');
    const before = inspectCardConservation(state);

    state = resolveActionEffect(state, 'A108', 'p1', 'p2');
    assertCardConservation(state);

    expect(state.players.p2.hand).not.toContain('A014');
    const inDiscard = state.discardPile[state.discardPile.length - 1] === 'A014';
    const inSomeHand = Object.values(state.players).some((p) => p.hand.includes('A014'));
    expect(inDiscard || inSomeHand).toBe(true);

    const after = inspectCardConservation(state);
    expect(after.total).toBe(before.total);
    expect(after.isValid).toBe(true);
  });

  it('preserves every card when A028 doubles a qualifying quantity card\'s effect', () => {
    let state = startedRoom();
    const a028Index = state.drawPile.indexOf('A028');
    state.drawPile.splice(a028Index, 1);
    state.players.p1.hand.push('A028');
    // A004 "Parallel Universe" (draw cards equal to current hand size) is on
    // QUANTITY_EFFECT_CARDS's allow-list and needs no target selection.
    const a004Index = state.drawPile.indexOf('A004');
    state.drawPile.splice(a004Index, 1);
    state.players.p1.hand.push('A004');
    assertCardConservation(state);

    // Mirror lib/session.tsx's applyPlayDoubledAction: both A028 and its
    // partner leave the actor's hand to discardPile, then exactly one
    // StackFrame is pushed for the PARTNER's code with customPayload.doubled
    // = true. This file operates at the engine layer (no lib/session.tsx
    // import), so the frame is constructed directly here.
    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A028' && c !== 'A004');
    state.discardPile.push('A028', 'A004');
    const before = inspectCardConservation(state);

    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A004',
      actorId: 'p1',
      targetIds: [],
      customPayload: { doubled: true },
    });
    assertCardConservation(state);

    const frame = state.reactionStack![state.reactionStack!.length - 1];
    const handBeforeEffect = state.players.p1.hand.length;

    // resolveCompletedStackFrames invokes executeActionFrameEffect a second
    // time when customPayload.doubled is set -- replicate that exactly.
    state = executeActionFrameEffect(state, frame);
    assertCardConservation(state);
    const handAfterFirst = state.players.p1.hand.length;
    expect(handAfterFirst).toBeGreaterThan(handBeforeEffect);

    state = executeActionFrameEffect(state, frame);
    assertCardConservation(state);
    const handAfterSecond = state.players.p1.hand.length;
    expect(handAfterSecond).toBeGreaterThan(handAfterFirst);
    // The doubled invocation drew strictly more cards than a single
    // invocation would have (second call draws hand.length again, off the
    // already-grown hand from the first call).
    expect(handAfterSecond - handAfterFirst).toBeGreaterThan(handAfterFirst - handBeforeEffect);

    state = popStackFrame(state).state;
    assertCardConservation(state);

    const after = inspectCardConservation(state);
    expect(after.total).toBe(before.total);
    expect(after.isValid).toBe(true);
  });

  it('preserves every card across a chained A017 -> A094 sequence (cross-card chainDepth)', () => {
    let state = startedRoom();
    const a017Index = state.drawPile.indexOf('A017');
    state.drawPile.splice(a017Index, 1);
    state.players.p1.hand.push('A017');
    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A017');
    state.discardPile.push('A017');
    assertCardConservation(state);

    const stackBefore = state.reactionStack?.length ?? 0;
    state = resolveActionEffect(state, 'A017', 'p1', 'p2');
    assertCardConservation(state);
    expect(state.reactionStack?.length ?? 0).toBe(stackBefore + 1);

    // Fully resolve the found card's own effect, mirroring lib/session.tsx's
    // resolveCompletedStackFrames bookkeeping (execute, log to
    // recentActionPlays, pop) so A094 has real history to replay.
    const foundFrame = state.reactionStack![state.reactionStack!.length - 1];
    const foundCode = foundFrame.sourceCode;
    expect(foundCode).not.toBe('A017');

    state = executeActionFrameEffect(state, foundFrame);
    assertCardConservation(state);
    state.recentActionPlays = [
      { code: foundFrame.sourceCode, actorId: foundFrame.actorId, targetIds: foundFrame.targetIds, customPayload: foundFrame.customPayload },
      ...(state.recentActionPlays ?? []),
    ].slice(0, 5);
    state = popStackFrame(state).state;
    assertCardConservation(state);

    // A different player (p3) now plays A094, replaying foundCode's effect
    // under a new actor -- the cross-card chainDepth path.
    const a094Index = state.drawPile.indexOf('A094');
    state.drawPile.splice(a094Index, 1);
    state.players.p3.hand.push('A094');
    state.players.p3.hand = state.players.p3.hand.filter((c) => c !== 'A094');
    state.discardPile.push('A094');
    const before = inspectCardConservation(state);

    state = resolveActionEffect(state, 'A094', 'p3');
    assertCardConservation(state);

    const replayFrame = state.reactionStack![state.reactionStack!.length - 1];
    expect(replayFrame.sourceCode).toBe(foundCode);
    expect(replayFrame.actorId).toBe('p3');
    expect((replayFrame.customPayload?.chainDepth as number | undefined)).toBe(1);

    state = executeActionFrameEffect(state, replayFrame);
    assertCardConservation(state);
    state = popStackFrame(state).state;
    assertCardConservation(state);

    const after = inspectCardConservation(state);
    expect(after.total).toBe(before.total);
    expect(after.isValid).toBe(true);
  });
});
