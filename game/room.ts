import { cloneState, shuffle } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';

export const GLOBAL_MIN_PLAYERS = 3;
export const GLOBAL_MAX_PLAYERS = 15;

export function createRoom(
  hostId: PlayerId,
  hostName: string,
  maxPlayers: number = GLOBAL_MAX_PLAYERS
): RoomState {
  const validatedMax = Math.max(
    GLOBAL_MIN_PLAYERS,
    Math.min(GLOBAL_MAX_PLAYERS, Math.floor(maxPlayers) || GLOBAL_MAX_PLAYERS)
  );

  return {
    status: 'lobby',
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    maxPlayers: validatedMax,
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

export function addPlayer(
  state: RoomState,
  playerId: PlayerId,
  name: string,
  maxPlayers?: number
): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('cannot join a room that has already started');
  }
  const effectiveMax = maxPlayers ?? state.maxPlayers ?? GLOBAL_MAX_PLAYERS;
  if (Object.keys(state.players).length >= effectiveMax) {
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
  if (playerIds.length < GLOBAL_MIN_PLAYERS) {
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
