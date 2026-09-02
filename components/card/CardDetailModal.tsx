'use client';

import type { Card as CardModel } from '../../data/cards/index';
import { Card } from './Card';
import { CloseIcon } from '../ui/Icons';

export function CardDetailModal({
  card,
  onClose,
}: {
  card: CardModel | null;
  onClose: () => void;
}) {
  if (!card) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name_th || 'รายละเอียดไพ่'}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-150"
    >
      <div className="relative max-h-[90vh] w-full max-w-xs flex-col items-center rounded-3xl bg-white p-4 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้ารายละเอียดไพ่"
          className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-ink shadow-xs hover:bg-gray-200 active:scale-95 transition-colors"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        <div className="pt-2 flex justify-center w-full">
          <div className="w-[min(65vw,230px)] sm:w-[240px] aspect-[2/3]">
            <Card card={card} variant="full" />
          </div>
        </div>
      </div>
    </div>
  );
}
