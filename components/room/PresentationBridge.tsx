'use client';

import { useEffect, useRef } from 'react';
import type { RoomState, PlayerId } from '../../game/types';
import { GAME_EVENT_TYPES } from '../../game/events';
import { usePresentation } from '../../lib/presentation/presentationContext';

interface PresentationBridgeProps {
  state: RoomState;
  viewerId: PlayerId;
}

export function PresentationBridge({ state, viewerId }: PresentationBridgeProps) {
  const { enqueuePresentationEvent, updatePersistentStatus } = usePresentation();
  const lastProcessedEventIndexRef = useRef<number>(0);
  const prevHandLengthsRef = useRef<Record<PlayerId, number>>({});
  const prevTrapLengthsRef = useRef<Record<PlayerId, number>>({});
  const prevActivePlayerIdRef = useRef<PlayerId | null>(null);
  const prevWinnerIdRef = useRef<PlayerId | null>(null);
  const prevResponseRequiredRef = useRef<boolean>(false);

  useEffect(() => {
    if (!state || (state.status !== 'playing' && state.status !== 'finished' && state.status !== 'ended')) return;

    const events = state.gameEvents ?? [];
    const lastIndex = lastProcessedEventIndexRef.current;
    const activePlayerId = state.turnOrder?.[state.currentTurnIndex];

    // Detect Turn Transition to Viewer (YOUR_TURN)
    if (activePlayerId && prevActivePlayerIdRef.current !== activePlayerId) {
      if (activePlayerId === viewerId) {
        enqueuePresentationEvent({
          type: 'YOUR_TURN',
          actorId: viewerId,
          actorName: state.players[viewerId]?.name,
        });
      }
      prevActivePlayerIdRef.current = activePlayerId;
    }

    // Detect Game Winner Announcement (GAME_WINNER)
    const winnerId = state.winnerId || state.winnerPlayerIds?.[0];
    if (winnerId && prevWinnerIdRef.current !== winnerId) {
      enqueuePresentationEvent({
        type: 'GAME_WINNER',
        actorId: winnerId,
        actorName: state.players[winnerId]?.name,
      });
      prevWinnerIdRef.current = winnerId;
    }

    // Detect Response Required Window for Viewer (RESPONSE_REQUIRED)
    const isResponseReq = Boolean(
      (state.pendingResponse && (state.pendingResponse.targetId === viewerId || state.pendingResponse.affectedPlayerIds?.includes(viewerId))) ||
      (state.pendingForcedDiscards && Object.values(state.pendingForcedDiscards).some((op) => op.targetPlayerId === viewerId)) ||
      (state.pendingInteraction && state.pendingInteraction.targetPlayerId === viewerId)
    );
    if (isResponseReq && !prevResponseRequiredRef.current) {
      enqueuePresentationEvent({
        type: 'RESPONSE_REQUIRED',
        actorId: viewerId,
      });
    }
    prevResponseRequiredRef.current = isResponseReq;

    // Process new authoritative game events
    if (events.length > lastIndex) {
      for (let i = lastIndex; i < events.length; i++) {
        const ev = events[i];
        const actorId = ev.emitterId;
        const actorName = state.players[actorId]?.name ?? actorId;

        if (ev.type === GAME_EVENT_TYPES.ACTION_PLAYED) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'ACTION_PLAYED',
            actorId: payload.actorId || actorId,
            actorName: state.players[payload.actorId || actorId]?.name ?? actorName,
            targetId: payload.targetId,
            cardCode: payload.actionCode,
          });
        } else if (ev.type === GAME_EVENT_TYPES.COUNTER_PLAYED) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'COUNTER_PLAYED',
            actorId: payload.actorId || actorId,
            actorName: state.players[payload.actorId || actorId]?.name ?? actorName,
            cardCode: payload.counterCode,
          });
        } else if (ev.type === GAME_EVENT_TYPES.SOCIAL_COUNTER_PLAYED) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'COUNTER_PLAYED',
            actorId: payload.actorId || actorId,
            actorName: state.players[payload.actorId || actorId]?.name ?? actorName,
            targetId: payload.targetPlayerId,
            targetName: payload.targetPlayerId ? state.players[payload.targetPlayerId]?.name : undefined,
            cardCode: payload.counterCode,
          });
        } else if (ev.type === GAME_EVENT_TYPES.TRAP_ACTIVATED) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'TRAP_ACTIVATED',
            actorId: payload.ownerId || actorId,
            actorName: state.players[payload.ownerId || actorId]?.name ?? actorName,
            cardCode: payload.trapCode,
          });
        } else if (ev.type === GAME_EVENT_TYPES.CARD_STOLEN) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'CARD_TRANSFER',
            actorId: payload.thiefId || actorId,
            actorName: state.players[payload.thiefId || actorId]?.name ?? actorName,
            targetId: payload.victimId,
            targetName: state.players[payload.victimId]?.name,
            count: payload.count || 1,
            // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
          });
        } else if (ev.type === GAME_EVENT_TYPES.FORCED_DISCARD) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'CARD_DISCARDED',
            actorId: payload.victimId || actorId,
            actorName: state.players[payload.victimId || actorId]?.name ?? actorName,
            count: payload.count || 1,
            // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
          });
        } else if (ev.type === GAME_EVENT_TYPES.MANUAL_RECOVERY_DISCARD) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'CARD_DISCARDED',
            actorId: payload.actorId || actorId,
            actorName: state.players[payload.actorId || actorId]?.name ?? actorName,
            count: payload.count || 1,
            // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
          });
        } else if (ev.type === GAME_EVENT_TYPES.MANUAL_RECOVERY_TRANSFER) {
          const payload = ev.payload as any;
          enqueuePresentationEvent({
            type: 'CARD_TRANSFER',
            actorId: payload.actorId || actorId,
            actorName: state.players[payload.actorId || actorId]?.name ?? actorName,
            targetId: payload.recipientId,
            targetName: state.players[payload.recipientId]?.name,
            count: payload.count || 1,
            // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
          });
        }
      }
      lastProcessedEventIndexRef.current = events.length;
    }

    // Detect Draw, Trap Placement, and MUFFIN TIME (10 cards) via state diffs
    Object.entries(state.players).forEach(([pid, player]) => {
      const prevHandLen = prevHandLengthsRef.current[pid];
      const prevTrapLen = prevTrapLengthsRef.current[pid];
      const curHandLen = player.hand.length;
      const curTrapLen = player.traps.length;

      // MUFFIN TIME Announcement: Trigger ONLY when transitioning INTO exactly 10 cards
      if (prevHandLen !== undefined && prevHandLen !== 10 && curHandLen === 10) {
        enqueuePresentationEvent({
          type: 'MUFFIN_TIME_REACHED',
          actorId: pid,
          actorName: player.name,
          count: 10,
        });
      }

      if (prevHandLen !== undefined && curHandLen > prevHandLen) {
        const diff = curHandLen - prevHandLen;
        // Verify this wasn't a steal transfer or manual recovery transfer already handled
        const recentStealOrTransfer = events.slice(lastIndex).some((e: any) =>
          e.type === GAME_EVENT_TYPES.CARD_STOLEN || e.type === GAME_EVENT_TYPES.MANUAL_RECOVERY_TRANSFER
        );
        if (!recentStealOrTransfer) {
          enqueuePresentationEvent({
            type: 'CARD_DRAW',
            actorId: pid,
            actorName: player.name,
            count: diff,
            // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
          });
        }
      }

      if (prevTrapLen !== undefined && curTrapLen > prevTrapLen) {
        enqueuePresentationEvent({
          type: 'TRAP_PLACED',
          actorId: pid,
          actorName: player.name,
          // ABSOLUTE PRIVACY GUARANTEE: cardCode is omitted / undefined
        });
      }

      prevHandLengthsRef.current[pid] = curHandLen;
      prevTrapLengthsRef.current[pid] = curTrapLen;
    });

    // Compute Authoritative Persistent State Status
    let newPersistentStatus: import('../../lib/presentation/liveStatusTypes').LiveGameStatusData | null = null;

    if (state.pendingResponse) {
      const resp = state.pendingResponse;
      const targetId = resp.targetId || resp.affectedPlayerIds?.[0];
      newPersistentStatus = {
        kind: 'waiting-response',
        actorId: resp.actorId,
        targetId,
        cardCode: resp.code,
        emphasis: targetId === viewerId ? 'viewer-action-required' : 'normal',
      };
    } else if (state.pendingForcedDiscards && Object.keys(state.pendingForcedDiscards).length > 0) {
      const op = Object.values(state.pendingForcedDiscards)[0];
      newPersistentStatus = {
        kind: 'waiting-discard',
        actorId: op.targetPlayerId,
        count: op.requestedCount - (op.cardCodes?.length ?? 0),
        emphasis: op.targetPlayerId === viewerId ? 'viewer-action-required' : 'normal',
      };
    } else if (state.pendingInteraction) {
      const inter = state.pendingInteraction;
      newPersistentStatus = {
        kind: 'waiting-choice',
        actorId: inter.initiatorId,
        targetId: inter.targetPlayerId,
        cardCode: inter.sourceCardCode,
        emphasis: inter.targetPlayerId === viewerId ? 'viewer-action-required' : 'normal',
      };
    } else if (activePlayerId) {
      newPersistentStatus = {
        kind: 'idle-turn',
        actorId: activePlayerId,
        emphasis: 'normal',
      };
    }

    updatePersistentStatus(newPersistentStatus);
  }, [state, viewerId, enqueuePresentationEvent, updatePersistentStatus]);

  return null;
}
