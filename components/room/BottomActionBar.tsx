import { PrimaryButton } from '../ui/PrimaryButton';

export function BottomActionBar({
  isMyTurn,
  onDraw,
  canDeclare,
  onDeclare,
}: {
  isMyTurn: boolean;
  onDraw: () => void;
  canDeclare: boolean;
  onDeclare: () => void;
}) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-ink/10 bg-app-bg p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <p className="text-sm font-semibold text-ink">{isMyTurn ? 'ตาของคุณ' : 'รอผู้เล่นอื่น...'}</p>
      <div className="flex gap-2">
        {canDeclare && (
          <PrimaryButton tone="counter" onClick={onDeclare}>
            Muffin Time!
          </PrimaryButton>
        )}
        <PrimaryButton onClick={onDraw} disabled={!isMyTurn}>
          จั่วไพ่
        </PrimaryButton>
      </div>
    </div>
  );
}
