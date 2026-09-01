import type { RoomState, PlayerId, CardCode, Rng } from '../game/types';
import { demoCardsOfType } from './demoCards';

export type BotDecision = { action: 'draw' } | { action: 'play'; code: CardCode; targetId?: PlayerId };

const PLAY_PROBABILITY = 0.4;

export function decideBotTurn(state: RoomState, botId: PlayerId, rng: Rng = Math.random): BotDecision {
  const hand = state.players[botId]?.hand ?? [];
  const actionCards = demoCardsOfType('action');
  const actionCodes = new Set(actionCards.map((c) => c.code));
  const playableActions = hand.filter((code) => actionCodes.has(code));

  if (playableActions.length === 0 || rng() >= PLAY_PROBABILITY) {
    return { action: 'draw' };
  }

  const code = playableActions[Math.floor(rng() * playableActions.length)];
  const card = actionCards.find((c) => c.code === code);
  if (!card || !card.needsTarget) {
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
