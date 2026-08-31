'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGameSession } from '../../../lib/session';
import {
  ChevronLeftIcon,
  UserIcon,
  InfoIcon,
  EnterDoorIcon,
  UsersIcon,
} from '../../../components/ui/Icons';

export default function JoinRoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const roomCode = params.code || '';
  const { rooms, joinRoom } = useGameSession();
  const [name, setName] = useState('');

  const summary = rooms.find((r) => r.code === roomCode);
  const isFull = summary ? summary.currentPlayers >= summary.maxPlayers : false;

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !summary || isFull) return;
    joinRoom(roomCode, trimmedName);
    router.push(`/room/${roomCode}`);
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
        <h1 className="text-lg font-bold text-ink">เข้าร่วมห้อง</h1>
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* 2. Hero Section */}
      <section className="flex items-center justify-between gap-3 py-1">
        {/* Left: Headline */}
        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="text-2xl font-black text-ink leading-tight">
            <span className="text-primary font-black">เข้าห้อง</span>เพื่อน
            <br />
            เริ่มความป่วนกันเลย!
          </h2>
          <p className="text-xs font-medium text-ink-secondary leading-snug mt-1.5">
            กรอกชื่อของคุณเพื่อเข้าร่วมห้อง
          </p>
        </div>

        {/* Right: Mascot holding smartphone */}
        <div className="flex w-32 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/join-room/white-muffin-phone.jpg"
            alt="Muffin holding smartphone"
            className="h-28 w-28 object-contain drop-shadow-xs"
          />
        </div>
      </section>

      {/* 3. Room Information Card */}
      {summary ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-ink-secondary px-0.5">
            ห้องที่คุณกำลังจะเข้าร่วม
          </span>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <p className="text-sm sm:text-base font-bold text-ink">
                ห้องของ {summary.hostName}
              </p>
              {isFull && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  ห้องเต็มแล้ว
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Room Code */}
              <div className="flex flex-col gap-0.5 rounded-xl bg-primary/5 p-2.5 border border-primary/10">
                <span className="text-[10px] font-bold text-ink-secondary">
                  รหัสห้อง
                </span>
                <span className="font-mono text-base font-black text-primary">
                  {roomCode}
                </span>
              </div>

              {/* Player Count */}
              <div className="flex flex-col gap-0.5 rounded-xl bg-gray-50 p-2.5 border border-gray-100">
                <span className="text-[10px] font-bold text-ink-secondary flex items-center gap-1">
                  <UsersIcon className="h-3 w-3 text-ink-secondary" />
                  <span>ผู้เล่นในห้อง</span>
                </span>
                <span className="text-base font-black text-ink">
                  {summary.currentPlayers} / {summary.maxPlayers} คน
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-6 text-center">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-bold text-red-600">ไม่พบห้องรหัส {roomCode}</p>
          <p className="text-xs text-ink-secondary">
            โปรดตรวจสอบรหัสห้องอีกครั้ง หรือกลับไปเลือกห้องในหน้าหลัก
          </p>
          <Link
            href="/"
            className="mt-1 rounded-xl bg-white px-4 py-2 text-xs font-bold text-primary border border-primary/20 shadow-xs"
          >
            กลับหน้าหลัก
          </Link>
        </div>
      )}

      {/* Form Area */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 flex-1">
        {/* 4. Player Name Field */}
        <div className="flex flex-col gap-1">
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
            disabled={!summary || isFull}
            className="w-full min-h-[50px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 placeholder:font-normal shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <p className="text-[11px] text-ink-secondary px-0.5">
            ชื่อที่แสดงให้เพื่อนในห้องเห็น
          </p>
        </div>

        {/* 5. Tips Panel */}
        <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-primary mb-0.5">
              <InfoIcon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold text-ink">เคล็ดลับ</span>
            </div>

            <ul className="flex flex-col gap-1 text-[11px] text-ink-secondary leading-snug">
              <li className="flex items-start gap-1">
                <span className="text-primary font-bold">•</span>
                <span>ตรวจสอบรหัสห้องให้ถูกต้อง</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-primary font-bold">•</span>
                <span>หากเข้าห้องไม่ได้ ลองให้เจ้าของห้องสร้างใหม่</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-primary font-bold">•</span>
                <span>เชื่อมต่ออินเทอร์เน็ตที่เสถียรเพื่อประสบการณ์ที่ดีที่สุด</span>
              </li>
            </ul>
          </div>

          {/* Decorative Muffin Mascot */}
          <div className="flex shrink-0 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/join-room/tips-muffin.jpg"
              alt="Muffin tips mascot"
              className="h-16 w-16 object-contain drop-shadow-xs"
            />
          </div>
        </div>

        {/* 6. Bottom CTA: เข้าร่วมห้อง */}
        <button
          type="submit"
          disabled={!name.trim() || !summary || isFull}
          className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
          <span>เข้าร่วมห้อง</span>
        </button>
      </form>
    </main>
  );
}
