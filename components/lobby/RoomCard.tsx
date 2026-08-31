import Link from 'next/link';
import type { RoomSummary } from '../../lib/session';

export function RoomCard({ room }: { room: RoomSummary }) {
  return (
    <div className="flex items-center justify-between rounded-card border border-ink/10 bg-card p-3 shadow-sm">
      <div>
        <p className="font-bold text-ink">ห้องของ {room.hostName}</p>
        <p className="text-sm text-ink-secondary">{room.code}</p>
        <p className="text-sm text-ink-secondary">
          {room.currentPlayers} / {room.maxPlayers} คน
        </p>
      </div>
      <Link
        href={`/join/${room.code}`}
        className="flex min-h-[44px] items-center rounded-card bg-primary px-4 font-bold text-white"
      >
        JOIN
      </Link>
    </div>
  );
}
