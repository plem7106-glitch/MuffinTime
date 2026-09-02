import { describe, expect, it } from 'vitest';
import { resolveActionEffect, executeActionFrameEffect } from './registry';
import type { PlayerId, RoomState, StackFrame } from '../types';

/** Builds a minimal StackFrame carrying customPayload, for roster_select/
 * outcome_entry rules that resolveActionEffect's legacy (code, actorId,
 * targetId) adapter can't express. */
function frameWithPayload(
  code: string,
  actorId: PlayerId,
  customPayload: Record<string, unknown>
): StackFrame {
  return {
    frameId: 'test', parentFrameId: null, sourceType: 'action', sourceCode: code, actorId,
    targetIds: [], targetScope: 'multi', eligibleResponderIds: [], responses: {}, modifiers: [],
    status: 'resolving', turnContext: { turnIndex: 0, phase: 'main', roundNumber: 0 }, customPayload,
  };
}

/** Builds a StackFrame carrying both a single targetId and customPayload --
 * for needsTargetThenOutcome rules (A166), where neither the legacy
 * (code, actorId, targetId) adapter nor frameWithPayload alone can express
 * "a target AND an outcome" together. */
function frameWithTargetAndPayload(
  code: string,
  actorId: PlayerId,
  targetId: PlayerId,
  customPayload: Record<string, unknown>
): StackFrame {
  return {
    frameId: 'test', parentFrameId: null, sourceType: 'action', sourceCode: code, actorId,
    targetIds: [targetId], targetScope: 'single', eligibleResponderIds: [], responses: {}, modifiers: [],
    status: 'resolving', turnContext: { turnIndex: 0, phase: 'main', roundNumber: 0 }, customPayload,
  };
}

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
  it('A001 is a no-op via the legacy (code, actorId) adapter -- it now needs a roster', () => {
    const state = baseState();
    expect(resolveActionEffect(state, 'A001', 'me')).toEqual(state);
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

describe('Family D batch (via resolveActionEffect)', () => {
  it.each([
    ['A077', 1],
    ['A112', 2],
    ['A141', 1],
    ['A144', 2],
    ['A051', 1],
    ['A120', 1],
  ])('%s steals %i card(s) from the target to the actor', (code, n) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me', 'p2');
    expect(next.players.me.hand.length).toBe(1 + n);
    expect(next.players.p2.hand.length).toBe(3 - n);
  });

  it('A029 steals 4 (clamped to what the target actually has) to the actor', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = resolveActionEffect(state, 'A029', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(5);
    expect(next.players.p2.hand.length).toBe(1);
  });

  it('A052 draws the actor 3 and the target 3', () => {
    const next = resolveActionEffect(threePlayerState(), 'A052', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(4);
    expect(next.players.p2.hand.length).toBe(6);
  });

  it('A124 draws only the target 5', () => {
    const next = resolveActionEffect(threePlayerState(), 'A124', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(8);
  });

  it('A140 draws both the actor and target 2', () => {
    const next = resolveActionEffect(threePlayerState(), 'A140', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(5);
  });

  it.each([
    ['A038', 3],
    ['A039', 5],
  ])('%s discards %i from the target only', (code, n) => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e', 'f'];
    const next = resolveActionEffect(state, code, 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(6 - n);
    expect(next.players.me.hand.length).toBe(1);
  });

  it('A041 discards 3 from both the actor and target', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b', 'c', 'd'];
    state.players.p2.hand = ['e', 'f', 'g', 'h'];
    const next = resolveActionEffect(state, 'A041', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(1);
  });

  it('A045 discards the target\'s whole hand then draws them 3 new', () => {
    const next = resolveActionEffect(threePlayerState(), 'A045', 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.discardPile).toEqual(expect.arrayContaining(['H2', 'H3', 'H4']));
  });

  it('A093 discards only Action-type cards from the target', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['A001', 'T01', 'A002'];
    const next = resolveActionEffect(state, 'A093', 'me', 'p2');
    expect(next.players.p2.hand).toEqual(['T01']);
  });

  it('A123 discards only Counter-type cards from the target', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['C09', 'T01', 'A002'];
    const next = resolveActionEffect(state, 'A123', 'me', 'p2');
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['T01', 'A002']));
    expect(next.players.p2.hand).not.toContain('C09');
  });

  it.each(['A018', 'A047'])('%s flags the target to skip their next turn', (code) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me', 'p2');
    expect(next.players.p2.skipNextTurn).toBe(true);
    expect(next.players.me.skipNextTurn).toBe(false);
  });

  it('A060 transfers the actor\'s whole hand to the target', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b'];
    const next = resolveActionEffect(state, 'A060', 'me', 'p2');
    expect(next.players.me.hand).toEqual([]);
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['a', 'b', 'H2', 'H3', 'H4']));
  });

  it('A079 gives 1 random card from the actor to the target', () => {
    const next = resolveActionEffect(threePlayerState(), 'A079', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(0);
    expect(next.players.p2.hand.length).toBe(4);
  });

  it('A082 draws the actor 2 then gives 1 to the target', () => {
    const next = resolveActionEffect(threePlayerState(), 'A082', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(4);
  });

  it('A107 gives 2 cards from the actor to the target', () => {
    const next = resolveActionEffect(threePlayerState(), 'A107', 'me', 'p2');
    expect(next.players.me.hand.length).toBe(0);
    expect(next.players.p2.hand.length).toBe(4);
  });

  it('A049 hands this card off to the next player in turn order (no target)', () => {
    const state = threePlayerState();
    state.discardPile = ['A049'];
    const next = resolveActionEffect(state, 'A049', 'me');
    expect(next.discardPile).toEqual([]);
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['A049']));
  });

  it('A078 hands this card off to the chosen target', () => {
    const state = threePlayerState();
    state.discardPile = ['A078'];
    const next = resolveActionEffect(state, 'A078', 'me', 'p3');
    expect(next.discardPile).toEqual([]);
    expect(next.players.p3.hand).toEqual(expect.arrayContaining(['A078']));
  });

  it('A125 hands this card off to the target, then steals 1 back', () => {
    const state = threePlayerState();
    state.discardPile = ['A125'];
    const next = resolveActionEffect(state, 'A125', 'me', 'p2');
    // p2 gains A125 (+1) then loses 1 random card back to the actor (-1) --
    // net zero, but the random steal-back can grab A125 itself, so don't
    // assert which specific card p2 ends up holding.
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.me.hand.length).toBe(2);
    expect(next.discardPile).toEqual([]);
  });

  it('A164 hands this card off to the next player (no target)', () => {
    const state = threePlayerState();
    state.discardPile = ['A164'];
    const next = resolveActionEffect(state, 'A164', 'me');
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['A164']));
  });

});

function seatedState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    seatOrder: ['p1', 'p2', 'p3'],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: Array.from({ length: 30 }, (_, i) => `D${i + 1}`),
    discardPile: [],
    players: {
      p1: { name: 'One', hand: ['a1'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['b1', 'b2'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['c1', 'c2', 'c3'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Family F batch (via resolveActionEffect)', () => {
  it('A010 rotates the seat order one step right and leaves hands alone', () => {
    const next = resolveActionEffect(seatedState(), 'A010', 'p1');
    expect(next.seatOrder).toEqual(['p3', 'p1', 'p2']);
    expect(next.players.p1.hand).toEqual(['a1']);
  });

  it('A010 leaves currentTurnIndex untouched -- turnOrder, not seatOrder, decides whose turn it is', () => {
    // Every gameplay gate in lib/session.tsx and GameTable's currentTurnPlayerId
    // read turnOrder[currentTurnIndex], never seatOrder[currentTurnIndex].
    // rotateSeatOrder doesn't touch turnOrder, so currentTurnIndex must not
    // move either -- otherwise the still-mid-turn player (p1) would find
    // their own next action rejected because the index now names someone else.
    const state = seatedState();
    const next = resolveActionEffect(state, 'A010', 'p1');
    expect(next.currentTurnIndex).toBe(state.currentTurnIndex);
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p1');
  });

  it('A156 rotates the seat order one step left', () => {
    const next = resolveActionEffect(seatedState(), 'A156', 'p1');
    expect(next.seatOrder).toEqual(['p2', 'p3', 'p1']);
  });

  it('A156 also leaves currentTurnIndex/turnOrder untouched', () => {
    const state = seatedState();
    const next = resolveActionEffect(state, 'A156', 'p1');
    expect(next.currentTurnIndex).toBe(state.currentTurnIndex);
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p1');
  });

  it('A080 makes every player steal 1 card from their right-seat neighbor', () => {
    const next = resolveActionEffect(seatedState(), 'A080', 'p1');
    // p1 steals from p2, p2 steals from p3, p3 steals from p1 -- everyone
    // still ends up with exactly the same hand size they started with.
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it('A087 sends every hand one seat over (consistently opposite of A110)', () => {
    const next = resolveActionEffect(seatedState(), 'A087', 'p1');
    expect(next.players.p3.hand).toEqual(['a1']);
    expect(next.players.p1.hand).toEqual(['b1', 'b2']);
    expect(next.players.p2.hand).toEqual(['c1', 'c2', 'c3']);
  });

  it('A110 sends every hand the opposite way around from A087', () => {
    const next = resolveActionEffect(seatedState(), 'A110', 'p1');
    expect(next.players.p2.hand).toEqual(['a1']);
    expect(next.players.p3.hand).toEqual(['b1', 'b2']);
    expect(next.players.p1.hand).toEqual(['c1', 'c2', 'c3']);
  });

  it('A044 draws hands up to 7 and discards hands down to 7', () => {
    const state = seatedState();
    state.players.p3.hand = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];
    const next = resolveActionEffect(state, 'A044', 'p1');
    expect(next.players.p1.hand.length).toBe(7);
    expect(next.players.p2.hand.length).toBe(7);
    expect(next.players.p3.hand.length).toBe(7);
  });

  it('A129 discards every hand down to exactly 1 card', () => {
    const next = resolveActionEffect(seatedState(), 'A129', 'p1');
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p3.hand.length).toBe(1);
  });

  it('A032 pools the actor + target hands and deals them back evenly', () => {
    const next = resolveActionEffect(seatedState(), 'A032', 'p1', 'p2');
    expect(next.players.p1.hand.length + next.players.p2.hand.length).toBe(3);
    expect(Math.abs(next.players.p1.hand.length - next.players.p2.hand.length)).toBeLessThanOrEqual(1);
    expect(next.players.p3.hand).toEqual(['c1', 'c2', 'c3']);
  });

  it('A074 pools every hand and deals them back evenly among all players', () => {
    const next = resolveActionEffect(seatedState(), 'A074', 'p1');
    const total = next.players.p1.hand.length + next.players.p2.hand.length + next.players.p3.hand.length;
    expect(total).toBe(6);
    const sizes = [next.players.p1.hand.length, next.players.p2.hand.length, next.players.p3.hand.length];
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

function trappedState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: Array.from({ length: 10 }, (_, i) => `D${i + 1}`),
    discardPile: [],
    players: {
      p1: { name: 'One', hand: ['T30', 'T31'], traps: ['T01', 'T02', 'T03'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['T32'], traps: ['T04'], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Family G1 batch (via resolveActionEffect)', () => {
  it('A003 discards 3 of the actor\'s own placed traps', () => {
    const next = resolveActionEffect(trappedState(), 'A003', 'p1');
    expect(next.players.p1.traps).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(['T01', 'T02', 'T03']));
  });

  it('A009 forces every other player to place all trap-type hand cards on the table', () => {
    const next = resolveActionEffect(trappedState(), 'A009', 'p1');
    // actor (p1) is untouched
    expect(next.players.p1.hand).toEqual(['T30', 'T31']);
    // p2's T32 (a trap-type card) moves from hand to traps
    expect(next.players.p2.hand).toEqual([]);
    expect(next.players.p2.traps).toEqual(expect.arrayContaining(['T04', 'T32']));
  });

  it('A015 discards the target\'s entire placed-trap set', () => {
    const next = resolveActionEffect(trappedState(), 'A015', 'p1', 'p1');
    // (targeting self here just to exercise the primitive path)
    expect(next.players.p1.traps).toEqual([]);
  });

  it.each(['A025', 'A030', 'A086'])('%s is a no-op (information reveal, not a state change)', (code) => {
    const state = trappedState();
    expect(resolveActionEffect(state, code, 'p1', 'p2')).toEqual(state);
  });

  it('A034 discards 1 placed trap from every player who has one', () => {
    const next = resolveActionEffect(trappedState(), 'A034', 'p1');
    expect(next.players.p1.traps.length).toBe(2);
    expect(next.players.p2.traps.length).toBe(0);
    expect(next.players.p3.traps.length).toBe(0);
  });

  it('A053 returns all of the target\'s placed traps to their hand', () => {
    const next = resolveActionEffect(trappedState(), 'A053', 'p1', 'p2');
    expect(next.players.p2.traps).toEqual([]);
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['T32', 'T04']));
  });

  it('A059 steals 1 of the target\'s placed traps into the actor\'s hand', () => {
    const next = resolveActionEffect(trappedState(), 'A059', 'p1', 'p2');
    expect(next.players.p2.traps).toEqual([]);
    expect(next.players.p1.hand).toEqual(expect.arrayContaining(['T30', 'T31', 'T04']));
  });

  it('A113 discards every player\'s entire placed-trap set', () => {
    const next = resolveActionEffect(trappedState(), 'A113', 'p1');
    expect(next.players.p1.traps).toEqual([]);
    expect(next.players.p2.traps).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(['T01', 'T02', 'T03', 'T04']));
  });
});

function deckState(): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: Array.from({ length: 20 }, (_, i) => `D${i + 1}`),
    discardPile: Array.from({ length: 12 }, (_, i) => `X${i + 1}`),
    players: {
      p1: { name: 'One', hand: ['h1'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('Family H1 batch (via resolveActionEffect)', () => {
  it('A026 draws the actor 1 card', () => {
    const next = resolveActionEffect(deckState(), 'A026', 'p1');
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.drawPile.length).toBe(19);
  });

  it('A046 takes 1 card from the top-5 peek into the actor\'s hand', () => {
    const state = deckState();
    const topFive = state.drawPile.slice(-5);
    const next = resolveActionEffect(state, 'A046', 'p1');
    expect(next.players.p1.hand.length).toBe(2);
    expect(next.drawPile.length).toBe(19);
    const takenCard = next.players.p1.hand.find((c) => !state.players.p1.hand.includes(c));
    expect(topFive).toContain(takenCard);
  });

  it('A106 takes 1 card from the last-10-discarded window into the actor\'s hand', () => {
    const state = deckState();
    const window = state.discardPile.slice(-10);
    const next = resolveActionEffect(state, 'A106', 'p1');
    expect(next.discardPile.length).toBe(11);
    const takenCard = next.players.p1.hand.find((c) => c !== 'h1');
    expect(window).toContain(takenCard);
  });

  it('A116 takes 1 random card from the whole discard pile into the actor\'s hand', () => {
    const next = resolveActionEffect(deckState(), 'A116', 'p1');
    expect(next.discardPile.length).toBe(11);
    expect(next.players.p1.hand.length).toBe(2);
  });

  it('A117 moves the entire discard pile onto the draw pile, unshuffled, and clears it', () => {
    const state = deckState();
    const next = resolveActionEffect(state, 'A117', 'p1');
    expect(next.discardPile).toEqual([]);
    expect(next.drawPile).toEqual([...state.drawPile, ...state.discardPile]);
  });

  it('A122 takes the 3 most-recently-discarded cards into the actor\'s hand', () => {
    const state = deckState();
    const lastThree = state.discardPile.slice(-3);
    const next = resolveActionEffect(state, 'A122', 'p1');
    expect(next.discardPile.length).toBe(9);
    expect(next.players.p1.hand).toEqual(expect.arrayContaining(lastThree));
  });

  it('A133 draws the actor 3 cards from the bottom of the draw pile', () => {
    const state = deckState();
    const bottomThree = state.drawPile.slice(0, 3);
    const next = resolveActionEffect(state, 'A133', 'p1');
    expect(next.players.p1.hand).toEqual(expect.arrayContaining(bottomThree));
    expect(next.drawPile.length).toBe(17);
  });
});

describe('Family I2/I5/J-objective batch (via resolveActionEffect)', () => {
  it('A076 reverses the play direction', () => {
    const state = threePlayerState();
    state.direction = 1;
    expect(resolveActionEffect(state, 'A076', 'me').direction).toBe(-1);
  });

  it('A021 takes Magical Pony (A097) from the discard pile if it\'s there', () => {
    const state = threePlayerState();
    state.discardPile = ['A097'];
    const next = resolveActionEffect(state, 'A021', 'me');
    expect(next.discardPile).toEqual([]);
    expect(next.players.me.hand).toEqual(expect.arrayContaining(['A097']));
  });

  it('A021 is a no-op if Magical Pony is not in the discard pile', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A021', 'me')).toEqual(state);
  });

  it('A048 steals the whole hand of whoever holds My Lemons (A127)', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['A127', 'x', 'y'];
    const next = resolveActionEffect(state, 'A048', 'me');
    expect(next.players.p2.hand).toEqual([]);
    expect(next.players.me.hand).toEqual(expect.arrayContaining(['A127', 'x', 'y']));
  });

  it('A048 is a no-op if nobody holds My Lemons', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A048', 'me')).toEqual(state);
  });

  it('A073 draws 3, and draws 3 more if Desmond The Moon Bear (A070) is among them', () => {
    const state = threePlayerState();
    // top 3 (from the end) are x4, x3, A070 -- includes the bear
    state.drawPile = ['y1', 'y2', 'y3', 'x1', 'x2', 'A070', 'x3', 'x4'];
    const next = resolveActionEffect(state, 'A073', 'me');
    expect(next.players.me.hand.length).toBe(1 + 6);
  });

  it('A073 draws only 3 if Desmond The Moon Bear is not among the top 3', () => {
    const state = threePlayerState();
    state.drawPile = ['A070', 'x1', 'x2', 'x3', 'x4'];
    const next = resolveActionEffect(state, 'A073', 'me');
    expect(next.players.me.hand.length).toBe(1 + 3);
  });

  it('A088 makes only the fewest-cards player(s) draw 3', () => {
    const state = threePlayerState();
    state.players.me.hand = [];
    const next = resolveActionEffect(state, 'A088', 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it('A088 makes every tied player draw when there\'s a tie for fewest', () => {
    const state = threePlayerState();
    state.players.me.hand = [];
    state.players.p2.hand = [];
    const next = resolveActionEffect(state, 'A088', 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3); // untouched, had more cards
  });

  it('A050 makes only the most-cards player(s) skip their next turn', () => {
    const next = resolveActionEffect(threePlayerState(), 'A050', 'me');
    expect(next.players.me.skipNextTurn).toBe(false);
    expect(next.players.p2.skipNextTurn).toBe(true);
    expect(next.players.p3.skipNextTurn).toBe(true);
  });
});

describe('Family A batch (via executeActionFrameEffect, since roster picks need customPayload)', () => {
  it.each([
    ['A001', 2], ['A002', 3], ['A011', 2], ['A065', 2], ['A069', 3], ['A098', 2], ['A138', 2], ['A139', 1],
  ])('%s makes only the players in the roster draw %i', (code, n) => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload(code, 'me', { rosterIds: ['p2'] }));
    expect(next.players.me.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(3 + n);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it.each(['A001', 'A002'])('%s is a no-op when nobody is picked (empty roster)', (code) => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload(code, 'me', { rosterIds: [] }))).toEqual(state);
  });

  it.each([
    ['A012', 3], ['A013', 1], ['A042', 2], ['A068', 2], ['A102', 2], ['A131', 1],
  ])('%s makes only the players in the roster discard %i', (code, n) => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = executeActionFrameEffect(state, frameWithPayload(code, 'me', { rosterIds: ['p2'] }));
    expect(next.players.p2.hand.length).toBe(5 - n);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it.each(['A081', 'A103', 'A111'])('%s steals 1 from each roster member to the actor', (code) => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload(code, 'me', { rosterIds: ['p2', 'p3'] }));
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('A089 makes only the roster players skip their next turn', () => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload('A089', 'me', { rosterIds: ['p3'] }));
    expect(next.players.p2.skipNextTurn).toBe(false);
    expect(next.players.p3.skipNextTurn).toBe(true);
  });
});

describe('Family E1/E7 batch (single target = winner/voted, via resolveActionEffect)', () => {
  it.each(['A006', 'A067', 'A096', 'A114', 'A160'])('%s draws the picked winner 3', (code) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(6);
  });

  it.each(['A006', 'A067'])('%s is a no-op when nobody is picked as winner', (code) => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, code, 'me')).toEqual(state);
  });

  it('A142 discards the voted target 3', () => {
    const next = resolveActionEffect(threePlayerState(), 'A142', 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(0);
  });

  it('A173 discards the voted target 4', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = resolveActionEffect(state, 'A173', 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(1);
  });
});

describe('Family E2/E8 batch (target = who the effect applies to, actor steals)', () => {
  it.each([
    ['A033', 3], ['A062', 3], ['A136', 3], ['A147', 3], ['A149', 2], ['A170', 2], ['A153', 2], ['A167', 1],
  ])('%s steals %i from the picked target to the actor', (code, n) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me', 'p2');
    expect(next.players.me.hand.length).toBe(1 + n);
    expect(next.players.p2.hand.length).toBe(3 - n);
  });

  it.each(['A033', 'A153'])('%s is a no-op when nobody is picked (nothing happened)', (code) => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, code, 'me')).toEqual(state);
  });

  it('A105 steals every Action-type card (not the whole hand) from the target', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['A001', 'T01', 'A002', 'C09'];
    const next = resolveActionEffect(state, 'A105', 'me', 'p2');
    expect(next.players.p2.hand).toEqual(expect.arrayContaining(['T01', 'C09']));
    expect(next.players.me.hand).toEqual(expect.arrayContaining(['A001', 'A002']));
  });
});

describe('Family E3 batch (target discards, via resolveActionEffect)', () => {
  it.each([
    ['A057', 3], ['A061', 3], ['A151', 3], ['A152', 4], ['A162', 3],
  ])('%s discards %i from the picked target', (code, n) => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = resolveActionEffect(state, code, 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(5 - n);
  });

  it('A057 is a no-op when nobody is picked', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A057', 'me')).toEqual(state);
  });
});

describe('Family E4 batch (self-only binary outcome, via executeActionFrameEffect)', () => {
  it('A148 draws the actor 2 when the outcome is true (someone laughed)', () => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload('A148', 'me', { outcome: true }));
    expect(next.players.me.hand.length).toBe(3);
  });

  it('A148 discards the actor 2 when the outcome is false (nobody laughed)', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b', 'c'];
    const next = executeActionFrameEffect(state, frameWithPayload('A148', 'me', { outcome: false }));
    expect(next.players.me.hand.length).toBe(1);
  });

  it('A150 draws the actor 3 only when the outcome is true', () => {
    const trueNext = executeActionFrameEffect(threePlayerState(), frameWithPayload('A150', 'me', { outcome: true }));
    expect(trueNext.players.me.hand.length).toBe(4);
    const falseState = threePlayerState();
    const falseNext = executeActionFrameEffect(falseState, frameWithPayload('A150', 'me', { outcome: false }));
    expect(falseNext).toEqual(falseState);
  });
});

describe('Family E5/E6 batch (roster = loser(s), via executeActionFrameEffect)', () => {
  it.each([
    ['A146', 3], ['A157', 3], ['A165', 2], ['A083', 3], ['A134', 3], ['A143', 2], ['A163', 2],
  ])('%s discards %i from each roster member', (code, n) => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = executeActionFrameEffect(state, frameWithPayload(code, 'me', { rosterIds: ['p2'] }));
    expect(next.players.p2.hand.length).toBe(5 - n);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it('A104 discards from every tied roster member', () => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload('A104', 'me', { rosterIds: ['p2', 'p3'] }));
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(0);
  });
});

describe('Family E9 batch (no_op)', () => {
  it.each(['A128', 'A154', 'A161', 'A169'])('%s is always a no-op', (code) => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, code, 'me', 'p2')).toEqual(state);
  });
});

describe('Unique cards, Phase 1 subset (via resolveActionEffect)', () => {
  it('A007 draws 3 or discards 3 (coin flip)', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A007', 'me');
    const handLen = next.players.me.hand.length;
    expect([4, 0]).toContain(handLen);
  });

  it('A020 discards the whole hand then redraws the same count', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b', 'c'];
    const next = resolveActionEffect(state, 'A020', 'me');
    expect(next.players.me.hand.length).toBe(3);
    expect(next.discardPile).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('A022 draws 10 when it was the actor\'s only card', () => {
    const state = threePlayerState();
    state.players.me.hand = []; // already discarded -- was the only card
    const next = resolveActionEffect(state, 'A022', 'me');
    expect(next.players.me.hand.length).toBe(10);
  });

  it('A022 is a no-op when the actor had other cards', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b'];
    const next = resolveActionEffect(state, 'A022', 'me');
    expect(next.players.me.hand).toEqual(['a', 'b']);
  });

  it('A036 draws the actor 3', () => {
    const next = resolveActionEffect(threePlayerState(), 'A036', 'me');
    expect(next.players.me.hand.length).toBe(4);
  });

  it('A043 takes the target\'s whole hand and buries it in the draw pile', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['x', 'y'];
    const next = resolveActionEffect(state, 'A043', 'me', 'p2');
    expect(next.players.p2.hand).toEqual([]);
    expect(next.drawPile).toEqual(expect.arrayContaining(['x', 'y']));
    expect(next.drawPile.length).toBe(state.drawPile.length + 2);
  });

  it('A055 discards the actor 2 and everyone else 1', () => {
    const next = resolveActionEffect(threePlayerState(), 'A055', 'me');
    expect(next.players.me.hand.length).toBe(0);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('A063 steals 1 from each player in the roster', () => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload('A063', 'me', { rosterIds: ['p2', 'p3'] }));
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('A071 is a no-op (temporary visibility, not state)', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A071', 'me')).toEqual(state);
  });

  it('A075 steals 1 from every player whose hand size matches the actor\'s', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a']; // 1 card
    state.players.p2.hand = ['b']; // matches (1 card)
    state.players.p3.hand = ['c', 'd']; // doesn't match (2 cards)
    const next = resolveActionEffect(state, 'A075', 'me');
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(2);
  });

  it('A084 swaps the actor\'s and target\'s whole hands', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a'];
    state.players.p2.hand = ['x', 'y'];
    const next = resolveActionEffect(state, 'A084', 'me', 'p2');
    expect(next.players.me.hand).toEqual(['x', 'y']);
    expect(next.players.p2.hand).toEqual(['a']);
  });

  it('A090 discards the actor\'s whole hand', () => {
    const state = threePlayerState();
    state.players.me.hand = ['a', 'b', 'c'];
    const next = resolveActionEffect(state, 'A090', 'me');
    expect(next.players.me.hand).toEqual([]);
  });

  it('A109 is always a no-op', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A109', 'me')).toEqual(state);
  });
});

describe('Family J1/J2-subjective batch (roster = the extreme player(s), via executeActionFrameEffect)', () => {
  it.each(['A031', 'A058', 'A054'])('%s discards from each roster member', (code) => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c', 'd', 'e'];
    const next = executeActionFrameEffect(state, frameWithPayload(code, 'me', { rosterIds: ['p2'] }));
    expect(next.players.p2.hand.length).toBeLessThan(5);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it.each(['A095', 'A070'])('%s draws each roster member 3', (code) => {
    const next = executeActionFrameEffect(threePlayerState(), frameWithPayload(code, 'me', { rosterIds: ['p2', 'p3'] }));
    expect(next.players.p2.hand.length).toBe(6);
    expect(next.players.p3.hand.length).toBe(6);
    expect(next.players.me.hand.length).toBe(1);
  });

  it('handles ties (multiple roster members) for A031', () => {
    const state = threePlayerState();
    state.players.p2.hand = ['a', 'b', 'c'];
    state.players.p3.hand = ['d', 'e', 'f'];
    const next = executeActionFrameEffect(state, frameWithPayload('A031', 'me', { rosterIds: ['p2', 'p3'] }));
    expect(next.players.p2.hand.length).toBe(0);
    expect(next.players.p3.hand.length).toBe(0);
  });
});

describe('Family I1 batch (via resolveActionEffect)', () => {
  it.each([
    ['A019', 'no_counters'],
    ['A072', 'no_actions'],
    ['A085', 'no_win'],
  ])('%s pushes a %s globalRestriction sourced from the actor', (code, type) => {
    const next = resolveActionEffect(threePlayerState(), code, 'me');
    expect(next.globalRestrictions).toEqual([{ type, sourcePlayerId: 'me' }]);
  });

  it('appends to existing restrictions rather than replacing them', () => {
    const state = threePlayerState();
    state.globalRestrictions = [{ type: 'no_win', sourcePlayerId: 'p2' }];
    const next = resolveActionEffect(state, 'A019', 'me');
    expect(next.globalRestrictions).toEqual([
      { type: 'no_win', sourcePlayerId: 'p2' },
      { type: 'no_counters', sourcePlayerId: 'me' },
    ]);
  });
});

describe('Family D no-target no-op', () => {
  it('is a no-op for target-only Family D cards when no target is given', () => {
    // Excludes A049/A164 (no target needed at all) and A052/A140/A082/A041 (they
    // have an unconditional self-effect even without a target).
    const targeted = [
      'A029', 'A077', 'A112', 'A141', 'A144', 'A051', 'A120', 'A124',
      'A038', 'A039', 'A045', 'A093', 'A123', 'A018', 'A047', 'A060', 'A079',
      'A107', 'A078', 'A125',
    ];
    for (const code of targeted) {
      const state = threePlayerState();
      expect(resolveActionEffect(state, code, 'me')).toEqual(state);
    }
  });
});

describe('A115 (dual-role pick: tallest gives 3 to shortest, via executeActionFrameEffect)', () => {
  it('moves 3 cards from firstId (tallest) to secondId (shortest)', () => {
    const next = executeActionFrameEffect(
      threePlayerState(),
      frameWithPayload('A115', 'me', { firstId: 'p3', secondId: 'p2' })
    );
    expect(next.players.p3.hand.length).toBe(0);
    expect(next.players.p2.hand.length).toBe(6);
  });

  it('is a no-op when either role is missing', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A115', 'me', { firstId: 'p3' }))).toEqual(state);
  });

  it('is a no-op when the same player is picked for both roles', () => {
    const state = threePlayerState();
    expect(
      executeActionFrameEffect(state, frameWithPayload('A115', 'me', { firstId: 'p2', secondId: 'p2' }))
    ).toEqual(state);
  });
});

describe('A172 (forced seat swap, exactly 2 players, via executeActionFrameEffect)', () => {
  it('swaps the two chosen players\' seats and leaves the third alone', () => {
    const next = executeActionFrameEffect(
      seatedState(),
      frameWithPayload('A172', 'p1', { rosterIds: ['p1', 'p3'] })
    );
    expect(next.seatOrder).toEqual(['p3', 'p2', 'p1']);
  });

  it('leaves currentTurnIndex/turnOrder untouched even when the active player is one of the two swapped', () => {
    // p1 (active) swaps seats with p3 -- turnOrder (what gameplay gates
    // actually read) must still say it's p1's turn, matching real-world
    // rules that swapping seats doesn't hand your turn to someone else.
    const state = seatedState();
    const next = executeActionFrameEffect(state, frameWithPayload('A172', 'p1', { rosterIds: ['p1', 'p3'] }));
    expect(next.currentTurnIndex).toBe(state.currentTurnIndex);
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p1');
  });

  it('is a no-op when fewer than 2 players are chosen', () => {
    const state = seatedState();
    expect(executeActionFrameEffect(state, frameWithPayload('A172', 'p1', { rosterIds: ['p2'] }))).toEqual(state);
  });
});

describe('Birthday cards (A037/A066/A137, via executeActionFrameEffect)', () => {
  it('A037 wins the game when today matches the actor\'s birthday', () => {
    const state = threePlayerState();
    state.players.me.birthdayMMDD = '09-02';
    const next = executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '09-02' }));
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('me');
  });

  it('A037 is a no-op when today does not match', () => {
    const state = threePlayerState();
    state.players.me.birthdayMMDD = '09-02';
    expect(executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '01-01' }))).toEqual(state);
  });

  it('A037 is a no-op when the actor never set a birthday', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '09-02' }))).toEqual(state);
  });

  it('A037 respects the A085 no_win restriction even on a birthday match', () => {
    const state = threePlayerState();
    state.players.me.birthdayMMDD = '09-02';
    state.globalRestrictions = [{ type: 'no_win', sourcePlayerId: 'p2' }];
    const next = executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '09-02' }));
    expect(next.status).not.toBe('finished');
  });

  it('A037 does not throw when the game is already finished (no-ops instead)', () => {
    const state = threePlayerState();
    state.players.me.birthdayMMDD = '09-02';
    state.status = 'finished';
    state.winnerId = 'p2';
    expect(() => executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '09-02' }))).not.toThrow();
    const next = executeActionFrameEffect(state, frameWithPayload('A037', 'me', { today: '09-02' }));
    expect(next.winnerId).toBe('p2'); // doesn't clobber the earlier winner
  });

  it('A066 makes everyone give 1 card to the single soonest-birthday player', () => {
    const state = threePlayerState();
    state.players.me.birthdayMMDD = '01-01'; // far from today
    state.players.p2.birthdayMMDD = '09-03'; // tomorrow -- soonest
    state.players.p3.birthdayMMDD = '06-15';
    const next = executeActionFrameEffect(state, frameWithPayload('A066', 'me', { today: '09-02' }));
    expect(next.players.me.hand.length).toBe(0); // gave its only card
    expect(next.players.p3.hand.length).toBe(2); // gave 1 of 3
    expect(next.players.p2.hand.length).toBe(5); // received from both
  });

  it('A066 is a no-op when nobody has set a birthday', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A066', 'me', { today: '09-02' }))).toEqual(state);
  });

  it('A066 splits giving across tied recipients, never making a recipient give to itself', () => {
    const state = threePlayerState();
    state.players.p2.birthdayMMDD = '09-03';
    state.players.p3.birthdayMMDD = '09-03'; // tied with p2, both 1 day away
    const next = executeActionFrameEffect(state, frameWithPayload('A066', 'me', { today: '09-02' }));
    // Only `me` is a non-recipient giver; total cards conserved, and p2/p3
    // (both recipients) keep their own hands intact toward each other.
    const totalBefore = state.players.me.hand.length + state.players.p2.hand.length + state.players.p3.hand.length;
    const totalAfter = next.players.me.hand.length + next.players.p2.hand.length + next.players.p3.hand.length;
    expect(totalAfter).toBe(totalBefore);
    expect(next.players.me.hand.length).toBe(0);
  });

  it('A137 makes everyone steal 1 card from the soonest-birthday player', () => {
    const state = threePlayerState();
    state.players.p2.birthdayMMDD = '09-03'; // tomorrow -- soonest
    state.players.p3.birthdayMMDD = '06-15';
    const next = executeActionFrameEffect(state, frameWithPayload('A137', 'me', { today: '09-02' }));
    expect(next.players.p2.hand.length).toBe(1); // lost 2 of 3, to me and p3
    expect(next.players.me.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(4);
  });

  it('A137 is a no-op when nobody has set a birthday', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A137', 'me', { today: '09-02' }))).toEqual(state);
  });

  it('birthday comparison wraps year-end correctly (Dec 31 beats Jan 5 when today is Dec 30)', () => {
    const state = threePlayerState();
    state.players.p2.birthdayMMDD = '01-05'; // 6 days away
    state.players.p3.birthdayMMDD = '12-31'; // 1 day away -- soonest
    const next = executeActionFrameEffect(state, frameWithPayload('A137', 'me', { today: '12-30' }));
    expect(next.players.p3.hand.length).toBe(1); // target -- lost 1 to each of me and p2
    expect(next.players.me.hand.length).toBe(2); // stealer -- gained 1
    expect(next.players.p2.hand.length).toBe(4); // stealer -- gained 1
  });
});

describe('A135 (needs a free-form number input)', () => {
  it('changes muffinTimeTarget to the chosen number', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithPayload('A135', 'me', { numberInput: 7 }));
    expect(next.muffinTimeTarget).toBe(7);
  });

  it('is a no-op when no number was provided', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A135', 'me', {}))).toEqual(state);
  });

  it('is a no-op when the provided number is zero or negative', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A135', 'me', { numberInput: 0 }))).toEqual(state);
    expect(executeActionFrameEffect(state, frameWithPayload('A135', 'me', { numberInput: -3 }))).toEqual(state);
  });
});

describe('A023/A024/A027 (deferred win checks at the actor\'s own next turn)', () => {
  it('A023 pushes a hand_nonempty pendingWinCheck for the actor', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithPayload('A023', 'me', {}));
    expect(next.pendingWinChecks).toEqual([{ sourcePlayerId: 'me', type: 'hand_nonempty' }]);
  });

  it('A024 pushes a fewest_hand pendingWinCheck for the actor', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithPayload('A024', 'me', {}));
    expect(next.pendingWinChecks).toEqual([{ sourcePlayerId: 'me', type: 'fewest_hand' }]);
  });

  it('A027 pushes a most_hand pendingWinCheck for the actor', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithPayload('A027', 'me', {}));
    expect(next.pendingWinChecks).toEqual([{ sourcePlayerId: 'me', type: 'most_hand' }]);
  });

  it('appends to any pre-existing pendingWinChecks instead of clobbering them', () => {
    const state = threePlayerState();
    state.pendingWinChecks = [{ sourcePlayerId: 'p2', type: 'most_hand' }];
    const next = executeActionFrameEffect(state, frameWithPayload('A023', 'me', {}));
    expect(next.pendingWinChecks).toEqual([
      { sourcePlayerId: 'p2', type: 'most_hand' },
      { sourcePlayerId: 'me', type: 'hand_nonempty' },
    ]);
  });
});

describe('A118 (steals 3 from whoever suggested this game)', () => {
  it('steals up to 3 cards from gameSuggesterId to the actor', () => {
    const state = threePlayerState();
    state.gameSuggesterId = 'p2';
    const next = resolveActionEffect(state, 'A118', 'me');
    expect(next.players.p2.hand.length).toBe(0); // only had 3
    expect(next.players.me.hand.length).toBe(4); // 1 + 3 stolen
  });

  it('is a no-op when no gameSuggesterId was ever set', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A118', 'me')).toEqual(state);
  });

  it('is a no-op when gameSuggesterId names a player no longer in the room', () => {
    const state = threePlayerState();
    state.gameSuggesterId = 'someone-who-left';
    expect(resolveActionEffect(state, 'A118', 'me')).toEqual(state);
  });

  it('is a no-op when the actor is the one who suggested the game (nothing to steal from itself)', () => {
    const state = threePlayerState();
    state.gameSuggesterId = 'me';
    expect(resolveActionEffect(state, 'A118', 'me')).toEqual(state);
  });
});

describe('A158 (honor-system: ask live, no persistent drink tracking)', () => {
  it('steals up to 3 cards from the chosen target when the actor picked one (has not drunk)', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A158', 'me', 'p2');
    expect(next.players.p2.hand.length).toBe(0); // only had 3
    expect(next.players.me.hand.length).toBe(4); // 1 + 3 stolen
  });

  it('is a no-op when no target was picked (actor already drunk this round)', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A158', 'me')).toEqual(state);
  });
});

describe('A166 (chugging challenge: target draws on success, actor draws on failure -- ruling confirmed with the user)', () => {
  it('the target draws 3 when they beat the count (outcome: true)', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A166', 'me', 'p2', { outcome: true }));
    expect(next.players.p2.hand.length).toBe(6); // 3 + 3 drawn
    expect(next.players.me.hand.length).toBe(1); // unchanged
  });

  it('the actor draws 3 when the target fails to beat the count (outcome: false)', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A166', 'me', 'p2', { outcome: false }));
    expect(next.players.me.hand.length).toBe(4); // 1 + 3 drawn
    expect(next.players.p2.hand.length).toBe(3); // unchanged
  });

  it('is a no-op when no target was picked (challenge cancelled)', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithPayload('A166', 'me', { outcome: true }))).toEqual(state);
  });

  it('is a no-op when a target was picked but no outcome was ever recorded', () => {
    const state = threePlayerState();
    expect(executeActionFrameEffect(state, frameWithTargetAndPayload('A166', 'me', 'p2', {}))).toEqual(state);
  });
});

describe('A100 (grants 2 bonus Action plays this turn)', () => {
  it('adds 2 to bonusActionPlaysRemaining for the actor', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A100', 'me');
    expect(next.players.me.bonusActionPlaysRemaining).toBe(2);
  });

  it('stacks on top of an existing bonus if played again', () => {
    const state = threePlayerState();
    state.players.me.bonusActionPlaysRemaining = 1;
    const next = resolveActionEffect(state, 'A100', 'me');
    expect(next.players.me.bonusActionPlaysRemaining).toBe(3);
  });
});

describe('A035 (obligates every player to play an Action on their own next turn)', () => {
  it('adds every current player to pendingActionObligations', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A035', 'me');
    expect(next.pendingActionObligations).toEqual(expect.arrayContaining(['me', 'p2', 'p3']));
    expect(next.pendingActionObligations).toHaveLength(3);
  });

  it('does not duplicate a player already queued', () => {
    const state = threePlayerState();
    state.pendingActionObligations = ['p2'];
    const next = resolveActionEffect(state, 'A035', 'me');
    expect(next.pendingActionObligations?.filter((id) => id === 'p2')).toHaveLength(1);
    expect(next.pendingActionObligations).toEqual(expect.arrayContaining(['me', 'p2', 'p3']));
    expect(next.pendingActionObligations).toHaveLength(3);
  });
});

describe("A040 (redirects the next 3 played Actions into the actor's hand)", () => {
  it('activates a 3-count redirect targeting the actor', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A040', 'me');
    expect(next.actionRedirect).toEqual({ toPlayerId: 'me', remaining: 3 });
  });

  it('overwrites (does not stack with) an existing active redirect', () => {
    const state = threePlayerState();
    state.actionRedirect = { toPlayerId: 'p2', remaining: 1 };
    const next = resolveActionEffect(state, 'A040', 'me');
    expect(next.actionRedirect).toEqual({ toPlayerId: 'me', remaining: 3 });
  });
});

describe('A119 (skip play forward to a chosen player\'s next turn)', () => {
  it('jumps the current turn to the chosen target', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A119', 'me', 'p3', {}));
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p3');
  });

  it('is a no-op when no target was picked', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A119', 'me')).toEqual(state);
  });

  it('resolves a pending action obligation for the player it lands on', () => {
    const state = threePlayerState();
    state.players.p3.hand = ['A001', 'H6', 'H7'];
    state.pendingActionObligations = ['p3'];
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A119', 'me', 'p3', {}));
    expect(next.players.p3.mustPlayActionThisTurn).toBe(true);
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('is a no-op when the target is the actor themselves (self-targeting, currently UI-unreachable but worth pinning down)', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A119', 'me', 'me', {}));
    expect(next).toEqual(state);
  });
});
