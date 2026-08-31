import { BottomSheet } from '../ui/BottomSheet';
import { Card } from '../card/Card';
import { SecondaryButton } from '../ui/SecondaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { CardCode } from '../../game/types';

export function CounterModal({
  open,
  counterCards,
  onPlay,
  onSkip,
}: {
  open: boolean;
  counterCards: CardCode[];
  onPlay: (code: CardCode) => void;
  onSkip: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onSkip}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เล่นการ์ดสวนกลับไหม?</h2>
        <div className="flex gap-2 overflow-x-auto">
          {counterCards.map((code, i) => {
            const card = getDemoCard(code);
            return (
              <Card key={`${code}-${i}`} type="counter" title={card.th} description={card.effect} onClick={() => onPlay(code)} />
            );
          })}
        </div>
        <SecondaryButton onClick={onSkip}>ข้าม</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
