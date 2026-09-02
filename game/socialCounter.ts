import { cloneState } from './util';
import { draw } from './pile';
import { executeRandomSteal } from './primitives';
import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';
import type { RoomState, PlayerId, CardCode } from './types';
import type { SocialCounterPlayedPayload } from './events';

/**
 * The exhaustive set of Counter cards that use the Manual Social Counter flow.
 * These cards reference real-world events (drinking, embarrassing tasks, controlling behavior)
 * that the digital engine cannot detect automatically.
 * The player is the authoritative trigger — confirming "this real-world event happened."
 */
export const SOCIAL_COUNTER_CODES = new Set<CardCode>([
  'C41', // Skip My Round — stop an action card that forces you to drink
  'C42', // Sneaky Swap — stop forced drink, redirect to another player
  'C43', // Not My Cup — stop embarrassing task order
  'C44', // Still Sober — not affected by drunk-behavior trap
  'C46', // Split the Shot — split forced drink with another player
  'C48', // Water Please — stop forced drink, draw 1 card instead
  'C49', // Fake Drunk — stop drunk-behavior trap from triggering
  'C50', // Cut Them Off — stop controlling/ordering, steal 1 card
]);

export function isSocialCounter(code: CardCode): boolean {
  return SOCIAL_COUNTER_CODES.has(code);
}

export type SocialCounterResultType = SocialCounterPlayedPayload['resultType'];

interface SocialCounterConfig {
  needsTarget: boolean;
  resultType: SocialCounterResultType;
  targetMustBeDifferent: boolean;
}

const SOCIAL_COUNTER_CONFIG: Record<string, SocialCounterConfig> = {
  C41: { needsTarget: false, resultType: 'cancel', targetMustBeDifferent: false },
  C42: { needsTarget: true, resultType: 'redirect', targetMustBeDifferent: true },
  C43: { needsTarget: true, resultType: 'cancel', targetMustBeDifferent: true },
  C44: { needsTarget: false, resultType: 'cancel', targetMustBeDifferent: false },
  C46: { needsTarget: true, resultType: 'split', targetMustBeDifferent: true },
  C48: { needsTarget: false, resultType: 'replace_draw', targetMustBeDifferent: false },
  C49: { needsTarget: false, resultType: 'cancel', targetMustBeDifferent: false },
  C50: { needsTarget: true, resultType: 'cancel_and_steal', targetMustBeDifferent: true },
};

/**
 * Returns the configuration for a social counter card, or undefined if not a social counter.
 */
export function getSocialCounterConfig(code: CardCode): SocialCounterConfig | undefined {
  return SOCIAL_COUNTER_CONFIG[code];
}

/**
 * Returns all social counter cards currently in a player's hand.
 * Does NOT filter by situation — social triggers are player-declared.
 */
export function getPlayableSocialCounters(hand: CardCode[]): CardCode[] {
  return hand.filter((code) => SOCIAL_COUNTER_CODES.has(code));
}

/**
 * Validates a social counter play request.
 * Returns null if valid, or an error string if invalid.
 */
export function validateSocialCounterPlay(
  state: RoomState,
  actorId: PlayerId,
  counterCode: CardCode,
  targetPlayerId?: PlayerId
): string | null {
  // Must be a recognized social counter
  if (!SOCIAL_COUNTER_CODES.has(counterCode)) {
    return `${counterCode} is not a social counter.`;
  }

  // Actor must exist
  const actor = state.players[actorId];
  if (!actor) {
    return `Player ${actorId} does not exist.`;
  }

  // Actor must own the exact card
  if (!actor.hand.includes(counterCode)) {
    return `Player ${actorId} does not have ${counterCode} in hand.`;
  }

  const config = SOCIAL_COUNTER_CONFIG[counterCode];
  if (!config) {
    return `No configuration for ${counterCode}.`;
  }

  // Target validation
  if (config.needsTarget) {
    if (!targetPlayerId) {
      return `${counterCode} requires a target player.`;
    }
    if (!state.players[targetPlayerId]) {
      return `Target player ${targetPlayerId} does not exist.`;
    }
    if (config.targetMustBeDifferent && targetPlayerId === actorId) {
      return `${counterCode} cannot target yourself.`;
    }
  }

  return null;
}

/**
 * Executes a social counter play.
 * This is the authoritative command for social/physical counters.
 *
 * Flow:
 * 1. Validate ownership + target
 * 2. Remove exact counter card from hand
 * 3. Discard exact counter card
 * 4. Apply any digital secondary effect (C48 draw, C50 steal)
 * 5. Emit SOCIAL_COUNTER_PLAYED event
 * 6. Return new state (atomic: on failure, returns unchanged state)
 *
 * NON-REACTIVE: Does NOT push StackFrames, open Reaction Windows, or trigger traps.
 */
export function playSocialCounter(
  state: RoomState,
  actorId: PlayerId,
  counterCode: CardCode,
  targetPlayerId?: PlayerId
): RoomState {
  // Validate
  const error = validateSocialCounterPlay(state, actorId, counterCode, targetPlayerId);
  if (error !== null) {
    return state; // Atomic rejection
  }

  const config = SOCIAL_COUNTER_CONFIG[counterCode]!;
  let next = cloneState(state);

  // 1. Remove exact counter card from hand
  const handIdx = next.players[actorId].hand.indexOf(counterCode);
  if (handIdx === -1) return state; // Safety: should never happen after validation
  next.players[actorId].hand.splice(handIdx, 1);

  // 2. Discard exact counter card
  next.discardPile.push(counterCode);

  // 3. Apply digital secondary effects
  switch (counterCode) {
    case 'C48': {
      // "Stop being forced to drink and draw 1 card instead."
      // Uses authoritative draw primitive; respects deck exhaustion.
      next = draw(next, actorId, 1);
      break;
    }
    case 'C50': {
      // "Stop another player from controlling you, then steal 1 card from them."
      // Uses authoritative steal primitive.
      if (targetPlayerId && next.players[targetPlayerId]) {
        next = executeRandomSteal(next, targetPlayerId, actorId, 1).state;
      }
      break;
    }
    // C41, C42, C43, C44, C46, C49: pure social effect, no digital secondary.
    default:
      break;
  }

  // 4. Emit event
  appendGameEvent(
    next,
    createGameEvent(
      GAME_EVENT_TYPES.SOCIAL_COUNTER_PLAYED,
      actorId,
      {
        actorId,
        counterCode,
        targetPlayerId,
        resultType: config.resultType,
      },
      targetPlayerId ? [actorId, targetPlayerId] : [actorId]
    )
  );

  return next;
}
