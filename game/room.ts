import { cloneState, shuffle } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export function createRoom(hostId: PlayerId, hostName: string): RoomState {
  return {
    status: 'lobby',
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      [hostId]: {
        name: hostName,
        hand: [],
        traps: [],
        connected: true,
        hasCalledMuffinTime: false,
        skipNextTurn: false,
      },
    },
  };
}

export function addPlayer(state: RoomState, playerId: PlayerId, name: string): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('cannot join a room that has already started');
  }
  if (Object.keys(state.players).length >= 8) {
    throw new Error('room is full');
  }
  if (state.players[playerId]) {
    throw new Error('player already in room');
  }
  const next = cloneState(state);
  next.players[playerId] = {
    name,
    hand: [],
    traps: [],
    connected: true,
    hasCalledMuffinTime: false,
    skipNextTurn: false,
  };
  return next;
}

export function startGame(state: RoomState, allCardCodes: CardCode[], rng: Rng = Math.random): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('game already started');
  }
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 3) {
    throw new Error('need at least 3 players to start');
  }
  const next = cloneState(state);
  next.turnOrder = shuffle(playerIds, rng);
  next.drawPile = shuffle(allCardCodes, rng);
  for (const playerId of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[playerId].hand.push(next.drawPile.pop()!);
    }
  }
  next.status = 'playing';
  next.currentTurnIndex = 0;
  return next;
}
