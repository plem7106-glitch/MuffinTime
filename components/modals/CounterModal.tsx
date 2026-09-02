import { BottomSheet } from '../ui/BottomSheet';
import { Card } from '../card/Card';
import { SecondaryButton } from '../ui/SecondaryButton';
import { getCardDisplay } from '../../data/cards/display';
import type { CardCode } from '../../game/types';

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
  return (
    <BottomSheet open={open} onClose={onSkip}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เล่นการ์ดสวนกลับไหม?</h2>
        <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[55vh] sm:grid-cols-2">
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
                variant="full"
                selected={selectedCode === code}
                onClick={() => onPlay(code)}
              />
            );
          })}
        </div>
        <SecondaryButton onClick={onSkip}>ข้าม</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
