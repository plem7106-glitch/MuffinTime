'use client';

import { useState, useEffect } from 'react';
import { CloseIcon, ShuffleIcon, InfoIcon } from '../ui/Icons';

export function ShuffleConfirmModal({
  isOpen,
  drawPileCount,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  drawPileCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onConfirm();
    onClose();
  };


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shuffle-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none animate-in fade-in duration-200"
    >
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-sm flex-col rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShuffleIcon className="h-4 w-4" />
            </div>
            <h2 id="shuffle-modal-title" className="text-base font-black text-ink">
              สับกองไพ่?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-ink leading-relaxed">
            ระบบจะนำเฉพาะไพ่ที่เหลืออยู่ในกองจั่ว (<span className="font-black text-primary">{drawPileCount} ใบ</span>) มาสับและกระจายประเภทไพ่ใหม่
          </p>

          <div className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/80 p-3">
            <InfoIcon className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <p className="text-[11px] font-medium text-blue-950 leading-snug">
              ไพ่ในมือ ไพ่ที่วางอยู่ และกองทิ้งจะไม่ถูกเปลี่ยน
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            disabled={isSubmitting || drawPileCount <= 1}
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] py-3 text-xs font-black text-white shadow-md shadow-red-500/20 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShuffleIcon className="h-4 w-4" />
            <span>สับกองไพ่</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-xs font-bold text-ink-secondary hover:bg-gray-50 active:scale-[0.98] transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
