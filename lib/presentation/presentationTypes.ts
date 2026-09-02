import type { PlayerId, CardCode } from '../../game/types';

export type PresentationEventType =
  | 'CARD_DRAW'
  | 'ACTION_PLAYED'
  | 'TRAP_PLACED'
  | 'TRAP_ACTIVATED'
  | 'COUNTER_PLAYED'
  | 'CARD_TRANSFER'
  | 'CARD_DISCARDED'
  | 'MUFFIN_TIME_REACHED'
  | 'YOUR_TURN'
  | 'RESPONSE_REQUIRED'
  | 'GAME_WINNER';

export interface PresentationEvent {
  id: string;
  type: PresentationEventType;
  actorId: PlayerId;
  actorName?: string;
  targetId?: PlayerId;
  targetName?: PlayerId;
  /** Public card details - NEVER populated for hidden cards (draws, trap placement, hidden transfer) */
  cardCode?: CardCode;
  cardTitle?: string;
  count?: number;
  sourceAnchorType?: 'deck' | 'player' | 'trap' | 'play_area' | 'discard';
  sourceAnchorId?: string;
  destAnchorType?: 'deck' | 'player' | 'trap' | 'play_area' | 'discard';
  destAnchorId?: string;
  timestamp: number;
}

export interface ActivityItem {
  id: string;
  message: string;
  type: PresentationEventType;
  timestamp: number;
}
