'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { fetchRoom, updateRoomWithRetry, createRoomWithRetry } from '../multiplayer/room';
import { subscribeToRoom, unsubscribeFromRoom } from '../multiplayer/realtime';
import {
  addPlayer,
  startSetup as engineStartSetup,
  updateSeatOrder as engineUpdateSeatOrder,
  updatePlayDirection as engineUpdatePlayDirection,
  startGame as engineStartGame,
  finishGame as engineFinishGame,
  resetForPlayAgain as engineResetForPlayAgain,
} from '../game/room';
import { draw, discard, balancedShuffleDrawPile } from '../game/pile';
import { placeTrap as enginePlaceTrap, removeTrap } from '../game/trap';
import { advanceTurn, checkWinnerAtTurnStart, declareMuffinTime as engineDeclareMuffinTime } from '../game/turn';
import type { RoomState, PlayerId, CardCode, PlayDirection, PendingResponse, LastResult } from '../game/types';
import { buildDemoDeck, resolveActionCard, resolveTrapCard, resolveCounterCard, getValidCounterCards } from './demoCards';

export interface ActiveRoom {
  code: string;
  state: RoomState;
}

export interface GameSessionValue {
  activeRoom: ActiveRoom | null;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  lastResult: LastResult | null;
  error: string | null;
  clearLastResult: () => void;
  createRoom: (maxPlayers: number) => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  previewRoom: (code: string) => Promise<RoomState | null>;
  resumeRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startSetup: () => void;
  setSeatOrder: (seatOrder: PlayerId[]) => void;
  setPlayDirection: (direction: PlayDirection) => void;
  confirmTurnOrder: () => void;
  drawCard: () => void;
  hostSkipTurn: () => void;
  playAction: (code: CardCode, targetId?: PlayerId) => void;
  placeTrapCard: (code: CardCode) => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId) => void;
  playCounter: (code: CardCode, responseId: string) => void;
  skipCounter: (responseId: string) => void;
  declareMuffinTime: () => void;
  finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
  playAgain: () => void;
  shuffleDrawPile: () => void;
  finishShuffleDrawPile: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  if (checkWinnerAtTurnStart(advanced, currentId)) {
    return { ...advanced, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return advanced;
}

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myPlayerId = user?.id ?? null;

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedResponseId, setDismissedResponseId] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof subscribeToRoom> | null>(null);
  const isWritingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (channelRef.current) unsubscribeFromRoom(channelRef.current);
    };
  }, []);

  const enterRoom = useCallback(async (code: string) => {
    if (channelRef.current) {
      unsubscribeFromRoom(channelRef.current);
      channelRef.current = null;
    }
    const row = await fetchRoom(supabase, code);
    setRoomCode(code);
    setRoomState(row.state);
    channelRef.current = subscribeToRoom(supabase, code, setRoomState, (status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setError('การเชื่อมต่อแบบเรียลไทม์มีปัญหา ลองรีเฟรชหน้านี้อีกครั้ง');
      }
    });
  }, []);

  const run = useCallback(
    async (updater: (state: RoomState) => RoomState) => {
      if (!roomCode || isWritingRef.current) return;
      isWritingRef.current = true;
      setError(null);
      try {
        await updateRoomWithRetry(supabase, roomCode, updater);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      } finally {
        isWritingRef.current = false;
      }
    },
    [roomCode]
  );

  const createRoomFn = useCallback(
    async (maxPlayers: number) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนสร้างห้อง');
      const { code } = await createRoomWithRetry(supabase, user.id, user.name, maxPlayers);
      await enterRoom(code);
      return code;
    },
    [user, enterRoom]
  );

  const joinRoomFn = useCallback(
    async (code: string) => {
      if (!user) throw new Error('ต้องเข้าสู่ระบบก่อนเข้าร่วมห้อง');
      await updateRoomWithRetry(supabase, code, (state) => {
        if (state.players[user.id]) return state; // already a member — resume, don't re-add
        return addPlayer(state, user.id, user.name);
      });
      await enterRoom(code);
    },
    [user, enterRoom]
  );

  const previewRoom = useCallback(async (code: string): Promise<RoomState | null> => {
    try {
      const row = await fetchRoom(supabase, code);
      return row.state;
    } catch {
      return null;
    }
  }, []);

  const resumeRoom = useCallback(
    async (code: string) => {
      await enterRoom(code);
    },
    [enterRoom]
  );

  const leaveRoom = useCallback(() => {
    if (channelRef.current) {
      unsubscribeFromRoom(channelRef.current);
      channelRef.current = null;
    }
    setRoomCode(null);
    setRoomState(null);
    setError(null);
  }, []);

  const startSetupFn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineStartSetup(state);
      }),
    [run, myPlayerId]
  );

  const setSeatOrderFn = useCallback(
    (seatOrder: PlayerId[]) =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        const expectedCount = Object.keys(state.players).length;
        const validIds = seatOrder.filter((id) => state.players[id] !== undefined);
        if (validIds.length !== expectedCount || new Set(validIds).size !== expectedCount) return state;
        return engineUpdateSeatOrder(state, validIds);
      }),
    [run, myPlayerId]
  );

  const setPlayDirectionFn = useCallback(
    (direction: PlayDirection) =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineUpdatePlayDirection(state, direction);
      }),
    [run, myPlayerId]
  );

  const confirmTurnOrderFn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        return engineStartGame(state, buildDemoDeck());
      }),
    [run, myPlayerId]
  );

  const drawCard = useCallback(
    () =>
      run((state) => {
        if (state.pendingResponse) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        return advanceAndCheckWin(draw(state, myPlayerId!, 1));
      }),
    [run, myPlayerId]
  );

  // Host-only escape hatch: advance past a player's turn with no card action, for when
  // that player has left mid-game (leaveRoom doesn't remove anyone server-side yet, so a
  // departed current player would otherwise stall the whole table indefinitely).
  const hostSkipTurn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        if (state.status !== 'playing') return state;
        if (state.pendingResponse) return state;
        return advanceAndCheckWin(state);
      }),
    [run, myPlayerId]
  );

  const playAction = useCallback(
    (code: CardCode, targetId?: PlayerId) =>
      run((state) => {
        if (state.pendingResponse) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const actorId = myPlayerId!;
        const afterDiscard = discard(state, actorId, 1, [code]);
        const responseId = `action-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...afterDiscard,
          pendingResponse: { responseId, kind: 'action', code, actorId, targetId },
        };
      }),
    [run, myPlayerId]
  );

  const placeTrapCard = useCallback(
    (code: CardCode) => run((state) => enginePlaceTrap(state, myPlayerId!, code)),
    [run, myPlayerId]
  );

  const openTrapCard = useCallback(
    (code: CardCode, targetId?: PlayerId) =>
      run((state) => {
        if (state.pendingResponse) return state;
        const ownerId = myPlayerId!;
        const afterRemove = removeTrap(state, ownerId, code);
        const responseId = `trap-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...afterRemove,
          pendingResponse: { responseId, kind: 'trap', code, actorId: ownerId, targetId },
        };
      }),
    [run, myPlayerId]
  );

  const playCounter = useCallback(
    (code: CardCode, responseId: string) =>
      run((state) => {
        if (!state.pendingResponse || state.pendingResponse.responseId !== responseId) return state;
        const counterActorId = myPlayerId!;
        const afterDiscard = discard(state, counterActorId, 1, [code]);
        const resolved = resolveCounterCard(afterDiscard, code, counterActorId);
        const finalState = state.pendingResponse.kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
        return {
          ...finalState,
          pendingResponse: null,
          lastResult: { ...state.pendingResponse, countered: true, counteredBy: counterActorId, counterCode: code },
        };
      }),
    [run, myPlayerId]
  );

  const skipCounter = useCallback(
    (responseId: string) =>
      run((state) => {
        if (!state.pendingResponse || state.pendingResponse.responseId !== responseId) return state;
        const { kind, code, actorId, targetId } = state.pendingResponse;
        const resolved =
          kind === 'action'
            ? resolveActionCard(state, code, actorId, targetId)
            : resolveTrapCard(state, code, actorId, targetId);
        const finalState = kind === 'action' ? advanceAndCheckWin(resolved) : resolved;
        return {
          ...finalState,
          pendingResponse: null,
          lastResult: kind === 'trap' ? { responseId, kind, code, actorId, targetId, countered: false } : null,
        };
      }),
    [run]
  );

  const declareMuffinTimeFn = useCallback(
    () => run((state) => engineDeclareMuffinTime(state, myPlayerId!)),
    [run, myPlayerId]
  );

  const clearLastResult = useCallback(() => {
    if (roomState?.lastResult?.responseId) setDismissedResponseId(roomState.lastResult.responseId);
  }, [roomState]);

  const finishGameFn = useCallback(
    (winnerId: PlayerId, reason: 'normal' | 'manual' = 'normal') =>
      run((state) => {
        if (state.status !== 'playing') return state;
        if (myPlayerId !== state.hostId) return state;
        if (!state.players[winnerId]) return state;
        return { ...engineFinishGame(state, winnerId, reason), pendingResponse: null };
      }),
    [run, myPlayerId]
  );

  const playAgain = useCallback(
    () =>
      run((state) => {
        const currentStatus = state.status;
        if (currentStatus !== 'finished' && (currentStatus as string) !== 'ended') return state;
        if (myPlayerId !== state.hostId) return state;
        return { ...engineResetForPlayAgain(state), pendingResponse: null, lastResult: null };
      }),
    [run, myPlayerId]
  );

  const shuffleDrawPile = useCallback(
    () =>
      run((state) => {
        if (state.status !== 'playing') return state;
        if (myPlayerId !== state.hostId) return state;
        if (state.pendingResponse || state.isShufflingDrawPile) return state;
        if (state.drawPile.length <= 1) return state;
        const shuffled = balancedShuffleDrawPile(state);
        shuffled.isShufflingDrawPile = true;
        shuffled.shuffleSequence = (state.shuffleSequence ?? 0) + 1;
        return shuffled;
      }),
    [run, myPlayerId]
  );

  const finishShuffleDrawPile = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        if (!state.isShufflingDrawPile) return state;
        return { ...state, isShufflingDrawPile: false };
      }),
    [run, myPlayerId]
  );

  // Auto-skip the counter window only when NO eligible responder holds a valid counter card.
  // Runs on the host's client only (single source of truth) — checking "does my own hand have
  // a counter" on every client independently would let the first bystander with an empty hand
  // resolve the window for the whole table within 400ms, even if the actual target (or any other
  // eligible player) does hold a valid counter and simply hasn't had a real chance to act yet.
  // The responseId guard in skipCounter still stops this from double-applying an effect, but it
  // can't stop the effect from being applied too early — so the eligibility check itself has to
  // be correct, not just idempotent.
  useEffect(() => {
    const pendingResponse = roomState?.pendingResponse;
    if (!pendingResponse || !myPlayerId || !roomState) return;
    if (myPlayerId !== roomState.hostId) return;

    const eligibleIds =
      pendingResponse.kind === 'trap' && pendingResponse.targetId
        ? [pendingResponse.targetId]
        : Object.keys(roomState.players).filter((id) => id !== pendingResponse.actorId);

    const anyoneCanRespond = eligibleIds.some((id) => {
      const hand = roomState.players[id]?.hand ?? [];
      return getValidCounterCards(hand, pendingResponse).length > 0;
    });
    if (anyoneCanRespond) return;

    const responseId = pendingResponse.responseId;
    const timer = setTimeout(() => skipCounter(responseId), 400);
    return () => clearTimeout(timer);
  }, [roomState, myPlayerId, skipCounter]);

  const rawLastResult = roomState?.lastResult ?? null;
  const lastResult =
    rawLastResult && rawLastResult.responseId && rawLastResult.responseId === dismissedResponseId
      ? null
      : rawLastResult;

  const value: GameSessionValue = {
    activeRoom: roomCode && roomState ? { code: roomCode, state: roomState } : null,
    myPlayerId,
    pendingResponse: roomState?.pendingResponse ?? null,
    lastResult,
    error,
    clearLastResult,
    createRoom: createRoomFn,
    joinRoom: joinRoomFn,
    previewRoom,
    resumeRoom,
    leaveRoom,
    startSetup: startSetupFn,
    setSeatOrder: setSeatOrderFn,
    setPlayDirection: setPlayDirectionFn,
    confirmTurnOrder: confirmTurnOrderFn,
    drawCard,
    hostSkipTurn,
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
