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

  if (rule.needsDualTargetSelection) {
    if (others.length < 2) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 2, rng);
    return { targetIds: [], customPayload: { firstId: others[idx[0]], secondId: others[idx[1]] } };
  }

  if (rule.needsTargetThenOutcome) {
    if (others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]], customPayload: { outcome: rng() < 0.5 } };
  }

  if (rule.needsDrinkCheck) {
    const alreadyDrunk = rng() < 0.5;
    if (alreadyDrunk || others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]] };
  }

  if (rule.needsOutcomeEntry) {
    return { targetIds: [], customPayload: { outcome: rng() < 0.5 } };
  }

  if (rule.needsNumberInput) {
    const min = rule.numberInputMin ?? 1;
    const max = rule.numberInputMax ?? Math.max(min, 5);
    const numberInput = min + Math.floor(rng() * (max - min + 1));
    return { targetIds: [], customPayload: { numberInput } };
  }

  if (rule.needsRosterSelection) {
    if (rule.rosterSelectionCount !== undefined) {
      const count = Math.min(rule.rosterSelectionCount, others.length);
      const idx = pickRandomIndices(others.length, count, rng);
      return { targetIds: idx.map((i) => others[i]) };
    }
    return { targetIds: others };
  }

  if (rule.needsTodayDate) {
    return { targetIds: [], customPayload: { today: today ?? '01-01' } };
  }

  if (rule.needsTargetSelection) {
    if (others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]] };
  }

  return { targetIds: [] };
}
