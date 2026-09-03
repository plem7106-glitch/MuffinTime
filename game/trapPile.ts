import { cloneState, pickRandomIndices, trackForcedLoss } from './util';
import type { CardCode, PlayerId, Rng, RoomState } from './types';

/**
 * "Family G1" primitives: operate on player.traps[] (placed-but-not-yet-triggered
 * Trap cards) instead of player.hand. Mirrors pile.ts/transfer.ts, but targets the
 * traps array -- no existing primitive touches it.
 */

export function discardTraps(
  state: RoomState,
  playerId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const traps = next.players[playerId].traps;
  let toDiscard: CardCode[];
  if (cardCodes) {
    if (cardCodes.length !== n) {
      throw new Error(`discardTraps: cardCodes length (${cardCodes.length}) does not match n (${n})`);
    }
    toDiscard = cardCodes;
  } else {
    const indices = pickRandomIndices(traps.length, Math.min(n, traps.length), rng);
    toDiscard = indices.map((i) => traps[i]);
  }
  for (const code of toDiscard) {
    const pos = traps.indexOf(code);
    if (pos === -1) throw new Error(`discardTraps: trap ${code} not found on ${playerId}`);
    traps.splice(pos, 1);
    next.discardPile.push(code);
  }
  return next;
}

export function discardAllTraps(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  const traps = next.players[playerId].traps;
  next.discardPile.push(...traps);
  next.players[playerId].traps = [];
  return next;
}

export function forceDiscardTraps(
  state: RoomState,
  victimId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  const before = state.players[victimId]?.traps.length ?? 0;
  const discarded = discardTraps(state, victimId, n, cardCodes, rng);
  const after = discarded.players[victimId]?.traps.length ?? 0;
  return trackForcedLoss(discarded, victimId, before - after);
}

export function forceDiscardAllTraps(state: RoomState, victimId: PlayerId): RoomState {
  const count = state.players[victimId]?.traps.length ?? 0;
  return trackForcedLoss(discardAllTraps(state, victimId), victimId, count);
}

export function returnTrapsToHand(
  state: RoomState,
  playerId: PlayerId,
  cardCodes: CardCode[] | null = null
): RoomState {
  const next = cloneState(state);
  const player = next.players[playerId];
  const toReturn = cardCodes ?? [...player.traps];
  for (const code of toReturn) {
    const pos = player.traps.indexOf(code);
    if (pos === -1) continue;
    player.traps.splice(pos, 1);
    player.hand.push(code);
  }
  return next;
}

export function stealTrap(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const fromTraps = next.players[fromId].traps;
  const pos = fromTraps.indexOf(cardCode);
  if (pos === -1) return next;
  fromTraps.splice(pos, 1);
  next.players[toId].traps.push(cardCode);
  return next;
}

/** Like stealTrap, but the taken card lands in the receiver's hand instead of
 * their traps (e.g. A059 "Mine Now" -- steal a placed trap back into your hand). */
export function stealTrapToHand(state: RoomState, fromId: PlayerId, toId: PlayerId, cardCode: CardCode): RoomState {
  const next = cloneState(state);
  const fromTraps = next.players[fromId].traps;
  const pos = fromTraps.indexOf(cardCode);
  if (pos === -1) return next;
  fromTraps.splice(pos, 1);
  next.players[toId].hand.push(cardCode);
  return next;
}
