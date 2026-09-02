import { ACTION_RULES_BATCH_1 } from './definitions';
import type { ActionRuleDefinition } from './types';
import type { CardCode, PlayerId, RoomState, StackFrame } from '../types';

const ACTION_RULES: Record<string, ActionRuleDefinition> = {
  ...ACTION_RULES_BATCH_1,
};

export function getActionRule(code: CardCode): ActionRuleDefinition | undefined {
  return ACTION_RULES[code];
}

export function isActionImplemented(code: CardCode): boolean {
  return code in ACTION_RULES;
}

export function getActionStatus(code: CardCode): 'implemented' | 'not_implemented' {
  return isActionImplemented(code) ? 'implemented' : 'not_implemented';
}

export function getImplementedActions(): CardCode[] {
  return Object.keys(ACTION_RULES);
}

export function getPlayableActions(state: RoomState, playerId: PlayerId): CardCode[] {
  const hand = state.players[playerId]?.hand ?? [];
  return hand.filter((code) => isActionImplemented(code));
}

/**
 * Builds a minimal StackFrame for callers that only have (code, actorId, targetId) —
 * e.g. the current lib/session.tsx call site. Once `roster_select`/`outcome_entry`
 * rules need frame.customPayload (rosterIds, winnerId, outcome), the caller should
 * push a real frame with that payload and call rule.executeEffect(state, frame)
 * directly instead of going through this adapter.
 */
function buildLegacyFrame(code: CardCode, actorId: PlayerId, targetId?: PlayerId): StackFrame {
  return {
    frameId: 'legacy',
    parentFrameId: null,
    sourceType: 'action',
    sourceCode: code,
    actorId,
    targetIds: targetId ? [targetId] : [],
    targetScope: targetId ? 'single' : 'all',
    eligibleResponderIds: [],
    responses: {},
    modifiers: [],
    status: 'resolving',
    turnContext: { turnIndex: 0, phase: 'main', roundNumber: 0 },
  };
}

export function resolveActionEffect(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  targetId?: PlayerId
): RoomState {
  const rule = getActionRule(code);
  if (!rule) return state;
  return rule.executeEffect(state, buildLegacyFrame(code, actorId, targetId));
}

/**
 * Executes an Action rule from a real StackFrame (preserving frame.customPayload
 * -- rosterIds, winnerId, outcome, etc.) instead of the (code, actorId, targetId)-only
 * legacy adapter above. Use this wherever the caller already has the frame.
 */
export function executeActionFrameEffect(state: RoomState, frame: StackFrame): RoomState {
  const rule = getActionRule(frame.sourceCode);
  if (!rule) return state;
  return rule.executeEffect(state, frame);
}
