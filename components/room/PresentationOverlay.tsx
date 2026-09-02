'use client';

import { useEffect, useState } from 'react';
import { usePresentation } from '../../lib/presentation/presentationContext';
import { CardBack } from '../card/CardBack';
import { Card } from '../card/Card';
import { getCardByCode } from '../../data/cards/index';

interface Position {
  x: number;
  y: number;
}

export function PresentationOverlay() {
  const { activeAnimation } = usePresentation();
  const [coords, setCoords] = useState<{ start: Position; end: Position } | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!activeAnimation) {
      setCoords(null);
      setAnimating(false);
      return;
    }

    const { sourceAnchorType, sourceAnchorId, destAnchorType, destAnchorId, actorId, targetId, type } = activeAnimation;

    const findAnchorRect = (anchorType?: string, anchorId?: string, isSource: boolean = true): DOMRect | null => {
      let query = '';
      if (anchorType === 'deck') {
        query = '[data-deck-anchor="true"]';
      } else if (anchorType === 'discard') {
        query = '[data-discard-anchor="true"]';
      } else if (anchorType === 'play_area') {
        query = '[data-play-area-anchor="true"]';
      } else if (anchorType === 'trap') {
        const pid = anchorId || (isSource ? actorId : targetId || actorId);
        query = `[data-trap-anchor="${pid}"]`;
      } else if (anchorType === 'player' || (!anchorType && (actorId || targetId))) {
        const pid = anchorId || (isSource ? actorId : targetId || actorId);
        query = `[data-player-anchor="${pid}"]`;
      }

      if (!query) return null;
      const el = document.querySelector(query);
      return el ? el.getBoundingClientRect() : null;
    };

    // Default anchor mappings for common types if not explicitly specified
    let startRect: DOMRect | null = null;
    let endRect: DOMRect | null = null;

    if (type === 'CARD_DRAW') {
      startRect = findAnchorRect('deck', undefined, true);
      endRect = findAnchorRect('player', actorId, false);
    } else if (type === 'ACTION_PLAYED') {
      startRect = findAnchorRect('player', actorId, true);
      endRect = findAnchorRect('play_area', undefined, false);
    } else if (type === 'TRAP_PLACED') {
      startRect = findAnchorRect('player', actorId, true);
      endRect = findAnchorRect('trap', actorId, false);
    } else if (type === 'TRAP_ACTIVATED') {
      startRect = findAnchorRect('trap', actorId, true);
      endRect = findAnchorRect('play_area', undefined, false);
    } else if (type === 'COUNTER_PLAYED') {
      startRect = findAnchorRect('player', actorId, true);
      endRect = findAnchorRect('play_area', undefined, false);
    } else if (type === 'CARD_TRANSFER') {
      const srcId = sourceAnchorId || targetId || actorId;
      const dstId = destAnchorId || actorId;
      startRect = findAnchorRect('player', srcId, true);
      endRect = findAnchorRect('player', dstId, false);
    } else if (type === 'CARD_DISCARDED') {
      startRect = findAnchorRect('player', actorId, true);
      endRect = findAnchorRect('discard', undefined, false);
    } else {
      startRect = findAnchorRect(sourceAnchorType, sourceAnchorId, true);
      endRect = findAnchorRect(destAnchorType, destAnchorId, false);
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const startPos: Position = startRect
      ? { x: startRect.left + startRect.width / 2, y: startRect.top + startRect.height / 2 }
      : { x: vw / 2, y: vh / 2 };

    const endPos: Position = endRect
      ? { x: endRect.left + endRect.width / 2, y: endRect.top + endRect.height / 2 }
      : { x: vw / 2, y: vh / 2 };

    setCoords({ start: startPos, end: endPos });

    // Trigger frame transition
    const timer = setTimeout(() => setAnimating(true), 20);
    return () => clearTimeout(timer);
  }, [activeAnimation]);

  if (!activeAnimation) return null;

  if (activeAnimation.type === 'MUFFIN_TIME_REACHED') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs pointer-events-none animate-in zoom-in-75 fade-in duration-200">
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-amber-500 via-orange-500 to-amber-600 p-6 text-center text-white shadow-2xl animate-bounce max-w-xs w-full">
          <span className="text-3xl font-black tracking-tight drop-shadow-md">🧁 MUFFIN TIME!</span>
          <span className="text-sm font-bold text-amber-100 mt-1">
            {activeAnimation.actorName || 'ผู้เล่น'} มีไพ่ครบ 10 ใบ!
          </span>
        </div>
      </div>
    );
  }

  if (activeAnimation.type === 'YOUR_TURN') {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none animate-in slide-in-from-top-4 fade-in duration-200">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-primary bg-gradient-to-r from-primary via-pink-600 to-primary px-5 py-2.5 text-white shadow-xl shadow-primary/30 max-w-xs w-full">
          <span className="text-xl">⚡</span>
          <div className="flex flex-col text-left">
            <span className="text-sm font-black uppercase tracking-wider">ตาของคุณแล้ว!</span>
            <span className="text-[11px] font-medium text-pink-100">เลือกจั่วไพ่ 1 ใบ หรือเล่น Action</span>
          </div>
        </div>
      </div>
    );
  }

  if (activeAnimation.type === 'GAME_WINNER') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs pointer-events-none animate-in zoom-in-75 fade-in duration-200">
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-600 via-teal-600 to-emerald-700 p-6 text-center text-white shadow-2xl max-w-xs w-full">
          <span className="text-4xl mb-1">🏆</span>
          <span className="text-2xl font-black tracking-tight text-white drop-shadow-md">WINNER!</span>
          <span className="text-base font-bold text-emerald-100 mt-1">
            {activeAnimation.actorName || 'ผู้เล่น'} เป็นผู้ชนะ!
          </span>
        </div>
      </div>
    );
  }

  if (!coords) return null;

  const currentPos = animating ? coords.end : coords.start;
  const isPublic = Boolean(activeAnimation.cardCode);
  const cardModel = activeAnimation.cardCode ? getCardByCode(activeAnimation.cardCode) : undefined;
  const rotation = animating ? (activeAnimation.type === 'CARD_DRAW' ? -5 : activeAnimation.type === 'ACTION_PLAYED' ? 4 : -3) : 0;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <div
        style={{
          position: 'absolute',
          left: `${currentPos.x}px`,
          top: `${currentPos.y}px`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${animating ? 1.06 : 0.85})`,
          transition: 'all 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          opacity: animating ? 1 : 0.7,
        }}
        className="shadow-2xl rounded-xl"
      >
        {isPublic && cardModel ? (
          <div className="w-24 sm:w-28">
            <Card card={cardModel} variant="compact" />
          </div>
        ) : (
          <CardBack size="md" />
        )}
      </div>
    </div>
  );
}
