import { cloneState } from './util';
import type { RoomState, PlayerId, PlayerState, PlayDirection, PendingWinCheck } from './types';
import { getCardById } from '../data/cards/index';

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

/**
 * Checks whether the active player has completed their mandatory Main Choice
 * (either drew 1 card OR played 1 Action card).
 */
export function hasCompletedMainChoice(player?: {
  hasDrawnThisTurn?: boolean;
  hasPlayedActionThisTurn?: boolean;
}): boolean {
  return Boolean(player?.hasDrawnThisTurn || player?.hasPlayedActionThisTurn);
}

/**
 * Authoritative single rule governing whether a player can End Turn.
 */
export function canEndTurn(state: RoomState, playerId: PlayerId): boolean {
  const isCurrentTurn = Boolean(
    state.turnOrder &&
      state.currentTurnIndex !== undefined &&
      state.turnOrder[state.currentTurnIndex] === playerId
  );
  if (!isCurrentTurn) return false;
  if (state.turnPhase !== 'main') return false;
  const player = state.players[playerId];
  if (!player || !hasCompletedMainChoice(player)) return false;
  // A035 "Come Out to Play": a player obligated by a pending action
  // obligation can't end their turn until they've played an Action.
  if (player.mustPlayActionThisTurn && !player.hasPlayedActionThisTurn) return false;
  if (state.pendingResponse || state.pendingInteraction) return false;
  if (state.reactionStack && state.reactionStack.length > 0) return false;
  if (state.status !== 'playing') return false;
  if (state.isShufflingDrawPile) return false;
  return true;
}

/**
 * The 5-field per-turn PlayerState reset checklist, shared by beginTurn,
 * game/room.ts's startGame/resetForPlayAgain, and restartGame (A092) --
 * extracted so a future caller of "start this player's turn fresh" doesn't
 * need a fifth copy of this list.
 */
export function resetPlayerPerTurnFlags(player: PlayerState): void {
  player.placedTrapThisTurn = false;
  player.hasDrawnThisTurn = false;
  player.hasPlayedActionThisTurn = false;
  player.bonusActionPlaysRemaining = 0;
  player.mustPlayActionThisTurn = false;
}

/**
 * Establishes the canonical per-turn state for an active player beginning their turn:
 * - Resets their per-turn flags via resetPlayerPerTurnFlags
 * - turnPhase = 'trap_placement'
 * - Lifts global restrictions created by activePlayerId that were defined to expire on their next turn.
 */
export function beginTurn(state: RoomState, activePlayerId: PlayerId): RoomState {
  const next = cloneState(state);
  if (next.players[activePlayerId]) {
    resetPlayerPerTurnFlags(next.players[activePlayerId]);
    next.players[activePlayerId].trapImmunityUntilTurn = false;
  }
  next.turnPhase = 'trap_placement';

  // "...until your next turn" restrictions (A019/A072/A085) lift the moment
  // play returns to whoever created them.
  if (next.globalRestrictions && next.globalRestrictions.length > 0) {
    next.globalRestrictions = next.globalRestrictions.filter((r) => r.sourcePlayerId !== activePlayerId);
  }

  return next;
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
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  if (wrapped) {
    next.roundNumber = (next.roundNumber ?? 1) + 1;
  } else if (!next.roundNumber) {
    next.roundNumber = 1;
  }
  return beginTurn(next, activePlayerId);
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

/**
 * Evaluates and consumes every RoomState.pendingActionObligations entry
 * scheduled for `currentId` (A035 -- see RoomState.pendingActionObligations's
 * doc comment in ./types.ts). Called on every turn transition, alongside
 * resolvePendingWinChecks. The obligation is consumed (removed) unconditionally
 * -- if the player holds ≥1 Action card and no table-wide no_actions
 * restriction is active, mustPlayActionThisTurn is set for their current
 * turn; otherwise they're silently exempt.
 */
export function resolvePendingActionObligations(state: RoomState, currentId: PlayerId): RoomState {
  const pending = state.pendingActionObligations;
  if (!pending || !pending.includes(currentId)) return state;

  const next = cloneState(state);
  next.pendingActionObligations = pending.filter((id) => id !== currentId);

  const noActions = next.globalRestrictions?.some((r) => r.type === 'no_actions');
  const hand = next.players[currentId]?.hand ?? [];
  const hasAction = hand.some((code) => getCardById(code)?.type === 'action');
  if (hasAction && !noActions) {
    next.players[currentId].mustPlayActionThisTurn = true;
  }
  return next;
}

/**
 * The full "a player's turn has just started" resolution chain: pending win
 * checks (A023/A024/A027), then the standing muffin-time win check, then
 * pending action obligations (A035). Shared by lib/session.tsx's
 * advanceAndCheckWin (a normal turn-end) and A119's executeEffect (an
 * immediate mid-turn jump via jumpToPlayerTurn) so both turn-arrival paths
 * run the identical, single-tested chain instead of two copies drifting
 * apart.
 */
export function resolveTurnArrival(state: RoomState, currentId: PlayerId): RoomState {
  const afterPendingChecks = resolvePendingWinChecks(state, currentId);
  if (afterPendingChecks.status === 'finished') return afterPendingChecks;
  if (checkWinnerAtTurnStart(afterPendingChecks, currentId)) {
    return { ...afterPendingChecks, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return resolvePendingActionObligations(afterPendingChecks, currentId);
}

/**
 * A119 "จะรอทำไม?" (Why Wait?): jumps play immediately to targetId's next
 * turn, skipping everyone in between for this cycle with zero side effects
 * (mirrors how advanceTurn's own loop treats a skipNextTurn-flagged player
 * it steps past -- see the design spec's "Design decisions made by
 * precedent" section). Two phases:
 *   1. Walk step-by-step from the current position to targetId's raw slot,
 *      touching nothing along the way.
 *   2. From targetId's slot onward, behave exactly like advanceTurn's own
 *      stepping loop -- if skipNextTurn is set, clear it and keep walking
 *      until landing on someone who isn't flagged.
 * Lands via beginTurn (flag reset + restriction clearing), same as
 * advanceTurn/emergencyForceSkipTurn.
 *
 * Note for callers chaining resolveTurnArrival after this: both no-op paths
 * below (self-target, invalid targetId) still return a state whose current
 * player is the original actor -- resolveTurnArrival's live
 * checkWinnerAtTurnStart check would then re-evaluate for them mid-turn.
 * This function only guards its own jump/beginTurn; it does not guard
 * against that. A119's executeEffect (game/actionRules/definitions.ts)
 * validates the target itself before calling either function -- any future
 * caller chaining resolveTurnArrival after this one needs the same check.
 */
export function jumpToPlayerTurn(state: RoomState, targetId: PlayerId): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder && next.turnOrder.length > 0 ? next.turnOrder : (next.seatOrder ?? []);
  const count = order.length;
  const targetIndex = order.indexOf(targetId);
  if (count <= 0 || targetIndex === -1) return next;
  // A119's card text is "choose *another* player" -- targeting the current
  // active player is a no-op, not a mid-turn redo via beginTurn.
  if (order[next.currentTurnIndex] === targetId) return next;

  const dir = next.direction ?? (next.playDirection === 'counterclockwise' ? -1 : 1);
  let index = next.currentTurnIndex;
  let wrapped = false;

  // Phase 1: walk to targetId's raw slot, no side effects along the way.
  let steps = 0;
  while (index !== targetIndex && steps <= count) {
    const nextIdx = (((index + dir) % count) + count) % count;
    if (nextIdx === 0) wrapped = true;
    index = nextIdx;
    steps++;
  }

  // Phase 2: from targetId's slot onward, honor skipNextTurn exactly like
  // advanceTurn's own loop.
  let attempts = 0;
  while (next.players[order[index]]?.skipNextTurn && attempts <= count) {
    next.players[order[index]].skipNextTurn = false;
    const nextIdx = (((index + dir) % count) + count) % count;
    if (nextIdx === 0) wrapped = true;
    index = nextIdx;
    attempts++;
  }

  next.currentTurnIndex = index;
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;
  if (wrapped) {
    next.roundNumber = (next.roundNumber ?? 1) + 1;
  } else if (!next.roundNumber) {
    next.roundNumber = 1;
  }

  const activePlayerId = order[index];
  return beginTurn(next, activePlayerId);
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
  const activePlayerId = order[next.currentTurnIndex];
  return beginTurn(next, activePlayerId);
}

