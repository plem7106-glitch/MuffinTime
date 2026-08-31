'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useGameSession } from '../lib/session';
import { RoomCard } from '../components/lobby/RoomCard';
import { BottomSheet } from '../components/ui/BottomSheet';

export default function Home() {
  const { rooms } = useGameSession();
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="text-xl font-bold text-primary">Muffin Time</h1>
        <button aria-label="เมนู" className="text-2xl text-ink">
          ☰
        </button>
      </header>

      <Link
        href="/create"
        className="flex min-h-[48px] items-center justify-center rounded-card bg-primary font-bold text-white"
      >
        + สร้างห้อง
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-secondary">ห้องที่เปิดอยู่</h2>
        <div className="flex flex-col gap-2 overflow-y-auto">
          {rooms.map((room) => (
            <RoomCard key={room.code} room={room} />
          ))}
        </div>
      </section>

      <button
        onClick={() => setShowHowToPlay(true)}
        className="mt-auto min-h-[44px] text-sm font-semibold text-ink-secondary underline"
      >
        HOW TO PLAY
      </button>

      <BottomSheet open={showHowToPlay} onClose={() => setShowHowToPlay(false)}>
        <h2 className="mb-2 text-lg font-bold text-ink">วิธีเล่น</h2>
        <p className="text-sm text-ink-secondary">
          จั่ว ทิ้ง หรือขโมยไพ่ผ่านการ์ด Action, Trap และ Counter ผู้เล่นที่มีไพ่ในมือครบ 10 ใบพอดี
          ตอนเริ่มเทิร์นของตัวเอง (และเคยประกาศไว้ก่อนหน้า) เป็นผู้ชนะ
        </p>
      </BottomSheet>
    </main>
  );
}
