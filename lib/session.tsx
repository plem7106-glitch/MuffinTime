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
  setGameSuggester as engineSetGameSuggester,
  startGame as engineStartGame,
  finishGame as engineFinishGame,
  resetForPlayAgain as engineResetForPlayAgain,
  updatePlayerBirthday as engineUpdatePlayerBirthday,
} from '../game/room';
import { draw, discard, balancedShuffleDrawPile } from '../game/pile';
import { applyActionRedirect } from '../game/turnFlow';
import { placeTrap as enginePlaceTrap, removeTrap, skipTrapPlacement as engineSkipTrapPlacement } from '../game/trap';
import {
  advanceTurn,
  emergencyForceSkipTurn,
  resolveTurnArrival,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
  hasCompletedMainChoice,
  canEndTurn,
} from '../game/turn';
import {
  pushStackFrame,
  popStackFrame,
  removeStackFrame,
  submitResponse,
  areAllResponsesComplete,
  getTopFrame,
  getStackFrame,
  addModifierToFrame,
  syncPendingResponseBridge,
} from '../game/reactionStack';
import {
  activateManualTrap,
  canActivateManualTrap,
  initiateTrapInteraction as engineInitiateTrapInteraction,
  respondToTrapInteraction as engineRespondToTrapInteraction,
  checkAndTriggerAutomaticTraps,
  executeTrapFrameEffect,
} from '../game/trapRules/engine';
import { resolveDelegatedTargetPick as engineResolveDelegatedTargetPick } from '../game/actionRules/delegatedTargetPick';
import { createGameEvent, appendGameEvent, GAME_EVENT_TYPES } from '../game/events';
import { getCounterContextForActiveFrame, getEligibleCounterResponders, getPlayableCountersForActiveFrame, getZeroEligibleCounterResponderIds } from '../game/counterRules/registry';
import { applyDevReactionScenario, createDevReactionScenario, createDevScenarioRoomCode, type DevReactionScenario } from './devReactionScenarios';
import { resolveCounterEffect } from '../game/counterRules/engine';
import { resolveForcedDiscard } from '../game/forcedDiscard';
import { resolveSteal } from '../game/steal';
import { getPlayableActions, isActionImplemented, executeActionFrameEffect } from '../game/actionRules/registry';
import { isQuantityEffectCard } from '../game/actionRules/quantityCards';
import type { RoomState, PlayerId, CardCode, PlayDirection, PendingResponse, LastResult, RecentActionPlay } from '../game/types';
import { buildCanonicalDeck } from '../data/cards/deck';
import { executeManualRecoveryDiscard, executeManualRecoveryGive } from '../game/recovery';
import { playSocialCounter as enginePlaySocialCounter } from '../game/socialCounter';
import {
  decideBotTurn,
  decideBotTrapPlacement,
  decideBotCounter,
  decideBotInteraction,
  decideBotManualTrapActivation,
  fillBotActionInputs,
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
  /** Player ids currently connected to this room's realtime channel, per
   * Supabase Presence. `null` until the first presence sync arrives (or
   * always, for bot rooms, which have no realtime channel) -- callers
   * should treat `null` as "unknown", not "nobody online". */
  onlinePlayerIds: Set<PlayerId> | null;
  /** True when you may use the host-only "unstick" escape hatch: either you ARE
   * the host, or the host has dropped off presence and you are the first player
   * in turn order who is still online. Without the fallback, a host who closes
   * their phone mid-response-window leaves the table permanently frozen --
   * `removePlayer` (which would migrate the host) only runs on a deliberate
   * "leave room" tap, never on a closed tab or a dead network. */
  canActAsHost: boolean;
  myPlayerId: PlayerId | null;
  pendingResponse: PendingResponse | null;
  lastResult: LastResult | null;
  error: string | null;
  clearLastResult: () => void;
  createRoom: (maxPlayers: number, hostName: string, hostBirthdayMMDD?: string) => Promise<string>;
  createBotRoom: (maxPlayers: number, hostName?: string, hostBirthdayMMDD?: string, scenario?: DevReactionScenario) => string;
  joinRoom: (code: string, playerName: string, playerBirthdayMMDD?: string) => Promise<void>;
  previewRoom: (code: string) => Promise<RoomState | null>;
  resumeRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startSetup: () => void;
  setSeatOrder: (seatOrder: PlayerId[]) => void;
  setPlayDirection: (direction: PlayDirection) => void;
  setGameSuggester: (playerId: PlayerId) => void;
  updateMyBirthday: (birthdayMMDD: string) => void;
  confirmTurnOrder: () => void;
  drawCard: () => void;
  endTurn: () => void;
  hostSkipTurn: () => void;
  playAction: (code: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) => void;
  playDoubledAction: (partnerCode: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) => void;
  placeTrapCard: (code: CardCode) => void;
  skipTrapPlacement: () => void;
  openTrapCard: (code: CardCode, targetId?: PlayerId | PlayerId[]) => void;
  initiateTrapInteraction: (code: CardCode, targetId: PlayerId) => void;
  respondToTrapInteraction: (interactionId: string, decision: 'accept' | 'refuse') => void;
  respondToDelegatedTargetPick: (interactionId: string, chosenTargetId: PlayerId) => void;
  playCounter: (code: CardCode, responseId: string, actorIdOverride?: PlayerId, customPayloadOverride?: Record<string, unknown>) => void;
  skipCounter: (responseId: string, responderIdOverride?: PlayerId) => void;
  declareMuffinTime: () => void;
  finishGame: (winnerId: PlayerId, reason?: 'normal' | 'manual') => void;
  playAgain: () => void;
  shuffleDrawPile: () => void;
  finishShuffleDrawPile: () => void;
  manualDiscard: (cardCodes: CardCode[]) => void;
  manualGiveCard: (recipientId: PlayerId, cardCodes: CardCode[]) => void;
  playSocialCounter: (code: CardCode, targetPlayerId?: PlayerId) => void;
}

const GameSessionContext = createContext<GameSessionValue | null>(null);

function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  return resolveTurnArrival(advanced, currentId);
}

/**
 * Resolves every reaction-stack frame whose responses are already complete,
 * applying each frame's effect (counter/trap/action) and popping it off the
 * stack, repeating until the top frame still needs responses or the stack is
 * empty. Hoisted to module scope (out of GameSessionProvider) because it is a
 * pure function of `state` -- it was previously a `useCallback` with an empty
 * dependency array, i.e. it never closed over component state/props -- which
 * also makes it independently testable outside of React.
 */
/**
 * Everything a player can actually SEE on the table, and nothing else --
 * reaction-stack bookkeeping, sequence numbers and event logs are deliberately
 * excluded, because those move on every resolution whether or not the card did
 * anything. Comparing this across a resolve is how `LastResult.hadNoEffect` is
 * decided, so a card whose condition wasn't met can say so instead of showing
 * the same popup as a card that worked.
 */
export function visibleFingerprint(state: RoomState): string {
  return JSON.stringify({
    draw: state.drawPile.length,
    discard: state.discardPile,
    banished: state.banishedCards?.length ?? 0,
    turnIndex: state.currentTurnIndex,
    direction: state.direction,
    muffinTarget: state.muffinTimeTarget,
    status: state.status,
    winner: state.winnerId ?? null,
    redirect: state.actionRedirect ?? null,
    restrictions: state.globalRestrictions ?? [],
    players: Object.keys(state.players).sort().map((id) => {
      const p = state.players[id];
      return [id, p.hand.length, p.traps.length, p.skipNextTurn === true, p.hasCalledMuffinTime === true];
    }),
  });
}

export function resolveCompletedStackFrames(state: RoomState): RoomState {
  let next = state;
  let currentTop = getTopFrame(next);

  while (currentTop && areAllResponsesComplete(currentTop)) {
    const resolvingFrame = currentTop;
    if (resolvingFrame.status !== 'cancelled') {
      if (resolvingFrame.sourceType === 'counter') {
        // 1. Primary Interception: Apply cancellation to parent frame if un-cancelled
        const parentId = resolvingFrame.parentFrameId ?? (resolvingFrame.customPayload?.parentFrameId as string | undefined);
        // Counters whose effect modifies/redirects the parent frame in place
        // (via resolveCounterEffect below) instead of just stopping it --
        // cancelling the parent here would wipe out that modification before
        // it ever runs.
        const parentSurvives = ['C07', 'C11', 'C15', 'C22', 'C23', 'C34', 'C35', 'C36', 'C39', 'C40', 'C45', 'C47'].includes(resolvingFrame.sourceCode);
        if (parentId && !parentSurvives) {
          next = addModifierToFrame(next, parentId, {
            modifierId: `mod-${resolvingFrame.sourceCode}-${Date.now()}`,
            sourceFrameId: resolvingFrame.frameId,
            type: 'cancel_all',
            affectedTargetIds: [resolvingFrame.actorId],
          });
        }

        // Forced Discard Operation modification for C02, C03, C30
        const opId = (resolvingFrame.customPayload?.forcedDiscardOperationId as string | undefined)
          ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.forcedDiscardOperationId as string | undefined) : undefined)
          ?? Object.keys(next.pendingForcedDiscards ?? {})[0];

        if (opId && next.pendingForcedDiscards?.[opId]) {
          const op = next.pendingForcedDiscards[opId];
          if (resolvingFrame.sourceCode === 'C02') {
            // C02: Stop another player from discarding their cards.
            next.pendingForcedDiscards[opId] = { ...op, status: 'canceled' };
          } else if (resolvingFrame.sourceCode === 'C03') {
            // C03: If you're being forced to discard cards, keep 2 of them.
            const newCount = Math.max(0, op.cardCodes.length - 2);
            const newCardCodes = op.cardCodes.slice(0, newCount);
            next.pendingForcedDiscards[opId] = {
              ...op,
              cardCodes: newCardCodes,
              requestedCount: newCount,
              status: newCount === 0 ? 'canceled' : op.status,
            };
          } else if (resolvingFrame.sourceCode === 'C30') {
            // C30: Stop being forced to discard cards and draw that many instead.
            const drawCount = op.cardCodes.length;
            next.pendingForcedDiscards[opId] = { ...op, status: 'canceled' };
            next = draw(next, op.targetPlayerId, drawCount);
          }
        }

        // Steal Operation modification for C04, C06, C08, C12, C26, C28
        const stealOpId = (resolvingFrame.customPayload?.stealOperationId as string | undefined)
          ?? (parentId ? (getStackFrame(next, parentId)?.customPayload?.stealOperationId as string | undefined) : undefined)
          ?? Object.keys(next.pendingSteals ?? {})[0];

        if (stealOpId && next.pendingSteals?.[stealOpId]) {
          const op = next.pendingSteals[stealOpId];
          if (['C06', 'C12', 'C28'].includes(resolvingFrame.sourceCode)) {
            // C06, C12, C28: Stop the steal operation
            next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
          } else if (resolvingFrame.sourceCode === 'C04') {
            // C04: Stop steal against self + redirect steal to newVictimId
            const newVictimId = (resolvingFrame.customPayload?.newVictimId as string | undefined)
              ?? (resolvingFrame.targetIds.find((id) => id !== op.thiefId && id !== op.victimId));

            if (newVictimId && next.players[newVictimId] && newVictimId !== op.thiefId && newVictimId !== op.victimId) {
              const newVictimHand = next.players[newVictimId].hand.length;
              const newActualCount = Math.min(op.requestedCount, newVictimHand);
              next.pendingSteals[stealOpId] = {
                ...op,
                victimId: newVictimId,
                redirectedFromId: op.victimId,
                selectedCardCode: undefined, // invalidate original victim's card selection
                actualCount: newActualCount,
                status: 'redirected', // mark redirected so resumePendingSteal opens new reaction cycle for newVictimId
              };
              if (parentId) {
                const res = removeStackFrame(next, parentId);
                next = res.state;
              }
            } else {
              next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
            }
          } else if (resolvingFrame.sourceCode === 'C08') {
            // C08: Stop steal + victim forced discards that many cards instead
            const countToDiscard = op.actualCount;
            const victimId = op.victimId;
            const thiefId = op.thiefId;
            next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
            next = resolveForcedDiscard(next, victimId, countToDiscard, thiefId);
          } else if (resolvingFrame.sourceCode === 'C26') {
            // C26: Stop steal + victim steals that many cards back from thief
            const countToStealBack = op.actualCount;
            const victimId = op.victimId;
            const thiefId = op.thiefId;
            next.pendingSteals[stealOpId] = { ...op, status: 'canceled' };
            next = resolveSteal(next, thiefId, victimId, countToStealBack, op.stealMode, victimId);
          }
        }

        // 2. Deferred Secondary Effect: Execute secondary effect only when surviving
        next = resolveCounterEffect(next, resolvingFrame.sourceCode, resolvingFrame.actorId, resolvingFrame);
      } else if (resolvingFrame.sourceType === 'trap') {
        next = executeTrapFrameEffect(next, resolvingFrame);
      } else {
        next = executeActionFrameEffect(next, resolvingFrame);
        if (resolvingFrame.customPayload?.doubled) {
          next = executeActionFrameEffect(next, resolvingFrame);
        }
        // Strip `doubled` before persisting to history: it's a one-shot
        // modifier that was already "spent" resolving this play. A later
        // replay (e.g. A094) should repeat the underlying effect once, not
        // inherit `doubled` and compound into a double-doubled invocation.
        const { doubled: _doubled, ...historyPayload } = resolvingFrame.customPayload ?? {};
        const entry: RecentActionPlay = {
          code: resolvingFrame.sourceCode,
          actorId: resolvingFrame.actorId,
          targetIds: resolvingFrame.targetIds,
          customPayload: Object.keys(historyPayload).length > 0 ? historyPayload : undefined,
        };
        next.recentActionPlays = [entry, ...(next.recentActionPlays ?? [])].slice(0, 5);
      }
    }

    next = checkAndTriggerAutomaticTraps(next);

    const { state: removedState, removedFrame } = removeStackFrame(next, resolvingFrame.frameId);
    const wasActionBase =
      removedFrame?.sourceType === 'action' &&
      (!removedState.reactionStack || removedState.reactionStack.length === 0);
    let finalState = removedState;
    if (wasActionBase && removedFrame?.actorId && removedFrame.actorId.startsWith('bot-')) {
      // Bot completed its Action Main Choice — advance turn directly without follow-up draw
      finalState = advanceAndCheckWin(removedState);
    }

    next = finalState;
    const newTop = getTopFrame(next);
    if (newTop === resolvingFrame) break;
    currentTop = newTop;
  }

  return next;
}

/**
 * Records a responder's decision not to play a Counter against the top
 * reaction-stack frame, then resolves the stack if that was the last
 * outstanding response. Hoisted to module scope (mirrors
 * resolveCompletedStackFrames above) for the same reason: it only closes
 * over its own parameters, not component state, so it's independently
 * testable. Sets `lastResult` for both trap AND action frames (not just
 * trap) so every connected client's TrapResultModal/ActionResultModal can
 * show the "what just happened" summary -- a plain, uncontested Action play
 * previously left `lastResult` null here, so nobody but the actor's own
 * small flying-card animation ever saw it resolve.
 */
export function applySkipCounter(state: RoomState, responseId: string, responderId?: PlayerId): RoomState {
  const top = getTopFrame(state);
  if (!top || top.frameId !== responseId) return state;

  let next = state;
  if (responderId && top.eligibleResponderIds.includes(responderId)) {
    next = submitResponse(next, responseId, responderId, {
      status: 'skipped',
    });
  }

  const beforeResolve = visibleFingerprint(next);
  next = resolveCompletedStackFrames(next);

  return {
    ...next,
    lastResult:
      top.sourceType === 'trap' || top.sourceType === 'action'
        ? {
            responseId,
            kind: top.sourceType,
            code: top.sourceCode,
            actorId: top.actorId,
            targetId: top.targetIds[0],
            countered: false,
            hadNoEffect: visibleFingerprint(next) === beforeResolve,
          }
        : null,
  };
}

/**
 * Core logic for playing a Counter card against the active reaction-stack
 * frame. Hoisted to module scope (mirrors applySkipCounter above) for the
 * same reason: it only closes over its own parameters, so it's
 * independently testable.
 *
 * The pushed child frame for the just-played Counter now passes its own
 * eligibleResponderIds via getEligibleCounterResponders instead of leaving
 * it unset. Leaving it unset previously fell through to
 * reactionStack.ts's createStackFrame default for sourceType 'counter' --
 * "every other player at the table" -- even though only a handful of cards
 * (C05/C18/C21/C29) can ever legally counter a Counter. That meant playing
 * ANY Counter (C03 included) pushed a phantom response window that had to
 * wait for the async host-mediated auto-skip effect (lib/session.tsx's
 * "Auto-skip or bot-respond to counter windows" effect) to silently resolve
 * it one extra round trip later -- invisible and fast on a good connection,
 * but with zero loading UI, so any latency (or the host's tab merely being
 * backgrounded) made the game look stuck right after playing a Counter,
 * with no indication of what anyone needed to do next.
 */
export function applyPlayCounter(
  state: RoomState,
  code: CardCode,
  responseId: string,
  counterActorId?: PlayerId,
  customPayloadOverride?: Record<string, unknown>
): RoomState {
  const top = getTopFrame(state);
  if (!top || top.frameId !== responseId) return state;
  if (state.globalRestrictions?.some((r) => r.type === 'no_counters')) return state;
  if (!counterActorId || !state.players[counterActorId]) return state;
  const ctx = getCounterContextForActiveFrame(state, counterActorId);
  const stealOp = ctx?.stealOp;

  if (!getPlayableCountersForActiveFrame(state, counterActorId).includes(code)) return state;

  if (code === 'C04') {
    const newVictimId = customPayloadOverride?.newVictimId as string | undefined;
    if (!stealOp || !newVictimId || !state.players[newVictimId] || newVictimId === stealOp.thiefId || newVictimId === stealOp.victimId) {
      return state;
    }
  }

  const afterDiscard = discard(state, counterActorId, 1, [code]);

  // Submit counter response to top frame
  let next = submitResponse(afterDiscard, responseId, counterActorId, {
    status: 'countered',
    counterCode: code,
  });

  // Push new child StackFrame for the played Counter card!
  next = pushStackFrame(next, {
    sourceType: 'counter',
    sourceCode: code,
    actorId: counterActorId,
    targetIds: [top.actorId],
    eligibleResponderIds: getEligibleCounterResponders(next, counterActorId, code),
    customPayload: {
      parentFrameId: responseId,
      ...(customPayloadOverride ?? {}),
    },
  });

  const counterEvent = createGameEvent(GAME_EVENT_TYPES.COUNTER_PLAYED, counterActorId, {
    actorId: counterActorId,
    counterCode: code,
    targetFrameId: responseId,
  }, [top.actorId]);
  appendGameEvent(next, counterEvent);
  next = checkAndTriggerAutomaticTraps(next, counterEvent);

  next = resolveCompletedStackFrames(next);

  return {
    ...next,
    lastResult: {
      responseId,
      kind: top.sourceType === 'trap' ? 'trap' : top.sourceType === 'counter' ? 'counter' : 'action',
      code: top.sourceCode,
      actorId: top.actorId,
      targetId: top.targetIds[0],
      countered: true,
      counteredBy: counterActorId,
      counterCode: code,
    },
  };
}

/**
 * Core logic for playing A028 "ทาเยอะไปหน่อย" (Bad Spread) together with a
 * qualifying partner Action card. Unlike every other Action, A028 is never
 * itself the sourceCode of a pushed StackFrame -- playing it discards BOTH
 * A028 and the chosen partner card, then pushes exactly ONE frame for the
 * PARTNER's code with customPayload.doubled = true (consumed by
 * resolveCompletedStackFrames above, which invokes the partner's effect
 * twice when that flag is set).
 *
 * Hoisted to module scope as a pure function of (state, myPlayerId, ...) --
 * mirroring resolveCompletedStackFrames above -- so it's independently
 * testable outside of React; the `playDoubledAction` useCallback inside
 * GameSessionProvider is a thin wrapper that supplies `myPlayerId` and
 * dispatches the result through `run`.
 */
export function applyPlayDoubledAction(
  state: RoomState,
  myPlayerId: PlayerId,
  partnerCode: CardCode,
  targetId?: PlayerId,
  customPayload?: Record<string, unknown>
): RoomState {
  if (state.reactionStack && state.reactionStack.length > 0) return state;
  if (state.pendingResponse || state.pendingInteraction) return state;
  if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
  if (state.globalRestrictions?.some((r) => r.type === 'no_actions')) return state;
  const actorId = myPlayerId;
  const player = state.players[actorId];
  // Same "Main Choice" rule as playAction -- see its comment above.
  if (player?.hasDrawnThisTurn) return state;
  const usingBonusPlay = Boolean(player?.hasPlayedActionThisTurn) && (player?.bonusActionPlaysRemaining ?? 0) > 0;
  if (player?.hasPlayedActionThisTurn && !usingBonusPlay) return state;
  if (!player?.hand.includes('A028')) return state;
  if (!isQuantityEffectCard(partnerCode) || partnerCode === 'A028') return state;
  if (!player.hand.includes(partnerCode)) return state;
  if (!isActionImplemented(partnerCode) || !getPlayableActions(state, actorId).includes(partnerCode)) return state;
  if (targetId && !state.players[targetId]) return state;

  let next = state;
  if (next.turnPhase === 'trap_placement' || !next.turnPhase) {
    next = engineSkipTrapPlacement(next, actorId);
  }
  if (next.turnPhase !== 'main') return state;

  let afterDiscard = applyActionRedirect(next, actorId, 'A028');
  afterDiscard = applyActionRedirect(afterDiscard, actorId, partnerCode);
  if (afterDiscard.players[actorId]) {
    if (usingBonusPlay) {
      afterDiscard.players[actorId].bonusActionPlaysRemaining = (afterDiscard.players[actorId].bonusActionPlaysRemaining ?? 0) - 1;
    } else {
      afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
    }
    afterDiscard.players[actorId].hasDrawnThisTurn = false;
  }
  const stackState = pushStackFrame(afterDiscard, {
    sourceType: 'action',
    sourceCode: partnerCode,
    actorId,
    targetIds: targetId ? [targetId] : [],
    customPayload: { ...(customPayload ?? {}), doubled: true },
  });
  const actionEvent = createGameEvent(
    GAME_EVENT_TYPES.ACTION_PLAYED,
    actorId,
    { actorId, actionCode: partnerCode, targetId },
    [targetId ?? actorId]
  );
  appendGameEvent(stackState, actionEvent);
  return checkAndTriggerAutomaticTraps(stackState, actionEvent);
}

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const { playerId, playerName } = usePlayer();
  const [localHostId, setLocalHostId] = useState<string>('host-me');

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedResponseId, setDismissedResponseId] = useState<string | null>(null);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<PlayerId> | null>(null);
  const canActAsHostRef = useRef(false);



  const isBotRoom = roomCode?.startsWith('bot-') ?? false;
  const myPlayerId = isBotRoom ? (localHostId || playerId || 'host-me') : playerId;

  // The host normally owns the unstick button. If they vanish without tapping
  // "leave room" (closed tab, dead network) the host never migrates, so hand
  // the button to the first still-online player in turn order instead -- one
  // deterministic deputy, so several clients can't all fire it at once.
  // `onlinePlayerIds === null` means presence hasn't reported yet: treat that as
  // "unknown", never as "the host is gone".
  const hostIsOffline =
    !!roomState && onlinePlayerIds !== null && !onlinePlayerIds.has(roomState.hostId);
  const deputyHostId = hostIsOffline
    ? (roomState!.turnOrder ?? []).find((id) => onlinePlayerIds!.has(id) && roomState!.players[id])
    : undefined;
  const canActAsHost =
    !!myPlayerId && !!roomState &&
    (myPlayerId === roomState.hostId || (hostIsOffline && myPlayerId === deputyHostId));
  canActAsHostRef.current = canActAsHost;

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
    setOnlinePlayerIds(null);
    const row = await fetchRoom(supabase, code);
    setRoomCode(code);
    setRoomState(row.state);
    channelRef.current = subscribeToRoom(
      supabase,
      code,
      setRoomState,
      (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('การเชื่อมต่อแบบเรียลไทม์มีปัญหา ลองรีเฟรชหน้านี้อีกครั้ง');
        }
      },
      setOnlinePlayerIds,
      playerId ?? undefined
    );
  }, [playerId]);

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
        // Apply our own committed write locally instead of waiting for the
        // Realtime echo to hand it back. The write itself is plain HTTP and
        // succeeds even when the Realtime channel is down; without this the
        // actor's screen keeps rendering pre-write state, which strands them:
        // e.g. the server has recorded their draw (hasDrawnThisTurn = true, so
        // it rejects a second one) while their UI still shows "not drawn yet"
        // and therefore leaves End Turn disabled -- no legal move left but a
        // manual refresh. The bot-room branch above already does this; only the
        // online path relied on the echo.
        const committed = await updateRoomWithRetry(supabase, roomCode, updater);
        setRoomState(committed);
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
    (maxPlayers: number, hostName?: string, hostBirthdayMMDD?: string, scenario?: DevReactionScenario) => {
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
      let state = scenario && process.env.NODE_ENV !== 'production'
        ? createDevReactionScenario(scenario, hostId, actualHostName)
        : engineCreateRoom(hostId, actualHostName, boundedMax, hostBirthdayMMDD);
      for (let i = scenario && process.env.NODE_ENV !== 'production' ? 3 : 1; i <= boundedMax - 1; i++) {
        const botId = `bot-${i}`;
        const botName = BOT_NAME_POOL[(i - 1) % BOT_NAME_POOL.length];
        state = addPlayer(state, botId, botName);
      }
      if (scenario && process.env.NODE_ENV !== 'production') {
        state = applyDevReactionScenario(state, scenario, hostId);
      }

      const code = scenario && process.env.NODE_ENV !== 'production'
        ? createDevScenarioRoomCode(scenario)
        : `bot-${Math.floor(1000 + Math.random() * 9000)}`;
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
    setOnlinePlayerIds(null);
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

  const setGameSuggesterFn = useCallback(
    (playerId: PlayerId) =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        if (!state.players[playerId]) return state;
        return engineSetGameSuggester(state, playerId);
      }),
    [run, myPlayerId]
  );

  const updateMyBirthdayFn = useCallback(
    (birthdayMMDD: string) =>
      run((state) => {
        if (!myPlayerId) return state;
        return engineUpdatePlayerBirthday(state, myPlayerId, birthdayMMDD);
      }),
    [run, myPlayerId]
  );

  const confirmTurnOrderFn = useCallback(
    () =>
      run((state) => {
        if (myPlayerId !== state.hostId) return state;
        const started = engineStartGame(state, buildCanonicalDeck());
        return started.devScenario && process.env.NODE_ENV !== 'production'
          ? applyDevReactionScenario(started, started.devScenario as DevReactionScenario, started.hostId)
          : started;
      }),
    [run, myPlayerId]
  );

  const drawCard = useCallback(
    () =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.devScenario && process.env.NODE_ENV !== 'production') return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const pid = myPlayerId!;
        const player = state.players[pid];
        if (player?.hasDrawnThisTurn || player?.hasPlayedActionThisTurn) return state;
        // A035 "Come Out to Play": under the draw-XOR-play-Action rule above,
        // drawing would permanently foreclose ever satisfying "must play an
        // Action" this turn (playAction is unconditionally blocked once
        // hasDrawnThisTurn is set) -- block the draw itself instead, funneling
        // an obligated player toward playing an Action as their only legal
        // Main Choice this turn.
        if (player?.mustPlayActionThisTurn) return state;
        let next = state;
        if (next.turnPhase === 'trap_placement' || !next.turnPhase) {
          next = engineSkipTrapPlacement(next, pid);
        }
        if (next.turnPhase !== 'main') return state;
        if (next.drawPile.length === 0) {
          return finishByDeckExhaustion(next);
        }
        next = draw(next, pid, 1);
        if (next.players[pid]) {
          next.players[pid].hasDrawnThisTurn = true;
          next.players[pid].hasPlayedActionThisTurn = false;
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
        const pid = myPlayerId!;
        if (!canEndTurn(state, pid)) return state;
        return advanceAndCheckWin(state);
      }),
    [run, myPlayerId]
  );

  // Host-only emergency escape hatch: recovers a stuck game in both Bot Mode and multiplayer
  const hostSkipTurn = useCallback(
    () =>
      run((state) => {
        // Not `myPlayerId !== state.hostId`: an absent host must not be able to
        // freeze the table (see canActAsHost).
        if (!canActAsHostRef.current) return state;
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
        // "Main Choice" rule: draw XOR play an Action -- once you've drawn,
        // no Action play is possible this turn (see game/turn.ts's
        // hasCompletedMainChoice/canEndTurn). Bonus plays from A100 only
        // bypass the hasPlayedActionThisTurn block below, never this one --
        // A100 itself has to be your first play (not preceded by a draw).
        if (player?.hasDrawnThisTurn) return state;
        const usingBonusPlay = Boolean(player?.hasPlayedActionThisTurn) && (player?.bonusActionPlaysRemaining ?? 0) > 0;
        if (player?.hasPlayedActionThisTurn && !usingBonusPlay) return state;
        if (!isActionImplemented(code) || !getPlayableActions(state, actorId).includes(code)) return state;
        if ((code === 'A014' || code === 'A016') && !targetId) return state;
        if (targetId && !state.players[targetId]) return state;

        let next = state;
        if (next.turnPhase === 'trap_placement' || !next.turnPhase) {
          next = engineSkipTrapPlacement(next, actorId);
        }
        if (next.turnPhase !== 'main') return state;

        const afterDiscard = applyActionRedirect(next, actorId, code);
        if (afterDiscard.players[actorId]) {
          if (usingBonusPlay) {
            afterDiscard.players[actorId].bonusActionPlaysRemaining = (afterDiscard.players[actorId].bonusActionPlaysRemaining ?? 0) - 1;
          } else {
            afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
          }
          afterDiscard.players[actorId].hasDrawnThisTurn = false;
        }
        const stackState = pushStackFrame(afterDiscard, {
          sourceType: 'action',
          sourceCode: code,
          actorId,
          targetIds: targetId ? [targetId] : [],
          ...(customPayload ? { customPayload } : {}),
        });
        const actionEvent = createGameEvent(GAME_EVENT_TYPES.ACTION_PLAYED, actorId, { actorId, actionCode: code, targetId }, [targetId ?? actorId]);
        appendGameEvent(stackState, actionEvent);
        return checkAndTriggerAutomaticTraps(stackState, actionEvent);
      }),
    [run, myPlayerId]
  );

  const playDoubledAction = useCallback(
    (partnerCode: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) =>
      run((state) => applyPlayDoubledAction(state, myPlayerId!, partnerCode, targetId, customPayload)),
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
        if (!canActivateManualTrap(state, ownerId, code)) return state;
        let next = activateManualTrap(state, ownerId, code, targetId ? (Array.isArray(targetId) ? targetId : [targetId]) : []);
        next = resolveCompletedStackFrames(next);
        return next;
      }),
    [run, myPlayerId]
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
    [run, myPlayerId]
  );

  const respondToDelegatedTargetPick = useCallback(
    (interactionId: string, chosenTargetId: PlayerId) =>
      run((state) => {
        const responderId = myPlayerId!;
        return engineResolveDelegatedTargetPick(state, interactionId, responderId, chosenTargetId);
      }),
    [run, myPlayerId]
  );

  const playCounter = useCallback(
    (code: CardCode, responseId: string, actorIdOverride?: PlayerId, customPayloadOverride?: Record<string, unknown>) =>
      run((state) => applyPlayCounter(state, code, responseId, actorIdOverride ?? myPlayerId ?? undefined, customPayloadOverride)),
    [run, myPlayerId]
  );

  const skipCounter = useCallback(
    (responseId: string, responderIdOverride?: PlayerId) =>
      run((state) => applySkipCounter(state, responseId, responderIdOverride ?? myPlayerId ?? undefined)),
    [run, myPlayerId]
  );

  const declareMuffinTimeFn = useCallback(
    () => run((state) => engineDeclareMuffinTime(state, myPlayerId!)),
    [run, myPlayerId]
  );

  const manualDiscard = useCallback(
    (cardCodes: CardCode[]) =>
      run((state) => {
        const actorId = myPlayerId!;
        return executeManualRecoveryDiscard(state, actorId, cardCodes);
      }),
    [run, myPlayerId]
  );

  const manualGiveCard = useCallback(
    (recipientId: PlayerId, cardCodes: CardCode[]) =>
      run((state) => {
        const senderId = myPlayerId!;
        return executeManualRecoveryGive(state, senderId, recipientId, cardCodes);
      }),
    [run, myPlayerId]
  );

  const playSocialCounter = useCallback(
    (code: CardCode, targetPlayerId?: PlayerId) =>
      run((state) => enginePlaySocialCounter(state, myPlayerId!, code, targetPlayerId)),
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
  const autoSkippedResponseKeysRef = useRef(new Set<string>());

  // Auto-skip or bot-respond to counter windows
  useEffect(() => {
    const pendingResponse = roomState?.pendingResponse;
    if (!pendingResponse || !myPlayerId || !roomState) return;
    // One client drives the auto-skips. Normally the host; if the host has
    // dropped off presence, the deputy (see canActAsHost) takes over, otherwise
    // a window waiting on a zero-eligible responder never advances.
    if (!canActAsHost) return;

    const top = getTopFrame(roomState);
    if (!top || top.frameId !== pendingResponse.responseId) return;
    const pendingResponderIds = top.eligibleResponderIds.filter(
      (id) => top.responses[id]?.status === 'pending'
    );
    const playableCountersFor = (responderId: PlayerId) =>
      getPlayableCountersForActiveFrame(roomState, responderId);
    const skipFirstZeroEligibleResponder = () => {
      const responderId = getZeroEligibleCounterResponderIds(roomState)[0];
      if (!responderId) return false;
      const key = `${pendingResponse.responseId}:${responderId}`;
      if (autoSkippedResponseKeysRef.current.has(key)) return true;
      autoSkippedResponseKeysRef.current.add(key);
      skipCounter(pendingResponse.responseId, responderId);
      return true;
    };

    const isBot = roomCode?.startsWith('bot-');

    if (isBot) {
      const humanIsPendingResponder = pendingResponderIds.includes(myPlayerId);
      // A targeted trap has its own explicit alert flow.
      if (humanIsPendingResponder && pendingResponse.kind === 'trap') {
        return;
      }
      // Preserve the human decision whenever a legal Counter exists.
      if (humanIsPendingResponder && playableCountersFor(myPlayerId).length > 0) {
        return;
      }

      // A responder with no legal card has no decision.  Advance through the
      // normal command one responder at a time so each new top state is
      // recalculated before another automatic pass.
      if (skipFirstZeroEligibleResponder()) return;

      const responseId = pendingResponse.responseId;
      const eligibleBotIds = pendingResponderIds.filter((id) => id.startsWith('bot-'));

      const timer = setTimeout(() => {
        // Evaluate bot counter decisions
        let botCounterActorId: string | null = null;
        let botCounterCode: string | null = null;
        let botCustomPayload: Record<string, unknown> | undefined;
        for (const botId of eligibleBotIds) {
          const decision = decideBotCounter(
            roomState,
            botId,
            pendingResponse,
            getCounterContextForActiveFrame(roomState, botId)
          );
            if (decision.action === 'counter') {
              botCounterActorId = botId;
              botCounterCode = decision.code;
              botCustomPayload = decision.customPayload;
              break;
            }
        }

        if (botCounterActorId && botCounterCode) {
          playCounter(botCounterCode, responseId, botCounterActorId, botCustomPayload);
        } else {
          const botId = eligibleBotIds[0];
          if (botId) skipCounter(responseId, botId);
        }
      }, 450);
      return () => clearTimeout(timer);
    }

    // Multiplayer uses the same authoritative top frame and per-responder
    // eligibility. Players with any legal Counter remain pending for UI input.
    skipFirstZeroEligibleResponder();
  }, [roomState, myPlayerId, canActAsHost, skipCounter, roomCode, playCounter]);

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

        const forced = process.env.NODE_ENV !== 'production' && state.devScenario && state.devForcedBotAction && currentBotId === 'bot-1'
          ? state.devForcedBotAction
          : null;
        // A forced dev-scenario action names only a code and a targetId, which
        // is not enough for a roster/outcome/number card (c01-a063 forces
        // A063, a roster_select). Run the normal chooser's payload logic for
        // the forced code so the frame still carries what executeEffect needs.
        const decision = forced
          ? {
              action: 'play' as const,
              code: forced.code,
              targetId: forced.targetId,
              customPayload: fillBotActionInputs(state, currentBotId, forced.code)?.customPayload,
            }
          : decideBotTurn(state, currentBotId);
        if (decision.action === 'draw') {
          let next = draw(state, currentBotId, 1);
          if (next.players[currentBotId]) {
            next.players[currentBotId].hasDrawnThisTurn = true;
            next.players[currentBotId].hasPlayedActionThisTurn = false;
          }
          next = checkAndTriggerAutomaticTraps(next);
          return advanceAndCheckWin(next);
        }
        // Verify card is still in hand before discarding
        if (!state.players[currentBotId]?.hand.includes(decision.code)) {
          // Card gone (stale decision), just draw instead
          let next = draw(state, currentBotId, 1);
          if (next.players[currentBotId]) {
            next.players[currentBotId].hasDrawnThisTurn = true;
            next.players[currentBotId].hasPlayedActionThisTurn = false;
          }
          next = checkAndTriggerAutomaticTraps(next);
          return advanceAndCheckWin(next);
        }
        const afterDiscard = discard(state, currentBotId, 1, [decision.code]);
        if (afterDiscard.players[currentBotId]) {
          afterDiscard.players[currentBotId].hasPlayedActionThisTurn = true;
          afterDiscard.players[currentBotId].hasDrawnThisTurn = false;
        }
        const next = pushStackFrame(afterDiscard, {
          sourceType: 'action',
          sourceCode: decision.code,
          actorId: currentBotId,
          targetIds: decision.targetId ? [decision.targetId] : [],
          // Carries the bot's roster/outcome/number answers. Omitting this is
          // what made every roster_select card a bot played resolve into
          // nothing -- executeEffect read an empty payload and bailed.
          customPayload: decision.customPayload,
        });
        if (forced) next.devForcedBotAction = undefined;
        return next;
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [roomCode, roomState, run]);

  // Auto-respond to interactive invitations (e.g. T10 date invite) for bot targets
  useEffect(() => {
    const interaction = roomState?.pendingInteraction;
    if (!interaction || !myPlayerId || myPlayerId !== roomState?.hostId) return;
    if (interaction.type !== 'date_invite') return;

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
    onlinePlayerIds,
    canActAsHost,
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
    setGameSuggester: setGameSuggesterFn,
    updateMyBirthday: updateMyBirthdayFn,
    confirmTurnOrder: confirmTurnOrderFn,
    drawCard,
    endTurn,
    hostSkipTurn,
    playAction,
    playDoubledAction,
    placeTrapCard,
    skipTrapPlacement,
    openTrapCard,
    initiateTrapInteraction,
    respondToTrapInteraction,
    respondToDelegatedTargetPick,
    playCounter,
    skipCounter,
    declareMuffinTime: declareMuffinTimeFn,
    finishGame: finishGameFn,
    playAgain,
    shuffleDrawPile,
    finishShuffleDrawPile,
    manualDiscard,
    manualGiveCard,
    playSocialCounter,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionValue {
  const ctx = useContext(GameSessionContext);
  if (!ctx) throw new Error('useGameSession must be used within GameSessionProvider');
  return ctx;
}

