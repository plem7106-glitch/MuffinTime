import { useEffect, useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Card } from '../card/Card';
import { SecondaryButton } from '../ui/SecondaryButton';
import { getCardDisplay } from '../../data/cards/display';
import type { CardCode } from '../../game/types';
import { usePresentation } from '../../lib/presentation/presentationContext';

export function CounterModal({
  open,
  counterCards,
  onPlay,
  selectedCode,
  onSkip,
}: {
  open: boolean;
  counterCards: CardCode[];
  onPlay: (code: CardCode) => void;
  onSkip: () => void;
  selectedCode?: CardCode | null;
}) {
  const { isIncomingPresentationActive } = usePresentation();
  const [localSelectedCode, setLocalSelectedCode] = useState<CardCode | null>(selectedCode ?? counterCards[0] ?? null);

  useEffect(() => {
    setLocalSelectedCode(selectedCode ?? counterCards[0] ?? null);
  }, [selectedCode, counterCards]);

  const selected = localSelectedCode && counterCards.includes(localSelectedCode) ? localSelectedCode : null;

  return (
    <BottomSheet open={open && !isIncomingPresentationActive} onClose={onSkip}>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        <h2 className="text-lg font-bold text-ink">เล่นการ์ดสวนกลับไหม?</h2>
        <p className="text-xs text-ink-secondary">เลือกการ์ดที่ต้องการใช้ตอบโต้ แล้วกดยืนยัน</p>
        <div className="grid max-h-[38vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {counterCards.map((code, i) => {
            const card = getCardDisplay(code);
            return (
              <Card
                key={`${code}-${i}`}
                type="counter"
                id={card.code}
                title={card.th}
                description={card.effect}
                image={card.image}
                variant="compact"
                selected={selected === code}
                onClick={() => setLocalSelectedCode(code)}
              />
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onPlay(selected)}
            className="flex-1 rounded-xl bg-counter px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            ใช้ Counter
          </button>
          <SecondaryButton onClick={onSkip}>ข้าม</SecondaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}
