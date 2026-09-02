import { cloneState } from './util';
import type { RoomState, PlayerId, PlayDirection, PendingWinCheck } from './types';

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
  // turnOrder, not seatOrder, decides whose turn it is -- every gameplay
  // gate (lib/session.tsx) and the UI (GameTable's currentTurnPlayerId) read
  // turnOrder[currentTurnIndex]. seatOrder can diverge from turnOrder after
  // a seat-shuffle Action card (A010/A156/A172) and nothing resyncs them, so
  // walking seatOrder here would reset the wrong player's per-turn flags and
  // hand the turn to someone who never actually played. Matches
  // emergencyForceSkipTurn's array preference below.
  const order = next.turnOrder && next.turnOrder.length > 0 ? next.turnOrder : (next.seatOrder ?? []);
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
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
  }
  next.turnPhase = 'trap_placement';
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  // "...until your next turn" restrictions (A019/A072/A085) lift the moment
  // play returns to whoever created them.
  if (next.globalRestrictions && next.globalRestrictions.length > 0) {
    next.globalRestrictions = next.globalRestrictions.filter((r) => r.sourcePlayerId !== activePlayerId);
  }

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
  if (state.globalRestrictions?.some((r) => r.type === 'no_win')) return false;
  const player = state.players[playerId];
  return Boolean(player?.hasCalledMuffinTime && player.hand.length === state.muffinTimeTarget);
}

/** The single player at the min/max hand size, or undefined on a tie
 * (A024/A027's "if tied, try again" -> no winner declared this time). */
function extremeHandSizeWinner(state: RoomState, direction: 'min' | 'max'): PlayerId | undefined {
  const ids = Object.keys(state.players);
  if (ids.length === 0) return undefined;
  const sizes = ids.map((id) => state.players[id].hand.length);
  const extreme = direction === 'min' ? Math.min(...sizes) : Math.max(...sizes);
  const tied = ids.filter((id) => state.players[id].hand.length === extreme);
  return tied.length === 1 ? tied[0] : undefined;
}

function evaluatePendingWinCheck(state: RoomState, check: PendingWinCheck): PlayerId | undefined {
  switch (check.type) {
    case 'hand_nonempty':
      return (state.players[check.sourcePlayerId]?.hand.length ?? 0) > 0 ? check.sourcePlayerId : undefined;
    case 'fewest_hand':
      return extremeHandSizeWinner(state, 'min');
    case 'most_hand':
      return extremeHandSizeWinner(state, 'max');
  }
}

/**
 * Evaluates and consumes every RoomState.pendingWinChecks entry scheduled
 * for `currentId` (A023/A024/A027 -- see PendingWinCheck's doc comment in
 * ./types.ts). Called on every turn transition, right alongside
 * checkWinnerAtTurnStart. Matching entries are always removed (consume-once),
 * regardless of whether they produce a winner -- a no_win restriction or a
 * tie means "no winner this time", not "check again next time it's your turn".
 */
export function resolvePendingWinChecks(state: RoomState, currentId: PlayerId): RoomState {
  const pending = state.pendingWinChecks;
  if (!pending || pending.length === 0) return state;
  const matching = pending.filter((c) => c.sourcePlayerId === currentId);
  if (matching.length === 0) return state;

  const next = cloneState(state);
  next.pendingWinChecks = pending.filter((c) => c.sourcePlayerId !== currentId);

  const noWin = next.globalRestrictions?.some((r) => r.type === 'no_win');
  for (const check of matching) {
    if (next.status !== 'playing' || noWin) break;
    const winnerId = evaluatePendingWinCheck(next, check);
    if (winnerId) {
      next.status = 'finished';
      next.winnerId = winnerId;
      next.finishReason = 'normal';
    }
  }
  return next;
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
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
  }
  if (next.globalRestrictions && next.globalRestrictions.length > 0) {
    next.globalRestrictions = next.globalRestrictions.filter((r) => r.sourcePlayerId !== activePlayerId);
  }
  return next;
}

