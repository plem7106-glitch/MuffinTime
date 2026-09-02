import { describe, expect, it } from 'vitest';
import { canActivateManualTrap } from '../../game/trapRules/engine';
import { createRoom } from '../../game/room';
import type { RoomState } from '../../game/types';

describe('Trap Inspection & Focus Privacy Mode', () => {
  it('1. Viewing placed trap modal does NOT mutate state or trigger activation', () => {
    let state = createRoom('p1', 'Player 1', 3);
    const p1 = state.players['p1'];
    
    // Simulate placing a trap T53
    p1.traps = ['T53'];
    state.placedTrapMeta = {
      T53: {
        ownerId: 'p1',
        placedSequence: 1,
        placedRound: 1,
        placedByPlayerTurnIndex: 0,
      },
    };

    const copyBeforeInspection = JSON.parse(JSON.stringify(state));

    // Inspecting trap (opening modal in presentation UI)
    const canActivate = canActivateManualTrap(state, 'p1', 'T53');
    expect(typeof canActivate).toBe('boolean');

    // Confirm state remains 100% identical after inspection
    expect(state).toEqual(copyBeforeInspection);
    expect(state.gameEvents ?? []).toEqual([]);
    expect(state.pendingResponse ?? null).toBeNull();
  });
});
