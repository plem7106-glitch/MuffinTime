'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import {
  ChevronLeftIcon,
  UserIcon,
  UsersIcon,
  InfoIcon,
  EnterDoorIcon,
} from '../../components/ui/Icons';

export default function CreateRoomPage() {
  const router = useRouter();
  const { createRoom } = useGameSession();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(3);

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const code = createRoom(trimmedName, maxPlayers);
    router.push(`/room/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3.5 p-4 pb-8 bg-white">
      {/* 1. Header */}
      <header className="flex items-center justify-between py-0.5">
        <Link
          href="/"
          aria-label="ย้อนกลับไปหน้าหลัก"
          className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:text-primary active:scale-95"
        >
          <ChevronLeftIcon className="h-6 w-6 stroke-[2.5]" />
        </Link>
        <h1 className="text-lg font-bold text-ink">สร้างห้อง</h1>
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* 2. Hero Section */}
      <section className="flex items-center justify-between gap-3 py-1">
        {/* Left: Mascot Character holding Red Card */}
        <div className="flex w-32 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/create-room/white-muffin-card.jpg"
            alt="White Muffin holding Red Card"
            className="h-28 w-28 object-contain drop-shadow-xs"
          />
        </div>

        {/* Right: Headline & Description */}
        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="text-2xl font-black text-ink leading-tight">
            <span className="text-primary">สร้างห้อง</span>ของคุณ
          </h2>
          <p className="text-xs font-medium text-ink-secondary leading-snug mt-1.5">
            ตั้งชื่อห้อง เลือกจำนวนผู้เล่น
            <br />
            แล้วเชิญเพื่อนมาเล่นด้วยกัน!
          </p>
        </div>
      </section>

      {/* Form Area */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 flex-1">
        {/* 3. Name Field */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-primary">
            <UserIcon className="h-4 w-4" />
            <label htmlFor="playerName" className="text-sm font-bold text-ink">
              ชื่อของคุณ
            </label>
          </div>
          <input
            id="playerName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="กรอกชื่อของคุณ"
            maxLength={20}
            className="w-full min-h-[50px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 placeholder:font-normal shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        {/* 4. Player Count Stepper */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-primary">
            <UsersIcon className="h-4 w-4" />
            <span className="text-sm font-bold text-ink">จำนวนผู้เล่น</span>
          </div>
          <p className="text-xs text-ink-secondary">
            เลือกจำนวนผู้เล่นในห้อง (รองรับ 3 – 15 คน)
          </p>

          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mt-1">
            {/* Decrement Button */}
            <button
              type="button"
              onClick={() => setMaxPlayers((prev) => Math.max(3, prev - 1))}
              disabled={maxPlayers <= 3}
              aria-label="ลดจำนวนผู้เล่น"
              className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              −
            </button>

            {/* Display */}
            <span className="text-2xl font-black text-ink">
              {maxPlayers} คน
            </span>

            {/* Increment Button */}
            <button
              type="button"
              onClick={() => setMaxPlayers((prev) => Math.min(15, prev + 1))}
              disabled={maxPlayers >= 15}
              aria-label="เพิ่มจำนวนผู้เล่น"
              className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
          </div>

          {/* Recommendation Badge */}
          <div className="flex justify-center mt-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0F3] px-3.5 py-1 text-xs font-bold text-primary border border-primary/10">
              <span>⭐</span>
              <span>แนะนำ 3 – 8 คน</span>
            </div>
          </div>
        </div>

        {/* 5. Dashed Divider */}
        <div className="border-t border-dashed border-gray-200 my-0.5" />

        {/* 6. Player Count Info Panel */}
        <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-center justify-between gap-2">
          {/* Info Details */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-primary mb-0.5">
              <InfoIcon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold text-ink">เกี่ยวกับจำนวนผู้เล่น</span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">
                3 – 8 คน
              </span>
              <span className="text-[11px] text-ink-secondary leading-tight">
                เกมสมดุลที่สุด เล่นสนุกและกระชับ
              </span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">
                9 – 15 คน
              </span>
              <span className="text-[11px] text-ink-secondary leading-tight">
                เหมาะกับปาร์ตี้ใหญ่ อาจมีเทิร์นรอนานขึ้น
              </span>
            </div>

            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-extrabold text-primary shrink-0 w-16">
                15 คน
              </span>
              <span className="text-[11px] text-ink-secondary leading-tight">
                รองรับสูงสุดของ Web Version
              </span>
            </div>
          </div>

          {/* Baked Muffin Info Mascot */}
          <div className="flex shrink-0 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/create-room/brown-muffin-info.jpg"
              alt="Muffin mascot"
              className="h-16 w-16 object-contain drop-shadow-xs"
            />
          </div>
        </div>

        {/* 7. Create Room CTA Button */}
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
          <span>สร้างห้อง</span>
        </button>
      </form>
    </main>
  );
}
