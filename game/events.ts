import type { PlayerId, CardCode } from './types';

export const GAME_EVENT_TYPES = {
  FORCED_DISCARD: 'EVENT_FORCED_DISCARD',
  CARD_STOLEN: 'EVENT_CARD_STOLEN',
  ACTION_PLAYED: 'EVENT_ACTION_PLAYED',
  COUNTER_PLAYED: 'EVENT_COUNTER_PLAYED',
  TRAP_ACTIVATED: 'EVENT_TRAP_ACTIVATED',
  HAND_EMPTY: 'EVENT_HAND_EMPTY',
  HAND_OVERFLOW: 'EVENT_HAND_OVERFLOW',
  CARD_NAME_MATCH: 'EVENT_CARD_NAME_MATCH',
  MUFFIN_TIME_CALLED: 'EVENT_MUFFIN_TIME_CALLED',
  MANUAL_TRIGGER: 'EVENT_MANUAL_TRIGGER',
} as const;

export type GameEventType = (typeof GAME_EVENT_TYPES)[keyof typeof GAME_EVENT_TYPES];

export interface ForcedDiscardPayload {
  operationId?: string;
  sourcePlayerId?: PlayerId;
  victimId: PlayerId;
  actorId: PlayerId;
  count: number;
  targetPlayerId?: PlayerId;
  requestedCount?: number;
  actualCount?: number;
  cardCodes?: CardCode[];
  originalDestination?: unknown;
  finalDestination?: unknown;
  intercepted?: boolean;
}

export interface CardStolenPayload {
  victimId: PlayerId;
  thiefId: PlayerId;
  count: number;
  stolenCards?: CardCode[];
}

export interface ActionPlayedPayload {
  actorId: PlayerId;
  actionCode: CardCode;
  targetId?: PlayerId;
  targetIds?: PlayerId[];
}

export interface CounterPlayedPayload {
  actorId: PlayerId;
  counterCode: CardCode;
  targetFrameId: string;
}

export interface TrapActivatedPayload {
  ownerId: PlayerId;
  trapCode: CardCode;
  triggerPlayerIds?: PlayerId[];
  affectedPlayerIds?: PlayerId[];
  targetIds?: PlayerId[];
}

export interface HandCountPayload {
  playerId: PlayerId;
  currentCount: number;
  targetThreshold?: number;
}

export interface CardNameMatchPayload {
  actorId: PlayerId;
  cardCode: CardCode;
  matchedTerm: string;
}

export interface ManualTriggerPayload {
  ownerId: PlayerId;
  trapCode: CardCode;
  targetIds: PlayerId[];
  note?: string;
}

export type EventPayloadMap = {
  [GAME_EVENT_TYPES.FORCED_DISCARD]: ForcedDiscardPayload;
  [GAME_EVENT_TYPES.CARD_STOLEN]: CardStolenPayload;
  [GAME_EVENT_TYPES.ACTION_PLAYED]: ActionPlayedPayload;
  [GAME_EVENT_TYPES.COUNTER_PLAYED]: CounterPlayedPayload;
  [GAME_EVENT_TYPES.TRAP_ACTIVATED]: TrapActivatedPayload;
  [GAME_EVENT_TYPES.HAND_EMPTY]: HandCountPayload;
  [GAME_EVENT_TYPES.HAND_OVERFLOW]: HandCountPayload;
  [GAME_EVENT_TYPES.CARD_NAME_MATCH]: CardNameMatchPayload;
  [GAME_EVENT_TYPES.MUFFIN_TIME_CALLED]: HandCountPayload;
  [GAME_EVENT_TYPES.MANUAL_TRIGGER]: ManualTriggerPayload;
};

export interface GameEvent<K extends GameEventType = GameEventType> {
  eventId: string;
  type: K;
  emitterId: PlayerId;
  targetIds?: PlayerId[];
  payload: K extends keyof EventPayloadMap ? EventPayloadMap[K] : Record<string, unknown>;
  timestamp: number;
}

export function createGameEvent<K extends GameEventType>(
  type: K,
  emitterId: PlayerId,
  payload: K extends keyof EventPayloadMap ? EventPayloadMap[K] : Record<string, unknown>,
  targetIds?: PlayerId[]
): GameEvent<K> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  return {
    eventId: `evt-${timestamp}-${randomSuffix}`,
    type,
    emitterId,
    targetIds,
    payload,
    timestamp,
  };
}

export function appendGameEvent(state: { gameEvents?: GameEvent[] }, event: GameEvent): void {
  state.gameEvents = [...(state.gameEvents ?? []), event];
}
