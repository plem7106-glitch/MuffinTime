'use client';

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
import { draw, discard, balancedShuffleDrawPile } from '../game/pile';
import { placeTrap as enginePlaceTrap, removeTrap, skipTrapPlacement as engineSkipTrapPlacement } from '../game/trap';
import {
  advanceTurn,
  emergencyForceSkipTurn,
  checkWinnerAtTurnStart,
  resolvePendingWinChecks,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
} from '../game/turn';
import {
  pushStackFrame,
  popStackFrame,
  submitResponse,
  areAllResponsesComplete,
  getTopFrame,
  addModifierToFrame,
  syncPendingResponseBridge,
} from '../game/reactionStack';
import {
  activateManualTrap,
  checkAndTriggerAutomaticTraps,
  initiateTrapInteraction as engineInitiateTrapInteraction,
  respondToTrapInteraction as engineRespondToTrapInteraction,
  executeTrapFrameEffect,
} from '../game/trapRules/engine';
import { createGameEvent, appendGameEvent, GAME_EVENT_TYPES } from '../game/events';
import { getPlayableCounters } from '../game/counterRules/registry';
import { resolveCounterEffect } from '../game/counterRules/engine';
import { getPlayableActions, isActionImplemented, executeActionFrameEffect } from '../game/actionRules/registry';
import type { RoomState, PlayerId, CardCode, PlayDirection, PendingResponse, LastResult } from '../game/types';
import { buildCanonicalDeck } from '../data/cards/deck';
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
  createRoom: (maxPlayers: number, hostName: string, hostBirthdayMMDD?: string) => Promise<string>;
  createBotRoom: (maxPlayers: number, hostName?: string, hostBirthdayMMDD?: string) => string;
  joinRoom: (code: string, playerName: string, playerBirthdayMMDD?: string) => Promise<void>;
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

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  const afterPendingChecks = resolvePendingWinChecks(advanced, currentId);
  if (afterPendingChecks.status === 'finished') return afterPendingChecks;
  if (checkWinnerAtTurnStart(afterPendingChecks, currentId)) {
    return { ...afterPendingChecks, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return afterPendingChecks;
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
    async (maxPlayers: number, hostName: string, hostBirthdayMMDD?: string) => {
      if (!playerId) throw new Error('ระบบยังไม่พร้อม ลองใหม่อีกครั้ง');
      const finalName = hostName.trim() || 'ผู้เล่น';
      const { code } = await createRoomWithRetry(supabase, playerId, finalName, maxPlayers, 5, Math.random, hostBirthdayMMDD);
      await enterRoom(code);
      return code;
    },
    [playerId, enterRoom]
  );

  const createBotRoomFn = useCallback(
    (maxPlayers: number, hostName?: string, hostBirthdayMMDD?: string) => {
      if (channelRef.current) {
        unsubscribeFromRoom(channelRef.current);
        channelRef.current = null;
      }
      const hostId = playerId || 'host-me';
      const actualHostName = hostName?.trim() || playerName || 'ผู้เล่น';
      const boundedMax = Math.min(Math.max(maxPlayers, 3), 15);

      // Bots deliberately get no birthdayMMDD -- there's no real person to
      // self-report one, and fabricating a date would silently skew A037/
      // A066/A137's "closest birthday" comparisons.
      let state = engineCreateRoom(hostId, actualHostName, boundedMax, hostBirthdayMMDD);
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
    async (code: string, name: string, playerBirthdayMMDD?: string) => {
      if (!playerId) throw new Error('ระบบยังไม่พร้อม ลองใหม่อีกครั้ง');
      const finalName = name.trim() || 'ผู้เล่น';
      await updateRoomWithRetry(supabase, code, (state) => {
        if (state.players[playerId]) return state; // already a member — resume, don't re-add
        return addPlayer(state, playerId, finalName, undefined, playerBirthdayMMDD);
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
        return engineStartGame(state, buildCanonicalDeck());
      }),
    [run, myPlayerId]
  );

  const drawCard = useCallback(
    () =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const pid = myPlayerId!;
        const player = state.players[pid];
        if (player?.hasDrawnThisTurn) return state;
        let next = state;
        if (next.drawPile.length === 0) {
          return finishByDeckExhaustion(next);
        }
        next = draw(next, pid, 1);
        if (next.players[pid]) {
          next.players[pid].hasDrawnThisTurn = true;
        }
        next.turnPhase = 'main';
        // Check automatic state traps (e.g. T09 Card Sick > 10 cards)
        next = checkAndTriggerAutomaticTraps(next);
        return next;
      }),
    [run, myPlayerId]
  );

  const endTurn = useCallback(
    () =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const pid = myPlayerId!;
        const player = state.players[pid];
        if (!player?.hasDrawnThisTurn) return state;
        return advanceAndCheckWin(state);
      }),
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
    (code: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        if (state.globalRestrictions?.some((r) => r.type === 'no_actions')) return state;
        const actorId = myPlayerId!;
        const player = state.players[actorId];
        if (player?.hasPlayedActionThisTurn) return state;
        if (!isActionImplemented(code) || !getPlayableActions(state, actorId).includes(code)) return state;
        if ((code === 'A014' || code === 'A016') && !targetId) return state;
        if (targetId && !state.players[targetId]) return state;
        const afterDiscard = discard(state, actorId, 1, [code]);
        if (afterDiscard.players[actorId]) {
          afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
        }
        const next = pushStackFrame(afterDiscard, {
          sourceType: 'action',
          sourceCode: code,
          actorId,
          targetIds: targetId ? [targetId] : [],
          ...(customPayload ? { customPayload } : {}),
        });
        appendGameEvent(next, createGameEvent(GAME_EVENT_TYPES.ACTION_PLAYED, actorId, { actorId, actionCode: code }, [actorId]));
        return next;
      }),
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

  const resolveCompletedStackFrames = useCallback((state: RoomState): RoomState => {
    let next = state;
    let currentTop = getTopFrame(next);

    while (currentTop && areAllResponsesComplete(currentTop)) {
      if (currentTop.status !== 'cancelled') {
        if (currentTop.sourceType === 'trap') {
          next = executeTrapFrameEffect(next, currentTop);
        } else {
          next = executeActionFrameEffect(next, currentTop);
        }
      }

      next = checkAndTriggerAutomaticTraps(next);

      const { state: poppedState, poppedFrame } = popStackFrame(next);
      const wasActionBase =
        poppedFrame?.sourceType === 'action' &&
        (!poppedState.reactionStack || poppedState.reactionStack.length === 0);
      let finalState = poppedState;
      if (wasActionBase && poppedFrame?.actorId && poppedFrame.actorId.startsWith('bot-')) {
        let botNext = draw(poppedState, poppedFrame.actorId, 1);
        if (botNext.players[poppedFrame.actorId]) {
          botNext.players[poppedFrame.actorId].hasDrawnThisTurn = true;
        }
        botNext = checkAndTriggerAutomaticTraps(botNext);
        finalState = advanceAndCheckWin(botNext);
      }

      next = finalState;
      const newTop = getTopFrame(next);
      if (newTop === currentTop) break;
      currentTop = newTop;
    }

    return next;
  }, []);

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
    (code: CardCode, responseId: string) =>
      run((state) => {
        const top = getTopFrame(state);
        if (!top || top.frameId !== responseId) return state;
        if (state.globalRestrictions?.some((r) => r.type === 'no_counters')) return state;
        const counterActorId = myPlayerId!;
        if (!state.pendingResponse || !getPlayableCounters(state.players[counterActorId]?.hand ?? [], state.pendingResponse).includes(code)) return state;
        const afterDiscard = discard(state, counterActorId, 1, [code]);

        // Submit counter response to top frame
        let next = submitResponse(afterDiscard, responseId, counterActorId, {
          status: 'countered',
          counterCode: code,
        });

        // Resolve counter card effect (e.g. demo draws)
        next = resolveCounterEffect(next, code, counterActorId);

        // Add modifier to target frame
        next = addModifierToFrame(next, responseId, {
          modifierId: `mod-${code}-${Date.now()}`,
          sourceFrameId: responseId,
          type: 'cancel_all',
          affectedTargetIds: [counterActorId],
        });

        next = resolveCompletedStackFrames(next);

        return {
          ...next,
          lastResult: {
            responseId,
            kind: top.sourceType === 'trap' ? 'trap' : 'action',
            code: top.sourceCode,
            actorId: top.actorId,
            targetId: top.targetIds[0],
            countered: true,
            counteredBy: counterActorId,
            counterCode: code,
          },
        };
      }),
    [run, myPlayerId, resolveCompletedStackFrames]
  );

  const skipCounter = useCallback(
    (responseId: string) =>
      run((state) => {
        const top = getTopFrame(state);
        if (!top || top.frameId !== responseId) return state;
        const responderId = myPlayerId ?? top.eligibleResponderIds[0];

        // Submit skip response for this player
        let next = submitResponse(state, responseId, responderId, {
          status: 'skipped',
        });

        next = resolveCompletedStackFrames(next);

        return {
          ...next,
          lastResult:
            top.sourceType === 'trap'
              ? {
                  responseId,
                  kind: 'trap',
                  code: top.sourceCode,
                  actorId: top.actorId,
                  targetId: top.targetIds[0],
                  countered: false,
                }
              : null,
        };
      }),
    [run, myPlayerId, resolveCompletedStackFrames]
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

  // Auto-skip or bot-respond to counter windows
  useEffect(() => {
    const pendingResponse = roomState?.pendingResponse;
    if (!pendingResponse || !myPlayerId || !roomState) return;
    if (myPlayerId !== roomState.hostId) return;

    const isBot = roomCode?.startsWith('bot-');

    if (isBot) {
      // In local bot mode, check if human has an active interaction to decide
      const isHumanActor = pendingResponse.actorId === myPlayerId;
      const isHumanTarget = !pendingResponse.targetId || pendingResponse.targetId === myPlayerId;
      const noCounters = roomState.globalRestrictions?.some((r) => r.type === 'no_counters') ?? false;
      const humanHand = roomState.players[myPlayerId]?.hand ?? [];
      const humanCanCounter = !noCounters && getPlayableCounters(humanHand, pendingResponse).length > 0;

      // 1. If human was hit by a trap, human sees TrapAlertModal to decide counter/decline
      if (!isHumanActor && isHumanTarget && pendingResponse.kind === 'trap') {
        return;
      }
      // 2. If human can counter an action, human sees CounterModal to decide play/skip
      if (!isHumanActor && humanCanCounter && pendingResponse.kind === 'action') {
        return;
      }

      // 3. Otherwise (bot-on-bot action/trap, human's own action/trap, or human has no valid counters):
      // Check if an eligible bot responder can play a counter
      const responseId = pendingResponse.responseId;
      const top = getTopFrame(roomState);
      const eligibleBotIds = top?.eligibleResponderIds.filter((id) => id.startsWith('bot-')) ?? [];

      const timer = setTimeout(() => {
        // Evaluate bot counter decisions
        let botCounterActorId: string | null = null;
        let botCounterCode: string | null = null;
        if (!noCounters) {
          for (const botId of eligibleBotIds) {
            const decision = decideBotCounter(roomState, botId, pendingResponse);
            if (decision.action === 'counter') {
              botCounterActorId = botId;
              botCounterCode = decision.code;
              break;
            }
          }
        }

        if (botCounterActorId && botCounterCode) {
          const actorId = botCounterActorId;
          const code = botCounterCode;
          run((state) => {
            const currentTop = getTopFrame(state);
            if (!currentTop || currentTop.frameId !== responseId) return state;

            const afterDiscard = discard(state, actorId, 1, [code]);
            let next = submitResponse(afterDiscard, responseId, actorId, {
              status: 'countered',
              counterCode: code,
            });
            next = resolveCounterEffect(next, code, actorId);
            next = addModifierToFrame(next, responseId, {
              modifierId: `mod-${code}-${Date.now()}`,
              sourceFrameId: responseId,
              type: 'cancel_all',
              affectedTargetIds: [actorId],
            });

            const updatedTop = getTopFrame(next);
            if (updatedTop && areAllResponsesComplete(updatedTop)) {
              const { state: poppedState, poppedFrame } = popStackFrame(next);
              const wasActionBase =
                poppedFrame?.sourceType === 'action' &&
                (!poppedState.reactionStack || poppedState.reactionStack.length === 0);
              let finalState = wasActionBase ? advanceAndCheckWin(poppedState) : poppedState;
              finalState = checkAndTriggerAutomaticTraps(finalState);
              return {
                ...finalState,
                lastResult: {
                  responseId,
                  kind: poppedFrame?.sourceType === 'trap' ? 'trap' : 'action',
                  code: poppedFrame?.sourceCode ?? code,
                  actorId: poppedFrame?.actorId ?? actorId,
                  targetId: poppedFrame?.targetIds[0],
                  countered: true,
                  counteredBy: actorId,
                  counterCode: code,
                },
              };
            }
            return next;
          });
        } else {
          skipCounter(responseId);
        }
      }, 450);
      return () => clearTimeout(timer);
    }

    // Multiplayer room logic (all human players):
    const eligibleIds =
      pendingResponse.kind === 'trap' && pendingResponse.targetId
        ? [pendingResponse.targetId]
        : Object.keys(roomState.players).filter((id) => id !== pendingResponse.actorId);

    const anyoneCanRespond = eligibleIds.some((id) => {
      const hand = roomState.players[id]?.hand ?? [];
      return getPlayableCounters(hand, pendingResponse).length > 0;
    });
    if (anyoneCanRespond) return;

    const responseId = pendingResponse.responseId;
    const timer = setTimeout(() => skipCounter(responseId), 400);
    return () => clearTimeout(timer);
  }, [roomState, myPlayerId, skipCounter, run, roomCode]);

  // Auto-play bot turns in local bot rooms
  useEffect(() => {
    if (!roomCode?.startsWith('bot-') || !roomState || roomState.pendingResponse || roomState.pendingInteraction) return;
    if (roomState.status !== 'playing') return;
    if (roomState.isShufflingDrawPile) return;

    const botId = roomState.turnOrder[roomState.currentTurnIndex];
    if (!botId || !botId.startsWith('bot-')) return;

    // Unique turn key per turn state to prevent duplicate scheduling
    const turnKey = `${roomState.sequenceNumber ?? 0}-${roomState.roundNumber ?? 1}-${roomState.currentTurnIndex}-${roomState.turnPhase ?? 'trap_placement'}-${botId}-${roomState.players[botId]?.hand.length}-${roomState.players[botId]?.traps?.length}-${roomState.drawPile.length}`;
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
          let next = draw(state, currentBotId, 1);
          next = checkAndTriggerAutomaticTraps(next);
          return advanceAndCheckWin(next);
        }
        // Verify card is still in hand before discarding
        if (!state.players[currentBotId]?.hand.includes(decision.code)) {
          // Card gone (stale decision), just draw instead
          let next = draw(state, currentBotId, 1);
          next = checkAndTriggerAutomaticTraps(next);
          return advanceAndCheckWin(next);
        }
        const afterDiscard = discard(state, currentBotId, 1, [decision.code]);
        return pushStackFrame(afterDiscard, {
          sourceType: 'action',
          sourceCode: decision.code,
          actorId: currentBotId,
          targetIds: decision.targetId ? [decision.targetId] : [],
        });
      });
    }, 600);
    return () => clearTimeout(timer);
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

