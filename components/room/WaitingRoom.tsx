'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import {
  ChevronLeftIcon,
  SettingsIcon,
  CopyIcon,
  CheckIcon,
  UsersIcon,
  CardsIcon,
  RotateCcwIcon,
  CrownIcon,
  PlayIcon,
  LightbulbIcon,
} from '../ui/Icons';

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

export function WaitingRoom() {
  const router = useRouter();
  const { activeRoom, myPlayerId, joinNextBot, leaveRoom, startGame } = useGameSession();
  const [copied, setCopied] = useState(false);

  // Prototype bot auto-join timer
  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount >= activeRoom.maxPlayers) return;
    const timer = setTimeout(() => joinNextBot(), 1200);
    return () => clearTimeout(timer);
  }, [activeRoom, joinNextBot]);

  // If host is a bot, auto-start when full
  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount < activeRoom.maxPlayers) return;
    if (!activeRoom.state.hostId.startsWith('bot-')) return;
    const timer = setTimeout(() => startGame(), 1200);
    return () => clearTimeout(timer);
  }, [activeRoom, startGame]);

  if (!activeRoom) return null;

  const { state, maxPlayers, code } = activeRoom;
  const isHost = myPlayerId === state.hostId;
  const playerIds = Object.keys(state.players);
  const playerCount = playerIds.length;
  const hostName = state.players[state.hostId]?.name ?? 'เจ้าของห้อง';
  const canStart = isHost && playerCount >= 3;
  const emptySlots = Math.max(maxPlayers - playerCount, 0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLeave = () => {
    leaveRoom();
    router.push('/');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4 pb-8 bg-white">
      {/* 1. Header */}
      <header className="flex items-center justify-between py-1">
        <button
          type="button"
          onClick={handleLeave}
          aria-label="ย้อนกลับไปหน้าหลัก"
          className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:text-primary active:scale-95"
        >
          <ChevronLeftIcon className="h-6 w-6 stroke-[2.5]" />
        </button>

        <div className="flex flex-col items-center text-center">
          <h1 className="text-base font-bold text-ink leading-tight">
            ห้องของ {hostName}
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-ink-secondary">รหัสห้อง: {code}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.2 text-[10px] font-bold text-emerald-600">
              รอผู้เล่น
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="ตั้งค่าห้อง"
          className="flex h-10 w-10 items-center justify-center text-ink-secondary transition-colors hover:text-primary active:scale-95"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </header>

      {/* 2. Share Room Code Card */}
      <section className="flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
        {/* Top Info */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/15 bg-primary/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/waiting-room/share-room-muffin.jpg"
                alt="Share Room Mascot"
                className="h-10 w-10 object-contain drop-shadow-xs"
              />
            </div>
            <div className="flex flex-col">
              <h2 className="text-sm font-black text-ink">แชร์รหัสห้อง</h2>
              <p className="text-[11px] text-ink-secondary">
                ให้เพื่อนเข้าร่วมได้เลย!
              </p>
            </div>
          </div>
        </div>

        {/* Room Code Banner + Copy Action */}
        <div className="flex items-center justify-between rounded-xl border border-[#FED7DE] bg-[#FFF5F7] px-3.5 py-2.5">
          <span className="font-mono text-2xl sm:text-3xl font-black text-primary tracking-[0.25em] pl-1">
            {code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-primary border border-primary/20 shadow-xs transition-all hover:bg-primary/5 active:scale-95"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600">คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" />
                <span>คัดลอก</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 3. Game Information Cards (3 items in 1 row) */}
      <section className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center text-center rounded-2xl border border-gray-100 bg-white p-2.5 shadow-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary mb-1">
            <UsersIcon className="h-4 w-4" />
          </div>
          <span className="text-xs font-black text-ink leading-tight">3–15 คน</span>
          <span className="text-[10px] text-ink-secondary mt-0.5">ผู้เล่น 3–15 คน</span>
        </div>

        <div className="flex flex-col items-center text-center rounded-2xl border border-gray-100 bg-white p-2.5 shadow-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary mb-1">
            <CardsIcon className="h-4 w-4" />
          </div>
          <span className="text-xs font-black text-ink leading-tight">231 ใบ</span>
          <span className="text-[10px] text-ink-secondary mt-0.5">ไพ่ทั้งหมดในเกม</span>
        </div>

        <div className="flex flex-col items-center text-center rounded-2xl border border-gray-100 bg-white p-2.5 shadow-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary mb-1">
            <RotateCcwIcon className="h-4 w-4" />
          </div>
          <span className="text-xs font-black text-ink leading-tight">ผลัดกันเล่น</span>
          <span className="text-[10px] text-ink-secondary mt-0.5">รูปแบบการเล่น</span>
        </div>
      </section>

      {/* 4. Player Section */}
      <section className="flex flex-col gap-2 pt-1">
        {/* Section Header */}
        <div className="flex items-center px-0.5">
          <h3 className="text-sm font-bold text-ink">
            ผู้เล่นในห้อง ({playerCount} / {maxPlayers})
          </h3>
        </div>

        {/* Player List */}
        <div className="flex flex-col gap-2">
          {playerIds.map((id, index) => {
            const player = state.players[id];
            const isPlayerHost = id === state.hostId;
            const isMe = id === myPlayerId;
            const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const initial = player.name.charAt(0).toUpperCase() || 'P';

            return (
              <div
                key={id}
                className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-3 shadow-xs transition-all hover:border-gray-200"
              >
                {/* Left: Avatar + Name + Badges */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black ${colorClass}`}
                  >
                    {initial}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs sm:text-sm font-bold text-ink">
                      {player.name}
                    </span>
                    {isMe && (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[9px] font-bold text-ink-secondary shrink-0">
                        คุณ
                      </span>
                    )}
                    {isPlayerHost && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.2 text-[9px] font-bold text-primary shrink-0">
                        <CrownIcon className="h-2.5 w-2.5 text-amber-500" />
                        <span>เจ้าของห้อง</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Online Status */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 shrink-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>ออนไลน์</span>
                </div>
              </div>
            );
          })}

          {/* Empty Waiting Slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-2.5 rounded-2xl border border-dashed border-gray-200 bg-gray-50/40 p-3 text-ink-secondary"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200/50 text-xs font-bold text-gray-400">
                ?
              </div>
              <span className="text-xs font-medium text-gray-400">
                รอผู้เล่น...
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Waiting Info / Rule Message */}
      <div className="flex items-center gap-2 rounded-2xl bg-[#FFF5F7] border border-[#FFE4E8] p-3 text-xs text-ink-secondary mt-1">
        <LightbulbIcon className="h-4 w-4 shrink-0 text-primary" />
        <span className="leading-tight">
          เมื่อมีผู้เล่นครบอย่างน้อย 3 คน เจ้าของห้องสามารถเริ่มเกมได้
        </span>
      </div>

      {/* 6. Host & Guest Actions */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        {isHost ? (
          <>
            <button
              type="button"
              disabled={!canStart}
              onClick={startGame}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-6 text-base font-black text-white shadow-[0_6px_16px_rgba(237,31,79,0.28)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <PlayIcon className="h-4 w-4" />
              <span>เริ่มเกม ({playerCount >= 3 ? 'พร้อมเริ่ม' : `ต้องการอีก ${3 - playerCount} คน`})</span>
            </button>

            <button
              type="button"
              onClick={handleLeave}
              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              ออกจากห้อง
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/10 bg-primary/5 py-3 text-xs font-bold text-primary">
              <span className="animate-spin">⏳</span>
              <span>กำลังรอเจ้าของห้องเริ่มเกม...</span>
            </div>

            <button
              type="button"
              onClick={handleLeave}
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              ออกจากห้อง
            </button>
          </>
        )}
      </div>
    </main>
  );
}
