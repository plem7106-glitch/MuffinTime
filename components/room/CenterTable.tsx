'use client';

import { useMemo } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { CARD_TYPE_THEMES } from '../card/Card';
import { CardStackIcon } from '../ui/Icons';

export function CenterTable({
  drawPileCount,
  discardPile,
  isMyTurn,
  canAct,
  hasDrawnThisTurn,
  hasPlayedActionThisTurn,
  isTrapPlacementPhase = false,
  onDraw,
  onOpenDiscardPile,
}: {
  drawPileCount: number;
  discardPile: CardCode[];
  isMyTurn: boolean;
  canAct: boolean;
  hasDrawnThisTurn?: boolean;
  hasPlayedActionThisTurn?: boolean;
  isTrapPlacementPhase?: boolean;
  onDraw: () => void;
  onOpenDiscardPile?: () => void;
}) {
  const hasUsedMainChoice = Boolean(hasDrawnThisTurn || hasPlayedActionThisTurn);
  const canClickDeck = isMyTurn && canAct && !hasUsedMainChoice && drawPileCount > 0;

  // Retrieve top discarded card details if available
  const topDiscardCode = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const topDiscardInfo = useMemo(() => {
    if (!topDiscardCode) return null;
    const fullCard = getCardById(topDiscardCode);
    if (fullCard) return fullCard;
    return { id: topDiscardCode, name_th: topDiscardCode, type: 'action' as const, image: undefined };
  }, [topDiscardCode]);

  const discardTheme = topDiscardInfo
    ? CARD_TYPE_THEMES[topDiscardInfo.type] ?? CARD_TYPE_THEMES.action
    : null;

  return (
    <section
      aria-label="พื้นที่กลางโต๊ะ กองจั่วและกองทิ้ง"
      className="flex items-center justify-center gap-7 sm:gap-9 py-2 px-2 sm:px-3 rounded-2xl border border-gray-100/90 bg-white/90 backdrop-blur-xs shadow-2xs select-none w-full shrink-0"
    >
      {/* 1. Draw Pile (กองจั่ว - 120x180px Portrait 2:3 Main Pile - Interactive Center Deck) */}
      <div className="flex flex-col items-center gap-4 shrink-0">
        <div className="relative w-[118px] sm:w-32 aspect-[2/3]">
          <div aria-hidden="true" className="absolute -right-1.5 top-2.5 bottom-[-8px] left-2 rotate-[1.4deg] rounded-2xl border border-pink-950/15 bg-pink-800 shadow-sm" />
          <div aria-hidden="true" className="absolute -right-1 top-2 bottom-[-5px] left-1 rotate-[-0.8deg] rounded-2xl border border-pink-950/15 bg-white shadow-[0_3px_7px_rgba(131,24,67,0.14)]" />
          <div aria-hidden="true" className="absolute -right-0.5 top-1.5 bottom-[-3px] left-1.5 rotate-[0.9deg] rounded-2xl border border-pink-950/15 bg-pink-500 shadow-sm" />
          <div aria-hidden="true" className="absolute right-0 top-1 bottom-[-1px] left-0.5 rotate-[-0.5deg] rounded-2xl border border-pink-950/15 bg-white shadow-[0_2px_5px_rgba(131,24,67,0.12)]" />
          <div aria-hidden="true" className="absolute right-0.5 top-0.5 bottom-0 left-1 rotate-[0.4deg] rounded-2xl border border-pink-950/15 bg-pink-600 shadow-sm" />
          <button
            type="button"
            onClick={() => {
              if (canClickDeck) onDraw();
            }}
            disabled={!canClickDeck}
            aria-label={`กองจั่ว เหลือ ${drawPileCount} ใบ${canClickDeck ? ' (แตะเพื่อจั่ว)' : ''}`}
            className={`group relative z-10 flex w-full h-full flex-col items-center justify-between overflow-hidden rounded-2xl border-2 p-2.5 sm:p-3 text-center shadow-[0_12px_22px_rgba(157,23,77,0.22)] transition-all before:absolute before:inset-1 before:rounded-xl before:border before:border-white/35 before:content-[''] after:absolute after:-right-5 after:-top-8 after:h-20 after:w-12 after:rotate-[24deg] after:bg-white/20 after:content-[''] ${
              canClickDeck
                ? 'border-pink-900/30 bg-pink-600 hover:-translate-y-0.5 hover:scale-[1.035] active:translate-y-0 active:scale-[0.985] cursor-pointer ring-2 ring-primary/40 hover:shadow-[0_16px_26px_rgba(157,23,77,0.28)] ring-offset-1'
                : 'border-pink-950/20 bg-pink-600/80 cursor-not-allowed opacity-75'
            }`}
          >
          {/* Top Header */}
          <div className="relative z-10 flex items-center justify-between w-full shrink-0">
            <span className="text-[10px] font-black text-white uppercase">จั่ว</span>
            <CardStackIcon className="h-4 w-4 text-white/75" />
          </div>

          {/* Clean Central Mascot Logo */}
          <div className="relative z-10 flex flex-col items-center justify-center my-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/home/hero/muffin-time-logo.jpg"
              alt="Muffin Logo"
              className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-[0_4px_7px_rgba(0,0,0,0.18)]"
            />
          </div>

          {/* Bottom Action Prompt when active */}
          {canClickDeck ? (
            <span className="relative z-10 w-full rounded-lg bg-white/95 py-1 text-[9px] sm:text-[10px] font-black text-primary shadow-2xs animate-pulse">
              แตะเพื่อจั่ว
            </span>
          ) : (
            <div className="h-3.5 shrink-0" />
          )}
          </button>
        </div>

        {/* Pile Label with Live Card Count */}
        <div className="flex items-center gap-1 rounded-full border border-pink-100 bg-white px-2.5 py-0.5 text-center shadow-2xs">
          <span className="text-sm font-black text-ink">กองจั่ว</span>
          <span className="font-mono text-sm font-bold text-ink-secondary">({drawPileCount})</span>
        </div>
      </div>

      {/* 2. Discard Pile (กองทิ้ง - Matching 120x180px Portrait 2:3 Main Pile - Tappable) */}
      <div className="flex flex-col items-center gap-4 shrink-0">
        <div className="relative w-[118px] sm:w-32 aspect-[2/3]">
          <div aria-hidden="true" className="absolute -left-1.5 right-1 top-3 bottom-[-6px] rotate-[-1.8deg] rounded-2xl border border-ink/10 bg-white shadow-[0_4px_10px_rgba(17,24,39,0.10)]" />
          <div aria-hidden="true" className="absolute -right-1.5 left-2 top-2 bottom-[-5px] rotate-[1.3deg] rounded-2xl border border-ink/10 bg-rose-50 shadow-sm" />
          <div aria-hidden="true" className="absolute -left-0.5 right-1.5 top-1.5 bottom-[-2px] rotate-[-0.9deg] rounded-2xl border border-ink/10 bg-white shadow-[0_3px_7px_rgba(17,24,39,0.08)]" />
          <div aria-hidden="true" className="absolute left-1 right-0 top-1 bottom-0 rotate-[0.7deg] rounded-2xl border border-ink/10 bg-gray-50 shadow-sm" />
          <button
            type="button"
            onClick={onOpenDiscardPile}
            aria-label={`กองทิ้ง ${discardPile.length} ใบ (แตะเพื่อดู)`}
            className={`group relative z-10 flex h-full w-full rotate-[0.4deg] flex-col justify-between rounded-2xl border-2 p-2.5 sm:p-3 text-left shadow-[0_10px_18px_rgba(17,24,39,0.12)] transition-all cursor-pointer hover:-translate-y-0.5 hover:rotate-0 hover:scale-[1.025] active:translate-y-0 active:scale-[0.985] hover:shadow-[0_14px_24px_rgba(17,24,39,0.16)] ${
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
        </div>

        {/* Pile Label with Live Discard Count */}
        <div className="flex items-center gap-1 rounded-full border border-gray-100 bg-white px-2.5 py-0.5 text-center shadow-2xs">
          <span className="text-sm font-black text-ink">กองทิ้ง</span>
          <span className="font-mono text-sm font-bold text-ink-secondary">({discardPile.length})</span>
        </div>
      </div>

    </section>
  );
}
