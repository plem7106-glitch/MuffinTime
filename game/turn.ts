import { cloneState } from './util';
import type { RoomState, PlayerId, PlayDirection } from './types';

export function getNextPlayerIndex(
  count: number,
  currentIndex: number,
  playDirection: PlayDirection | 1 | -1 = 'clockwise'
): number {
  if (count <= 0) return 0;
  const dir = playDirection === 'counterclockwise' || playDirection === -1 ? -1 : 1;
  return (((currentIndex + dir) % count) + count) % count;
}

export function getNextPlayerId(
  seatOrder: PlayerId[],
  currentPlayerId: PlayerId,
  playDirection: PlayDirection | 1 | -1 = 'clockwise'
): PlayerId {
  if (!seatOrder || seatOrder.length === 0) return '';
  const currentIndex = seatOrder.indexOf(currentPlayerId);
  if (currentIndex === -1) return seatOrder[0];
  const nextIndex = getNextPlayerIndex(seatOrder.length, currentIndex, playDirection);
  return seatOrder[nextIndex];
}

export function getTurnPreviewSequence(
  seatOrder: PlayerId[],
  playDirection: PlayDirection = 'clockwise'
): PlayerId[] {
  if (!seatOrder || seatOrder.length === 0) return [];
  if (playDirection === 'counterclockwise') {
    const list = [seatOrder[0]];
    for (let i = seatOrder.length - 1; i >= 1; i--) {
      list.push(seatOrder[i]);
    }
    list.push(seatOrder[0]);
    return list;
  }
  return [...seatOrder, seatOrder[0]];
}

export function advanceTurn(state: RoomState): RoomState {
  const next = cloneState(state);
  const order = next.seatOrder && next.seatOrder.length > 0 ? next.seatOrder : next.turnOrder;
  const count = order.length;
  if (count <= 0) return next;

  let index = next.currentTurnIndex;
  let attempts = 0;
  const dir = next.direction ?? (next.playDirection === 'counterclockwise' ? -1 : 1);
  let wrapped = false;

  // attempts <= count is a defensive backstop; in practice the loop always exits via the
  // inner `break` once it revisits a player whose flag it already cleared this call.
  do {
    const nextIdx = (((index + dir) % count) + count) % count;
    if (nextIdx === 0) {
      wrapped = true;
    }
    index = nextIdx;
    attempts++;
    const playerId = order[index];
    if (next.players[playerId]?.skipNextTurn) {
      next.players[playerId].skipNextTurn = false;
      continue;
    }
    break;
  } while (attempts <= count);

  next.currentTurnIndex = index;
  const activePlayerId = order[index];
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
  }
  next.turnPhase = 'trap_placement';
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  if (wrapped) {
    next.roundNumber = (next.roundNumber ?? 1) + 1;
  } else if (!next.roundNumber) {
    next.roundNumber = 1;
  }
  return next;
}

export function finishByDeckExhaustion(state: RoomState): RoomState {
  if (state.drawPile.length > 0) return state;
  const next = cloneState(state);
  const playerIds = Object.keys(next.players);
  if (playerIds.length === 0) return next;

  const finalHandCounts: Record<PlayerId, number> = {};
  let minDistance = Infinity;

  playerIds.forEach((id) => {
    const count = next.players[id]?.hand.length ?? 0;
    finalHandCounts[id] = count;
    const dist = Math.abs(count - 10);
    if (dist < minDistance) {
      minDistance = dist;
    }
  });

  const winners = playerIds.filter((id) => Math.abs((next.players[id]?.hand.length ?? 0) - 10) === minDistance);

  next.status = 'finished';
  next.finishReason = 'normal';
  next.gameEndReason = 'deck_exhausted';
  next.winnerId = winners[0];
  next.winnerPlayerIds = winners;
  next.finalHandCounts = finalHandCounts;

  return next;
}


export function isMuffinTimeEligible(state: RoomState, playerId: PlayerId): boolean {
  return state.players[playerId]?.hand.length === state.muffinTimeTarget;
}

export function declareMuffinTime(state: RoomState, playerId: PlayerId): RoomState {
  if (!isMuffinTimeEligible(state, playerId)) {
    throw new Error('player does not have the target hand count');
  }
  const next = cloneState(state);
  next.players[playerId].hasCalledMuffinTime = true;
  return next;
}

export function checkWinnerAtTurnStart(state: RoomState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(player?.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget);
}

export function clearMuffinTimeDeclaration(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  if (next.players[playerId]) {
    next.players[playerId].hasCalledMuffinTime = false;
  }
  return next;
}

/**
 * Emergency Force Skip Turn:
 * Reliably recovers a stuck game in both Bot Mode and real multiplayer.
 * - Safely clears active reaction stack frames and pending states without executing effects
 * - Cancels pending target selection & interactions
 * - Increments sequenceNumber to invalidate stale scheduled timers/callbacks
 * - Does NOT execute unresolved card effects
 * - Advances turn exactly once
 * - Next player starts at 'trap_placement'
 * - Preserves hands, deck, discard pile, active traps
 */
export function emergencyForceSkipTurn(state: RoomState): RoomState {
  const next = cloneState(state);

  // Safely clear any active reaction stack frames and pending states without executing effects
  next.reactionStack = [];
  next.pendingResponse = null;
  next.pendingInteraction = null;
  next.lastResult = null;
  next.isShufflingDrawPile = false;

  // Increment sequence number to invalidate any stale scheduled bot timers/callbacks
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  // Emergency recovery advances exactly one real turn-order position and ignores
  // normal skip flags so a recovery can never skip more than one player.
  const order = next.turnOrder.length > 0 ? next.turnOrder : (next.seatOrder ?? []);
  if (order.length === 0) return next;
  const dir = next.direction ?? (next.playDirection === 'counterclockwise' ? -1 : 1);
  next.currentTurnIndex = getNextPlayerIndex(order.length, next.currentTurnIndex, dir);
  next.turnPhase = 'trap_placement';
  const activePlayerId = order[next.currentTurnIndex];
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
  }
  return next;
}

