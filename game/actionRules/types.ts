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
  /** Needs "today" as MM-DD in the frame's customPayload (A037/A066/A137's
   * birthday comparisons). executeEffect must stay a pure function of
   * (state, frame) -- it never calls `new Date()` itself, since that would
   * make resolution depend on whichever client's clock/timezone happens to
   * resolve the frame. The caller (GameTable) stamps the date in before
   * pushing the frame, the same way a picker stamps rosterIds/outcome/etc. */
  needsTodayDate?: boolean;
  /** Needs a free-form number chosen by the actor before this resolves
   * (A135's "pick a new Muffin Time target"). Bounds are advisory for the UI
   * picker only -- executeEffect trusts whatever numberInputFromFrame
   * returns and simply no-ops on a missing/non-positive value. */
  needsNumberInput?: boolean;
  numberInputPrompt?: string;
  numberInputMin?: number;
  numberInputMax?: number;
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

/** MM-DD, as stamped by the caller before pushing the frame -- see
 * needsTodayDate. */
export function todayFromFrame(frame: StackFrame): string | undefined {
  return frame.customPayload?.today as string | undefined;
}

/** The number the actor chose, as stamped by the caller before pushing the
 * frame -- see needsNumberInput. */
export function numberInputFromFrame(frame: StackFrame): number | undefined {
  return frame.customPayload?.numberInput as number | undefined;
}
