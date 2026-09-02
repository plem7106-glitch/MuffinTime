import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, removePlayer, startGame, startSetup, setGameSuggester, resetForPlayAgain, restartGame, GLOBAL_MIN_PLAYERS, GLOBAL_MAX_PLAYERS } from './room';
import type { RoomState } from './types';

describe('createRoom', () => {
  it('creates a lobby room with the host as the first player', () => {
    const room = createRoom('host1', 'Ploy');
    expect(room.status).toBe('lobby');
    expect(room.hostId).toBe('host1');
    expect(room.maxPlayers).toBe(GLOBAL_MAX_PLAYERS);
    expect(room.players.host1).toEqual({
      name: 'Ploy',
      hand: [],
      traps: [],
      connected: true,
      hasCalledMuffinTime: false,
      skipNextTurn: false,
    });
  });

  it('validates and clamps maxPlayers between 3 and 15', () => {
    const roomMin = createRoom('host1', 'Host', 1);
    expect(roomMin.maxPlayers).toBe(GLOBAL_MIN_PLAYERS);

    const roomMax = createRoom('host1', 'Host', 99);
    expect(roomMax.maxPlayers).toBe(GLOBAL_MAX_PLAYERS);

    const roomExact = createRoom('host1', 'Host', 6);
    expect(roomExact.maxPlayers).toBe(6);
  });
});

describe('addPlayer', () => {
  it('adds a new player to a lobby room', () => {
    const room = createRoom('host1', 'Ploy', 4);
    const next = addPlayer(room, 'p2', 'Nam');
    expect(next.players.p2.name).toBe('Nam');
    expect(Object.keys(next.players).length).toBe(2);
  });

  it('throws if the room already started', () => {
    const room = { ...createRoom('host1', 'Ploy'), status: 'playing' as const };
    expect(() => addPlayer(room, 'p2', 'Nam')).toThrow('cannot join a room that has already started');
  });

  it('throws if the player id is already in the room', () => {
    const room = createRoom('host1', 'Ploy');
    expect(() => addPlayer(room, 'host1', 'Someone Else')).toThrow('player already in room');
  });

  describe('capacity limits respect room.maxPlayers', () => {
    it('enforces capacity for maxPlayers = 3 (Host + 2 guests)', () => {
      let room = createRoom('host1', 'Host', 3);
      room = addPlayer(room, 'p2', 'P2');
      room = addPlayer(room, 'p3', 'P3');
      expect(Object.keys(room.players).length).toBe(3);
      expect(() => addPlayer(room, 'p4', 'P4')).toThrow('room is full');
    });

    it('enforces capacity for maxPlayers = 4', () => {
      let room = createRoom('host1', 'Host', 4);
      for (let i = 2; i <= 4; i++) {
        room = addPlayer(room, `p${i}`, `P${i}`);
      }
      expect(Object.keys(room.players).length).toBe(4);
      expect(() => addPlayer(room, 'p5', 'P5')).toThrow('room is full');
    });

    it('enforces capacity for maxPlayers = 8', () => {
      let room = createRoom('host1', 'Host', 8);
      for (let i = 2; i <= 8; i++) {
        room = addPlayer(room, `p${i}`, `P${i}`);
      }
      expect(Object.keys(room.players).length).toBe(8);
      expect(() => addPlayer(room, 'p9', 'P9')).toThrow('room is full');
    });

    it('allows 9 players when maxPlayers = 9 (removes old 8-player limit)', () => {
      let room = createRoom('host1', 'Host', 9);
      for (let i = 2; i <= 9; i++) {
        room = addPlayer(room, `p${i}`, `P${i}`);
      }
      expect(Object.keys(room.players).length).toBe(9);
      expect(() => addPlayer(room, 'p10', 'P10')).toThrow('room is full');
    });

    it('allows up to 15 players when maxPlayers = 15 (global max)', () => {
      let room = createRoom('host1', 'Host', 15);
      // Adding players 2 through 15 (including player 9) succeeds
      for (let i = 2; i <= 15; i++) {
        room = addPlayer(room, `p${i}`, `P${i}`);
      }
      expect(Object.keys(room.players).length).toBe(15);
      // 16th player fails
      expect(() => addPlayer(room, 'p16', 'P16')).toThrow('room is full');
    });
  });
});

describe('startGame', () => {
  it('deals 3 cards to each player and moves the room to playing', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.status).toBe('playing');
    expect(next.turnPhase).toBe('trap_placement');
    expect(next.players.host1.placedTrapThisTurn).toBe(false);
    expect(next.turnOrder.length).toBe(3);
    expect(next.players.host1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
    expect(next.drawPile.length).toBe(20 - 9);
  });

  it('resets actionRedirect and pendingActionObligations left over from a prior game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    room.actionRedirect = { toPlayerId: 'p2', remaining: 2 };
    room.pendingActionObligations = ['p3'];
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.actionRedirect).toBeFalsy();
    expect(next.pendingActionObligations ?? []).toEqual([]);
  });

  it('resets a leftover mustPlayActionThisTurn flag from a prior game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    room.players.p3.mustPlayActionThisTurn = true;
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.players.p3.mustPlayActionThisTurn).toBeFalsy();
  });

  it('can start with 3 players even when maxPlayers is 15', () => {
    let room = createRoom('host1', 'P1', 15);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.status).toBe('playing');
    expect(Object.keys(next.players).length).toBe(3);
  });

  it('can start with 15 players when maxPlayers is 15', () => {
    let room = createRoom('host1', 'P1', 15);
    for (let i = 2; i <= 15; i++) {
      room = addPlayer(room, `p${i}`, `P${i}`);
    }
    const allCodes = Array.from({ length: 60 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.status).toBe('playing');
    expect(next.turnOrder.length).toBe(15);
    expect(next.drawPile.length).toBe(60 - 45);
  });

  it('throws if fewer than 3 players are in the room', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    expect(() => startGame(room, ['A1'])).toThrow('need at least 3 players to start');
  });

  it('throws if the room has already started', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    expect(() => startGame(started, allCodes, () => 0)).toThrow('game already started');
  });
});

describe('resetForPlayAgain', () => {
  it('resets bonusActionPlaysRemaining to 0', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    started.players.host1.bonusActionPlaysRemaining = 1;
    started.status = 'finished';
    const next = resetForPlayAgain(started);
    expect(next.players.host1.bonusActionPlaysRemaining).toBe(0);
  });

  it('resets actionRedirect and pendingActionObligations left over from the finished game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    started.actionRedirect = { toPlayerId: 'p2', remaining: 2 };
    started.pendingActionObligations = ['p3'];
    started.status = 'finished';
    const next = resetForPlayAgain(started);
    expect(next.actionRedirect).toBeFalsy();
    expect(next.pendingActionObligations ?? []).toEqual([]);
  });

  it('resets a leftover mustPlayActionThisTurn flag from the finished game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    started.players.p3.mustPlayActionThisTurn = true;
    started.status = 'finished';
    const next = resetForPlayAgain(started);
    expect(next.players.p3.mustPlayActionThisTurn).toBeFalsy();
  });
});

describe('setGameSuggester', () => {
  function setupRoom() {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    return startSetup(room);
  }

  it('records the chosen player as gameSuggesterId', () => {
    const room = setupRoom();
    const next = setGameSuggester(room, 'p2');
    expect(next.gameSuggesterId).toBe('p2');
  });

  it('throws for a player not in the room', () => {
    const room = setupRoom();
    expect(() => setGameSuggester(room, 'nobody')).toThrow('player not in room');
  });

  it('throws outside of setup status', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    expect(() => setGameSuggester(room, 'p2')).toThrow('can only set the game suggester during setup');
  });
});

describe('removePlayer', () => {
  it('removes a non-host player and leaves the host unchanged', () => {
    let room = createRoom('host1', 'Ploy', 4);
    room = addPlayer(room, 'p2', 'Nut');
    const next = removePlayer(room, 'p2');
    expect(next.players.p2).toBeUndefined();
    expect(Object.keys(next.players)).toEqual(['host1']);
    expect(next.hostId).toBe('host1');
  });

  it('reassigns the host to a remaining player when the host leaves', () => {
    let room = createRoom('host1', 'Ploy', 4);
    room = addPlayer(room, 'p2', 'Nut');
    room = addPlayer(room, 'p3', 'Bank');
    const next = removePlayer(room, 'host1');
    expect(next.players.host1).toBeUndefined();
    expect(next.hostId).not.toBe('host1');
    expect(['p2', 'p3']).toContain(next.hostId);
  });

  it('is a no-op when the player is not in the room', () => {
    const room = createRoom('host1', 'Ploy', 4);
    const next = removePlayer(room, 'nobody');
    expect(next).toEqual(room);
  });
});

describe('restartGame (A092)', () => {
  function playingRoom() {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 15 }, (_, i) => `A${i + 1}`);
    return startGame(room, allCodes, () => 0);
  }

  it('pools drawPile, discardPile, every hand, and every trap, then deals 3 fresh cards per player', () => {
    const room = playingRoom();
    // Simulate a card already in the discard pile and a placed trap before A092 fires.
    room.discardPile = [room.drawPile.pop()!, room.drawPile.pop()!];
    room.players.p3.traps = [room.drawPile.pop()!];

    const before = new Set([
      ...room.drawPile, ...room.discardPile,
      ...room.players.host1.hand, ...room.players.p2.hand, ...room.players.p3.hand,
      ...room.players.p3.traps,
    ]);

    const next = restartGame(room, () => 0);

    expect(next.status).toBe('playing');
    expect(next.discardPile).toEqual([]);
    expect(next.players.host1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
    expect(next.players.p3.traps).toEqual([]);
    const after = new Set([
      ...next.drawPile,
      ...next.players.host1.hand, ...next.players.p2.hand, ...next.players.p3.hand,
    ]);
    expect(after).toEqual(before);
    expect(next.drawPile.length).toBe(before.size - 9);
  });

  it('resets turn order to seatOrder[0]-first, muffinTimeTarget to 10, and clears win/end-of-game and reaction-stack state', () => {
    const room = {
      status: 'playing',
      hostId: 'host1',
      seatOrder: ['host1', 'p2', 'p3'],
      turnOrder: ['p2', 'p3', 'host1'],
      currentTurnIndex: 2,
      direction: 1,
      muffinTimeTarget: 6,
      drawPile: ['A01', 'A02', 'A03'],
      discardPile: ['A04'],
      players: {
        host1: { name: 'Host', hand: ['A05'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'P2', hand: ['A06'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'P3', hand: ['A07'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      winnerId: 'p2',
      finishReason: 'normal',
      gameEndReason: 'muffin_time',
      winnerPlayerIds: ['p2'],
      finalHandCounts: { p2: 6 },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p2' }],
      pendingWinChecks: [{ sourcePlayerId: 'host1', type: 'hand_nonempty' }],
      pendingActionObligations: ['p3'],
      actionRedirect: { toPlayerId: 'p3', remaining: 2 },
      reactionStack: [{ frameId: 'f1', sourceType: 'action' }],
      pendingResponse: { responseId: 'r1', kind: 'action', code: 'A092', actorId: 'host1' },
      pendingInteraction: { interactionId: 'i1', type: 'date_invite', sourceCardCode: 'T10', initiatorId: 'host1', targetPlayerId: 'p2', timestamp: 0 },
      lastResult: { kind: 'action', code: 'A092', actorId: 'host1', countered: false },
      isShufflingDrawPile: true,
      shuffleSequence: 5,
      placedTrapMeta: { fake: { ownerId: 'p3', placedSequence: 1, placedRound: 1, placedByPlayerTurnIndex: 0 } },
      pendingForcedDiscards: { fake: { operationId: 'op1', targetPlayerId: 'p3', requestedCount: 1, cardCodes: [], originalDestination: 'discard', intercepted: false, status: 'pending' } },
      roundNumber: 4,
    } as unknown as RoomState;

    const next = restartGame(room, () => 0);

    expect(next.turnOrder).toEqual(['host1', 'p2', 'p3']);
    expect(next.currentTurnIndex).toBe(0);
    expect(next.muffinTimeTarget).toBe(10);
    expect(next.winnerId).toBeUndefined();
    expect(next.finishReason).toBeUndefined();
    expect(next.gameEndReason).toBeUndefined();
    expect(next.winnerPlayerIds).toBeUndefined();
    expect(next.finalHandCounts).toBeUndefined();
    expect(next.globalRestrictions).toEqual([]);
    expect(next.pendingWinChecks).toEqual([]);
    expect(next.pendingActionObligations).toBeUndefined();
    expect(next.actionRedirect).toBeNull();
    expect(next.reactionStack).toEqual([]);
    expect(next.pendingResponse).toBeNull();
    expect(next.pendingInteraction).toBeNull();
    expect(next.lastResult).toBeNull();
    expect(next.isShufflingDrawPile).toBe(false);
    expect(next.shuffleSequence).toBe(0);
    expect(next.placedTrapMeta).toEqual({});
    expect(next.pendingForcedDiscards).toEqual({});
    expect(next.roundNumber).toBe(1);
  });

  it('preserves hostId, joinOrder, maxPlayers, gameSuggesterId, and per-player name/connected/birthdayMMDD', () => {
    const room = playingRoom();
    room.gameSuggesterId = 'p2';
    room.players.p3.birthdayMMDD = '05-10';
    room.players.p2.connected = false;

    const next = restartGame(room, () => 0);

    expect(next.hostId).toBe('host1');
    expect(next.joinOrder).toEqual(room.joinOrder);
    expect(next.maxPlayers).toBe(room.maxPlayers);
    expect(next.gameSuggesterId).toBe('p2');
    expect(next.players.p3.birthdayMMDD).toBe('05-10');
    expect(next.players.p2.connected).toBe(false);
    expect(next.players.host1.name).toBe('P1');
  });

  it('is a no-op outside "playing" status', () => {
    const room = {
      status: 'lobby', hostId: 'host1', turnOrder: [], currentTurnIndex: 0, direction: 1,
      muffinTimeTarget: 10, drawPile: [], discardPile: [], players: {},
    } as unknown as RoomState;
    expect(restartGame(room)).toEqual(room);
  });
});
