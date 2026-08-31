import { cloneState, shuffle } from './util';
import type { RoomState, PlayerId, CardCode, Rng, PlayDirection } from './types';

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
    joinOrder: [hostId],
    seatOrder: [hostId],
    playDirection: 'clockwise',
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
  const existingJoinOrder = next.joinOrder ?? Object.keys(state.players);
  next.joinOrder = [...existingJoinOrder, playerId];
  next.seatOrder = [...next.joinOrder];
  next.playDirection = next.playDirection ?? 'clockwise';
  return next;
}

export function startSetup(state: RoomState): RoomState {
  if (state.status !== 'lobby') {
    throw new Error('cannot enter setup from non-lobby state');
  }
  const playerIds = Object.keys(state.players);
  if (playerIds.length < GLOBAL_MIN_PLAYERS) {
    throw new Error('need at least 3 players to start');
  }
  const next = cloneState(state);
  next.status = 'setup';
  const joinOrder =
    next.joinOrder && next.joinOrder.length === playerIds.length && next.joinOrder.every((id) => next.players[id])
      ? next.joinOrder
      : playerIds;
  next.joinOrder = [...joinOrder];
  next.seatOrder =
    next.seatOrder && next.seatOrder.length === playerIds.length && next.seatOrder.every((id) => next.players[id])
      ? [...next.seatOrder]
      : [...joinOrder];
  next.playDirection = next.playDirection ?? 'clockwise';
  return next;
}

export function updateSeatOrder(state: RoomState, seatOrder: PlayerId[]): RoomState {
  if (state.status !== 'setup') {
    throw new Error('can only update seat order in setup status');
  }
  const next = cloneState(state);
  next.seatOrder = [...seatOrder];
  return next;
}

export function updatePlayDirection(state: RoomState, direction: PlayDirection): RoomState {
  if (state.status !== 'setup') {
    throw new Error('can only update play direction in setup status');
  }
  const next = cloneState(state);
  next.playDirection = direction;
  return next;
}

export function startGame(state: RoomState, allCardCodes: CardCode[], rng: Rng = Math.random): RoomState {
  if (state.status !== 'lobby' && (state.status as string) !== 'setup') {
    throw new Error('game already started');
  }
  const playerIds = Object.keys(state.players);
  if (playerIds.length < GLOBAL_MIN_PLAYERS) {
    throw new Error('need at least 3 players to start');
  }
  const next = cloneState(state);
  const seatOrder =
    next.seatOrder && next.seatOrder.length === playerIds.length && next.seatOrder.every((id) => next.players[id])
      ? next.seatOrder
      : playerIds;
  next.seatOrder = [...seatOrder];
  next.turnOrder = [...seatOrder];
  next.playDirection = next.playDirection ?? 'clockwise';
  next.direction = next.playDirection === 'counterclockwise' ? -1 : 1;
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

