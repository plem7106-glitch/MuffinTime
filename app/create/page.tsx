'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

const PLAYER_COUNTS = [3, 4, 5, 6, 7, 8];

export default function CreateRoomPage() {
  const router = useRouter();
  const { createRoom } = useGameSession();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);

  function handleSubmit() {
    if (!name.trim()) return;
    const code = createRoom(name.trim(), maxPlayers);
    router.push(`/room/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" aria-label="ย้อนกลับ" className="text-xl text-ink">
          ←
        </Link>
        <h1 className="text-lg font-bold text-ink">สร้างห้อง</h1>
      </header>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-secondary">ชื่อของคุณ</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tee"
          className="min-h-[48px] rounded-card border border-ink/20 px-3 text-ink"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink-secondary">จำนวนผู้เล่น</span>
        <div className="grid grid-cols-3 gap-2">
          {PLAYER_COUNTS.map((count) => {
            const selected = count === maxPlayers;
            return (
              <button
                key={count}
                onClick={() => setMaxPlayers(count)}
                className={`min-h-[48px] rounded-card border text-ink ${
                  selected ? 'border-primary bg-primary/10 text-primary' : 'border-ink/20'
                }`}
              >
                {count} คน
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton
        className="mt-auto"
        disabled={!name.trim()}
        onClick={handleSubmit}
      >
        สร้างห้อง
      </PrimaryButton>
    </main>
  );
}
