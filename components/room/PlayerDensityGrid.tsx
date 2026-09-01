'use client';

import { useMemo, useState } from 'react';
import type { PlayerId, PlayerState } from '../../game/types';
import { CardsIcon, TrapIcon, CrownIcon } from '../ui/Icons';

const MASCOT_AVATARS = [
  { image: '/images/home/mascot/muffin-blue-cap.jpg', bg: 'bg-[#E1F0FF]', border: 'border-[#CCE4FF]', text: 'text-[#1769C2]' },
  { image: '/images/home/mascot/muffin-green-cap.jpg', bg: 'bg-[#E8F8EE]', border: 'border-[#C8F0D5]', text: 'text-[#2FA35A]' },
  { image: '/images/home/mascot/muffin-yellow-cap.jpg', bg: 'bg-[#FFF8E1]', border: 'border-[#FFEBB3]', text: 'text-[#D97706]' },
  { image: '/images/home/mascot/muffin-default.jpg', bg: 'bg-[#FCE7F3]', border: 'border-[#FBCFE8]', text: 'text-[#DB2777]' },
  { image: '/images/create-room/white-muffin-card.jpg', bg: 'bg-[#EDE9FE]', border: 'border-[#DDD6FE]', text: 'text-[#7C3AED]' },
  { image: '/images/create-room/brown-muffin-info.jpg', bg: 'bg-[#FEF3C7]', border: 'border-[#FDE68A]', text: 'text-[#B45309]' },
  { image: '/images/join-room/white-muffin-phone.jpg', bg: 'bg-[#E0F2FE]', border: 'border-[#BAE6FD]', text: 'text-[#0284C7]' },
  { image: '/images/waiting-room/share-room-muffin.jpg', bg: 'bg-[#FEE2E2]', border: 'border-[#FECACA]', text: 'text-[#DC2626]' },
  { image: '/images/join-room/tips-muffin.jpg', bg: 'bg-[#DCFCE7]', border: 'border-[#BBF7D0]', text: 'text-[#16A34A]' },
  { image: '/images/create-room/mascot.jpg', bg: 'bg-[#FFEDD5]', border: 'border-[#FED7AA]', text: 'text-[#EA580C]' },
  { image: '/images/home/hero/white-muffin-hero.jpg', bg: 'bg-[#F3E8FF]', border: 'border-[#E9D5FF]', text: 'text-[#9333EA]' },
  { image: '/images/home/hero/hero-muffin.jpg', bg: 'bg-[#FFE4E6]', border: 'border-[#FECDD3]', text: 'text-[#E11D48]' },
];

export function PlayerDensityGrid({
  seatOrder,
  players,
  currentTurnPlayerId,
  myPlayerId,
  hostId,
}: {
  seatOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  currentTurnPlayerId: PlayerId;
  myPlayerId: PlayerId;
  hostId: PlayerId;
}) {
  const count = seatOrder.length;
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Responsive CSS grid rules strictly adhering to mobile design constraints:
  // 3 players -> 3 columns (1 row)
  // 4 players -> 4 columns (1 row)
  // 5–6 players -> 3 columns (2 rows)
  // 7–8 players -> 4 columns (2 rows)
  // 9–10 players -> 5 columns (2 rows x 5 cols = 10 players)
  // 11–12 players -> 4 columns (up to 3 rows) [NO 6 columns on mobile!]
  // 13–15 players -> 5 columns (3 rows)
  const gridColsClass = useMemo(() => {
    if (count <= 3) return 'grid-cols-3';
    if (count === 4) return 'grid-cols-4';
    if (count <= 6) return 'grid-cols-3';
    if (count <= 8) return 'grid-cols-4';
    if (count <= 10) return 'grid-cols-5';
    if (count <= 12) return 'grid-cols-4'; // 11-12 players: 4 columns
    return 'grid-cols-5'; // 13-15 players: 5 columns
  }, [count]);

  // Mascot avatar theme mapping by seat order
  const playerThemeMap = useMemo(() => {
    const map: Record<string, (typeof MASCOT_AVATARS)[0]> = {};
    seatOrder.forEach((id, idx) => {
      map[id] = MASCOT_AVATARS[idx % MASCOT_AVATARS.length];
    });
    return map;
  }, [seatOrder]);

  return (
    <section aria-label="รายชื่อผู้เล่นบนโต๊ะ" className="flex flex-col gap-1 w-full shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-ink-secondary">
          ผู้เล่นบนโต๊ะ ({count} คน)
        </span>
      </div>

      {/* Grid: 100% width, No horizontal scroll, adapts perfectly by player count */}
      <div className={`grid ${gridColsClass} gap-1 sm:gap-1.5 w-full`}>
        {seatOrder.map((id) => {
          const player = players[id];
          if (!player) return null;

          const isCurrentTurn = id === currentTurnPlayerId;
          const isMe = id === myPlayerId;
          const isHost = id === hostId;
          const theme = playerThemeMap[id] || MASCOT_AVATARS[0];
          const initial = player.name.charAt(0).toUpperCase() || 'P';
          const cardCount = player.hand?.length ?? 0;
          const trapCount = player.traps?.length ?? 0;
          const hasImageError = imageErrors[id];

          return (
            <div
              key={id}
              className={`relative flex flex-col items-center justify-between rounded-xl border p-1 transition-all text-center min-w-0 ${
                isCurrentTurn
                  ? 'border-primary bg-gradient-to-b from-primary/15 via-pink-50/60 to-white shadow-[0_0_10px_rgba(237,31,79,0.3)] ring-2 ring-primary/60'
                  : isMe
                  ? 'border-primary/40 bg-pink-50/40 shadow-2xs'
                  : 'border-gray-200/90 bg-white shadow-2xs'
              } ${count <= 4 ? 'min-h-[72px] p-1.5' : count <= 8 ? 'min-h-[66px]' : 'min-h-[60px]'}`}
            >
              {/* Compact Turn Overlay Badge */}
              {isCurrentTurn && (
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.2 text-[7px] font-black text-white shadow-xs tracking-tight animate-bounce z-10 whitespace-nowrap">
                  กำลังเล่น
                </span>
              )}

              {/* Real Mascot Avatar with Host Crown */}
              <div className="relative flex items-center justify-center mt-0.5">
                <div
                  className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border ${theme.bg} ${theme.border} ${
                    count <= 4
                      ? 'h-9 w-9 sm:h-10 sm:w-10'
                      : count <= 8
                      ? 'h-8.5 w-8.5 sm:h-9 sm:w-9'
                      : 'h-8 w-8 sm:h-8.5 sm:w-8.5'
                  }`}
                >
                  {!hasImageError ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={theme.image}
                      alt={player.name}
                      onError={() => setImageErrors((prev) => ({ ...prev, [id]: true }))}
                      className="h-full w-full object-contain p-0.5 drop-shadow-2xs"
                    />
                  ) : (
                    <span className={`text-xs font-black ${theme.text}`}>
                      {initial}
                    </span>
                  )}
                </div>
                {isHost && (
                  <CrownIcon className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500 drop-shadow-2xs" />
                )}
              </div>

              {/* Player Name & Local Indicator */}
              <div className="w-full flex items-center justify-center gap-0.5 min-w-0 my-0.5">
                <span
                  className={`truncate font-black ${
                    isCurrentTurn ? 'text-primary' : 'text-ink'
                  } ${
                    count <= 4
                      ? 'text-xs'
                      : count <= 8
                      ? 'text-[10px]'
                      : 'text-[9px]'
                  }`}
                >
                  {player.name}
                </span>
                {isMe && (
                  <span className="text-[7px] font-extrabold text-primary shrink-0">
                    (คุณ)
                  </span>
                )}
              </div>


              {/* Hand & Trap Counters */}
              <div className="flex items-center justify-center gap-1 w-full shrink-0">
                {/* Hand Count */}
                <div
                  title={`ไพ่ในมือ: ${cardCount} ใบ`}
                  className="flex items-center gap-0.5 rounded-sm bg-gray-100 px-1 py-0.2 text-ink"
                >
                  <CardsIcon className="h-2.5 w-2.5 text-primary/80" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{cardCount}</span>
                </div>

                {/* Active Trap Count */}
                <div
                  title={`กับดักที่วางอยู่: ${trapCount} ใบ`}
                  className={`flex items-center gap-0.5 rounded-sm px-1 py-0.2 ${
                    trapCount > 0
                      ? 'bg-trap/15 text-trap border border-trap/30'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <TrapIcon className="h-2.5 w-2.5" />
                  <span className="font-mono text-[8px] sm:text-[9px] font-black">{trapCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
