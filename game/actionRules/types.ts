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
  /** Roster picks must number exactly this many before confirm is allowed
   * (e.g. A172's "choose exactly 2 players to swap seats"). Unset means any
   * non-empty selection is fine. */
  rosterSelectionCount?: number;
  needsOutcomeEntry?: boolean;
  outcomePrompt?: string;
  outcomeYesLabel?: string;
  outcomeNoLabel?: string;
  /** Two sequential single-target picks with distinct roles (e.g. A115's
   * "tallest" then "shortest") -- click order alone can't safely disambiguate
   * roles in a multi-select roster, so this drives a dedicated two-step
   * TargetSelector flow instead. Results land in the frame's customPayload
   * as { firstId, secondId }. */
  needsDualTargetSelection?: boolean;
  dualTargetPrompts?: { first: string; second: string };
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

export function dualTargetIdsFromFrame(frame: StackFrame): { firstId?: PlayerId; secondId?: PlayerId } {
  return {
    firstId: frame.customPayload?.firstId as PlayerId | undefined,
    secondId: frame.customPayload?.secondId as PlayerId | undefined,
  };
}
