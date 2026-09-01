import { Card } from './Card';
import { getCardDisplay } from '../../data/cards/display';
import type { CardCode } from '../../game/types';

export function CardHand({
  hand,
  selectedCode,
  onSelect,
}: {
  hand: CardCode[];
  selectedCode?: CardCode | null;
  onSelect: (code: CardCode) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollSnapType: 'x proximity' }}
    >
      {hand.map((code, i) => {
        const card = getCardDisplay(code);
        return (
          <div key={`${code}-${i}`} style={{ scrollSnapAlign: 'start' }}>
            <Card
              type={card.type}
              title={card.th}
              description={card.effect}
              selected={selectedCode === code}
              onClick={() => onSelect(code)}
            />
          </div>
        );
      })}
    </div>
  );
}
