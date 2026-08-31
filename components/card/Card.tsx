import type { DemoCardType } from '../../lib/demoCards';

const TYPE_LABEL: Record<DemoCardType, string> = {
  action: 'ACTION',
  trap: 'TRAP',
  counter: 'COUNTER',
};

const TYPE_COLOR: Record<DemoCardType, string> = {
  action: 'border-action text-action',
  trap: 'border-trap text-trap',
  counter: 'border-counter text-counter',
};

export function Card({
  type,
  title,
  description,
  selected = false,
  onClick,
}: {
  type: DemoCardType;
  title: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-32 shrink-0 flex-col gap-1 rounded-card border-2 bg-card p-2 text-left shadow-sm transition-transform ${TYPE_COLOR[type]} ${
        selected ? '-translate-y-2 shadow-md' : ''
      }`}
    >
      <span className={`text-xs font-bold ${TYPE_COLOR[type]}`}>{TYPE_LABEL[type]}</span>
      <span className="text-sm font-bold text-ink">{title}</span>
      <span className="line-clamp-3 text-xs text-ink-secondary">{description}</span>
    </button>
  );
}
