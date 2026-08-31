'use client';

import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import {
  createRoom as engineCreateRoom,
  addPlayer,
  startGame as engineStartGame,
  startSetup as engineStartSetup,
  updateSeatOrder as engineUpdateSeatOrder,
  updatePlayDirection as engineUpdatePlayDirection,
  finishGame as engineFinishGame,
  resetForPlayAgain as engineResetForPlayAgain,
} from '../game/room';
import { draw, discard, balancedShuffleDrawPile } from '../game/pile';
import { placeTrap as enginePlaceTrap, removeTrap } from '../game/trap';
import { advanceTurn, checkWinnerAtTurnStart, declareMuffinTime as engineDeclareMuffinTime } from '../game/turn';
import type { RoomState, PlayerId, CardCode, PlayDirection } from '../game/types';

import { buildDemoDeck, demoCardsOfType, resolveActionCard, resolveTrapCard, resolveCounterCard, getValidCounterCards } from './demoCards';

import { decideBotTurn } from './botTurn';

export interface RoomSummary {
  code: string;
  hostName: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface ActiveRoom {
  code: string;
  state: RoomState;
  maxPlayers: number;
}

export interface PendingResponse {
  responseId?: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
}

export interface LastResult {
  responseId?: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
  countered: boolean;
  counteredBy?: PlayerId;
  counterCode?: CardCode;
}


interface SessionState {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  lastResult: LastResult | null;
}

type Action =
  | { type: 'CREATE_ROOM'; code: string; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; name: string }
  | { type: 'JOIN_BOT' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_SETUP' }
  | { type: 'SET_SEAT_ORDER'; seatOrder: PlayerId[] }
  | { type: 'SET_PLAY_DIRECTION'; direction: PlayDirection }
  | { type: 'CONFIRM_TURN_ORDER' }
  | { type: 'START_GAME' }
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_ACTION'; code: CardCode; targetId?: PlayerId }
  | { type: 'PLACE_TRAP'; code: CardCode }
  | { type: 'OPEN_TRAP'; code: CardCode; targetId?: PlayerId }
  | { type: 'PLAY_COUNTER'; code: CardCode }
  | { type: 'SKIP_COUNTER' }
  | { type: 'CLEAR_RESULT' }
  | { type: 'DECLARE_MUFFIN_TIME' }
  | { type: 'BOT_TURN' }
  | { type: 'FINISH_GAME'; winnerId: PlayerId; reason: 'normal' | 'manual' }
  | { type: 'PLAY_AGAIN' }
  | { type: 'SHUFFLE_DRAW_PILE' }
  | { type: 'FINISH_SHUFFLE_DRAW_PILE' };


export const BOT_NAME_POOL = [
  'Tee',
  'Bank',
  'Joe',
  'Guy',
  'Nam',
  'Ploy',
  'Golf',
  'Mint',
  'Fern',
  'Aom',
  'Art',
  'Ice',
  'Beam',
  'Oat',
  'Toey',
  'Nook',
  'Krit',
];

const SEED_ROOMS: RoomSummary[] = [
  { code: '4829', hostName: 'Tee', currentPlayers: 3, maxPlayers: 4 },
  { code: '7712', hostName: 'Bank', currentPlayers: 2, maxPlayers: 6 },
  { code: '8890', hostName: 'Joe', currentPlayers: 1, maxPlayers: 5 },
];

export function makeRoomCode(rng: () => number = Math.random): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += digits[Math.floor(rng() * digits.length)];
  return out;
}

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  if (checkWinnerAtTurnStart(advanced, currentId)) {
    return { ...advanced, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return advanced;
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom('me', action.hostName, action.maxPlayers);
      return {
        ...state,
        myPlayerId: 'me',
        activeRoom: { code: action.code, state: roomState, maxPlayers: roomState.maxPlayers ?? action.maxPlayers },
        pendingResponse: null,
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 15;
      const hostName = summary?.hostName ?? 'เจ้าของห้อง';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      try {
        let roomState = engineCreateRoom('bot-0', hostName, maxPlayers);
        for (let i = 1; i <= existingOthers; i++) {
          roomState = addPlayer(roomState, `bot-${i}`, BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length]);
        }
        roomState = addPlayer(roomState, 'me', action.name);
        return {
          ...state,
          myPlayerId: 'me',
          activeRoom: { code: action.code, state: roomState, maxPlayers },
          pendingResponse: null,
        };
      } catch (err) {
        console.warn('Cannot join room:', err);
        return state;
      }
    }
    case 'JOIN_BOT': {
      if (!state.activeRoom) return state;
      const current = state.activeRoom.state;
      const currentCount = Object.keys(current.players).length;
      if (currentCount >= state.activeRoom.maxPlayers) return state;
      try {
        const botId = `bot-${currentCount}`;
        const botName = BOT_NAME_POOL[(currentCount - 1) % BOT_NAME_POOL.length] || `Bot ${currentCount}`;
        const next = addPlayer(current, botId, botName);
        return { ...state, activeRoom: { ...state.activeRoom, state: next } };
      } catch {
        return state;
      }
    }
    case 'LEAVE_ROOM':
      return { ...state, activeRoom: null, myPlayerId: null, pendingResponse: null };
    case 'START_SETUP': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'lobby') return state;
      // Guard: Only host can initiate setup
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;
      const currentCount = Object.keys(state.activeRoom.state.players).length;
      if (currentCount < 3) return state;

      const next = engineStartSetup(state.activeRoom.state);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'SET_SEAT_ORDER': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'setup') return state;
      // Guard: Only host can set seat order
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;

      // Validate all IDs belong to room and no duplicates
      const currentPlayers = state.activeRoom.state.players;
      const expectedCount = Object.keys(currentPlayers).length;
      const validIds = action.seatOrder.filter((id) => currentPlayers[id] !== undefined);
      if (validIds.length !== expectedCount || new Set(validIds).size !== expectedCount) return state;

      const next = engineUpdateSeatOrder(state.activeRoom.state, validIds);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'SET_PLAY_DIRECTION': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'setup') return state;
      // Guard: Only host can set play direction
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;

      const next = engineUpdatePlayDirection(state.activeRoom.state, action.direction);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'CONFIRM_TURN_ORDER': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'setup') return state;
      // Guard: Only host can confirm turn order
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;
      const currentCount = Object.keys(state.activeRoom.state.players).length;
      if (currentCount < 3) return state;

      const next = engineStartGame(state.activeRoom.state, buildDemoDeck());
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'START_GAME': {
      if (!state.activeRoom) return state;
      const next = engineStartGame(state.activeRoom.state, buildDemoDeck());
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }

    case 'DRAW_CARD': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      if (room.turnOrder[room.currentTurnIndex] !== state.myPlayerId) return state;
      const drawn = draw(room, state.myPlayerId!, 1);
      return { ...state, activeRoom: { ...state.activeRoom, state: advanceAndCheckWin(drawn) } };
    }
    case 'PLAY_ACTION': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      if (room.turnOrder[room.currentTurnIndex] !== state.myPlayerId) return state;
      const actorId = state.myPlayerId!;
      const afterDiscard = discard(room, actorId, 1, [action.code]);
      const responseId = `action-${action.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterDiscard },
        pendingResponse: { responseId, kind: 'action', code: action.code, actorId, targetId: action.targetId },
      };
    }
    case 'PLACE_TRAP': {
      if (!state.activeRoom) return state;
      const next = enginePlaceTrap(state.activeRoom.state, state.myPlayerId!, action.code);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'OPEN_TRAP': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const ownerId = state.myPlayerId!;
      const afterRemove = removeTrap(state.activeRoom.state, ownerId, action.code);
      const responseId = `trap-${action.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterRemove },
        pendingResponse: { responseId, kind: 'trap', code: action.code, actorId: ownerId, targetId: action.targetId },
      };
    }
    case 'PLAY_COUNTER': {
      if (!state.activeRoom || !state.pendingResponse) return state;
      const counterActorId = state.myPlayerId!;
      const afterDiscard = discard(state.activeRoom.state, counterActorId, 1, [action.code]);
      const resolved = resolveCounterCard(afterDiscard, action.code, counterActorId);
      const finalState = state.pendingResponse.kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: finalState },
        pendingResponse: null,
        lastResult: { ...state.pendingResponse, countered: true, counteredBy: counterActorId, counterCode: action.code },
      };
    }
    case 'SKIP_COUNTER': {
      if (!state.activeRoom || !state.pendingResponse) return state;
      const { kind, code, actorId, targetId, responseId } = state.pendingResponse;
      const resolved =
        kind === 'action'
          ? resolveActionCard(state.activeRoom.state, code, actorId, targetId)
          : resolveTrapCard(state.activeRoom.state, code, actorId, targetId);
      const finalState = kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: finalState },
        pendingResponse: null,
        lastResult: kind === 'trap' ? { responseId, kind, code, actorId, targetId, countered: false } : null,
      };
    }
    case 'CLEAR_RESULT':
      return { ...state, lastResult: null };
    case 'DECLARE_MUFFIN_TIME': {
      if (!state.activeRoom) return state;
      const next = engineDeclareMuffinTime(state.activeRoom.state, state.myPlayerId!);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'BOT_TURN': {
      if (!state.activeRoom || state.pendingResponse) return state;
      const room = state.activeRoom.state;
      const botId = room.turnOrder[room.currentTurnIndex];
      const decision = decideBotTurn(room, botId);
      if (decision.action === 'draw') {
        const drawn = draw(room, botId, 1);
        return { ...state, activeRoom: { ...state.activeRoom, state: advanceAndCheckWin(drawn) } };
      }
      const afterDiscard = discard(room, botId, 1, [decision.code]);
      const responseId = `action-${decision.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: afterDiscard },
        pendingResponse: { responseId, kind: 'action', code: decision.code, actorId: botId, targetId: decision.targetId },
      };
    }

    case 'FINISH_GAME': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'playing') return state;
      // Guard: only host can manually finish game
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;
      // Guard: winner must exist in room
      if (!state.activeRoom.state.players[action.winnerId]) return state;

      const next = engineFinishGame(state.activeRoom.state, action.winnerId, action.reason);
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: next },
        pendingResponse: null,
      };
    }
    case 'PLAY_AGAIN': {
      if (!state.activeRoom) return state;
      const currentStatus = state.activeRoom.state.status;
      if (currentStatus !== 'finished' && (currentStatus as string) !== 'ended') return state;
      // Guard: only host can reset room for play again
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;

      const resetRoom = engineResetForPlayAgain(state.activeRoom.state);
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: resetRoom },
        pendingResponse: null,
        lastResult: null,
      };
    }
    case 'SHUFFLE_DRAW_PILE': {
      if (!state.activeRoom || state.activeRoom.state.status !== 'playing') return state;
      // Guard: only host can shuffle draw pile
      if (state.myPlayerId !== state.activeRoom.state.hostId) return state;
      // Guard: cannot shuffle while pending response or already shuffling
      if (state.pendingResponse || state.activeRoom.state.isShufflingDrawPile) return state;
      // Guard: need at least 2 cards to meaningfully shuffle
      if (state.activeRoom.state.drawPile.length <= 1) return state;

      const shuffledRoom = balancedShuffleDrawPile(state.activeRoom.state);
      shuffledRoom.isShufflingDrawPile = true;
      shuffledRoom.shuffleSequence = (state.activeRoom.state.shuffleSequence ?? 0) + 1;

      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: shuffledRoom },
      };

    }
    case 'FINISH_SHUFFLE_DRAW_PILE': {
      if (!state.activeRoom) return state;
      const nextRoom = { ...state.activeRoom.state, isShufflingDrawPile: false };
      return {
        ...state,
        activeRoom: { ...state.activeRoom, state: nextRoom },
      };
    }
    default:
      return state;
  }
}

export interface GameSessionValue {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  lastResult: LastResult | null;
  clearLastResult: () => void;
  createRoom: (hostName: string, maxPlayers: number) => string;
  joinRoom: (code: string, name: string) => void;
  joinNextBot: () => void;
  leaveRoom: () => void;
  startSetup: () => void;
  setSeatOrder: (seatOrder: PlayerId[]) => void;
  setPlayDirection: (direction: PlayDirection) => void;
  confirmTurnOrder: () => void;
  startGame: () => void;
  drawCard: () => void;
  playAction: (code: CardCode, targetId?: PlayerId) => void;
  placeTrapCard: (code: CardCode) => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId) => void;
  playCounter: (code: CardCode) => void;
  skipCounter: () => void;
  declareMuffinTime: () => void;
  finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
  playAgain: () => void;
  shuffleDrawPile: () => void;
  finishShuffleDrawPile: () => void;
}


const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    rooms: SEED_ROOMS,
    activeRoom: null,
    myPlayerId: null,
    pendingResponse: null,
    lastResult: null,
  });

  const createRoomFn = useCallback((hostName: string, maxPlayers: number) => {
    const code = makeRoomCode();
    dispatch({ type: 'CREATE_ROOM', code, hostName, maxPlayers });
    return code;
  }, []);
  const joinRoomFn = useCallback((code: string, name: string) => {
    dispatch({ type: 'JOIN_ROOM', code, name });
  }, []);
  const joinNextBot = useCallback(() => dispatch({ type: 'JOIN_BOT' }), []);
  const leaveRoom = useCallback(() => dispatch({ type: 'LEAVE_ROOM' }), []);
  const startSetupFn = useCallback(() => dispatch({ type: 'START_SETUP' }), []);
  const setSeatOrderFn = useCallback(
    (seatOrder: PlayerId[]) => dispatch({ type: 'SET_SEAT_ORDER', seatOrder }),
    []
  );
  const setPlayDirectionFn = useCallback(
    (direction: PlayDirection) => dispatch({ type: 'SET_PLAY_DIRECTION', direction }),
    []
  );
  const confirmTurnOrderFn = useCallback(() => dispatch({ type: 'CONFIRM_TURN_ORDER' }), []);
  const startGameFn = useCallback(() => dispatch({ type: 'START_GAME' }), []);
  const drawCard = useCallback(() => dispatch({ type: 'DRAW_CARD' }), []);
  const playAction = useCallback(
    (code: CardCode, targetId?: PlayerId) => dispatch({ type: 'PLAY_ACTION', code, targetId }),
    []
  );
  const placeTrapCard = useCallback((code: CardCode) => dispatch({ type: 'PLACE_TRAP', code }), []);
  const openTrapCard = useCallback(
    (code: CardCode, targetId?: PlayerId) => dispatch({ type: 'OPEN_TRAP', code, targetId }),
    []
  );
  const playCounter = useCallback((code: CardCode) => dispatch({ type: 'PLAY_COUNTER', code }), []);
  const skipCounter = useCallback(() => dispatch({ type: 'SKIP_COUNTER' }), []);
  const declareMuffinTimeFn = useCallback(() => dispatch({ type: 'DECLARE_MUFFIN_TIME' }), []);
  const clearLastResult = useCallback(() => dispatch({ type: 'CLEAR_RESULT' }), []);
  const finishGameFn = useCallback(
    (winnerId: PlayerId, reason: 'normal' | 'manual' = 'normal') =>
      dispatch({ type: 'FINISH_GAME', winnerId, reason }),
    []
  );
  const playAgain = useCallback(() => dispatch({ type: 'PLAY_AGAIN' }), []);


  // Auto-skip the counter window when the human has no valid counter card to play for Actions.
  // For TRAPs targeting the local human player, do NOT auto-skip so the Trap Alert + Decision screen is displayed.
  useEffect(() => {
    if (!state.pendingResponse || !state.activeRoom || !state.myPlayerId) return;

    const isTrapTarget =
      state.pendingResponse.kind === 'trap' &&
      state.pendingResponse.actorId !== state.myPlayerId &&
      (!state.pendingResponse.targetId || state.pendingResponse.targetId === state.myPlayerId);

    if (isTrapTarget) return;

    const myHand = state.activeRoom.state.players[state.myPlayerId]?.hand ?? [];
    const validCounters = getValidCounterCards(myHand, state.pendingResponse);
    if (validCounters.length === 0) {
      const timer = setTimeout(() => dispatch({ type: 'SKIP_COUNTER' }), 400);
      return () => clearTimeout(timer);
    }
  }, [state.pendingResponse, state.activeRoom, state.myPlayerId]);



  // Auto-play bot turns when it's a bot's turn and no response window is open.
  useEffect(() => {
    if (!state.activeRoom || state.pendingResponse) return;
    if (state.activeRoom.state.status !== 'playing') return;
    const room = state.activeRoom.state;
    const currentId = room.turnOrder[room.currentTurnIndex];
    if (!currentId || !currentId.startsWith('bot-')) return;
    const timer = setTimeout(() => dispatch({ type: 'BOT_TURN' }), 700);
    return () => clearTimeout(timer);
  }, [state.activeRoom, state.pendingResponse]);

  const shuffleDrawPile = useCallback(() => {
    dispatch({ type: 'SHUFFLE_DRAW_PILE' });
  }, []);

  const finishShuffleDrawPile = useCallback(() => {
    dispatch({ type: 'FINISH_SHUFFLE_DRAW_PILE' });
  }, []);

  const value: GameSessionValue = {
    rooms: state.rooms,
    activeRoom: state.activeRoom,
    myPlayerId: state.myPlayerId,
    pendingResponse: state.pendingResponse,
    lastResult: state.lastResult,
    clearLastResult,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    joinNextBot,
    leaveRoom,
    startSetup: startSetupFn,
    setSeatOrder: setSeatOrderFn,
    setPlayDirection: setPlayDirectionFn,
    confirmTurnOrder: confirmTurnOrderFn,
    startGame: startGameFn,
    drawCard,
    playAction,
    placeTrapCard,
    openTrapCard,
    playCounter,
    skipCounter,
    declareMuffinTime: declareMuffinTimeFn,
    finishGame: finishGameFn,
    playAgain,
    shuffleDrawPile,
    finishShuffleDrawPile,
  };


  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}

