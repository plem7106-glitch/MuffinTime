import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { PlayerId, PlayerState } from '../../game/types';
import { soundManager } from '../../lib/presentation/soundManager';

export function TargetSelector({
  open,
  candidates,
  selectedId,
  selectedIds,
  multiSelect = false,
  requiredCount,
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
  /** multiSelect only: confirm stays disabled until exactly this many are
   * picked (e.g. A172's "choose exactly 2"). Unset means any non-empty
   * selection enables confirm. */
  requiredCount?: number;
  onSelect: (id: PlayerId) => void;
  onConfirm: () => void;
  /** Omit when there is no valid "cancel" for this flow (e.g. a delegated
   * choice that must be resolved to unstick the game) -- the Cancel button
   * and scrim-dismiss are both suppressed. */
  onCancel?: () => void;
  prompt: string;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel ?? (() => {})}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เลือกผู้เล่นเป้าหมาย</h2>
        <p className="text-sm text-ink-secondary">{prompt}</p>
        <div className="flex flex-col gap-2">
          {candidates.map(({ id, player }) => (
            <button
              key={id}
              onClick={() => {
                soundManager.playSfx('/sounds/Select.mp3', 0.35);
                onSelect(id);
              }}
              className={`flex items-center gap-2 rounded-card border p-2.5 text-left transition-all active:scale-[0.98] ${
                (multiSelect ? selectedIds?.includes(id) : selectedId === id)
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm'
                  : 'border-ink/20 hover:border-primary/50'
              }`}
            >
              <span className={(multiSelect ? selectedIds?.includes(id) : selectedId === id) ? 'text-primary' : 'text-ink-secondary'}>
                {(multiSelect ? selectedIds?.includes(id) : selectedId === id) ? '●' : '○'}
              </span>
              <span className="font-semibold text-ink">{player.name}</span>
            </button>
          ))}
        </div>
        <PrimaryButton
          disabled={
            multiSelect
              ? requiredCount !== undefined
                ? selectedIds?.length !== requiredCount
                : !(selectedIds && selectedIds.length > 0)
              : !selectedId
          }
          onClick={onConfirm}
        >
          ยืนยัน
        </PrimaryButton>
        {onCancel && <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>}
      </div>
    </BottomSheet>
  );
}
