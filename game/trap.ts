import { cloneState } from './util';
import type { RoomState, PlayerId, CardCode } from './types';

/**
 * Places a Trap card from hand into the player's face-down active trap slots.
 * Enforces:
 * - Card must be in player's hand.
 * - Maximum 3 active traps per player.
 * - If on own turn, maximum 1 trap placement per turn.
 * - Transitions turnPhase from 'trap_placement' to 'main'.
 */
export function placeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  if (!player) throw new Error('player not found');

  if (player.traps.length >= 3) {
    throw new Error('trap limit reached: discard an existing trap first');
  }

  const isCurrentTurn = Boolean(
    next.turnOrder &&
      next.currentTurnIndex !== undefined &&
      next.turnOrder[next.currentTurnIndex] === playerId
  );
  if (isCurrentTurn && player.placedTrapThisTurn) {
    throw new Error('already placed a trap this turn');
  }

  const pos = player.hand.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('card not in hand');
  }

  player.hand.splice(pos, 1);
  player.traps.push(cardCode);

  next.placedTrapMeta = {
    ...next.placedTrapMeta,
    [`${playerId}_${cardCode}`]: {
      ownerId: playerId,
      placedSequence: next.sequenceNumber ?? 0,
      placedRound: next.roundNumber ?? 1,
      placedByPlayerTurnIndex: next.currentTurnIndex,
    },
  };

  if (isCurrentTurn) {
    player.placedTrapThisTurn = true;
    next.turnPhase = 'main';
  }

  return next;
}

/**
 * Explicitly skips the Trap Placement Phase at turn start, entering the Main Phase.
 */
export function skipTrapPlacement(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  const isCurrentTurn = Boolean(
    next.turnOrder &&
      next.currentTurnIndex !== undefined &&
      next.turnOrder[next.currentTurnIndex] === playerId
  );
  if (isCurrentTurn && (next.turnPhase === 'trap_placement' || !next.turnPhase)) {
    next.turnPhase = 'main';
  }
  return next;
}

/**
 * Replaces one active placed trap with a new trap from hand at the 3-trap limit.
 */
export function replaceTrap(
  state: RoomState,
  playerId: PlayerId,
  oldTrapCode: CardCode,
  newTrapCode: CardCode
): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  if (!player) throw new Error('player not found');

  const isCurrentTurn = Boolean(
    next.turnOrder &&
      next.currentTurnIndex !== undefined &&
      next.turnOrder[next.currentTurnIndex] === playerId
  );
  if (isCurrentTurn && player.placedTrapThisTurn) {
    throw new Error('already placed a trap this turn');
  }

  const oldPos = player.traps.indexOf(oldTrapCode);
  if (oldPos === -1) throw new Error('old trap not found in active traps');

  const newPos = player.hand.indexOf(newTrapCode);
  if (newPos === -1) throw new Error('new trap card not in hand');

  // Discard old trap
  player.traps.splice(oldPos, 1);
  next.discardPile.push(oldTrapCode);

  // Place new trap
  player.hand.splice(newPos, 1);
  player.traps.push(newTrapCode);

  if (isCurrentTurn) {
    player.placedTrapThisTurn = true;
    next.turnPhase = 'main';
  }

  return next;
}

/**
 * Removes a trap from active slots upon activation and puts it into discard pile.
 */
export function removeTrap(state: RoomState, playerId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  if (!player) throw new Error('player not found');

  const pos = player.traps.indexOf(cardCode);
  if (pos === -1) {
    throw new Error('trap not found');
  }
  player.traps.splice(pos, 1);
  next.discardPile.push(cardCode);
  return next;
}

