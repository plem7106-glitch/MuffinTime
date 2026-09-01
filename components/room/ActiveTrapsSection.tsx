'use client';

import { useState } from 'react';
import type { CardCode } from '../../game/types';
import { getCardById } from '../../data/cards/index';
import { getDemoCard } from '../../lib/demoCards';
import { TrapIcon, PlusIcon } from '../ui/Icons';

export function ActiveTrapsSection({
  traps,
  onOpenTrap,
  onAddTrapSlotClick,
  disabled = false,
}: {
  traps: CardCode[];
  onOpenTrap: (trapCode: CardCode) => void;
  onAddTrapSlotClick?: () => void;
  disabled?: boolean;
}) {
  const count = traps.length;
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  return (
    <section
      aria-label="กับดักที่คุณวางไว้"
      className="flex flex-col gap-1.5 w-full shrink-0 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <TrapIcon className="h-3.5 w-3.5 text-trap" />
          <h3 className="text-xs font-black text-ink">
            กับดักที่คุณวางไว้ ({count}/3)
          </h3>
        </div>
        {count > 0 ? (
          <span className="text-[10px] font-semibold text-ink-secondary">
            แตะเพื่อเปิดใช้งาน
          </span>
        ) : (
          <span className="text-[10px] font-medium text-ink-secondary">
            แตะ + เพื่อวางกับดัก
          </span>
        )}
      </div>

      {/* 3 Trap Slots (Always 3 portrait 2:3 slots: Placed Cards + Empty Slots) */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {[0, 1, 2].map((slotIndex) => {
          const code = traps[slotIndex];

          // 1. Placed Trap Card (Preserves 2:3 portrait aspect ratio with real card artwork)
          if (code) {
            const cardData = getCardById(code);
            const title = cardData?.name_th ?? (function () {
              try {
                return getDemoCard(code).th;
              } catch {
                return code;
              }
            })();
            const description = cardData?.description_th ?? (function () {
              try {
                return getDemoCard(code).effect;
              } catch {
                return '';
              }
            })();
            const image = cardData?.image;
            const hasImageError = imageErrors[code];

            return (
              <button
                key={`${code}-${slotIndex}`}
                type="button"
                onClick={() => {
                  if (!disabled) onOpenTrap(code);
                }}
                disabled={disabled}
                aria-label={`กับดัก ${title} (แตะเพื่อเปิดใช้งาน)`}
                className="group relative flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-2xl border-2 border-trap bg-white p-2 text-left shadow-xs transition-all hover:border-trap hover:shadow-md hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* Card Top Header */}
                <div className="flex items-center justify-between shrink-0">
                  <span className="rounded bg-trap/10 px-1 py-0.2 text-[8px] font-black text-trap uppercase tracking-wider">
                    TRAP
                  </span>
                  <span className="font-mono text-[8px] font-bold text-ink-secondary">
                    {code}
                  </span>
                </div>

                {/* Card Artwork Image Slot (aspect 4:3) */}
                <div className="w-full aspect-[4/3] overflow-hidden rounded-lg border border-trap/15 bg-white shrink-0 my-1 flex items-center justify-center">
                  {image && !hasImageError ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={image}
                      alt={title}
                      onError={() => setImageErrors((prev) => ({ ...prev, [code]: true }))}
                      className="h-full w-full object-contain drop-shadow-2xs"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-trap/40">
                      <TrapIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>

                {/* Card Title & Description */}
                <div className="flex flex-col gap-0.5 shrink-0 min-w-0">
                  <h4 className="text-[10px] sm:text-[11px] font-black text-ink line-clamp-1 group-hover:text-trap transition-colors leading-tight">
                    {title}
                  </h4>
                  {description && (
                    <p className="text-[8px] text-ink-secondary line-clamp-2 leading-tight">
                      {description}
                    </p>
                  )}
                </div>
              </button>
            );
          }

          // 2. Empty Trap Slot (Clickable + slot to open HandTrayModal)
          const isFirstEmpty = slotIndex === count;

          return (
            <button
              key={`empty-slot-${slotIndex}`}
              type="button"
              onClick={() => {
                if (!disabled && onAddTrapSlotClick) {
                  onAddTrapSlotClick();
                }
              }}
              disabled={disabled}
              aria-label="ช่องวางกับดักว่าง (แตะเพื่อวางกับดักจากมือ)"
              className="group relative flex aspect-[2/3] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 p-2 text-center transition-all hover:border-primary/60 hover:bg-pink-50/25 hover:shadow-xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 group-hover:bg-primary/15 transition-colors">
                <PlusIcon className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors stroke-[2.5]" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 group-hover:text-primary mt-1.5 transition-colors leading-tight">
                {isFirstEmpty ? 'วางกับดัก' : 'ว่าง'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
