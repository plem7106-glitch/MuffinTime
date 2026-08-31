import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { getDemoCard } from '../../lib/demoCards';
import type { LastResult } from '../../lib/session';

export function CounterResultModal({
  result,
  counterActorName,
  onClose,
}: {
  result: LastResult | null;
  counterActorName: string;
  onClose: () => void;
}) {
  const show = result !== null && result.countered;
  const counterCard = result?.counterCode ? getDemoCard(result.counterCode) : null;

  return (
    <BottomSheet open={show} onClose={onClose}>
      {counterCard && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-counter">โดนสวนกลับ!</span>
          <h2 className="text-lg font-bold text-ink">
            {counterActorName} เล่นการ์ด &quot;{counterCard.th}&quot;
          </h2>
          <p className="text-sm text-ink-secondary">ผลของการ์ด/กับดักถูกยกเลิก</p>
          <PrimaryButton tone="counter" onClick={onClose}>
            ตกลง
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
