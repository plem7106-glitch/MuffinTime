import Link from 'next/link';
import type { RoomSummary } from '../../lib/session';
import { UsersIcon } from '../ui/Icons';

export interface RoomCardProps {
  room: RoomSummary;
  index?: number;
}

const AVATAR_THEMES = [
  {
    bg: 'bg-[#E1F0FF]',
    border: 'border-[#CCE4FF]',
    text: 'text-[#1769C2]',
    image: '/images/home/mascot/muffin-blue-cap.jpg',
  },
  {
    bg: 'bg-[#E8F8EE]',
    border: 'border-[#C8F0D5]',
    text: 'text-[#2FA35A]',
    image: '/images/home/mascot/muffin-green-cap.jpg',
  },
  {
    bg: 'bg-[#FFF8E1]',
    border: 'border-[#FFEBB3]',
    text: 'text-[#D97706]',
    image: '/images/home/mascot/muffin-yellow-cap.jpg',
  },
];

export function RoomCard({ room, index = 0 }: RoomCardProps) {
  const theme = AVATAR_THEMES[index % AVATAR_THEMES.length];

  return (
    <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all hover:border-primary/30">
      {/* Left: Avatar + Room Details */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* White Muffin Avatar */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${theme.bg} ${theme.border}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.image}
            alt={`Muffin avatar for ${room.hostName}`}
            className="h-9 w-9 object-contain drop-shadow-xs"
          />
        </div>

        {/* Text Info */}
        <div className="flex flex-col min-w-0">
          <p className="truncate text-sm font-bold text-ink leading-tight">
            ห้องของ {room.hostName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`font-mono text-xs font-bold ${theme.text}`}>
              {room.code}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-secondary">
              <UsersIcon className="h-3 w-3 text-ink-secondary/80" />
              <span>
                {room.currentPlayers} / {room.maxPlayers} คน
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Join Button */}
      <Link
        href={`/join/${room.code}`}
        className="flex min-h-[44px] min-w-[68px] shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-white shadow-[0_3px_8px_rgba(237,31,79,0.25)] transition-all hover:bg-primary/90 active:scale-95"
      >
        เข้าร่วม
      </Link>
    </div>
  );
}
