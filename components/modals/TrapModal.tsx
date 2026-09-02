'use client';

import { useMemo } from 'react';
import { Card } from '../card/Card';
import { getCardById } from '../../data/cards/index';
import { getCardDisplay, type CardDisplay } from '../../data/cards/display';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { TrapIcon, WarningIcon } from '../ui/Icons';

export function TrapModal({
  card,
  mode,
  onConfirm,
  onCancel,
}: {
  card: CardDisplay | null;
  mode: 'place' | 'open';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const fullTrapCard = useMemo(() => {
    if (!card) return null;
    const code = card.code;
    const fromDb = getCardById(code);
    if (fromDb) return fromDb;
    return {
      id: code,
      number: 0,
      name_th: card.th,
      name_en: card.th,
      type: 'trap' as const,
      description_th: card.effect,
      description_en: card.effect,
      image: undefined,
    };
  }, [card]);

  if (!card || !fullTrapCard) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trap-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none pointer-events-auto animate-in fade-in duration-200"
      onClick={onCancel}
    >
      {/* Modal Dialog Card */}
      <div
        className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border-2 border-purple-300/80 bg-white p-4 sm:p-5 text-center shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Badge */}
        <div className="flex items-center gap-1.5 rounded-full bg-purple-100/80 px-3 py-1 text-purple-700 border border-purple-200 mb-2">
          <TrapIcon className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wide">
            {mode === 'place' ? 'วางกับดัก' : 'กับดักของคุณ'}
          </span>
        </div>

        {/* Title / Description Prompt */}
        <p id="trap-modal-title" className="text-xs text-ink-secondary mb-3 font-medium">
          {mode === 'place'
            ? 'ทบทวนกับดักก่อนเลือกวางลงบนโต๊ะ'
            : 'หากเงื่อนไขในการเล่นเกิดขึ้นแล้ว คุณสามารถเปิดใช้กับดักนี้ได้'}
        </p>

        {/* Full Enlarged 2:3 Trap Card View */}
        <div className="my-2 flex justify-center w-full">
          <div className="w-[min(58vw,220px)] sm:w-[230px] aspect-[2/3] shrink-0 shadow-2xl rounded-2xl overflow-hidden pointer-events-none">
            <Card
              card={fullTrapCard}
              type="trap"
              id={fullTrapCard.id}
              title={fullTrapCard.name_th}
              description={fullTrapCard.description_th}
              image={fullTrapCard.image}
              variant="full"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex w-full flex-col gap-2">
          <PrimaryButton tone="trap" onClick={onConfirm} className="w-full">
            {mode === 'place' ? 'วางกับดักนี้' : 'เปิดกับดักนี้ / ประกาศเงื่อนไขทำงาน'}
          </PrimaryButton>

          <SecondaryButton onClick={onCancel} className="w-full">
            ยกเลิก
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
