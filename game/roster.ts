import { cloneState } from './util';
import { draw, discard } from './pile';
import { stealRandom } from './transfer';
import { skipTurn } from './turnFlow';
import type { PlayerId, Rng, RoomState } from './types';

/**
 * "Family A" style primitives: apply an effect to a manually-picked subset of
 * players (the roster a human selected via RosterSelector), rather than to
 * everyone or to a single chosen target. Each one is a thin loop around an
 * existing per-player primitive.
 */

export function rosterDraws(state: RoomState, playerIds: PlayerId[], n: number, rng: Rng = Math.random): RoomState {
  let next = cloneState(state);
  for (const playerId of playerIds) {
    next = draw(next, playerId, n, rng);
  }
  return next;
}

export function rosterDiscards(state: RoomState, playerIds: PlayerId[], n: number, rng: Rng = Math.random): RoomState {
  let next = cloneState(state);
  for (const playerId of playerIds) {
    next = discard(next, playerId, n, null, rng);
  }
  return next;
}

export function rosterStolenBy(
  state: RoomState,
  thiefId: PlayerId,
  victimIds: PlayerId[],
  n: number,
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const victimId of victimIds) {
    if (victimId === thiefId) continue;
    next = stealRandom(next, victimId, thiefId, n, rng);
  }
  return next;
}

export function rosterSkipTurn(state: RoomState, playerIds: PlayerId[]): RoomState {
  let next = cloneState(state);
  for (const playerId of playerIds) {
    next = skipTurn(next, playerId);
  }
  return next;
}
