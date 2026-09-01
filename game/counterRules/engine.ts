import { draw } from '../pile';
import type { CardCode, PlayerId, RoomState } from '../types';

export function resolveCounterEffect(state: RoomState, code: CardCode, actorId: PlayerId): RoomState {
  switch (code) {
    case 'C16': return draw(state, actorId, 3);
    case 'C17': return draw(state, actorId, 1);
    case 'C09': return state;
    default: return state;
  }
}
