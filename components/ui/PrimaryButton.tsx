import type { ButtonHTMLAttributes } from 'react';

const TONE_CLASS = {
  primary: 'bg-primary',
  action: 'bg-action',
  trap: 'bg-trap',
  counter: 'bg-counter',
} as const;

export function PrimaryButton({
  className = '',
  tone = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONE_CLASS }) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-card px-4 font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${TONE_CLASS[tone]} ${className}`}
    />
  );
}
