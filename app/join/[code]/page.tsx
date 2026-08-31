'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../../lib/session';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';

export default function JoinRoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const { rooms, joinRoom } = useGameSession();
  const [name, setName] = useState('');

  const summary = rooms.find((r) => r.code === params.code);

  function handleSubmit() {
    if (!name.trim()) return;
    joinRoom(params.code, name.trim());
    router.push(`/room/${params.code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" aria-label="ย้อนกลับ" className="text-xl text-ink">
          ←
        </Link>
        <h1 className="text-lg font-bold text-ink">JOIN ห้อง</h1>
      </header>

      <div className="rounded-card border border-ink/10 bg-card p-3">
        <p className="font-bold text-ink">ห้องของ {summary?.hostName ?? '—'}</p>
        <p className="text-sm text-ink-secondary">
          {summary?.currentPlayers ?? 0} / {summary?.maxPlayers ?? 0} คน
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-secondary">ชื่อของคุณ</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bank"
          className="min-h-[48px] rounded-card border border-ink/20 px-3 text-ink"
        />
      </label>

      <PrimaryButton className="mt-auto" disabled={!name.trim()} onClick={handleSubmit}>
        เข้าร่วมห้อง
      </PrimaryButton>
    </main>
  );
}
