'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PresentationEvent, ActivityItem } from './presentationTypes';
import type { LiveGameStatusData } from './liveStatusTypes';
import { soundManager } from './soundManager';
import { getCardDisplay } from '../../data/cards/display';
import { IncomingCardPresentation } from '../../components/room/IncomingCardPresentation';
import { isBlockingIncomingEvent } from './incomingPresentation';

interface PresentationContextValue {
  activeAnimation: PresentationEvent | null;
  activityFeed: ActivityItem[];
  liveStatus: LiveGameStatusData | null;
  enqueuePresentationEvent: (event: Omit<PresentationEvent, 'id' | 'timestamp'>) => void;
  updatePersistentStatus: (status: LiveGameStatusData | null) => void;
  clearAnimation: () => void;
  isIncomingPresentationActive: boolean;
}

const PresentationContext = createContext<PresentationContextValue | null>(null);

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<PresentationEvent[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<PresentationEvent | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [persistentStatus, setPersistentStatus] = useState<LiveGameStatusData | null>(null);
  const [tempEventStatus, setTempEventStatus] = useState<LiveGameStatusData | null>(null);
  const tempStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef(false);

  const updatePersistentStatus = useCallback((status: LiveGameStatusData | null) => {
    setPersistentStatus(status);
  }, []);

  const formatActivityMessage = (event: Omit<PresentationEvent, 'id' | 'timestamp'>): string => {
    const actor = event.actorName || event.actorId || 'ผู้เล่น';
    const target = event.targetName || event.targetId || 'ผู้เล่น';
    const count = event.count || 1;

    switch (event.type) {
      case 'CARD_DRAW':
        return `${actor} จั่วไพ่ ${count} ใบ`;
      case 'ACTION_PLAYED': {
        const cardName = event.cardCode ? getCardDisplay(event.cardCode).th : '';
        return cardName ? `${actor} เล่น Action: ${cardName}` : `${actor} เล่น Action`;
      }
      case 'TRAP_PLACED':
        return `${actor} วางกับดัก`;
      case 'TRAP_ACTIVATED': {
        const cardName = event.cardCode ? getCardDisplay(event.cardCode).th : '';
        return cardName ? `${actor} เปิดกับดัก: ${cardName}` : `${actor} เปิดกับดัก`;
      }
      case 'COUNTER_PLAYED': {
        const cardName = event.cardCode ? getCardDisplay(event.cardCode).th : '';
        return cardName ? `${actor} ใช้ Counter: ${cardName}` : `${actor} ใช้ Counter`;
      }
      case 'CARD_TRANSFER':
        return `${actor} ได้รับ/ขโมยไพ่ ${count} ใบ จาก ${target}`;
      case 'CARD_DISCARDED':
        return `${actor} ทิ้งไพ่ ${count} ใบ`;
      case 'MUFFIN_TIME_REACHED':
        return `🧁 ${actor} มีไพ่ครบ 10 ใบ (MUFFIN TIME!)`;
      case 'YOUR_TURN':
        return `⚡ ตาของคุณแล้ว!`;
      case 'GAME_WINNER':
        return `🏆 ${actor} เป็นผู้ชนะในเกมนี้!`;
      default:
        return `${actor} ทำแอ็กชัน`;
    }
  };

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    setQueue((prevQueue) => {
      if (prevQueue.length === 0) return prevQueue;
      processingRef.current = true;
      const [nextEvent, ...rest] = prevQueue;

      // Check prefers-reduced-motion
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Play sound
      soundManager.playSound(nextEvent.type);

      if (prefersReducedMotion) {
        // Skip visual flight animation, immediately finish after short delay
        setTimeout(() => {
          processingRef.current = false;
          setActiveAnimation(null);
        }, 100);
      } else {
        setActiveAnimation(nextEvent);
        // Duration of card flight & hold
        if (!isBlockingIncomingEvent(nextEvent)) {
          setTimeout(() => {
            processingRef.current = false;
            setActiveAnimation(null);
          }, 550);
        }
      }

      return rest;
    });
  }, []);

  // Trigger processing when activeAnimation clears
  React.useEffect(() => {
    if (!activeAnimation && !processingRef.current && queue.length > 0) {
      processQueue();
    }
  }, [activeAnimation, queue, processQueue]);

  const enqueuePresentationEvent = useCallback(
    (eventInput: Omit<PresentationEvent, 'id' | 'timestamp'>) => {
      // ABSOLUTE PRIVACY GUARANTEE:
      // For hidden events (CARD_DRAW, TRAP_PLACED, CARD_TRANSFER, CARD_DISCARDED), cardCode MUST BE UNDEFINED!
      const isHiddenType =
        eventInput.type === 'CARD_DRAW' ||
        eventInput.type === 'TRAP_PLACED' ||
        eventInput.type === 'CARD_TRANSFER' ||
        eventInput.type === 'CARD_DISCARDED';

      const sanitizedEvent: PresentationEvent = {
        ...eventInput,
        cardCode: isHiddenType ? undefined : eventInput.cardCode,
        id: `pres_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: Date.now(),
      };

      // Add to Activity Feed (keep last 20)
      const msg = formatActivityMessage(sanitizedEvent);
      setActivityFeed((prev) => [
        {
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          message: msg,
          type: sanitizedEvent.type,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 19),
      ]);

      // Set temporary event status
      const eventKindMap: Record<string, LiveGameStatusData['kind']> = {
        CARD_DRAW: 'draw',
        ACTION_PLAYED: 'action',
        TRAP_PLACED: 'trap-placement',
        TRAP_ACTIVATED: 'trap-activation',
        COUNTER_PLAYED: 'counter',
        CARD_TRANSFER: 'transfer',
        CARD_DISCARDED: 'discard',
        MUFFIN_TIME_REACHED: 'muffin-time',
        YOUR_TURN: 'your-turn',
      };

      if (eventKindMap[eventInput.type]) {
        if (tempStatusTimerRef.current) clearTimeout(tempStatusTimerRef.current);
        setTempEventStatus({
          kind: eventKindMap[eventInput.type],
          actorId: eventInput.actorId,
          targetId: eventInput.targetId,
          cardCode: sanitizedEvent.cardCode,
          count: eventInput.count,
          timestamp: Date.now(),
        });

        tempStatusTimerRef.current = setTimeout(() => {
          setTempEventStatus(null);
          tempStatusTimerRef.current = null;
        }, 1800);
      }

      setQueue((prev) => [...prev, sanitizedEvent]);
    },
    []
  );

  const clearAnimation = useCallback(() => {
    setActiveAnimation(null);
    processingRef.current = false;
  }, []);

  const liveStatus = tempEventStatus || persistentStatus;
  const isIncomingPresentationActive = Boolean(
    activeAnimation &&
    (activeAnimation.type === 'ACTION_PLAYED' || activeAnimation.type === 'COUNTER_PLAYED') &&
    activeAnimation.targetId
  );

  return (
    <PresentationContext.Provider
      value={{
        activeAnimation,
        activityFeed,
        liveStatus,
        enqueuePresentationEvent,
        updatePersistentStatus,
        clearAnimation,
        isIncomingPresentationActive,
      }}
    >
      {children}
      {isIncomingPresentationActive && activeAnimation && (
        <IncomingCardPresentation event={activeAnimation} onContinue={clearAnimation} />
      )}
    </PresentationContext.Provider>
  );
}

export function usePresentation() {
  const ctx = useContext(PresentationContext);
  if (!ctx) {
    throw new Error('usePresentation must be used within PresentationProvider');
  }
  return ctx;
}
