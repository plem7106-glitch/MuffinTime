import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, removePlayer, startGame, startSetup, setGameSuggester, resetForPlayAgain, GLOBAL_MIN_PLAYERS, GLOBAL_MAX_PLAYERS } from './room';

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
