import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { LastResult } from '../../lib/session';

export function TrapResultModal({
  result,
  ownerName,
  targetName,
  onClose,
}: {
  result: LastResult | null;
  ownerName: string;
  targetName?: string;
  onClose: () => void;
}) {
  const show = result !== null && result.kind === 'trap' && !result.countered;
  const card = result ? getDemoCard(result.code) : null;

  return (
    <BottomSheet open={show} onClose={onClose}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-trap">TRAP!</span>
          <h2 className="text-lg font-bold text-ink">
            {card.th} ของ {ownerName} ถูกเปิดแล้ว!
          </h2>
          {targetName && <p className="text-sm text-ink">{targetName} ทำเงื่อนไขจริง</p>}
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="trap" onClick={onClose}>
            ปิด
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
