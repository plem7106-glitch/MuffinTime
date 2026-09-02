'use client';

import { useMemo, useState } from 'react';
import type { CardCode, PlayerId } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getCardDisplay } from '../../data/cards/display';
import { Card } from '../card/Card';
import { CloseIcon, UsersIcon, CheckIcon, CardsIcon } from '../ui/Icons';

export function ManualGiveModal({
  isOpen,
  hand,
  players,
  myPlayerId,
  onClose,
  onConfirmGive,
}: {
  isOpen: boolean;
  hand: CardCode[];
  players: Record<PlayerId, { name: string }>;
  myPlayerId: PlayerId;
  onClose: () => void;
  onConfirmGive: (recipientId: PlayerId, cardCodes: CardCode[]) => void;
}) {
  const [selectedRecipientId, setSelectedRecipientId] = useState<PlayerId | null>(null);
  const [selectedIndexSet, setSelectedIndexSet] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  // Candidate recipients excluding self
  const recipientCandidates = useMemo(() => {
    return Object.entries(players)
      .filter(([id]) => id !== myPlayerId)
      .map(([id, p]) => ({ id, name: p.name }));
  }, [players, myPlayerId]);

  // Map hand codes to display details with unique index
  const handCardItems = useMemo(() => {
    return hand.map((code, index) => {
      const full = getCardById(code);
      const display = getCardDisplay(code);
      return {
        index,
        code,
        title: full?.name_th ?? display.th,
        type: full?.type ?? display.type,
        display,
      };
    });
  }, [hand]);

  if (!isOpen) return null;

  const toggleSelectCard = (index: number) => {
    setSelectedIndexSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleOpenConfirm = () => {
    if (!selectedRecipientId || selectedIndexSet.size === 0) return;
    setShowConfirm(true);
  };

  const handleFinalConfirm = () => {
    if (!selectedRecipientId) return;

    const selectedCodes = Array.from(selectedIndexSet)
      .sort((a, b) => a - b)
      .map((idx) => hand[idx])
      .filter((code): code is CardCode => Boolean(code));

    onConfirmGive(selectedRecipientId, selectedCodes);
    setSelectedRecipientId(null);
    setSelectedIndexSet(new Set());
    setShowConfirm(false);
    onClose();
  };

  const handleClose = () => {
    setSelectedRecipientId(null);
    setSelectedIndexSet(new Set());
    setShowConfirm(false);
    onClose();
  };

  const cardCount = selectedIndexSet.size;
  const recipientName = selectedRecipientId ? players[selectedRecipientId]?.name ?? '' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={handleClose} />

      {/* Container */}
      <div className="relative z-10 flex w-full max-w-lg flex-col max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <CardsIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-ink">ส่งไพ่ให้ผู้เล่น (Manual Give)</h2>
              <p className="text-[11px] text-ink-secondary">
                เลือกผู้รับและไพ่ในมือเพื่อย้ายให้ผู้เล่นอื่นกรณีเอฟเฟกต์เกมค้าง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="ปิด"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Content Scroll Container */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 min-h-[220px]">
          {/* Step 1: Select Recipient */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-ink flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5 text-blue-600" />
              <span>1. เลือกผู้รับไพ่</span>
            </label>
            {recipientCandidates.length === 0 ? (
              <p className="text-xs text-ink-secondary italic p-2 bg-gray-50 rounded-xl">
                ไม่มีผู้เล่นอื่นในห้องนี้
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recipientCandidates.map((candidate) => {
                  const isSelected = selectedRecipientId === candidate.id;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedRecipientId(candidate.id)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-xs ring-2 ring-blue-300/60'
                          : 'border-gray-200 bg-white text-ink hover:bg-gray-50'
                      }`}
                    >
                      <span>{candidate.name}</span>
                      {isSelected && <CheckIcon className="h-3.5 w-3.5 text-blue-600 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Select Cards */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-ink flex items-center gap-1.5">
              <CardsIcon className="h-3.5 w-3.5 text-blue-600" />
              <span>2. เลือกไพ่ในมือของคุณ</span>
            </label>
            {handCardItems.length === 0 ? (
              <div className="py-6 text-center text-ink-secondary text-xs font-bold">
                ไม่มีไพ่ในมือของคุณ
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {handCardItems.map((item) => {
                  const isSelected = selectedIndexSet.has(item.index);
                  return (
                    <div
                      key={`${item.code}-${item.index}`}
                      onClick={() => toggleSelectCard(item.index)}
                      className={`relative cursor-pointer rounded-2xl p-1.5 transition-all active:scale-95 border-2 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-300/60'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      {/* Selected Badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm animate-in zoom-in-50 duration-150">
                          <CheckIcon className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                      )}

                      <div className="pointer-events-none">
                        <Card card={getCardById(item.code)} title={item.title} type={item.type} variant="compact" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-gray-100 shrink-0 flex items-center justify-between gap-2">
          <div className="flex flex-col text-xs font-bold text-ink-secondary">
            <span>
              ผู้รับ: <strong className="text-blue-600 font-black">{recipientName || 'ยังไม่เลือก'}</strong>
            </span>
            <span className="text-[11px]">
              เลือกแล้ว: <strong className="text-ink font-black">{cardCount}</strong> ใบ
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!selectedRecipientId || cardCount === 0}
              onClick={handleOpenConfirm}
              className={`rounded-xl px-4 py-2 text-xs font-black text-white shadow-sm transition-all active:scale-95 ${
                selectedRecipientId && cardCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-300 opacity-60 cursor-not-allowed'
              }`}
            >
              {!selectedRecipientId
                ? 'เลือกผู้รับไพ่'
                : cardCount === 0
                ? 'เลือกไพ่ที่ต้องการส่ง'
                : `ส่งไพ่ ${cardCount} ใบ`}
            </button>
          </div>
        </div>

        {/* Confirmation Overlay */}
        {showConfirm && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-3xl bg-white p-5 text-center shadow-xl animate-in fade-in duration-150">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-2">
              <CardsIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black text-ink">
              ส่งไพ่ {cardCount} ใบ ให้ {recipientName}?
            </h3>
            <p className="text-xs text-ink-secondary mt-1 max-w-xs">
              ไพ่ที่เลือกจะถูกย้ายจากมือของคุณไปยังมือของ {recipientName} โดยตรงเพื่อแก้ไขสถานะเกม
            </p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleFinalConfirm}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
              >
                ยืนยันส่งไพ่
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
