import type { RoomState, PlayerId, CardCode, StackFrame } from '../types';
import type { GameEvent } from '../events';

export type TrapTriggerMode = 'manual_honor' | 'automatic_event' | 'automatic_state' | 'interactive';

export interface TrapTriggerResult {
  triggered: boolean;
  triggerPlayerIds?: PlayerId[];
  customPayload?: Record<string, unknown>;
  note?: string;
}

export interface TrapRuleDefinition {
  code: CardCode;
  name_en: string;
  name_th: string;
  mode: TrapTriggerMode;
  description_th: string;
  needsTargetSelection?: boolean;
  targetPrompt?: string;
  checkTrigger?: (state: RoomState, ownerId: PlayerId, event?: GameEvent) => TrapTriggerResult;
  resolveAffectedPlayers: (
    state: RoomState,
    ownerId: PlayerId,
    triggerPlayerIds: PlayerId[],
    customPayload?: Record<string, unknown>
  ) => PlayerId[];
  resolveEligibleResponders?: (
    state: RoomState,
    ownerId: PlayerId,
    affectedPlayerIds: PlayerId[],
    triggerPlayerIds: PlayerId[]
  ) => PlayerId[];
  executeEffect: (state: RoomState, frame: StackFrame) => RoomState;
}
