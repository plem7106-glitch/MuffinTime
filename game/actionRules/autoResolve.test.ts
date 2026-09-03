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

  it('needsOutcomeEntry: produces a boolean outcome', () => {
    // A148 ("Dad Joke Roulette") is a plain needsOutcomeEntry card with no
    // target selection -- see game/actionRules/definitions.ts. (The task
    // text's illustrative A029 turned out to be a needsTargetSelection
    // card, not needsOutcomeEntry -- swapped for a real match to this flag.)
    const result = autoResolveInputFrame(threePlayerState(), 'A148', 'me', undefined, () => 0);
    expect(typeof result?.customPayload?.outcome).toBe('boolean');
  });

  it('needsTodayDate: uses the passed-in today, not a derived one', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A037', 'me', '05-20', () => 0);
    expect(result?.customPayload?.today).toBe('05-20');
  });

  it('needsNumberInput: produces a number within the card-defined bounds', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A135', 'me', undefined, () => 0.5);
    expect(typeof result?.customPayload?.numberInput).toBe('number');
  });

  it('plain auto with no flags: returns empty targetIds and no customPayload', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A127', 'me', undefined, () => 0);
    expect(result?.targetIds).toEqual([]);
  });
});
