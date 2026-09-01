'use client';

import { useState, useEffect, useRef } from 'react';
import type { PlayerId, PlayerState } from '../../game/types';
import { useAudio } from '../../lib/audio';
import { CrownIcon, EnterDoorIcon, RefreshIcon } from '../ui/Icons';

const WINNER_PARTICLES = [
  { tx: '-130px', ty: '-110px', rot: '45deg', color: '#FF2E63', size: 16, type: 'rect', delay: '0.18s' },
  { tx: '140px', ty: '-120px', rot: '-30deg', color: '#F59E0B', size: 18, type: 'diamond', delay: '0.22s' },
  { tx: '-160px', ty: '20px', rot: '60deg', color: '#06B6D4', size: 14, type: 'circle', delay: '0.2s' },
  { tx: '150px', ty: '40px', rot: '-45deg', color: '#10B981', size: 16, type: 'rect', delay: '0.26s' },
  { tx: '-90px', ty: '-160px', rot: '15deg', color: '#EC4899', size: 20, type: 'star', delay: '0.24s' },
  { tx: '95px', ty: '-155px', rot: '-20deg', color: '#8B5CF6', size: 16, type: 'circle', delay: '0.28s' },
  { tx: '-110px', ty: '130px', rot: '75deg', color: '#F59E0B', size: 15, type: 'rect', delay: '0.23s' },
  { tx: '120px', ty: '125px', rot: '-60deg', color: '#06B6D4', size: 18, type: 'diamond', delay: '0.3s' },
  { tx: '-140px', ty: '-50px', rot: '30deg', color: '#10B981', size: 14, type: 'diamond', delay: '0.21s' },
  { tx: '135px', ty: '-60px', rot: '-75deg', color: '#FF2E63', size: 16, type: 'star', delay: '0.27s' },
  { tx: '0px', ty: '-180px', rot: '0deg', color: '#FF2E63', size: 14, type: 'circle', delay: '0.18s' },
  { tx: '0px', ty: '160px', rot: '45deg', color: '#F59E0B', size: 16, type: 'diamond', delay: '0.29s' },
  { tx: '-70px', ty: '150px', rot: '-15deg', color: '#EC4899', size: 12, type: 'circle', delay: '0.31s' },
  { tx: '70px', ty: '145px', rot: '30deg', color: '#F59E0B', size: 14, type: 'rect', delay: '0.25s' },
  { tx: '-60px', ty: '-180px', rot: '40deg', color: '#06B6D4', size: 15, type: 'diamond', delay: '0.22s' },
  { tx: '60px', ty: '-185px', rot: '-40deg', color: '#10B981', size: 14, type: 'star', delay: '0.25s' },
];

function StarShape({ className = 'h-4 w-4 text-amber-400' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function WinnerCelebrationOverlay({
  winnerId,
  winnerPlayerIds,
  finalHandCounts,
  gameEndReason,
  finishReason = 'normal',
  players,
  isHost,
  myPlayerId,
  onPlayAgain,
  onLeaveRoom,
}: {
  winnerId: PlayerId;
  winnerPlayerIds?: PlayerId[];
  finalHandCounts?: Record<PlayerId, number>;
  gameEndReason?: 'deck_exhausted' | 'muffin_time' | 'manual';
  finishReason?: 'normal' | 'manual';
  players: Record<PlayerId, PlayerState>;
  isHost: boolean;
  myPlayerId?: PlayerId | null;
  onPlayAgain: () => void;
  onLeaveRoom: () => void;
}) {
  const { playSuccess } = useAudio();
  const [stage, setStage] = useState<'intro' | 'countdown' | 'postgame'>('intro');
  const [countdown, setCountdown] = useState(3);
  const [isResetting, setIsResetting] = useState(false);
  const hasPlayedSoundRef = useRef(false);

  const winner = players[winnerId];
  const winnerName = winner?.name ?? 'ผู้เล่น';
  const winnerNames = (winnerPlayerIds?.length ? winnerPlayerIds : [winnerId]).map((id) => players[id]?.name ?? 'ผู้เล่น');
  const isMe = myPlayerId === winnerId;

  // 1. Play Succes.mp3 sound ONCE on mount at -15 dB volume
  useEffect(() => {
    if (!hasPlayedSoundRef.current) {
      hasPlayedSoundRef.current = true;
      playSuccess();
    }
  }, [playSuccess]);

  // 2. Staged timeline: 0.0s -> intro -> 1.5s -> countdown begins
  useEffect(() => {
    const countdownTimer = setTimeout(() => {
      setStage('countdown');
    }, 1500);

    return () => clearTimeout(countdownTimer);
  }, []);

  // 3. Countdown timer: 3! -> 2! -> 1! -> postgame
  useEffect(() => {
    if (stage !== 'countdown') return;

    if (countdown > 1) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      const finishCountdownTimer = setTimeout(() => {
        setStage('postgame');
      }, 1000);
      return () => clearTimeout(finishCountdownTimer);
    }
  }, [stage, countdown]);

  const handlePlayAgainClick = () => {
    if (!isHost || isResetting) return;
    setIsResetting(true);
    onPlayAgain();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="การฉลองผู้ชนะ"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-md p-4 select-none overflow-hidden"
    >
      {/* 1. Festive Subtle Radial Light Burst in Center (Bright & Cute) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-20 flex items-center justify-center opacity-90 animate-[winner-radial-burst_1.4s_ease-out_forwards]"
      >
        <div className="h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(255,46,99,0.18)_0%,_rgba(245,158,11,0.15)_40%,_rgba(6,182,212,0.1)_70%,_transparent_100%)] blur-2xl" />
      </div>

      {/* 2. Expanding Decorative Outer Ring */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-80 w-80 rounded-full border-2 border-dashed border-primary/20 animate-[spin_18s_linear_infinite] motion-reduce:hidden"
      />

      {/* 3. Celebration Particle Burst System */}
      <div className="relative flex items-center justify-center pointer-events-none">
        {WINNER_PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-xs animate-[particle-burst_1.6s_cubic-bezier(0.25,1,0.5,1)_forwards]"
            style={
              {
                '--tx': p.tx,
                '--ty': p.ty,
                '--rot': p.rot,
                animationDelay: p.delay,
                width: p.size,
                height: p.size,
                backgroundColor: p.type === 'circle' ? p.color : undefined,
                borderRadius:
                  p.type === 'circle' ? '9999px' : p.type === 'diamond' ? '3px' : '4px',
                transform: p.type === 'diamond' ? 'rotate(45deg)' : undefined,
                border: p.type !== 'circle' ? `2px solid ${p.color}` : undefined,
                background: p.type !== 'circle' ? `${p.color}dd` : p.color,
                boxShadow: `0 0 10px ${p.color}66`,
              } as React.CSSProperties
            }
          >
            {p.type === 'star' && <StarShape className="h-full w-full text-amber-400" />}
          </div>
        ))}
      </div>

      {/* 4. Main Celebration Presentation Card (Bright, Clean, Cute White Theme) */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center justify-center rounded-3xl border-2 border-pink-100 bg-white/95 p-5 sm:p-6 text-center text-ink shadow-[0_12px_40px_rgba(255,46,99,0.15)] backdrop-blur-xl transition-all duration-300">
        {/* Crown Icon with Sparkle Glow */}
        <div className="relative mb-2 flex items-center justify-center">
          <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-amber-400/30 via-yellow-300/40 to-pink-500/20 blur-md animate-[spark-pulse_1.5s_ease-in-out_infinite]" />
          <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-300 via-amber-400 to-yellow-500 text-white shadow-md shadow-amber-400/30 animate-[winner-float-slow_3s_ease-in-out_infinite]">
            <CrownIcon className="h-8 w-8 sm:h-9 sm:w-9 text-white stroke-[2.5] drop-shadow-xs" />
          </div>
        </div>

        {/* 0.3s Pop: Winner Title Header */}
        <div className="flex items-center gap-1.5 animate-[winner-pop-title_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.3s_both]">
          <StarShape className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
          <span className="text-xs sm:text-sm font-black tracking-widest text-[#FF2E63] uppercase drop-shadow-xs">
            {isMe ? 'คุณชนะ!' : 'ผู้ชนะ!'}
          </span>
          <StarShape className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
        </div>

        {/* 0.55s Pop: Dramatic Winner Name Container */}
        <div className="mt-2 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-pink-200/80 bg-gradient-to-r from-pink-50 via-amber-50/70 to-pink-50 py-3 px-4 shadow-sm animate-[winner-pop-name_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.55s_both]">
          <div className="flex items-center justify-center gap-2 max-w-full">
            <StarShape className="h-4 w-4 shrink-0 text-amber-500" />
            <h2
              className="truncate text-2xl sm:text-3xl font-black tracking-tight text-ink drop-shadow-xs"
              style={{
                textShadow: '0 2px 10px rgba(255, 46, 99, 0.15)',
              }}
            >
              {winnerName}
            </h2>
            <StarShape className="h-4 w-4 shrink-0 text-amber-500" />
          </div>

          {gameEndReason === 'deck_exhausted' && (
            <p className="mt-2 text-sm font-bold text-ink-secondary">
              กองจั่วหมดแล้ว ผู้ชนะ: {winnerNames.join(' / ')}
              {finalHandCounts && winnerPlayerIds?.length ? ` (${winnerPlayerIds.map((id) => finalHandCounts[id]).join(' / ')} ใบ)` : ''}
            </p>
          )}
          {finishReason === 'manual' && (
            <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-100 border border-amber-300/80 px-2 py-0.2 text-[9px] font-black text-amber-900 uppercase tracking-wide">
              จบเกมโดย Host
            </span>
          )}
        </div>

        {/* 5. Minigame-Style Dynamic Countdown (3! -> 2! -> 1!) */}
        {stage !== 'postgame' && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-secondary">
              กำลังเข้าสู่หน้าสรุปผล
            </span>
            <div
              key={countdown}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-pink-300 bg-gradient-to-br from-pink-100 to-amber-100 font-mono text-xl font-black text-[#FF2E63] shadow-md shadow-pink-500/15 animate-[countdown-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_both]"
            >
              {stage === 'countdown' ? `${countdown}!` : '...'}
            </div>
          </div>
        )}

        {/* 6. Post-Game Menu Card (Smooth slide-in after countdown) */}
        {stage === 'postgame' && (
          <div className="mt-4 flex w-full flex-col gap-2 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 text-center">
              <span className="text-xs font-black text-[#FF2E63]">จบเกมแล้ว</span>
              <p className="text-[11px] font-semibold text-ink mt-0.5">
                {winnerName} เป็นผู้ชนะในรอบนี้
              </p>
            </div>

            {/* Host Actions vs Guest Notice */}
            {isHost ? (
              <>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handlePlayAgainClick}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-4 text-sm font-black text-white shadow-md shadow-primary/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshIcon className="h-4 w-4 stroke-[2.5]" />
                  <span>เล่นต่อ</span>
                </button>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white text-xs font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
                >
                  <EnterDoorIcon className="h-4 w-4" />
                  <span>ออกจากห้อง</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-2.5 text-xs font-bold text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                  <span>รอ Host เลือกว่าจะเล่นต่อหรือไม่...</span>
                </div>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white text-xs font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
                >
                  <EnterDoorIcon className="h-4 w-4" />
                  <span>ออกจากห้อง</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
