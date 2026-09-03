import type { PlayerId, Rng, RoomState } from './types';

export function cloneState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state));
}

export function shuffle<T>(array: T[], rng: Rng = Math.random): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandomIndices(length: number, n: number, rng: Rng = Math.random): number[] {
  const indices = shuffle(
    Array.from({ length }, (_, i) => i),
    rng
  );
  return indices.slice(0, Math.min(n, length));
}

export function trackForcedLoss(state: RoomState, victimId: PlayerId, count: number): RoomState {
  if (count <= 0) return state;
  const next = cloneState(state);
  const player = next.players[victimId];
  if (player) player.forcedLossSinceLastTurn = (player.forcedLossSinceLastTurn ?? 0) + count;
  return next;
}
