'use client';

import { useState, useMemo } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById, type Card as CardModel } from '../../data/cards/index';
import { Card } from '../card/Card';
import { CardDetailModal } from '../card/CardDetailModal';
import { CloseIcon, CardStackIcon } from '../ui/Icons';

type DiscardItem =
  | { isUnresolved: false; card: CardModel }
  | { isUnresolved: true; code: CardCode };

export function DiscardPileModal({
  isOpen,
  onClose,
  discardPile,
}: {
  isOpen: boolean;
  onClose: () => void;
  discardPile: CardCode[];
}) {
  const [activeCardDetail, setActiveCardDetail] = useState<CardModel | null>(null);

  // Resolved list of cards with NEWEST (most recently discarded) first
  // Creates a reversed display copy without mutating the original discardPile array
  const resolvedItems = useMemo<DiscardItem[]>(() => {
    return [...discardPile].reverse().map((code) => {
      // 1. Primary lookup in canonical card database (data/cards.json)
      const fromDb = getCardById(code);
      if (fromDb) {
        return { isUnresolved: false, card: fromDb };
      }

      return { isUnresolved: true, code };
    });
  }, [discardPile]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 animate-in fade-in duration-200"
    >
      <div className="flex h-[88vh] w-full max-w-md flex-col rounded-3xl border border-gray-100 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink/5 text-ink">
              <CardStackIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 id="discard-modal-title" className="text-sm sm:text-base font-black text-ink leading-tight">
                กองไพ่ทิ้ง
              </h2>
              <p className="text-[11px] font-bold text-ink-secondary">
                ไพ่ทั้งหมด {discardPile.length} ใบ (ใบล่าสุดอยู่บนสุด)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดกองไพ่ทิ้ง"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body / Card Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-3.5">
          {resolvedItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-3">
                <CardStackIcon className="h-7 w-7" />
              </div>
              <p className="text-sm font-black text-ink">ยังไม่มีไพ่ในกองทิ้ง</p>
              <p className="text-xs text-ink-secondary mt-1">
                เมื่อมีผู้เล่นเล่นไพ่หรือทิ้งไพ่ ไพ่เหล่านั้นจะปรากฏที่นี่
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {resolvedItems.map((item, index) => {
                if (item.isUnresolved) {
                  return (
                    <div
                      key={`unresolved-${item.code}-${index}`}
                      className="relative flex aspect-[2/3] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-3 text-center shadow-2xs"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-200/70 text-gray-400 mb-2">
                        <CardStackIcon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold text-gray-700">ไม่พบข้อมูลการ์ด</span>
                      <span className="font-mono text-[10px] font-bold text-gray-400 mt-1">
                        ID: {item.code}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${item.card.id}-${index}`}
                    className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Card
                      card={item.card}
                      variant="compact"
                      onClick={() => setActiveCardDetail(item.card)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reusable Shared Card Detail Inspection Modal */}
        <CardDetailModal
          card={activeCardDetail}
          onClose={() => setActiveCardDetail(null)}
        />
      </div>
    </div>
  );
}
