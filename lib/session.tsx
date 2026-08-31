'use client';

import { createContext, useCallback, useContext, useReducer, type ReactNode } from 'react';
import { createRoom as engineCreateRoom, addPlayer, startGame as engineStartGame } from '../game/room';
import type { RoomState, PlayerId } from '../game/types';
import { buildDemoDeck } from './demoCards';

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

interface SessionState {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
}

type Action =
  | { type: 'CREATE_ROOM'; code: string; hostName: string; maxPlayers: number }
  | { type: 'JOIN_ROOM'; code: string; name: string }
  | { type: 'JOIN_BOT' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_GAME' };

export const BOT_NAME_POOL = ['Bank', 'Joe', 'Guy', 'Nam', 'Ploy', 'Golf', 'Mint'];

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

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'CREATE_ROOM': {
      const roomState = engineCreateRoom('me', action.hostName);
      return {
        ...state,
        myPlayerId: 'me',
        activeRoom: { code: action.code, state: roomState, maxPlayers: action.maxPlayers },
      };
    }
    case 'JOIN_ROOM': {
      const summary = state.rooms.find((r) => r.code === action.code);
      const maxPlayers = summary?.maxPlayers ?? 4;
      const hostName = summary?.hostName ?? 'Host';
      const existingOthers = Math.max((summary?.currentPlayers ?? 1) - 1, 0);
      let roomState = engineCreateRoom('bot-0', hostName);
      for (let i = 1; i <= existingOthers; i++) {
        roomState = addPlayer(roomState, `bot-${i}`, BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length]);
      }
      roomState = addPlayer(roomState, 'me', action.name);
      return { ...state, myPlayerId: 'me', activeRoom: { code: action.code, state: roomState, maxPlayers } };
    }
    case 'JOIN_BOT': {
      if (!state.activeRoom) return state;
      const current = state.activeRoom.state;
      const currentCount = Object.keys(current.players).length;
      if (currentCount >= state.activeRoom.maxPlayers) return state;
      const botId = `bot-${currentCount}`;
      const botName = BOT_NAME_POOL[(currentCount - 1) % BOT_NAME_POOL.length];
      const next = addPlayer(current, botId, botName);
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    case 'LEAVE_ROOM':
      return { ...state, activeRoom: null, myPlayerId: null };
    case 'START_GAME': {
      if (!state.activeRoom) return state;
      const next = engineStartGame(state.activeRoom.state, buildDemoDeck());
      return { ...state, activeRoom: { ...state.activeRoom, state: next } };
    }
    default:
      return state;
  }
}

interface GameSessionValue {
  rooms: RoomSummary[];
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  createRoom: (hostName: string, maxPlayers: number) => string;
  joinRoom: (code: string, name: string) => void;
  joinNextBot: () => void;
  leaveRoom: () => void;
  startGame: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { rooms: SEED_ROOMS, activeRoom: null, myPlayerId: null });

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
  const startGameFn = useCallback(() => dispatch({ type: 'START_GAME' }), []);

  const value: GameSessionValue = {
    rooms: state.rooms,
    activeRoom: state.activeRoom,
    myPlayerId: state.myPlayerId,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    joinNextBot,
    leaveRoom,
    startGame: startGameFn,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}
