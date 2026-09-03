import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { getCardDisplay } from '../../data/cards/display';
import type { LastResult } from '../../game/types';

export function ActionResultModal({
  result,
  actorName,
  targetName,
  onClose,
}: {
  result: LastResult | null;
  actorName: string;
  targetName?: string;
  onClose: () => void;
}) {
  const show = result !== null && result.kind === 'action' && !result.countered;
  const card = result ? getCardDisplay(result.code) : null;

  return (
    <BottomSheet open={show} onClose={onClose}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-action">ACTION!</span>
          <h2 className="text-lg font-bold text-ink">
            {actorName} เล่นการ์ด {card.th}
          </h2>
          {targetName && <p className="text-sm text-ink">เป้าหมาย: {targetName}</p>}
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="action" onClick={onClose}>
            ปิด
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
