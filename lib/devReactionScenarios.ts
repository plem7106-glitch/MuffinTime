import { allCards } from '../data/cards/index';
import { addPlayer, createRoom, startGame } from '../game/room';
import type { CardCode, RoomState } from '../game/types';

export type DevReactionScenario = 'r1-simple-counter' | 'r2-c35' | 'r5-counter-chain' | 'r6-multiple-responders' | 's1-c43' | 's2-c48' | 's3-c50' | 's4-c41' | 'c01-a063';

const hands: Record<DevReactionScenario, CardCode[][]> = {
  'r1-simple-counter': [['A016'], ['C17'], ['A002']],
  'r2-c35': [['A016'], ['C35'], ['A002']],
  'r5-counter-chain': [['A016'], ['C29'], ['C17']],
  'r6-multiple-responders': [['A019'], ['C17'], ['C17']],
  's1-c43': [['A016'], ['C43'], ['A002']],
  's2-c48': [['A016'], ['C48'], ['A002']],
  's3-c50': [['A001'], ['C50'], ['A002']],
  's4-c41': [['A016'], ['C41'], ['A002']],
  'c01-a063': [['A063', 'A001', 'A002', 'A003'], ['C01'], ['A004']],
};

export function createDevReactionScenario(scenario: DevReactionScenario, hostId: string, hostName: string): RoomState {
  if (process.env.NODE_ENV === 'production') throw new Error('development scenarios are unavailable in production');
  let state = createRoom(hostId, hostName, 3);
  state = addPlayer(state, 'bot-1', 'Source Bot');
  state = addPlayer(state, 'bot-2', 'Alternate Bot');
  state = startGame(state, allCards.map((card) => card.id), () => 0.5);
  const used = new Set(hands[scenario].flat());
  state.drawPile = state.drawPile.filter((code) => !used.has(code));
  state.turnOrder = ['bot-1', hostId, 'bot-2'];
  state.seatOrder = [...state.turnOrder];
  state.turnOrder.forEach((id, index) => { state.players[id].hand = [...hands[scenario][index]]; });
  state.turnPhase = 'main';
  state.devScenario = scenario;
  state.currentTurnIndex = 0;
  state.devForcedBotAction = {
    code: scenario === 'r6-multiple-responders' ? 'A019' : 'A016',
    ...(scenario === 'r6-multiple-responders' ? {} : { targetId: scenario === 'r5-counter-chain' ? 'bot-2' : hostId }),
  };
  state.players[hostId].hasDrawnThisTurn = false;
  state.players[hostId].hasPlayedActionThisTurn = false;
  if (scenario.startsWith('s')) {
    state.currentTurnIndex = 1;
    state.devForcedBotAction = undefined;
    if (scenario === 's2-c48') {
      state.drawPile = ['A003', 'A004', ...state.drawPile.filter((code) => code !== 'A003' && code !== 'A004')];
    }
  }
  if (scenario === 'c01-a063') {
    state.currentTurnIndex = 0;
    state.devForcedBotAction = { code: 'A063', targetId: hostId };
  }
  return state;
}
