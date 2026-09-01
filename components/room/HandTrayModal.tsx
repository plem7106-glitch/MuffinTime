'use client';

import { useState, useMemo } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getDemoCard, type DemoCard } from '../../lib/demoCards';
import { Card, CARD_TYPE_THEMES } from '../card/Card';
import { CloseIcon, CardsIcon, CheckIcon } from '../ui/Icons';

export function HandTrayModal({
  isOpen,
  hand,
  isMyTurn,
  canAct,
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
  trapsCount: number;
  onClose: () => void;
  onPlayAction: (code: CardCode) => void;
  onPlaceTrap: (code: CardCode) => void;
  onRequestTarget: (demoCard: DemoCard) => void;
}) {
  const [selectedCode, setSelectedCode] = useState<CardCode | null>(null);

  // Retrieve selected card details
  const selectedCardInfo = useMemo(() => {
    if (!selectedCode) return null;
    const full = getCardById(selectedCode);
    let demo: DemoCard | null = null;
    try {
      demo = getDemoCard(selectedCode);
    } catch {
      // Not a demo card
    }

    return {
      code: selectedCode,
      type: full?.type ?? demo?.type ?? 'action',
      title: full?.name_th ?? demo?.th ?? selectedCode,
      titleEn: full?.name_en,
      description: full?.description_th ?? demo?.effect ?? '',
      image: full?.image,
      needsTarget: demo?.needsTarget ?? false,
      demo,
    };
  }, [selectedCode]);

  if (!isOpen) return null;

  const handleCardClick = (code: CardCode) => {
    setSelectedCode(code);
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
      if (selectedCardInfo.needsTarget && selectedCardInfo.demo) {
        onRequestTarget(selectedCardInfo.demo);
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

        {/* 1. Overlapping Hand Cards Track (fanned like real cards in hand) */}
        <div className="flex overflow-x-auto pt-7 pl-1 pr-8 pb-3 scrollbar-none shrink-0">
          {hand.length === 0 ? (
            <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400">
              ไม่มีไพ่ในมือ
            </div>
          ) : (
            hand.map((code, idx) => {
              const isSelected = selectedCode === code;
              const fullCard = getCardById(code);
              let demo: DemoCard | null = null;
              try {
                demo = getDemoCard(code);
              } catch {
                // Ignore
              }

              const cardType = fullCard?.type ?? demo?.type ?? 'action';
              const title = fullCard?.name_th ?? demo?.th ?? code;
              const desc = fullCard?.description_th ?? demo?.effect ?? '';
              const image = fullCard?.image;

              return (
                <div
                  key={`${code}-${idx}`}
                  className="shrink-0 transition-transform duration-150"
                  style={{
                    marginLeft: idx === 0 ? 0 : -44,
                    zIndex: isSelected ? 100 : idx,
                    transform: isSelected ? 'translateY(-14px)' : undefined,
                  }}
                >
                  <Card
                    id={code}
                    type={cardType}
                    title={title}
                    description={desc}
                    image={image}
                    variant="hand"
                    selected={isSelected}
                    onClick={() => handleCardClick(code)}
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
                ) : selectedCardInfo.type === 'trap' ? (
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
    </div>
  );
}
