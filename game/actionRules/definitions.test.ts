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
    expect(next.players.p2.hand).toContain('A125');
    expect(next.players.p2.hand.length).toBe(3); // gained A125, lost 1 stolen
    expect(next.players.me.hand.length).toBe(2);
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

  it('A156 rotates the seat order one step left', () => {
    const next = resolveActionEffect(seatedState(), 'A156', 'p1');
    expect(next.seatOrder).toEqual(['p2', 'p3', 'p1']);
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
