'use client';

import { useState, useEffect } from 'react';
import { CheckIcon } from '../ui/Icons';

export function ShuffleDrawPileOverlay({
  isHost,
  onComplete,
}: {
  isHost: boolean;
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<'shuffling' | 'done'>('shuffling');

  useEffect(() => {
    // 1.5s -> Mark done with brief success feedback
    const doneTimer = setTimeout(() => {
      setStage('done');
    }, 1500);

    // 2.0s -> Complete and unmount overlay
    const finishTimer = setTimeout(() => {
      onComplete();
    }, 2000);

    return () => {
      clearTimeout(doneTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      role="status"
      aria-label="กำลังสับกองไพ่"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/85 backdrop-blur-md p-4 select-none overflow-hidden animate-in fade-in duration-200"
    >
      {/* Decorative Subtle Radial Glow (Bright, Cute, Minigame Feel) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-20 flex items-center justify-center opacity-80"
      >
        <div className="h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(255,46,99,0.18)_0%,_rgba(6,182,212,0.12)_45%,_rgba(245,158,11,0.1)_70%,_transparent_100%)] blur-2xl" />
      </div>

      {/* Main Shuffling Card Container */}
      <div className="relative z-10 flex w-full max-w-xs flex-col items-center justify-center rounded-3xl border-2 border-pink-100 bg-white/95 p-6 text-center text-ink shadow-[0_10px_35px_rgba(255,46,99,0.15)] backdrop-blur-xl">
        {/* Animated 3-Card Swapping Loader */}
        <div className="relative mb-6 flex h-24 w-32 items-center justify-center">
          {/* Left Card (Blue Action Accent) */}
          <div
            className="absolute h-18 w-13 rounded-xl border-2 border-blue-400/80 bg-gradient-to-b from-blue-100 to-white shadow-md shadow-blue-500/15 flex flex-col items-center justify-center p-1 animate-[shuffle-card-left_1.2s_ease-in-out_infinite]"
          >
            <span className="h-1.5 w-5 rounded-full bg-blue-400 mb-1" />
            <span className="h-1 w-3 rounded-full bg-blue-200" />
          </div>

          {/* Center Card (Pink Primary Accent) */}
          <div
            className="absolute h-19 w-14 rounded-xl border-2 border-primary/90 bg-gradient-to-b from-pink-100 via-white to-pink-50 shadow-lg shadow-primary/20 flex flex-col items-center justify-center p-1 animate-[shuffle-card-center_1.2s_ease-in-out_infinite]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/home/hero/muffin-time-logo.jpg"
              alt="Muffin Logo"
              className="h-6 w-6 object-contain drop-shadow-2xs"
            />
            <span className="h-1 w-4 rounded-full bg-primary/40 mt-1" />
          </div>

          {/* Right Card (Green Counter Accent) */}
          <div
            className="absolute h-18 w-13 rounded-xl border-2 border-emerald-400/80 bg-gradient-to-b from-emerald-100 to-white shadow-md shadow-emerald-500/15 flex flex-col items-center justify-center p-1 animate-[shuffle-card-right_1.2s_ease-in-out_infinite]"
          >
            <span className="h-1.5 w-5 rounded-full bg-emerald-400 mb-1" />
            <span className="h-1 w-3 rounded-full bg-emerald-200" />
          </div>
        </div>

        {/* Text Status */}
        {stage === 'shuffling' ? (
          <div className="flex flex-col items-center gap-1 animate-in fade-in duration-150">
            <h3 className="text-base font-black text-ink">
              {isHost ? 'กำลังสับกองไพ่...' : 'กำลังรอเจ้าของห้องสับไพ่...'}
            </h3>
            <p className="text-[11px] font-medium text-ink-secondary">
              กำลังกระจายประเภทไพ่ในกองจั่วให้สมดุล
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 animate-in zoom-in-90 duration-200">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-0.5 shadow-xs">
              <CheckIcon className="h-4 w-4 stroke-[3]" />
            </div>
            <h3 className="text-base font-black text-emerald-600">
              สับกองไพ่เรียบร้อย!
            </h3>
            <p className="text-[11px] font-medium text-ink-secondary">
              พร้อมเล่นต่อแล้ว
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
