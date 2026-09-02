'use client';

import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getCardDisplay, type CardDisplay } from '../../data/cards/display';
import { Card, CARD_TYPE_THEMES } from '../card/Card';
import { CloseIcon, CardsIcon, CheckIcon } from '../ui/Icons';

export function HandTrayModal({
  isOpen,
  hand,
  isMyTurn,
  canAct,
  hasDrawnThisTurn,
  hasPlayedActionThisTurn,
  isTrapPlacementPhase,
  trapsCount,
  onClose,
  onPlayAction,
  onPlaceTrap,
  onRequestTarget,
}: {
  isOpen: boolean;
  hand: CardCode[];
  isMyTurn: boolean;
  canAct: boolean;
  hasDrawnThisTurn?: boolean;
  hasPlayedActionThisTurn?: boolean;
  isTrapPlacementPhase?: boolean;
  trapsCount: number;
  onClose: () => void;
  onPlayAction: (code: CardCode) => void;
  onPlaceTrap: (code: CardCode) => void;
  onRequestTarget: (card: CardDisplay) => void;
}) {
  const [selectedCode, setSelectedCode] = useState<CardCode | null>(null);
  const [fullscreenCode, setFullscreenCode] = useState<CardCode | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ code: CardCode; timestamp: number } | null>(null);

  // Retrieve selected card details
  const selectedCardInfo = useMemo(() => {
    if (!selectedCode) return null;
    const full = getCardById(selectedCode);
    const display = getCardDisplay(selectedCode);

    return {
      code: selectedCode,
      type: full?.type ?? display.type,
      title: full?.name_th ?? display.th,
      titleEn: full?.name_en,
      description: full?.description_th ?? display.effect,
      image: full?.image,
      needsTarget: display.needsTarget,
      display,
    };
  }, [selectedCode]);

  const handleCardClick = (code: CardCode) => {
    setSelectedCode(code);
  };

  const handleHandCardPress = (code: CardCode) => {
    const now = Date.now();
    const lastTap = lastTapRef.current;
    const isDoublePress = lastTap?.code === code && now - lastTap.timestamp <= 240;

    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (isDoublePress) {
      lastTapRef.current = null;
      setSelectedCode(null);
      setFullscreenCode(code);
      return;
    }

    lastTapRef.current = { code, timestamp: now };
    singleTapTimerRef.current = window.setTimeout(() => {
      handleCardClick(code);
      singleTapTimerRef.current = null;
      lastTapRef.current = null;
    }, 220);
  };

  const handleActionConfirm = () => {
    if (!selectedCardInfo) return;

    if (selectedCardInfo.type === 'trap') {
      if (trapsCount >= 3) return;
      onPlaceTrap(selectedCardInfo.code);
      setSelectedCode(null);
      onClose();
      return;
    }

    if (selectedCardInfo.type === 'action') {
      if (selectedCardInfo.needsTarget) {
        onRequestTarget(selectedCardInfo.display);
        setSelectedCode(null);
        onClose();
        return;
      }
      onPlayAction(selectedCardInfo.code);
      setSelectedCode(null);
      onClose();
      return;
    }
  };

  const theme = selectedCardInfo
    ? CARD_TYPE_THEMES[selectedCardInfo.type] ?? CARD_TYPE_THEMES.action
    : null;

  const fullscreenCardInfo = useMemo(() => {
    if (!fullscreenCode) return null;
    const full = getCardById(fullscreenCode);
    const display = getCardDisplay(fullscreenCode);

    return {
      code: fullscreenCode,
      type: full?.type ?? display.type,
      title: full?.name_th ?? display.th,
      description: full?.description_th ?? display.effect,
      image: full?.image,
    };
  }, [fullscreenCode]);

  useEffect(() => {
    if (!isOpen) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = null;
      setSelectedCode(null);
      setFullscreenCode(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!fullscreenCode) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreenCode(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenCode]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop click dismisses */}
      <div className="flex-1" onClick={onClose} />

      {/* Main Bottom Sheet Container */}
      <div className="flex max-h-[85vh] w-full max-w-md mx-auto flex-col rounded-t-3xl border-t border-gray-100 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CardsIcon className="h-4 w-4" />
            </div>
            <h2 className="text-sm sm:text-base font-black text-ink">
              ไพ่ในมือของคุณ ({hand.length} ใบ)
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดถาดไพ่"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Helper Hint */}
        <div className="flex items-center justify-between py-1.5 px-0.5 text-[11px] font-semibold text-ink-secondary shrink-0">
          <span>แตะไพ่เพื่อดูรายละเอียดและเลือกใช้งาน</span>
          <span className="text-[10px] text-ink-secondary/70">← เลื่อนซ้าย-ขวา →</span>
        </div>

        {/* 1. Hand Cards Track */}
        <div
          className="flex gap-3 overflow-x-auto px-1 pb-3 pt-3 scrollbar-none shrink-0 overscroll-x-contain"
          style={{ scrollSnapType: 'x proximity' }}
          onWheel={(event: WheelEvent<HTMLDivElement>) => {
            const target = event.currentTarget;
            const canScroll = target.scrollWidth > target.clientWidth;
            if (!canScroll) return;

            const horizontalIntent = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
            if (horizontalIntent) return;

            const nextScrollLeft = target.scrollLeft + event.deltaY;
            const maxScrollLeft = target.scrollWidth - target.clientWidth;
            const isMovingLeft = event.deltaY < 0;
            const isMovingRight = event.deltaY > 0;
            const canMoveLeft = target.scrollLeft > 0;
            const canMoveRight = target.scrollLeft < maxScrollLeft;

            if ((isMovingLeft && canMoveLeft) || (isMovingRight && canMoveRight)) {
              event.preventDefault();
              target.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
            }
          }}
        >
          {hand.length === 0 ? (
            <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400">
              ไม่มีไพ่ในมือ
            </div>
          ) : (
            hand.map((code, idx) => {
              const isSelected = selectedCode === code;
              const fullCard = getCardById(code);
              const display = getCardDisplay(code);

              const cardType = fullCard?.type ?? display.type;
              const title = fullCard?.name_th ?? display.th;
              const desc = fullCard?.description_th ?? display.effect;
              const image = fullCard?.image;

              return (
                <div
                  key={`${code}-${idx}`}
                  className="shrink-0 transition-transform duration-150"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Card
                    id={code}
                    type={cardType}
                    title={title}
                    description={desc}
                    image={image}
                    variant="hand"
                    selected={isSelected}
                    onClick={() => handleHandCardPress(code)}
                    className="cursor-pointer shadow-xs hover:shadow-md"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* 2. Selected Card Action Details Area */}
        {selectedCardInfo && theme ? (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl border-2 border-gray-100 bg-gray-50/70 p-3 animate-in fade-in duration-150 shrink-0">
            {/* Header / Type Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider uppercase ${theme.text} ${theme.bgBadge}`}
                >
                  {theme.label} • {theme.labelTh}
                </span>
                <span className="font-mono text-xs font-bold text-ink-secondary">
                  {selectedCardInfo.code}
                </span>
              </div>
              <span className="text-xs font-bold text-ink-secondary">
                {selectedCardInfo.needsTarget ? 'ต้องระบุเป้าหมาย' : 'เป้าหมายทั้งหมด / ตัวเอง'}
              </span>
            </div>

            {/* Title & Description */}
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-black text-ink">{selectedCardInfo.title}</h3>
              <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-line">
                {selectedCardInfo.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="mt-1 flex items-center gap-2">
              {isMyTurn && canAct ? (
                selectedCardInfo.type === 'action' ? (
                  hasDrawnThisTurn ? (
                    <div className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-700">
                      คุณจั่วไพ่ประจำเทิร์นแล้ว (กด จบเทิร์น เพื่อเปลี่ยนตา)
                    </div>
                  ) : hasPlayedActionThisTurn ? (
                    <div className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-700">
                      คุณเล่นแอ็กชันประจำเทิร์นแล้ว (กด จบเทิร์น เพื่อเปลี่ยนตา)
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleActionConfirm}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-action px-4 text-xs sm:text-sm font-black text-white shadow-md shadow-action/25 transition-all hover:opacity-95 active:scale-[0.98]"
                    >
                      <CheckIcon className="h-4 w-4 stroke-[3]" />
                      <span>
                        {selectedCardInfo.needsTarget ? 'เลือกเป้าหมาย' : 'ใช้ไพ่ใบนี้'}
                      </span>
                    </button>
                  )
                ) : selectedCardInfo.type === 'trap' ? (
                  !isTrapPlacementPhase ? (
                    <div className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-100/70 px-3 text-[11px] font-bold text-ink-secondary">
                      ช่วงวางกับดักผ่านไปแล้ว (วางได้ในเทิร์นถัดไปของคุณ)
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleActionConfirm}
                      disabled={trapsCount >= 3}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-trap px-4 text-xs sm:text-sm font-black text-white shadow-md shadow-trap/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckIcon className="h-4 w-4 stroke-[3]" />
                      <span>
                        {trapsCount >= 3 ? 'กับดักเต็มแล้ว (3/3)' : 'วางกับดักลงบนโต๊ะ'}
                      </span>
                    </button>
                  )
                ) : (
                  <div className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-counter/30 bg-counter/10 px-3 text-[11px] font-bold text-counter">
                    ใช้ตอบโต้เมื่อมีการเล่น Action หรือ Trap
                  </div>
                )
              ) : (
                <div className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-100/70 px-3 text-[11px] font-bold text-ink-secondary">
                  {!isMyTurn ? 'ไม่ใช่เทิร์นของคุณ (ดูรายละเอียด)' : 'กำลังรอผลลัพธ์'}
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedCode(null)}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-xs font-bold text-ink-secondary hover:bg-gray-100 transition-colors active:scale-95"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {fullscreenCardInfo ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setFullscreenCode(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`ดูไพ่ ${fullscreenCardInfo.title}`}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFullscreenCode(null);
            }}
            aria-label="ปิดมุมมองไพ่เต็มจอ"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-lg transition-colors hover:bg-white active:scale-95"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          <div
            className="w-full max-w-[min(78vw,360px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Card
              id={fullscreenCardInfo.code}
              type={fullscreenCardInfo.type}
              title={fullscreenCardInfo.title}
              description={fullscreenCardInfo.description}
              image={fullscreenCardInfo.image}
              variant="full"
              className="max-h-[82vh] shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
