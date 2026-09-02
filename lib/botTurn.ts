import type { RoomState, PlayerId, CardCode, Rng, PendingResponse, PendingInteraction } from '../game/types';
import { getPlayableCounters, type CounterContext } from '../game/counterRules/registry';
import { getTrapRule, isTrapImplemented } from '../game/trapRules/registry';
import { canActivateManualTrap } from '../game/trapRules/engine';
import { getActionRule, getPlayableActions } from '../game/actionRules/registry';
import { getCardsByType } from '../data/cards/index';

export type BotDecision =
  | { action: 'draw' }
  | { action: 'play'; code: CardCode; targetId?: PlayerId };

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
  const playableActions = getPlayableActions(state, botId);

  if (playableActions.length === 0 || rng() >= ACTION_PLAY_PROBABILITY) {
    return { action: 'draw' };
  }

  const code = playableActions[Math.floor(rng() * playableActions.length)];
  const needsTarget = getActionRule(code)?.needsTargetSelection === true;
  if (!needsTarget) {
    return { action: 'play', code };
  }

  const otherIds = Object.keys(state.players).filter((id) => id !== botId);
  const humanIds = otherIds.filter((id) => !id.startsWith('bot-'));
  const candidates = humanIds.length > 0 ? humanIds : otherIds;
  if (candidates.length === 0) {
    return { action: 'draw' };
  }
  const targetId = candidates[Math.floor(rng() * candidates.length)];
  return { action: 'play', code, targetId };
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
