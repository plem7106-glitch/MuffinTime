'use client';

import { useMemo } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getDemoCard } from '../../lib/demoCards';
import { CARD_TYPE_THEMES } from '../card/Card';
import { CardStackIcon } from '../ui/Icons';

export function CenterTable({
  drawPileCount,
  discardPile,
  isMyTurn,
  canAct,
  onDraw,
  onOpenDiscardPile,
}: {
  drawPileCount: number;
  discardPile: CardCode[];
  isMyTurn: boolean;
  canAct: boolean;
  onDraw: () => void;
  onOpenDiscardPile?: () => void;
}) {

  // Retrieve top discarded card details if available
  const topDiscardCode = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const topDiscardInfo = useMemo(() => {
    if (!topDiscardCode) return null;
    const fullCard = getCardById(topDiscardCode);
    if (fullCard) return fullCard;
    try {
      const demo = getDemoCard(topDiscardCode);
      return {
        id: demo.code,
        name_th: demo.th,
        type: demo.type,
        image: undefined,
      };
    } catch {
      return {
        id: topDiscardCode,
        name_th: topDiscardCode,
        type: 'action' as const,
        image: undefined,
      };
    }
  }, [topDiscardCode]);

  const discardTheme = topDiscardInfo
    ? CARD_TYPE_THEMES[topDiscardInfo.type] ?? CARD_TYPE_THEMES.action
    : null;

  return (
    <section
      aria-label="พื้นที่กลางโต๊ะ กองจั่วและกองทิ้ง"
      className="flex items-center justify-center gap-3.5 sm:gap-4 py-2 px-2 sm:px-3 rounded-2xl border border-gray-100/90 bg-white/90 backdrop-blur-xs shadow-2xs select-none w-full shrink-0"
    >
      {/* 1. Draw Pile (กองจั่ว - 120x180px Portrait 2:3 Main Pile) */}
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (isMyTurn && canAct) onDraw();
          }}
          disabled={!isMyTurn || !canAct}
          aria-label={`กองจั่ว เหลือ ${drawPileCount} ใบ${isMyTurn && canAct ? ' (แตะเพื่อจั่ว)' : ''}`}
          className={`group relative flex w-[120px] sm:w-32 aspect-[2/3] flex-col items-center justify-between rounded-2xl border-2 p-2.5 sm:p-3 text-center transition-all ${
            isMyTurn && canAct
              ? 'border-primary bg-gradient-to-b from-primary/15 via-white to-primary/5 shadow-md shadow-primary/20 hover:scale-105 active:scale-95 cursor-pointer ring-2 ring-primary/40'
              : 'border-gray-200 bg-gray-50 cursor-default opacity-90'
          }`}
        >
          {/* Top Header */}
          <div className="flex items-center justify-between w-full shrink-0">
            <span className="text-[10px] font-black text-primary uppercase tracking-wider">จั่ว</span>
            <CardStackIcon className="h-4 w-4 text-primary/70" />
          </div>

          {/* Clean Central Mascot Logo */}
          <div className="flex flex-col items-center justify-center my-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/home/hero/muffin-time-logo.jpg"
              alt="Muffin Logo"
              className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-xs"
            />
          </div>

          {/* Bottom Action Prompt when active */}
          {isMyTurn && canAct ? (
            <span className="w-full rounded-lg bg-primary py-1 text-[9px] sm:text-[10px] font-black text-white shadow-2xs animate-pulse">
              แตะเพื่อจั่ว
            </span>
          ) : (
            <div className="h-3.5 shrink-0" />
          )}
        </button>

        {/* Pile Label with Live Card Count */}
        <div className="flex items-center gap-1 text-center">
          <span className="text-sm font-black text-ink">กองจั่ว</span>
          <span className="font-mono text-sm font-bold text-ink-secondary">({drawPileCount})</span>
        </div>
      </div>

      {/* 2. Discard Pile (กองทิ้ง - Matching 120x180px Portrait 2:3 Main Pile - Tappable) */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenDiscardPile}
          aria-label={`กองทิ้ง ${discardPile.length} ใบ (แตะเพื่อดู)`}
          className={`group relative flex w-[120px] sm:w-32 aspect-[2/3] flex-col justify-between rounded-2xl border-2 p-2.5 sm:p-3 text-left transition-all cursor-pointer hover:scale-105 active:scale-95 hover:shadow-md ${
            topDiscardInfo && discardTheme
              ? `${discardTheme.border} ${discardTheme.bgLight} shadow-2xs`
              : 'border-dashed border-gray-300 bg-gray-50/70 hover:border-gray-400'
          }`}
        >
          {topDiscardInfo && discardTheme ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between shrink-0">
                <span className={`text-[10px] font-black tracking-wider ${discardTheme.text}`}>
                  {discardTheme.label}
                </span>
                <span className="font-mono text-[10px] font-bold text-ink-secondary">
                  {topDiscardInfo.id}
                </span>
              </div>

              {/* Central Thumbnail & Name */}
              <div className="flex flex-col items-center justify-center my-auto text-center px-0.5 w-full">
                {topDiscardInfo.image ? (
                  <div className="w-full aspect-[4/3] overflow-hidden rounded-lg border border-ink/5 bg-white mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={topDiscardInfo.image}
                      alt={topDiscardInfo.name_th}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <span className="text-xs sm:text-[13px] font-black text-ink line-clamp-1 leading-tight">
                  {topDiscardInfo.name_th}
                </span>
              </div>

              <div className="flex items-center justify-center w-full shrink-0">
                <span className="text-[9px] font-bold text-ink-secondary/80 group-hover:text-primary transition-colors">
                  แตะเพื่อดู
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <CardStackIcon className="h-7 w-7 text-gray-300 mb-1 group-hover:text-primary/60 transition-colors" />
              <span className="text-xs text-gray-400 font-bold">ว่าง</span>
              <span className="text-[9px] text-gray-400 mt-1">แตะเพื่อดู</span>
            </div>
          )}
        </button>

        {/* Pile Label with Live Discard Count */}
        <div className="flex items-center gap-1 text-center">
          <span className="text-sm font-black text-ink">กองทิ้ง</span>
          <span className="font-mono text-sm font-bold text-ink-secondary">({discardPile.length})</span>
        </div>
      </div>

    </section>
  );
}
