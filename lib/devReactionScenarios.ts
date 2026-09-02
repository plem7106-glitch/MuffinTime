import { allCards } from '../data/cards/index';
import { addPlayer, createRoom, startGame } from '../game/room';
import type { CardCode, RoomState } from '../game/types';

export type DevReactionScenario = 'r1-simple-counter' | 'r2-c35' | 'r5-counter-chain' | 'r6-multiple-responders' | 'r7-human-action-counter' | 's1-c43' | 's2-c48' | 's3-c50' | 's4-c41' | 'c01-a063';

const hands: Record<DevReactionScenario, CardCode[][]> = {
  'r1-simple-counter': [['A016'], ['C17'], ['A002']],
  'r2-c35': [['A016'], ['C35'], ['A002']],
  'r5-counter-chain': [['A016'], ['C29'], ['C17']],
  'r6-multiple-responders': [['A019'], ['C17'], ['C17']],
  'r7-human-action-counter': [['A002'], ['A016'], ['C17']],
  's1-c43': [['A016'], ['C43'], ['A002']],
  's2-c48': [['A016'], ['C48'], ['A002']],
  's3-c50': [['A001'], ['C50'], ['A002']],
  's4-c41': [['A016'], ['C41'], ['A002']],
  'c01-a063': [['A063', 'A001', 'A002', 'A003'], ['C01'], ['A004']],
};

export function createDevScenarioRoomCode(scenario: DevReactionScenario, random: () => number = Math.random): string {
  const nonce = Math.floor(random() * 1_000_000_000).toString().padStart(9, '0');
  return `bot-dev-${scenario}-${nonce}`;
}

export function createDevReactionScenario(scenario: DevReactionScenario, hostId: string, hostName: string): RoomState {
  if (process.env.NODE_ENV === 'production') throw new Error('development scenarios are unavailable in production');
  let state = createRoom(hostId, hostName, 3);
  state = addPlayer(state, 'bot-1', 'Source Bot');
  state = addPlayer(state, 'bot-2', 'Alternate Bot');
  state = startGame(state, allCards.map((card) => card.id), () => 0.5);
  applyDevReactionScenario(state, scenario, hostId);
  return state;
}

/** Applies only deterministic setup data after the real room start command.
 * Runtime reaction state is intentionally left to production gameplay. */
export function applyDevReactionScenario(state: RoomState, scenario: DevReactionScenario, hostId: string): RoomState {
  const next = state;
  const used = new Set(hands[scenario].flat());
  next.drawPile = next.drawPile.filter((code) => !used.has(code));
  next.turnOrder = ['bot-1', hostId, 'bot-2'];
  next.seatOrder = [...next.turnOrder];
  next.turnOrder.forEach((id, index) => { next.players[id].hand = [...hands[scenario][index]]; });
  next.turnPhase = 'main';
  next.devScenario = scenario;
  next.currentTurnIndex = scenario === 'r7-human-action-counter' ? 1 : 0;
  next.devForcedBotAction = {
    code: scenario === 'r6-multiple-responders' ? 'A019' : 'A016',
    ...(scenario === 'r6-multiple-responders' ? {} : { targetId: scenario === 'r5-counter-chain' ? 'bot-2' : hostId }),
  };
  if (scenario === 'r7-human-action-counter') next.devForcedBotAction = undefined;
  next.players[hostId].hasDrawnThisTurn = false;
  next.players[hostId].hasPlayedActionThisTurn = false;
  if (scenario.startsWith('s')) {
    next.currentTurnIndex = 1;
    next.devForcedBotAction = undefined;
    if (scenario === 's2-c48') {
      next.drawPile = ['A003', 'A004', ...next.drawPile.filter((code) => code !== 'A003' && code !== 'A004')];
    }
  }
  if (scenario === 'c01-a063') {
    next.currentTurnIndex = 0;
    next.devForcedBotAction = { code: 'A063', targetId: hostId };
  }
  return next;
}
