'use client';

import { useMemo } from 'react';
import { getNextPlayerId } from '../../game/turn';
import type { PlayerId, PlayerState, PlayDirection } from '../../game/types';
import { ClockwiseIcon, CounterClockwiseIcon } from '../ui/Icons';

export function TurnStatusBar({
  currentTurnPlayerId,
  myPlayerId,
  players,
  seatOrder,
  playDirection,
}: {
  currentTurnPlayerId: PlayerId;
  myPlayerId: PlayerId;
  players: Record<PlayerId, PlayerState>;
  seatOrder: PlayerId[];
  playDirection: PlayDirection;
}) {
  const isMyTurn = currentTurnPlayerId === myPlayerId;
  const currentTurnPlayer = players[currentTurnPlayerId];
  const currentName = currentTurnPlayer?.name ?? '—';

  // Calculate next player ID dynamically from seatOrder and playDirection
  const nextPlayerId = useMemo(() => {
    return getNextPlayerId(seatOrder, currentTurnPlayerId, playDirection);
  }, [seatOrder, currentTurnPlayerId, playDirection]);

  const nextPlayer = players[nextPlayerId];
  const nextName = nextPlayer?.name ?? '—';

  return (
    <section
      aria-label="สถานะเทิร์นปัจจุบัน"
      className={`flex items-center justify-between rounded-xl border px-3 py-1.5 sm:py-2 shadow-2xs transition-all shrink-0 select-none ${
        isMyTurn
          ? 'border-primary/50 bg-gradient-to-r from-primary/15 via-pink-50/80 to-white shadow-primary/10 ring-1 ring-primary/30'
          : 'border-gray-200/90 bg-white'
      }`}
    >
      {/* Left: Active Turn Indicator */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${
            isMyTurn ? 'bg-primary animate-ping' : 'bg-emerald-500'
          }`}
        />
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`truncate text-xs sm:text-sm font-black ${
              isMyTurn ? 'text-primary' : 'text-ink'
            }`}
          >
            {isMyTurn ? 'เทิร์นของคุณ' : `เทิร์นของ ${currentName}`}
          </span>
          {isMyTurn && (
            <span className="rounded-full bg-primary text-white text-[8px] font-black px-1.5 py-0.2 shrink-0 animate-pulse">
              ตาคุณแล้ว!
            </span>
          )}
        </div>
      </div>

      {/* Right: Next Player & Direction */}
      <div className="flex items-center gap-2 shrink-0 text-right">
        <span className="text-[10px] font-semibold text-ink-secondary">
          ถัดไป: <span className="font-extrabold text-ink">{nextName}</span>
        </span>
        <div className="flex items-center gap-0.5 text-[9px] font-bold text-ink-secondary border-l border-gray-200 pl-1.5">
          {playDirection === 'clockwise' ? (
            <>
              <ClockwiseIcon className="h-3 w-3 text-primary" />
              <span>ตามเข็ม</span>
            </>
          ) : (
            <>
              <CounterClockwiseIcon className="h-3 w-3 text-primary" />
              <span>ทวนเข็ม</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
