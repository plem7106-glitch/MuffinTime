import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

/**
 * For "outcome_entry" Action cards resolved by a binary yes/no verdict
 * rather than picking a player (e.g. E4/E8: "did they laugh?", "which did
 * they choose?"). Family E's single-target contests/dares reuse the
 * existing TargetSelector instead -- this is only for the branch-less cases.
 */
export function OutcomeToggle({
  open,
  prompt,
  yesLabel = 'ใช่',
  noLabel = 'ไม่ใช่',
  onSelect,
  onCancel,
}: {
  open: boolean;
  prompt: string;
  yesLabel?: string;
  noLabel?: string;
  onSelect: (outcome: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">ผลลัพธ์เป็นยังไง?</h2>
        <p className="text-sm text-ink-secondary">{prompt}</p>
        <div className="flex gap-2">
          <PrimaryButton tone="action" onClick={() => onSelect(true)}>
            {yesLabel}
          </PrimaryButton>
          <PrimaryButton tone="action" onClick={() => onSelect(false)}>
            {noLabel}
          </PrimaryButton>
        </div>
        <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
