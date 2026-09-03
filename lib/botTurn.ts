import type { RoomState, PlayerId, CardCode, Rng, PendingResponse, PendingInteraction } from '../game/types';
import { getPlayableCounters, type CounterContext } from '../game/counterRules/registry';
import { getTrapRule, isTrapImplemented } from '../game/trapRules/registry';
import { canActivateManualTrap } from '../game/trapRules/engine';
import { getActionRule, getPlayableActions } from '../game/actionRules/registry';
import { getCardsByType } from '../data/cards/index';

export type BotDecision =
  | { action: 'draw' }
  | { action: 'play'; code: CardCode; targetId?: PlayerId; customPayload?: Record<string, unknown> };

export type BotTrapPlacementDecision =
  | { action: 'place'; code: CardCode }
  | { action: 'skip' };

export type BotCounterDecision =
  | { action: 'counter'; code: CardCode; customPayload?: Record<string, unknown> }
  | { action: 'skip' };

const ACTION_PLAY_PROBABILITY = 0.5;
const TRAP_PLACE_PROBABILITY = 0.7;
const COUNTER_PLAY_PROBABILITY = 0.8;

/**
 * Decides whether a bot places a Trap card from hand during its trap_placement phase.
 */
export function decideBotTrapPlacement(
  state: RoomState,
  botId: PlayerId,
  rng: Rng = Math.random
): BotTrapPlacementDecision {
  const player = state.players[botId];
  if (!player) return { action: 'skip' };

  const currentTraps = player.traps ?? [];
  if (currentTraps.length >= 3) {
    return { action: 'skip' };
  }

  const trapCodes = new Set(getCardsByType('trap').map((c) => c.id));
  const handTraps = player.hand.filter((code) => trapCodes.has(code) || code.startsWith('T'));

  if (handTraps.length === 0 || rng() > TRAP_PLACE_PROBABILITY) {
    return { action: 'skip' };
  }

  const chosenCode = handTraps[Math.floor(rng() * handTraps.length)];
  return { action: 'place', code: chosenCode };
}

/**
 * Decides a bot's main phase action (draw vs play action card).
 */
export function decideBotTurn(
  state: RoomState,
  botId: PlayerId,
  rng: Rng = Math.random
): BotDecision {
  const hand = state.players[botId]?.hand ?? [];
  // A028 "Bad Spread" is excluded from bot candidate selection: its
  // executeEffect is an unreachable no-op stub outside the human-driven
  // co-play flow in components/room/GameTable.tsx (pick a partner Action
  // card, then play both together via playDoubledAction) -- bots have no
  // concept of that flow and would just discard A028 for nothing via
  // pushStackFrame directly (see lib/session.tsx's bot-auto-play effect,
  // which bypasses playAction/playDoubledAction entirely).
  const playableActions = getPlayableActions(state, botId).filter((code) => code !== 'A028');

  if (playableActions.length === 0 || rng() >= ACTION_PLAY_PROBABILITY) {
    return { action: 'draw' };
  }

  const code = playableActions[Math.floor(rng() * playableActions.length)];
  const filled = fillBotActionInputs(state, botId, code, rng);
  if (!filled) return { action: 'draw' };
  return { action: 'play', code, targetId: filled.targetId, customPayload: filled.customPayload };
}

/**
 * Answers, on a bot's behalf, every question the UI would ask a human before
 * this card can resolve -- the roster picker, the outcome toggle, the dual
 * pick, the number input, the date stamp.
 *
 * Without this a bot pushed a frame carrying nothing but a code and a targetId,
 * so `rosterIdsFromFrame` came back empty and the card resolved into a no-op.
 * That silently applied to every roster/outcome/number card a bot could draw
 * (A063 "steal from any number of players" among them): the card was discarded,
 * the turn moved on, and nothing happened.
 *
 * Returns null when the table cannot satisfy the card (too few players for a
 * fixed-size roster or a dual pick) -- the caller should draw instead.
 */
export function fillBotActionInputs(
  state: RoomState,
  botId: PlayerId,
  code: CardCode,
  rng: Rng = Math.random
): { targetId?: PlayerId; customPayload?: Record<string, unknown> } | null {
  const rule = getActionRule(code);
  const otherIds = Object.keys(state.players).filter((id) => id !== botId);
  const humanIds = otherIds.filter((id) => !id.startsWith('bot-'));
  const candidates = humanIds.length > 0 ? humanIds : otherIds;
  // A bot can legitimately be the answer to its own mini-game or superlative.
  const pickPool = rule?.includeSelfAsCandidate ? [botId, ...candidates] : candidates;

  const payload: Record<string, unknown> = {};

  if (rule?.needsRosterSelection) {
    const pool = rule.includeSelfAsCandidate ? pickPool : candidates;
    if (pool.length === 0) return null;
    const want = rule.rosterSelectionCount ?? 1 + Math.floor(rng() * pool.length);
    if (rule.rosterSelectionCount !== undefined && pool.length < rule.rosterSelectionCount) {
      return null; // not enough players to satisfy a fixed-size roster
    }
    const shuffled = [...pool].sort(() => rng() - 0.5);
    payload.rosterIds = shuffled.slice(0, Math.min(want, pool.length));
  }
  if (rule?.needsOutcomeEntry || rule?.needsDrinkCheck || rule?.needsTargetThenOutcome) {
    payload.outcome = rng() < 0.5;
  }
  if (rule?.needsDualTargetSelection) {
    if (candidates.length < 2) return null;
    const shuffled = [...candidates].sort(() => rng() - 0.5);
    payload.firstId = shuffled[0];
    payload.secondId = shuffled[1];
  }
  if (rule?.needsNumberInput) {
    const min = rule.numberInputMin ?? 1;
    const max = rule.numberInputMax ?? min + 9;
    payload.numberInput = min + Math.floor(rng() * (max - min + 1));
  }
  if (rule?.needsTodayDate) {
    const now = new Date();
    payload.today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const customPayload = Object.keys(payload).length > 0 ? payload : undefined;
  if (rule?.needsTargetSelection !== true) return { customPayload };
  if (pickPool.length === 0) return null;
  return { targetId: pickPool[Math.floor(rng() * pickPool.length)], customPayload };
}

/**
 * Decides whether a bot plays a valid Counter card or skips when responding to a frame.
 */
export function decideBotCounter(
  state: RoomState,
  botId: PlayerId,
  pendingResponse: PendingResponse | null,
  contextOrRng?: CounterContext | Rng,
  rngParam?: Rng
): BotCounterDecision {
  const context = typeof contextOrRng === 'function' ? undefined : contextOrRng;
  const rng = typeof contextOrRng === 'function' ? contextOrRng : (rngParam ?? Math.random);

  const player = state.players[botId];
  if (!player) return { action: 'skip' };

  const validCounters = getPlayableCounters(player.hand, pendingResponse, context);
  if (validCounters.length === 0 || rng() > COUNTER_PLAY_PROBABILITY) {
    return { action: 'skip' };
  }

  const chosenCode = validCounters[Math.floor(rng() * validCounters.length)];
  let customPayload: Record<string, unknown> | undefined;
  if (chosenCode === 'C04' && context?.stealOp) {
    const stealOp = context.stealOp;
    const candidates = Object.keys(state.players).filter(
      (pid) => pid !== stealOp.thiefId && pid !== stealOp.victimId
    );
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      customPayload = { newVictimId: target };
    }
  }
  return { action: 'counter', code: chosenCode, customPayload };
}

/**
 * Decides a bot's response to an interactive invitation (e.g. T10 date invite).
 */
export function decideBotInteraction(
  _interaction: PendingInteraction,
  rng: Rng = Math.random
): 'accept' | 'refuse' {
  // Bots refuse date invitations 70% of the time to allow the T10 steal effect to trigger
  return rng() < 0.7 ? 'refuse' : 'accept';
}

/**
 * Evaluates whether a bot activates one of its active manual/honor traps.
 */
export function decideBotManualTrapActivation(
  state: RoomState,
  botId: PlayerId,
  rng: Rng = Math.random
): { code: CardCode; targetId?: PlayerId } | null {
  const player = state.players[botId];
  if (!player || !player.traps || player.traps.length === 0) return null;

  // Small simulated chance per check so bot doesn't spam all traps at once
  if (rng() > 0.25) return null;

  const manualTraps = player.traps.filter((code) => {
    const rule = getTrapRule(code);
    if (!rule || (rule.mode !== 'manual_honor' && rule.mode !== 'interactive')) return false;
    return canActivateManualTrap(state, botId, code);
  });

  if (manualTraps.length === 0) return null;

  const chosenTrap = manualTraps[Math.floor(rng() * manualTraps.length)];
  const otherIds = Object.keys(state.players).filter((id) => id !== botId);
  const humanIds = otherIds.filter((id) => !id.startsWith('bot-'));
  const candidates = humanIds.length > 0 ? humanIds : otherIds;
  const targetId = candidates.length > 0 ? candidates[Math.floor(rng() * candidates.length)] : undefined;

  return { code: chosenTrap, targetId };
}
