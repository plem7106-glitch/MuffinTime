export function DiscardPile({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-16 w-12 items-center justify-center rounded-card border-2 border-dashed border-ink/20 bg-card text-sm font-bold text-ink-secondary">
        {count}
      </div>
      <span className="text-xs text-ink-secondary">กองทิ้ง</span>
    </div>
  );
}
