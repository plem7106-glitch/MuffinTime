'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { usePlayer } from './player';
import { fetchRoom, updateRoomWithRetry, createRoomWithRetry } from '../multiplayer/room';
import { subscribeToRoom, unsubscribeFromRoom } from '../multiplayer/realtime';
import {
  addPlayer,
  createRoom as engineCreateRoom,
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
import { decideBotTurn } from './botTurn';

export const BOT_NAME_POOL = [
  'Tee (Bot)',
  'Bank (Bot)',
  'Joe (Bot)',
  'Guy (Bot)',
  'Nam (Bot)',
  'Ploy (Bot)',
  'Golf (Bot)',
  'Mint (Bot)',
  'Fern (Bot)',
  'Aom (Bot)',
  'Art (Bot)',
  'Ice (Bot)',
  'Beam (Bot)',
  'Oat (Bot)',
  'Toey (Bot)',
  'Nook (Bot)',
  'Krit (Bot)',
];

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
  createRoom: (maxPlayers: number, hostName: string) => Promise<string>;
  createBotRoom: (maxPlayers: number, hostName?: string) => string;
  joinRoom: (code: string, playerName: string) => Promise<void>;
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
  const { playerId, playerName } = usePlayer();
  const [localHostId, setLocalHostId] = useState<string>('host-me');

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedResponseId, setDismissedResponseId] = useState<string | null>(null);

  const isBotRoom = roomCode?.startsWith('bot-') ?? false;
  const myPlayerId = isBotRoom ? (localHostId || playerId || 'host-me') : playerId;

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

      // Bot room: in-memory local state update
      if (roomCode.startsWith('bot-')) {
        setRoomState((prev) => {
          if (!prev) return prev;
          const next = updater(prev);
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(
                `muffin_bot_room_${roomCode}`,
                JSON.stringify({ hostId: localHostId || playerId || 'host-me', state: next })
              );
            } catch {
              // ignore storage errors
            }
          }
          return next;
        });
        return;
      }

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
    [roomCode, localHostId, playerId]
  );

  const createRoomFn = useCallback(
    async (maxPlayers: number, hostName: string) => {
      if (!playerId) throw new Error('ระบบยังไม่พร้อม ลองใหม่อีกครั้ง');
      const finalName = hostName.trim() || 'ผู้เล่น';
      const { code } = await createRoomWithRetry(supabase, playerId, finalName, maxPlayers);
      await enterRoom(code);
      return code;
    },
    [playerId, enterRoom]
  );

  const createBotRoomFn = useCallback(
    (maxPlayers: number, hostName?: string) => {
      if (channelRef.current) {
        unsubscribeFromRoom(channelRef.current);
        channelRef.current = null;
      }
      const hostId = playerId || 'host-me';
      const actualHostName = hostName?.trim() || playerName || 'ผู้เล่น';
      const boundedMax = Math.min(Math.max(maxPlayers, 3), 15);

      let state = engineCreateRoom(hostId, actualHostName, boundedMax);
      for (let i = 1; i <= boundedMax - 1; i++) {
        const botId = `bot-${i}`;
        const botName = BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length];
        state = addPlayer(state, botId, botName);
      }

      const code = `bot-${Math.floor(1000 + Math.random() * 9000)}`;
      setLocalHostId(hostId);
      setRoomCode(code);
      setRoomState(state);
      setError(null);

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            `muffin_bot_room_${code}`,
            JSON.stringify({ hostId, state })
          );
        } catch {
          // ignore storage errors
        }
      }
      return code;
    },
    [playerId, playerName]
  );

  const joinRoomFn = useCallback(
    async (code: string, name: string) => {
      if (!playerId) throw new Error('ระบบยังไม่พร้อม ลองใหม่อีกครั้ง');
      const finalName = name.trim() || 'ผู้เล่น';
      await updateRoomWithRetry(supabase, code, (state) => {
        if (state.players[playerId]) return state; // already a member — resume, don't re-add
        return addPlayer(state, playerId, finalName);
      });
      await enterRoom(code);
    },
    [playerId, enterRoom]
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
      if (code.startsWith('bot-')) {
        if (roomCode === code && roomState) return;
        if (typeof window !== 'undefined') {
          const cached = sessionStorage.getItem(`muffin_bot_room_${code}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              setLocalHostId(parsed.hostId || playerId || 'host-me');
              setRoomCode(code);
              setRoomState(parsed.state);
              return;
            } catch {
              // fallback to fresh bot room
            }
          }
        }
        const hostId = playerId || 'host-me';
        const hostName = playerName || 'ผู้เล่น';
        let state = engineCreateRoom(hostId, hostName, 3);
        state = addPlayer(state, 'bot-1', BOT_NAME_POOL[0]);
        state = addPlayer(state, 'bot-2', BOT_NAME_POOL[1]);
        setLocalHostId(hostId);
        setRoomCode(code);
        setRoomState(state);
        return;
      }
      await enterRoom(code);
    },
    [enterRoom, roomCode, roomState, playerId, playerName]
  );

  const leaveRoom = useCallback(() => {
    if (channelRef.current) {
      unsubscribeFromRoom(channelRef.current);
      channelRef.current = null;
    }
    if (roomCode?.startsWith('bot-') && typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(`muffin_bot_room_${roomCode}`);
      } catch {
        // ignore
      }
    }
    executedBotTurnKeyRef.current = null;
    setRoomCode(null);
    setRoomState(null);
    setError(null);
  }, [roomCode]);

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
    () => {
      executedBotTurnKeyRef.current = null;
      run((state) => {
        const currentStatus = state.status;
        if (currentStatus !== 'finished' && (currentStatus as string) !== 'ended') return state;
        if (myPlayerId !== state.hostId) return state;
        return { ...engineResetForPlayAgain(state), pendingResponse: null, lastResult: null };
      });
    },
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

  const executedBotTurnKeyRef = useRef<string | null>(null);

  // Auto-skip the counter window only when NO eligible responder holds a valid counter card.
  useEffect(() => {
    const pendingResponse = roomState?.pendingResponse;
    if (!pendingResponse || !myPlayerId || !roomState) return;
    if (myPlayerId !== roomState.hostId) return;

    const isBot = roomCode?.startsWith('bot-');

    if (isBot) {
      // In local bot mode, only the local human player interacts via counter modals.
      // If the local human player is the actor of the card, or is not the target of a trap,
      // or does not hold any valid counter card, auto-skip the counter response window.
      const isHumanActor = pendingResponse.actorId === myPlayerId;
      const isHumanTarget = !pendingResponse.targetId || pendingResponse.targetId === myPlayerId;
      const humanHand = roomState.players[myPlayerId]?.hand ?? [];
      const humanCanCounter = getValidCounterCards(humanHand, pendingResponse).length > 0;

      // 1. If human was hit by a trap, human sees TrapAlertModal to decide counter/decline
      if (!isHumanActor && isHumanTarget && pendingResponse.kind === 'trap') {
        return;
      }
      // 2. If human can counter an action, human sees CounterModal to decide play/skip
      if (!isHumanActor && humanCanCounter && pendingResponse.kind === 'action') {
        return;
      }

      // Otherwise (bot-on-bot action/trap, human's own action/trap, or human has no valid counters), auto-skip after 400ms
      const responseId = pendingResponse.responseId;
      const timer = setTimeout(() => skipCounter(responseId), 400);
      return () => clearTimeout(timer);
    }

    // Multiplayer room logic (all human players):
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
  }, [roomState, myPlayerId, skipCounter, roomCode]);

  // Auto-play bot turns in local bot rooms
  useEffect(() => {
    if (!roomCode?.startsWith('bot-') || !roomState || roomState.pendingResponse) return;
    if (roomState.status !== 'playing') return;
    if (roomState.isShufflingDrawPile) return;

    const botId = roomState.turnOrder[roomState.currentTurnIndex];
    if (!botId || !botId.startsWith('bot-')) return;

    // Unique turn key per turn state to prevent duplicate scheduling
    const turnKey = `${roomState.roundNumber ?? 1}-${roomState.currentTurnIndex}-${botId}-${roomState.players[botId]?.hand.length}-${roomState.drawPile.length}`;
    if (executedBotTurnKeyRef.current === turnKey) return;

    const timer = setTimeout(() => {
      executedBotTurnKeyRef.current = turnKey;
      run((state) => {
        if (state.status !== 'playing' || state.pendingResponse || state.isShufflingDrawPile) return state;
        const currentBotId = state.turnOrder[state.currentTurnIndex];
        if (!currentBotId || !currentBotId.startsWith('bot-')) return state;

        const decision = decideBotTurn(state, currentBotId);
        if (decision.action === 'draw') {
          return advanceAndCheckWin(draw(state, currentBotId, 1));
        }
        const afterDiscard = discard(state, currentBotId, 1, [decision.code]);
        const responseId = `action-${decision.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...afterDiscard,
          pendingResponse: {
            responseId,
            kind: 'action',
            code: decision.code,
            actorId: currentBotId,
            targetId: decision.targetId,
          },
        };
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [roomCode, roomState, run]);

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
    createBotRoom: createBotRoomFn,
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

