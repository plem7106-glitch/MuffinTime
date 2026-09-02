'use client';

export interface CardBackProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CardBack({ className = '', size = 'md' }: CardBackProps) {
  const sizeClasses = {
    sm: 'w-12 h-[72px]',
    md: 'w-20 h-30',
    lg: 'w-28 h-[168px]',
  }[size];

  return (
    <div
      className={`relative flex flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-pink-900/30 bg-pink-600 p-2 shadow-md ${sizeClasses} ${className}`}
    >
      <div className="absolute inset-1 rounded-lg border border-white/30 pointer-events-none" />
      <div className="relative z-10 flex w-full items-center justify-between text-[8px] font-black uppercase text-white/80">
        <span>MUFFIN</span>
        <span>TIME</span>
      </div>
      <div className="relative z-10 my-auto flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/home/hero/muffin-time-logo.jpg"
          alt="Muffin Logo"
          className="h-10 w-10 object-contain drop-shadow-sm"
        />
      </div>
      <div className="relative z-10 text-[7px] font-black uppercase text-white/70">
        CARD BACK
      </div>
    </div>
  );
}
