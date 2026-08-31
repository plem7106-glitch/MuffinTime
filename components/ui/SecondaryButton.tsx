import type { ButtonHTMLAttributes } from 'react';

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-[44px] rounded-card border border-ink/20 bg-card px-4 font-bold text-ink disabled:opacity-40 ${className}`}
    />
  );
}
