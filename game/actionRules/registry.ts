import { everyoneDraws, everyoneDiscards } from '../group';
import { draw } from '../pile';
import { executeDiscard } from '../primitives';
import { stealRandom } from '../transfer';
import type { CardCode, PlayerId, RoomState } from '../types';

const IMPLEMENTED_ACTIONS = new Set<CardCode>(['A001', 'A004', 'A008', 'A014', 'A016']);

export function isActionImplemented(code: CardCode): boolean {
  return IMPLEMENTED_ACTIONS.has(code);
}

export function getActionStatus(code: CardCode): 'implemented' | 'not_implemented' {
  return isActionImplemented(code) ? 'implemented' : 'not_implemented';
}

export function getImplementedActions(): CardCode[] {
  return [...IMPLEMENTED_ACTIONS];
}

export function getPlayableActions(state: RoomState, playerId: PlayerId): CardCode[] {
  const hand = state.players[playerId]?.hand ?? [];
  return hand.filter((code) => isActionImplemented(code));
}

export function resolveActionEffect(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  targetId?: PlayerId
): RoomState {
  if (!isActionImplemented(code)) return state;
  switch (code) {
    case 'A001': return everyoneDraws(state, 2, [actorId]);
    case 'A004': return draw(state, actorId, state.players[actorId].hand.length);
    case 'A008': return everyoneDiscards(state, 1, [actorId], Math.random, actorId);
    case 'A014': return targetId ? stealRandom(state, actorId, targetId, 1) : state;
    case 'A016': return targetId ? executeDiscard(state, targetId, state.players[targetId].hand.length, undefined, 'clamp_to_available', actorId).state : state;
    default: return state;
  }
}
