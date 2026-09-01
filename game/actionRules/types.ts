import type { CardCode, PlayerId, RoomState, StackFrame } from '../types';

export type ActionResolutionKind = 'auto' | 'roster_select' | 'outcome_entry' | 'no_op';

export interface ActionRuleDefinition {
  code: CardCode;
  name_en: string;
  name_th: string;
  description_th: string;
  kind: ActionResolutionKind;
  needsTargetSelection?: boolean;
  targetPrompt?: string;
  needsRosterSelection?: boolean;
  rosterPrompt?: string;
  needsOutcomeEntry?: boolean;
  outcomePrompt?: string;
  executeEffect: (state: RoomState, frame: StackFrame) => RoomState;
}

export function rosterIdsFromFrame(frame: StackFrame): PlayerId[] {
  return (frame.customPayload?.rosterIds as PlayerId[] | undefined) ?? [];
}

export function winnerIdFromFrame(frame: StackFrame): PlayerId | undefined {
  return frame.customPayload?.winnerId as PlayerId | undefined;
}

export function outcomeFromFrame(frame: StackFrame): boolean | undefined {
  return frame.customPayload?.outcome as boolean | undefined;
}
