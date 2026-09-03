import { cloneState, shuffle } from './util';
import { beginTurn, resetPlayerPerTurnFlags, clearForcedLoss } from './turn';
import type { RoomState, PlayerId, CardCode, Rng, PlayDirection } from './types';

export const GLOBAL_MIN_PLAYERS = 3;
export const GLOBAL_MAX_PLAYERS = 15;

export function createRoom(
  hostId: PlayerId,
  hostName: string,
  maxPlayers: number = GLOBAL_MAX_PLAYERS,
  hostBirthdayMMDD?: string
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
    banishedCards: [],
    maxPlayers: validatedMax,
    players: {
      [hostId]: {
        name: hostName,
        hand: [],
        traps: [],
        connected: true,
        hasCalledMuffinTime: false,
        skipNextTurn: false,
        ...(hostBirthdayMMDD ? { birthdayMMDD: hostBirthdayMMDD } : {}),
      },
    },
  };
}

export function addPlayer(
  state: RoomState,
  playerId: PlayerId,
  name: string,
  maxPlayers?: number,
  birthdayMMDD?: string
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
    ...(birthdayMMDD ? { birthdayMMDD } : {}),
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

/** A118 ("steal 3 from whoever suggested this game") needs this one-time
 * fact captured before gameplay starts -- host-only, during setup once the
 * roster is locked (see RoomState.gameSuggesterId's doc comment). */
export function setGameSuggester(state: RoomState, playerId: PlayerId): RoomState {
  if (state.status !== 'setup') {
    throw new Error('can only set the game suggester during setup');
  }
  if (!state.players[playerId]) {
    throw new Error('player not in room');
  }
  const next = cloneState(state);
  next.gameSuggesterId = playerId;
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
  // Physical seatOrder without mutation or reversal
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
  for (const pid of Object.keys(next.players)) {
    resetPlayerPerTurnFlags(next.players[pid]);
    clearForcedLoss(next, pid); // end-of-turn field: no outgoing turn here, just don't inherit last game's tally
  }
  next.actionRedirect = null;
  next.bananaPeelArmed = false;
  next.pendingActionObligations = undefined;
  next.roundNumber = 1;
  next.sequenceNumber = 1;
  next.gameEndReason = undefined;
  next.winnerPlayerIds = undefined;
  next.finalHandCounts = undefined;
  const firstPlayerId = next.turnOrder[0];
  return beginTurn(next, firstPlayerId);
}


export function removePlayer(state: RoomState, playerId: PlayerId): RoomState {
  if (!state.players[playerId]) {
    return state;
  }
  const next = cloneState(state);
  delete next.players[playerId];

  if (next.joinOrder) {
    next.joinOrder = next.joinOrder.filter((id) => id !== playerId);
  }
  if (next.seatOrder) {
    next.seatOrder = next.seatOrder.filter((id) => id !== playerId);
  }
  if (next.turnOrder) {
    next.turnOrder = next.turnOrder.filter((id) => id !== playerId);
  }

  // If the host left and other players remain, designate the next player as host
  if (next.hostId === playerId) {
    const remainingIds =
      next.seatOrder && next.seatOrder.length > 0
        ? next.seatOrder
        : (next.joinOrder && next.joinOrder.length > 0 ? next.joinOrder : Object.keys(next.players));
    if (remainingIds.length > 0) {
      next.hostId = remainingIds[0];
    }
  }

  const remainingCount = Object.keys(next.players).length;
  if (remainingCount > 0) {
    next.currentTurnIndex = next.currentTurnIndex % remainingCount;
  } else {
    next.currentTurnIndex = 0;
  }

  return next;
}

export function finishGame(
  state: RoomState,
  winnerId: PlayerId,
  reason: 'normal' | 'manual' = 'normal'
): RoomState {
  if (state.status !== 'playing') {
    throw new Error('can only finish game while playing');
  }
  if (!state.players[winnerId]) {
    throw new Error(`winner ${winnerId} does not exist in room`);
  }
  const next = cloneState(state);
  next.status = 'finished';
  next.winnerId = winnerId;
  next.finishReason = reason;
  return next;
}

export function resetForPlayAgain(state: RoomState): RoomState {
  if (state.status !== 'finished' && (state.status as string) !== 'ended') {
    throw new Error('can only reset game when finished');
  }
  const next = cloneState(state);
  const playerIds = Object.keys(next.players);

  // Reset match-specific player state
  for (const pid of playerIds) {
    next.players[pid] = { ...next.players[pid], hand: [], traps: [], hasCalledMuffinTime: false, skipNextTurn: false };
    resetPlayerPerTurnFlags(next.players[pid]);
    clearForcedLoss(next, pid); // end-of-turn field: no outgoing turn here, just don't inherit last game's tally
  }
  next.actionRedirect = null;
  next.bananaPeelArmed = false;
  next.pendingActionObligations = undefined;

  next.status = 'lobby';
  next.winnerId = undefined;
  next.finishReason = undefined;
  next.gameEndReason = undefined;
  next.winnerPlayerIds = undefined;
  next.finalHandCounts = undefined;
  next.joinOrder =
    next.joinOrder && next.joinOrder.length === playerIds.length && next.joinOrder.every((id) => next.players[id])
      ? next.joinOrder
      : [...playerIds];
  next.seatOrder = [...next.joinOrder];
  next.playDirection = 'clockwise';
  next.turnOrder = [];
  next.currentTurnIndex = 0;
  next.direction = 1;
  next.drawPile = [];
  next.discardPile = [];
  next.isShufflingDrawPile = false;
  next.shuffleSequence = 0;
  next.roundNumber = 1;
  return next;
}

/**
 * A092 "ฉันบ้าไปแล้ว!" (I'm Crazy!): mid-game full restart. Unlike
 * resetForPlayAgain (which requires status 'finished'/'ended' and detours
 * through 'lobby'), this fires while status stays 'playing' -- it pools
 * every card currently anywhere in the game (not a fresh canonical deck,
 * per the card's own text), reshuffles, deals 3 fresh cards per player, and
 * resets turn order/win state/reaction-stack state. Room/social identity
 * fields (hostId, joinOrder, maxPlayers, gameSuggesterId, playDirection,
 * and each PlayerState's name/connected/birthdayMMDD) are deliberately left
 * untouched -- see the design spec's rulings for why gameSuggesterId in
 * particular is preserved rather than cleared.
 */
export function restartGame(state: RoomState, rng: Rng = Math.random): RoomState {
  if (state.status !== 'playing') return cloneState(state);
  const next = cloneState(state);
  const playerIds = Object.keys(next.players);

  // "นำไพ่ทั้งหมดกลับเข้ากอง" -- pool every card currently anywhere in the
  // game (not a fresh canonical deck).
  const pool: CardCode[] = [...next.drawPile, ...next.discardPile];
  for (const pid of playerIds) {
    pool.push(...next.players[pid].hand, ...next.players[pid].traps);
  }
  if (pool.length < playerIds.length * 3) {
    throw new Error('restartGame: not enough cards in the pool to deal 3 to every player');
  }
  next.drawPile = shuffle(pool, rng);
  next.discardPile = [];

  const seatOrder =
    next.seatOrder && next.seatOrder.length === playerIds.length && next.seatOrder.every((id) => next.players[id])
      ? next.seatOrder
      : playerIds;
  next.seatOrder = [...seatOrder];
  next.turnOrder = [...seatOrder];
  next.direction = next.playDirection === 'counterclockwise' ? -1 : 1;

  for (const pid of playerIds) {
    next.players[pid].hand = [];
    next.players[pid].traps = [];
    next.players[pid].hasCalledMuffinTime = false;
    next.players[pid].skipNextTurn = false;
    resetPlayerPerTurnFlags(next.players[pid]);
    clearForcedLoss(next, pid); // end-of-turn field: no outgoing turn here, just don't inherit last game's tally
  }
  for (const pid of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[pid].hand.push(next.drawPile.pop()!);
    }
  }

  next.currentTurnIndex = 0;
  next.muffinTimeTarget = 10;
  next.winnerId = undefined;
  next.finishReason = undefined;
  next.gameEndReason = undefined;
  next.winnerPlayerIds = undefined;
  next.finalHandCounts = undefined;
  next.globalRestrictions = [];
  next.pendingWinChecks = [];
  next.pendingActionObligations = undefined;
  next.actionRedirect = null;
  next.bananaPeelArmed = false;
  next.reactionStack = [];
  next.pendingResponse = null;
  next.pendingInteraction = null;
  next.lastResult = null;
  next.isShufflingDrawPile = false;
  next.shuffleSequence = 0;
  next.placedTrapMeta = {};
  next.pendingForcedDiscards = {};
  next.roundNumber = 1;
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  const firstPlayerId = next.turnOrder[0];
  return beginTurn(next, firstPlayerId);
}
