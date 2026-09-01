import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { PlayerId, PlayerState } from '../../game/types';

export function TargetSelector({
  open,
  candidates,
  selectedId,
  selectedIds,
  multiSelect = false,
  onSelect,
  onConfirm,
  onCancel,
  prompt,
}: {
  open: boolean;
  candidates: Array<{ id: PlayerId; player: PlayerState }>;
  selectedId: PlayerId | null;
  selectedIds?: PlayerId[];
  multiSelect?: boolean;
  onSelect: (id: PlayerId) => void;
  onConfirm: () => void;
  onCancel: () => void;
  prompt: string;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เลือกผู้เล่นเป้าหมาย</h2>
        <p className="text-sm text-ink-secondary">{prompt}</p>
        <div className="flex flex-col gap-2">
          {candidates.map(({ id, player }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-2 rounded-card border p-2 text-left ${
                (multiSelect ? selectedIds?.includes(id) : selectedId === id) ? 'border-primary bg-primary/10' : 'border-ink/20'
              }`}
            >
              <span className={(multiSelect ? selectedIds?.includes(id) : selectedId === id) ? 'text-primary' : 'text-ink-secondary'}>
                {(multiSelect ? selectedIds?.includes(id) : selectedId === id) ? '●' : '○'}
              </span>
              <span className="font-semibold text-ink">{player.name}</span>
            </button>
          ))}
        </div>
        <PrimaryButton disabled={multiSelect ? !(selectedIds && selectedIds.length > 0) : !selectedId} onClick={onConfirm}>
          ยืนยัน
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
