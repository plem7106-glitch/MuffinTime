import { describe, expect, it } from 'vitest';
import { autoResolveInputFrame } from './autoResolve';
import type { RoomState } from '../types';

function threePlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  } as unknown as RoomState;
}

function fourPlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2', 'p3', 'p4'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p4: { name: 'Four', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  } as unknown as RoomState;
}

function twoPlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  } as unknown as RoomState;
}

describe('autoResolveInputFrame', () => {
  it('returns null for an unimplemented code', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A999' as never, 'me', undefined, () => 0);
    expect(result).toBeNull();
  });

  it('needsTargetSelection: picks one candidate excluding the actor', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A006', 'me', undefined, () => 0);
    expect(result?.targetIds).toHaveLength(1);
    expect(result?.targetIds[0]).not.toBe('me');
    expect(['p2', 'p3']).toContain(result?.targetIds[0]);
  });

  it('needsRosterSelection with no fixed count: defaults to all eligible candidates', () => {
    // A002 ("Oh No! Babies!") is a plain roster_select card with no
    // rosterSelectionCount -- see game/actionRules/definitions.ts. (The
    // task text's illustrative A057 turned out to be a needsTargetSelection
    // card, not roster_select -- swapped for a real match to this flag.)
    const result = autoResolveInputFrame(threePlayerState(), 'A002', 'me', undefined, () => 0);
    expect(result?.targetIds.sort()).toEqual(['p2', 'p3']);
  });

  it('needsRosterSelection with a fixed count: picks exactly that many at random', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A172', 'me', undefined, () => 0.99);
    expect(result?.targetIds).toHaveLength(2);
  });

  it('needsTodayDate: uses the passed-in today, not a derived one', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A037', 'me', '05-20', () => 0);
    expect(result?.customPayload?.today).toBe('05-20');
  });

  it('needsNumberInput: rng() => 0 produces exactly numberInputMin', () => {
    // A135 ("Time of Death") declares numberInputMin: 1, numberInputMax: 20
    // -- see game/actionRules/definitions.ts.
    const result = autoResolveInputFrame(threePlayerState(), 'A135', 'me', undefined, () => 0);
    expect(result?.customPayload?.numberInput).toBe(1);
  });

  it('needsNumberInput: rng() just under 1 produces exactly numberInputMax, never exceeding it', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A135', 'me', undefined, () => 0.999999);
    expect(result?.customPayload?.numberInput).toBe(20);
  });

  it('plain auto with no flags: returns empty targetIds and no customPayload', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A127', 'me', undefined, () => 0);
    expect(result?.targetIds).toEqual([]);
  });

  it('needsDualTargetSelection: happy path picks two distinct, actor-excluded candidates', () => {
    // A115 ("Tall Midget") declares needsDualTargetSelection: true -- see
    // game/actionRules/definitions.ts.
    const result = autoResolveInputFrame(fourPlayerState(), 'A115', 'me', undefined, () => 0);
    const firstId = result?.customPayload?.firstId;
    const secondId = result?.customPayload?.secondId;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(firstId).not.toBe('me');
    expect(secondId).not.toBe('me');
    expect(firstId).not.toBe(secondId);
    expect(['p2', 'p3', 'p4']).toContain(firstId);
    expect(['p2', 'p3', 'p4']).toContain(secondId);
    expect(result?.targetIds).toEqual([]);
  });

  it('needsDualTargetSelection: with fewer than 2 other players, returns empty targetIds and no pair', () => {
    const result = autoResolveInputFrame(twoPlayerState(), 'A115', 'me', undefined, () => 0);
    expect(result?.targetIds).toEqual([]);
    expect(result?.customPayload).toBeUndefined();
  });

  it('needsTargetThenOutcome: picks a target excluding the actor and a boolean outcome', () => {
    // A166 ("Speed Chug Bonus") declares needsTargetThenOutcome: true -- see
    // game/actionRules/definitions.ts.
    const result = autoResolveInputFrame(threePlayerState(), 'A166', 'me', undefined, () => 0);
    expect(result?.targetIds).toHaveLength(1);
    expect(result?.targetIds[0]).not.toBe('me');
    expect(['p2', 'p3']).toContain(result?.targetIds[0]);
    expect(typeof result?.customPayload?.outcome).toBe('boolean');
  });

  it('needsDrinkCheck: already-drunk path (rng < 0.5) picks no target', () => {
    // A158 ("Sober Spy") declares needsDrinkCheck: true -- see
    // game/actionRules/definitions.ts. The first rng() call decides
    // alreadyDrunk = rng() < 0.5; when true the function returns
    // immediately with no further rng() calls, so a single constant < 0.5
    // deterministically forces this branch.
    const result = autoResolveInputFrame(threePlayerState(), 'A158', 'me', undefined, () => 0);
    expect(result?.targetIds).toEqual([]);
    expect(result?.customPayload).toBeUndefined();
  });

  it('needsDrinkCheck: not-already-drunk path (rng >= 0.5) picks a target excluding the actor', () => {
    // The first rng() call must be >= 0.5 so alreadyDrunk is false; the
    // remaining rng() calls (inside pickRandomIndices' shuffle) only need
    // to be valid [0,1) values, so the same constant works throughout.
    const result = autoResolveInputFrame(threePlayerState(), 'A158', 'me', undefined, () => 0.999999);
    expect(result?.targetIds).toHaveLength(1);
    expect(result?.targetIds[0]).not.toBe('me');
    expect(['p2', 'p3']).toContain(result?.targetIds[0]);
  });

  it('needsOutcomeEntry: rng() => 0 produces outcome exactly true', () => {
    // A148 ("Dad Joke Roulette") is a plain needsOutcomeEntry card with no
    // target selection -- see game/actionRules/definitions.ts.
    const result = autoResolveInputFrame(threePlayerState(), 'A148', 'me', undefined, () => 0);
    expect(result?.customPayload?.outcome).toBe(true);
  });

  it('needsOutcomeEntry: rng() just under 1 produces outcome exactly false', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A148', 'me', undefined, () => 0.999999);
    expect(result?.customPayload?.outcome).toBe(false);
  });
});
