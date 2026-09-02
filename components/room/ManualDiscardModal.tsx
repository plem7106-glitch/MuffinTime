'use client';

import { useMemo, useState } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getCardDisplay } from '../../data/cards/display';
import { Card } from '../card/Card';
import { CloseIcon, TrashIcon, CheckIcon } from '../ui/Icons';

export function ManualDiscardModal({
  isOpen,
  hand,
  onClose,
  onConfirmDiscard,
}: {
  isOpen: boolean;
  hand: CardCode[];
  onClose: () => void;
  onConfirmDiscard: (cardCodes: CardCode[]) => void;
}) {
  const [selectedIndexSet, setSelectedIndexSet] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

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
    if (selectedIndexSet.size === 0) return;
    setShowConfirm(true);
  };

  const handleFinalConfirm = () => {
    const selectedCodes = Array.from(selectedIndexSet)
      .sort((a, b) => a - b)
      .map((idx) => hand[idx])
      .filter((code): code is CardCode => Boolean(code));

    onConfirmDiscard(selectedCodes);
    setSelectedIndexSet(new Set());
    setShowConfirm(false);
    onClose();
  };

  const handleClose = () => {
    setSelectedIndexSet(new Set());
    setShowConfirm(false);
    onClose();
  };

  const count = selectedIndexSet.size;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={handleClose} />

      {/* Container */}
      <div className="relative z-10 flex w-full max-w-lg flex-col max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <TrashIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-ink">ทิ้งไพ่เอง (Manual Discard)</h2>
              <p className="text-[11px] text-ink-secondary">
                เลือกไพ่จากมือเพื่อทิ้งเข้ากองทิ้งกรณีเอฟเฟกต์เกมค้าง
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

        {/* Hand Cards Grid */}
        <div className="flex-1 overflow-y-auto py-3 min-h-[160px]">
          {handCardItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-ink-secondary">
              <p className="text-xs font-bold">ไม่มีไพ่ในมือของคุณ</p>
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
                        ? 'border-red-500 bg-red-50/50 shadow-md ring-2 ring-red-300/60'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-sm animate-in zoom-in-50 duration-150">
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

        {/* Footer Actions */}
        <div className="pt-3 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-ink-secondary">
            เลือกแล้ว: <strong className="text-red-600 font-black">{count}</strong> ใบ
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={count === 0}
              onClick={handleOpenConfirm}
              className={`rounded-xl px-4 py-2 text-xs font-black text-white shadow-sm transition-all active:scale-95 ${
                count > 0
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-300 opacity-60 cursor-not-allowed'
              }`}
            >
              {count > 0 ? `ทิ้งไพ่ ${count} ใบ` : 'เลือกไพ่ที่ต้องการทิ้ง'}
            </button>
          </div>
        </div>

        {/* Confirmation Modal Overlay */}
        {showConfirm && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-3xl bg-white p-5 text-center shadow-xl animate-in fade-in duration-150">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-2">
              <TrashIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black text-ink">ยืนยันทิ้งไพ่ {count} ใบ?</h3>
            <p className="text-xs text-ink-secondary mt-1 max-w-xs">
              ไพ่ที่เลือกจะถูกย้ายจากมือของคุณเข้าสู่กองทิ้งโดยตรงเพื่อแก้ไขสถานะเกม
            </p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleFinalConfirm}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
              >
                ยืนยันทิ้งไพ่
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
