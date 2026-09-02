import { describe, it, expect } from 'vitest';
import { placeTrap, removeTrap } from './trap';
import { activateManualTrap } from './trapRules/engine';
import { popStackFrame } from './reactionStack';
import { advanceTurn } from './turn';
import type { RoomState } from './types';

describe('placeTrap', () => {
  it('moves a card from hand to face-down traps, preserving exact cardCode and transitioning phase to main', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      discardPile: [],
      players: { p1: { hand: ['T14', 'A001'], traps: [], placedTrapThisTurn: false } }
    } as unknown as RoomState;

    const next = placeTrap(state, 'p1', 'T14');

    // 1. Exact card moves hand -> activeTraps
    expect(next.players.p1.hand).toEqual(['A001']);
    expect(next.players.p1.traps).toEqual(['T14']);

    // 2. Same cardCode is preserved
    expect(next.players.p1.traps[0]).toBe('T14');

    // 3. Phase becomes main
    expect(next.turnPhase).toBe('main');
    expect(next.players.p1.placedTrapThisTurn).toBe(true);

    // 4. Placement does NOT emit CARD_PLAYED or modify events
    expect((next as any).events).toBeUndefined();

    // 5. Card conservation remains valid
    const initialCount = state.players.p1.hand.length + state.players.p1.traps.length;
    const finalCount = next.players.p1.hand.length + next.players.p1.traps.length;
    expect(finalCount).toBe(initialCount);
  });

  it('allows every canonical Trap card T01 through T66 to be placed from hand', () => {
    for (let i = 1; i <= 66; i++) {
      const code = `T${i < 10 ? '0' + i : i}` as any;
      const state = {
        status: 'playing',
        turnOrder: ['p1'],
        currentTurnIndex: 0,
        turnPhase: 'trap_placement',
        players: { p1: { hand: [code], traps: [], placedTrapThisTurn: false } }
      } as unknown as RoomState;

      const next = placeTrap(state, 'p1', code);
      expect(next.players.p1.hand).toEqual([]);
      expect(next.players.p1.traps).toEqual([code]);
      expect(next.turnPhase).toBe('main');
    }
  });

  it('works for any valid trap card code (e.g. T66)', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      players: { p1: { hand: ['T66'], traps: [] } }
    } as unknown as RoomState;

    const next = placeTrap(state, 'p1', 'T66');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p1.traps).toEqual(['T66']);
    expect(next.turnPhase).toBe('main');
  });

  it('throws if the player already has 3 traps', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      players: { p1: { hand: ['T04'], traps: ['T01', 'T02', 'T03'] } }
    } as unknown as RoomState;

    expect(() => placeTrap(state, 'p1', 'T04')).toThrow('trap limit reached');
  });

  it('throws if the card is not in hand', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      players: { p1: { hand: ['A001'], traps: [] } }
    } as unknown as RoomState;

    expect(() => placeTrap(state, 'p1', 'T01')).toThrow('card not in hand');
  });

  it('throws if player already placed a trap this turn', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      players: { p1: { hand: ['T01', 'T02'], traps: ['T05'], placedTrapThisTurn: true } }
    } as unknown as RoomState;

    expect(() => placeTrap(state, 'p1', 'T01')).toThrow('already placed a trap this turn');
  });

  it('preserves hasDrawnThisTurn and restores turnPhase=main when a trap frame resolves', () => {
    const state = {
      status: 'playing',
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      turnPhase: 'main',
      discardPile: [],
      placedTrapMeta: {},
      players: {
        p1: { name: 'P1', hand: [], traps: ['T01'], hasDrawnThisTurn: true, connected: true },
        p2: { name: 'P2', hand: [], traps: [], connected: true },
      },
      reactionStack: [],
    } as unknown as RoomState;

    const next = activateManualTrap(state, 'p1', 'T01', ['p2']);
    expect(next.players.p1.hasDrawnThisTurn).toBe(true);
    expect(next.reactionStack?.length).toBe(1);

    const { state: popped } = popStackFrame(next);
    expect(popped.players.p1.hasDrawnThisTurn).toBe(true);
    expect(popped.turnPhase).toBe('main');
    expect(popped.reactionStack?.length).toBe(0);
    expect(popped.pendingResponse).toBeNull();
  });

  it('resets placedTrapThisTurn when turn advances so player can place traps again on future turns', () => {
    let state = {
      status: 'playing',
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      turnPhase: 'trap_placement',
      discardPile: [],
      players: {
        p1: { hand: ['T01', 'T02'], traps: [], placedTrapThisTurn: false },
        p2: { hand: ['A001'], traps: [], placedTrapThisTurn: false },
      },
    } as unknown as RoomState;

    state = placeTrap(state, 'p1', 'T01');
    expect(state.players.p1.placedTrapThisTurn).toBe(true);

    state = advanceTurn(state);
    expect(state.currentTurnIndex).toBe(1);

    state = advanceTurn(state);
    expect(state.currentTurnIndex).toBe(0);
    expect(state.players.p1.placedTrapThisTurn).toBe(false);
    expect(state.turnPhase).toBe('trap_placement');

    state = placeTrap(state, 'p1', 'T02');
    expect(state.players.p1.traps).toEqual(['T01', 'T02']);
  });

  it('restores current active player turn state when hit by another player cross-turn trap', () => {
    let state = {
      status: 'playing',
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 1, // P2 is active player
      turnPhase: 'main',
      discardPile: [],
      placedTrapMeta: {},
      players: {
        p1: { name: 'P1', hand: [], traps: ['T01'], hasDrawnThisTurn: false, connected: true },
        p2: { name: 'P2', hand: ['A001'], traps: [], hasDrawnThisTurn: true, connected: true },
      },
      reactionStack: [],
    } as unknown as RoomState;

    // P1 cross-turn activates T01 targeting P2
    state = activateManualTrap(state, 'p1', 'T01', ['p2']);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');
    expect(state.players.p2.hasDrawnThisTurn).toBe(true);

    const { state: popped } = popStackFrame(state);
    expect(popped.turnOrder[popped.currentTurnIndex]).toBe('p2');
    expect(popped.players.p2.hasDrawnThisTurn).toBe(true);
    expect(popped.turnPhase).toBe('main');
    expect(popped.reactionStack?.length).toBe(0);
    expect(popped.pendingResponse).toBeNull();
  });
});

describe('removeTrap', () => {
  it('moves a trap card to the discard pile', () => {
    const state = { discardPile: [], players: { p1: { traps: ['T01', 'T02'] } } } as unknown as RoomState;
    const next = removeTrap(state, 'p1', 'T01');
    expect(next.players.p1.traps).toEqual(['T02']);
    expect(next.discardPile).toEqual(['T01']);
  });

  it('throws if the trap is not found', () => {
    const state = { discardPile: [], players: { p1: { traps: [] } } } as unknown as RoomState;
    expect(() => removeTrap(state, 'p1', 'T01')).toThrow();
  });
});
