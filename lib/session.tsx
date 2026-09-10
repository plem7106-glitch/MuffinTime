'use client';

import { resolveCompletedStackFrames, respondToFrame, drawTurnCard, endPlayerTurn, playTurnAction } from '../game/sessionFlow';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { usePlayer } from './player';
import { fetchRoom, updateRoomWithRetry, createRoomWithRetry } from '../multiplayer/room';
import { subscribeToRoom, unsubscribeFromRoom } from '../multiplayer/realtime';
import {
  addPlayer,
  removePlayer,
  createRoom as engineCreateRoom,
  startSetup as engineStartSetup,
  updateSeatOrder as engineUpdateSeatOrder,
  updatePlayDirection as engineUpdatePlayDirection,
  startGame as engineStartGame,
  finishGame as engineFinishGame,
  resetForPlayAgain as engineResetForPlayAgain,
} from '../game/room';
import { balancedShuffleDrawPile } from '../game/pile';
import { placeTrap as enginePlaceTrap, skipTrapPlacement as engineSkipTrapPlacement } from '../game/trap';
import {
  emergencyForceSkipTurn,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
} from '../game/turn';
import {
  areAllResponsesComplete,
  getTopFrame,
} from '../game/reactionStack';
import {
  activateManualTrap,
  initiateTrapInteraction as engineInitiateTrapInteraction,
  respondToTrapInteraction as engineRespondToTrapInteraction,
} from '../game/trapRules/engine';
import { getPlayableCounters } from '../game/counterRules/registry';
import type { RoomState, PlayerId, CardCode, PlayDirection, PendingResponse, LastResult } from '../game/types';
import { buildPlayableDeck } from '../game/playableCards';
import {
  decideBotTurn,
  decideBotTrapPlacement,
  decideBotCounter,
  decideBotInteraction,
  decideBotManualTrapActivation,
} from './botTurn';

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
  endTurn: () => void;
  hostSkipTurn: () => void;
  playAction: (code: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) => void;
  placeTrapCard: (code: CardCode) => void;
  skipTrapPlacement: () => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId | PlayerId[]) => void;
  initiateTrapInteraction: (code: CardCode, targetId: PlayerId) => void;
  respondToTrapInteraction: (interactionId: string, decision: 'accept' | 'refuse') => void;
  playCounter: (code: CardCode, responseId: string) => void;
  skipCounter: (responseId: string) => void;
  declareMuffinTime: () => void;
  finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
  playAgain: () => void;
  shuffleDrawPile: () => void;
  finishShuffleDrawPile: () => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

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
          const next = finishByDeckExhaustion(updater(prev));
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
        await updateRoomWithRetry(supabase, roomCode, (state) => finishByDeckExhaustion(updater(state)));
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
    // Best-effort: remove this player from the room server-side so others stop
    // seeing them listed. Fire-and-forget -- the leaver's own screen moves on
    // immediately regardless of whether this write succeeds.
    if (roomCode && !roomCode.startsWith('bot-') && myPlayerId) {
      const codeToLeave = roomCode;
      const idToRemove = myPlayerId;
      updateRoomWithRetry(supabase, codeToLeave, (state) => removePlayer(state, idToRemove)).catch(() => {
        // ignore -- nothing left to show an error to once we've navigated away
      });
    }
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
  }, [roomCode, myPlayerId]);

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
        return engineStartGame(state, buildPlayableDeck());
      }),
    [run, myPlayerId]
  );

  const drawCard = useCallback(
    () => run((state) => drawTurnCard(state, myPlayerId!)),
    [run, myPlayerId]
  );

  const endTurn = useCallback(
    () => run((state) => endPlayerTurn(state, myPlayerId!)),
    [run, myPlayerId]
  );

  // Host-only emergency escape hatch: recovers a stuck game in both Bot Mode and multiplayer
  const hostSkipTurn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        if (state.status !== 'playing') return state;
        return emergencyForceSkipTurn(state);
      }),
    [run, myPlayerId]
  );

  const playAction = useCallback(
    (code: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) => run((state) => playTurnAction(state, myPlayerId!, code, targetId, customPayload)),
    [run, myPlayerId]
  );

  const placeTrapCard = useCallback(
    (code: CardCode) =>
      run((state) => {
        const pid = myPlayerId!;
        const player = state.players[pid];
        // Idempotency guard: silently abort if placement is no longer valid
        // (double-click, stale callback, phase already advanced)
        if (!player || player.placedTrapThisTurn || state.turnPhase !== 'trap_placement') return state;
        if (state.turnOrder[state.currentTurnIndex] !== pid) return state;
        if (!player.hand.includes(code)) return state;
        return enginePlaceTrap(state, pid, code);
      }),
    [run, myPlayerId]
  );

  const skipTrapPlacement = useCallback(
    () =>
      run((state) => {
        const pid = myPlayerId!;
        // Idempotency guard: skip is harmless but avoid calling if phase already changed
        if (state.turnPhase !== 'trap_placement') return state;
        if (state.turnOrder[state.currentTurnIndex] !== pid) return state;
        return engineSkipTrapPlacement(state, pid);
      }),
    [run, myPlayerId]
  );

  const openTrapCard = useCallback(
    (code: CardCode, targetId?: PlayerId | PlayerId[]) =>
      run((state) => {
        const ownerId = myPlayerId!;
        let next = activateManualTrap(state, ownerId, code, targetId ? (Array.isArray(targetId) ? targetId : [targetId]) : []);
        next = resolveCompletedStackFrames(next);
        return next;
      }),
    [run, myPlayerId, resolveCompletedStackFrames]
  );

  const initiateTrapInteraction = useCallback(
    (code: CardCode, targetId: PlayerId) =>
      run((state) => {
        const ownerId = myPlayerId!;
        return engineInitiateTrapInteraction(state, ownerId, code, targetId);
      }),
    [run, myPlayerId]
  );

  const respondToTrapInteraction = useCallback(
    (interactionId: string, decision: 'accept' | 'refuse') =>
      run((state) => {
        const responderId = myPlayerId!;
        let next = engineRespondToTrapInteraction(state, interactionId, responderId, decision);
        next = resolveCompletedStackFrames(next);
        return next;
      }),
    [run, myPlayerId, resolveCompletedStackFrames]
  );

  const playCounter = useCallback(
    (code: CardCode, responseId: string) => run((state) => respondToFrame(state, responseId, myPlayerId!, code)),
    [run, myPlayerId]
  );

  const skipCounter = useCallback(
    (responseId: string) => run((state) => respondToFrame(state, responseId, myPlayerId!)),
    [run, myPlayerId]
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
        return {
          ...engineFinishGame(state, winnerId, reason),
          reactionStack: [],
          pendingResponse: null,
          pendingInteraction: null,
        };
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

  // Each client handles its own response; the local host also handles bot responses.
  useEffect(() => {
    if (!roomState || roomState.status !== 'playing' || !myPlayerId) return;
    const top = getTopFrame(roomState);
    if (!top) return;
    const pendingIds = top.eligibleResponderIds.filter(id => top.responses[id]?.status === 'pending');
    const botId = roomCode?.startsWith('bot-') && myPlayerId === roomState.hostId
      ? pendingIds.find(id => id.startsWith('bot-')) : undefined;
    const responderId = botId ?? (pendingIds.includes(myPlayerId) ? myPlayerId : undefined);
    const noCounters = roomState.globalRestrictions?.some(r => r.type === 'no_counters');
    if (!responderId) {
      if (areAllResponsesComplete(top) && myPlayerId === roomState.hostId) {
        const timer = setTimeout(() => run(resolveCompletedStackFrames), 400);
        return () => clearTimeout(timer);
      }
      return;
    }
    if (!botId && !noCounters && getPlayableCounters(roomState.players[responderId].hand, roomState.pendingResponse ?? null).length > 0) return;
    const timer = setTimeout(() => run(state => {
      const current = getTopFrame(state);
      if (current?.frameId !== top.frameId) return state;
      const decision = botId && !state.globalRestrictions?.some(r => r.type === 'no_counters') && state.pendingResponse
        ? decideBotCounter(state, botId, state.pendingResponse) : { action: 'skip' as const };
      return respondToFrame(state, top.frameId, responderId, decision.action === 'counter' ? decision.code : undefined);
    }), 450);
    return () => clearTimeout(timer);
  }, [roomState, myPlayerId, run, roomCode]);

  // Auto-play bot turns in local bot rooms
  useEffect(() => {
    if (!roomCode?.startsWith('bot-') || !roomState || roomState.pendingResponse || roomState.pendingInteraction) return;
    if (roomState.status !== 'playing') return;
    if (roomState.isShufflingDrawPile) return;

    const botId = roomState.turnOrder[roomState.currentTurnIndex];
    if (!botId || !botId.startsWith('bot-')) return;

    // Unique turn key per turn state to prevent duplicate scheduling
    const turnKey = `${roomState.sequenceNumber ?? 0}-${roomState.roundNumber ?? 1}-${roomState.currentTurnIndex}-${roomState.turnPhase ?? 'trap_placement'}-${botId}-${roomState.players[botId]?.hand.length}-${roomState.players[botId]?.traps?.length}-${roomState.drawPile.length}-${Boolean(roomState.players[botId]?.hasDrawnThisTurn)}-${Boolean(roomState.players[botId]?.hasPlayedActionThisTurn)}`;
    if (executedBotTurnKeyRef.current === turnKey) return;

    // Set ref at SCHEDULE TIME, not inside the timer callback.
    // This prevents duplicate timers when React re-renders between schedule and fire.
    executedBotTurnKeyRef.current = turnKey;

    const capturedSeq = roomState.sequenceNumber ?? 0;
    const timer = setTimeout(() => {
      run((state) => {
        // Stale callback guard: sequenceNumber changed (force skip or new game)
        if ((state.sequenceNumber ?? 0) !== capturedSeq) return state;
        if (state.status !== 'playing' || state.pendingResponse || state.pendingInteraction || state.isShufflingDrawPile) return state;
        const currentBotId = state.turnOrder[state.currentTurnIndex];
        if (!currentBotId || !currentBotId.startsWith('bot-')) return state;

        // Phase 1: Trap Placement Phase
        if (state.turnPhase === 'trap_placement') {
          const player = state.players[currentBotId];
          // Idempotency guard: if trap already placed this turn, skip to avoid throwing
          if (!player || player.placedTrapThisTurn) return state;
          const trapDecision = decideBotTrapPlacement(state, currentBotId);
          if (trapDecision.action === 'place') {
            // Verify card is still in hand before calling engine
            if (!player.hand.includes(trapDecision.code)) {
              return engineSkipTrapPlacement(state, currentBotId);
            }
            return enginePlaceTrap(state, currentBotId, trapDecision.code);
          } else {
            return engineSkipTrapPlacement(state, currentBotId);
          }
        }

        const bot = state.players[currentBotId];
        if (bot.hasDrawnThisTurn || bot.hasPlayedActionThisTurn) {
          return endPlayerTurn(state, currentBotId);
        }

        // Phase 2: Main Phase
        // Evaluate manual trap activation opportunity
        const manualTrapDecision = decideBotManualTrapActivation(state, currentBotId);
        if (manualTrapDecision) {
          if (manualTrapDecision.code === 'T10' && manualTrapDecision.targetId) {
            let next = engineInitiateTrapInteraction(state, currentBotId, 'T10', manualTrapDecision.targetId);
            return resolveCompletedStackFrames(next);
          } else if (manualTrapDecision.targetId) {
            let next = activateManualTrap(state, currentBotId, manualTrapDecision.code, [manualTrapDecision.targetId]);
            return resolveCompletedStackFrames(next);
          }
        }

        const decision = decideBotTurn(state, currentBotId);
        if (decision.action === 'draw') {
          return drawTurnCard(state, currentBotId);
        }
        return playTurnAction(state, currentBotId, decision.code, decision.targetId);
      });
    }, 600);
    return () => {
      clearTimeout(timer);
      if (executedBotTurnKeyRef.current === turnKey) executedBotTurnKeyRef.current = null;
    };
  }, [roomCode, roomState, run]);

  // Auto-respond to interactive invitations (e.g. T10 date invite) for bot targets
  useEffect(() => {
    const interaction = roomState?.pendingInteraction;
    if (!interaction || !myPlayerId || myPlayerId !== roomState?.hostId) return;

    const targetId = interaction.targetPlayerId;
    if (!targetId || !targetId.startsWith('bot-')) return;

    const timer = setTimeout(() => {
      run((state) => {
        if (!state.pendingInteraction || state.pendingInteraction.interactionId !== interaction.interactionId) {
          return state;
        }
        const decision = decideBotInteraction(interaction);
        return engineRespondToTrapInteraction(state, interaction.interactionId, targetId, decision);
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [roomState?.pendingInteraction, myPlayerId, run]);

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
    endTurn,
    hostSkipTurn,
    playAction,
    placeTrapCard,
    skipTrapPlacement,
    openTrapCard,
    initiateTrapInteraction,
    respondToTrapInteraction,
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

