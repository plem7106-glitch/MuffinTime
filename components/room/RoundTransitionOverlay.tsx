'use client';

import { useEffect, useState } from 'react';
import { useAudio } from '../../lib/audio';
import { SparkleIcon } from '../ui/Icons';

export function RoundTransitionOverlay({
  roundNumber,
  activePlayerId,
  myPlayerId,
  activePlayerName,
  onComplete,
}: {
  roundNumber: number;
  activePlayerId: string;
  myPlayerId: string;
  activePlayerName: string;
  onComplete: () => void;
}) {
  const { playRound } = useAudio();
  const [isFadingOut, setIsFadingOut] = useState(false);
  const isMyTurn = activePlayerId === myPlayerId;

  useEffect(() => {
    // 1. Play Round.mp3 sound effect once on mount
    playRound();

    // 2. Begin fade out at 1.4s
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 1400);

    // 3. Complete and unmount at 1.8s
    const finishTimer = setTimeout(() => {
      onComplete();
    }, 1800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [playRound, onComplete]);

  return (
    <div
      role="status"
      aria-label={`เริ่มรอบที่ ${roundNumber} ${isMyTurn ? 'ถึงตาของคุณแล้ว' : `ถึงตาของ ${activePlayerName}`}`}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md p-4 select-none overflow-hidden transition-opacity duration-300 pointer-events-auto ${
        isFadingOut ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-200'
      }`}
    >
      {/* Decorative Subtle Radial Pastel Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-20 flex items-center justify-center opacity-80"
      >
        <div className="h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(255,46,99,0.2)_0%,_rgba(6,182,212,0.15)_45%,_rgba(245,158,11,0.12)_70%,_transparent_100%)] blur-2xl" />
      </div>

      {/* Main Round Pop Card */}
      <div className="relative z-10 flex w-full max-w-xs flex-col items-center justify-center rounded-3xl border-2 border-pink-100 bg-white/95 p-6 text-center shadow-[0_10px_35px_rgba(255,46,99,0.18)] backdrop-blur-xl animate-in zoom-in-75 duration-300">
        {/* Top Decorative Sparkles */}
        <div className="flex items-center gap-1.5 text-amber-500 mb-2">
          <SparkleIcon className="h-4 w-4 animate-spin-slow" />
          <SparkleIcon className="h-5 w-5 text-primary animate-pulse" />
          <SparkleIcon className="h-4 w-4 animate-spin-slow" />
        </div>

        {/* Round Badge */}
        <div className="rounded-full bg-gradient-to-r from-primary/15 via-pink-100 to-primary/10 border border-primary/30 px-3 py-0.5 text-[11px] font-black text-primary uppercase tracking-wider mb-1.5">
          NEW ROUND
        </div>

        {/* Main Thai Heading */}
        <h2 className="text-3xl font-black text-ink tracking-tight mb-2">
          รอบที่ <span className="text-primary">{roundNumber}</span>
        </h2>

        {/* Turn Announcement Subtitle */}
        {isMyTurn ? (
          <div className="flex items-center justify-center rounded-full bg-primary/10 px-4 py-1.5 border border-primary/30 shadow-xs animate-pulse">
            <span className="text-sm sm:text-base font-black text-primary">
              ถึงตาของคุณแล้ว!
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-full bg-gray-100/90 px-3.5 py-1 border border-gray-200">
            <span className="text-xs sm:text-sm font-bold text-ink-secondary">
              ถึงตาของ <span className="font-black text-ink">{activePlayerName}</span>
            </span>
          </div>
        )}

        {/* Bottom Small Particle Dots */}
        <div className="flex items-center gap-1.5 mt-3.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        </div>
      </div>
    </div>
  );
}
