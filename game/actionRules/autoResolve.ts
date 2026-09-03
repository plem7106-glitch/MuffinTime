import type { CardCode, PlayerId, RoomState, Rng } from '../types';
import { getActionRule } from './registry';
import { pickRandomIndices } from '../util';

export interface AutoResolvedInput {
  targetIds: PlayerId[];
  customPayload?: Record<string, unknown>;
}

/**
 * Fills in a card's required manual input (target/roster/outcome/etc.) with
 * a sensible random default, for the two Cluster D cards (A017, A108) that
 * cause a DIFFERENT card's effect to resolve with no live player available
 * to ask -- see docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md.
 * Not used for A028 (input gathered live through the normal co-play UI) or
 * A094 (input reused verbatim from history). `rng` defaults to `Math.random`
 * per this codebase's established pattern for helper FUNCTIONS (not
 * executeEffect itself, which must stay a pure function of (state, frame)
 * with no injectable parameters at all -- see game/pile.ts's draw()).
 * Excludes the actor from candidate selection uniformly; this codebase's
 * per-card target lists occasionally allow self-targeting, a simplification
 * accepted for this auto-resolve path specifically (documented in the
 * design spec).
 */
export function autoResolveInputFrame(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  today: string | undefined,
  rng: Rng = Math.random
): AutoResolvedInput | null {
  const rule = getActionRule(code);
  if (!rule) return null;

  const others = Object.keys(state.players).filter((id) => id !== actorId);

  let result: AutoResolvedInput;

  if (rule.needsDualTargetSelection) {
    if (others.length < 2) {
      result = { targetIds: [] };
    } else {
      const idx = pickRandomIndices(others.length, 2, rng);
      result = { targetIds: [], customPayload: { firstId: others[idx[0]], secondId: others[idx[1]] } };
    }
  } else if (rule.needsTargetThenOutcome) {
    if (others.length === 0) {
      result = { targetIds: [] };
    } else {
      const idx = pickRandomIndices(others.length, 1, rng);
      result = { targetIds: [others[idx[0]]], customPayload: { outcome: rng() < 0.5 } };
    }
  } else if (rule.needsDrinkCheck) {
    const alreadyDrunk = rng() < 0.5;
    if (alreadyDrunk || others.length === 0) {
      result = { targetIds: [] };
    } else {
      const idx = pickRandomIndices(others.length, 1, rng);
      result = { targetIds: [others[idx[0]]] };
    }
  } else if (rule.needsOutcomeEntry) {
    result = { targetIds: [], customPayload: { outcome: rng() < 0.5 } };
  } else if (rule.needsNumberInput) {
    const min = rule.numberInputMin ?? 1;
    const max = rule.numberInputMax ?? Math.max(min, 5);
    const numberInput = min + Math.floor(rng() * (max - min + 1));
    result = { targetIds: [], customPayload: { numberInput } };
  } else if (rule.needsRosterSelection) {
    if (rule.rosterSelectionCount !== undefined) {
      const count = Math.min(rule.rosterSelectionCount, others.length);
      const idx = pickRandomIndices(others.length, count, rng);
      result = { targetIds: idx.map((i) => others[i]) };
    } else {
      result = { targetIds: others };
    }
  } else if (rule.needsTargetSelection) {
    if (others.length === 0) {
      result = { targetIds: [] };
    } else {
      const idx = pickRandomIndices(others.length, 1, rng);
      result = { targetIds: [others[idx[0]]] };
    }
  } else {
    result = { targetIds: [] };
  }

  // needsTodayDate is orthogonal to the "shape" flags above -- a card can
  // need a target/roster/etc. AND a stamped `today` date (A017, A108 are the
  // only two that do). Merge it in after the shape is decided rather than
  // short-circuiting past target selection (see this function's history for
  // the bug this fixed).
  if (rule.needsTodayDate) {
    result = { ...result, customPayload: { ...result.customPayload, today: today ?? '01-01' } };
  }

  return result;
}
