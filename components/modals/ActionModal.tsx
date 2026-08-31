import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { DemoCard } from '../../lib/demoCards';

export function ActionModal({
  card,
  onConfirm,
  onCancel,
}: {
  card: DemoCard | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={card !== null} onClose={onCancel}>
      {card && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-action">ACTION</span>
          <h2 className="text-lg font-bold text-ink">{card.th}</h2>
          <p className="text-sm text-ink-secondary">{card.effect}</p>
          <PrimaryButton tone="action" onClick={onConfirm}>
            เล่นการ์ดนี้
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
