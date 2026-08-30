import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';

describe('createRoom', () => {
  it('creates a lobby room with the host as the first player', () => {
    const room = createRoom('host1', 'Ploy');
    expect(room.status).toBe('lobby');
    expect(room.hostId).toBe('host1');
    expect(room.players.host1).toEqual({
      name: 'Ploy',
      hand: [],
      traps: [],
      connected: true,
      hasCalledMuffinTime: false,
      skipNextTurn: false,
    });
  });
});

describe('addPlayer', () => {
  it('adds a new player to a lobby room', () => {
    const room = createRoom('host1', 'Ploy');
    const next = addPlayer(room, 'p2', 'Nam');
    expect(next.players.p2.name).toBe('Nam');
    expect(Object.keys(next.players).length).toBe(2);
  });

  it('throws if the room already started', () => {
    const room = { ...createRoom('host1', 'Ploy'), status: 'playing' as const };
    expect(() => addPlayer(room, 'p2', 'Nam')).toThrow();
  });

  it('throws if the room already has 8 players', () => {
    let room = createRoom('host1', 'P1');
    for (let i = 2; i <= 8; i++) {
      room = addPlayer(room, `p${i}`, `P${i}`);
    }
    expect(() => addPlayer(room, 'p9', 'P9')).toThrow();
  });

  it('throws if the player id is already in the room', () => {
    const room = createRoom('host1', 'Ploy');
    expect(() => addPlayer(room, 'host1', 'Someone Else')).toThrow();
  });
});

describe('startGame', () => {
  it('deals 3 cards to each player and moves the room to playing', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.status).toBe('playing');
    expect(next.turnOrder.length).toBe(3);
    expect(next.players.host1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
    expect(next.drawPile.length).toBe(20 - 9);
  });

  it('throws if fewer than 3 players are in the room', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    expect(() => startGame(room, ['A1'])).toThrow();
  });

  it('throws if the room has already started', () => {
    let room = createRoom('host1', 'P1');
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    expect(() => startGame(started, allCodes, () => 0)).toThrow();
  });
});
