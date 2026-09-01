'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GameBenefits } from '../components/lobby/GameBenefits';
import { JoinRoomModal } from '../components/lobby/JoinRoomModal';
import { useAudio } from '../lib/audio';
import { useAuth } from '../lib/auth';
import {
  MenuIcon,
  PlusIcon,
  BookOpenIcon,
  ChevronRightIcon,
  CardsIcon,
  EnterDoorIcon,
  MusicIcon,
  MusicOffIcon,
  VolumeIcon,
  VolumeOffIcon,
} from '../components/ui/Icons';

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { isMusicEnabled, isSfxEnabled, toggleMusic, toggleSfx } = useAudio();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4 pb-8 bg-white">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="text-2xl font-black tracking-tight text-primary">
            Muffin Time
          </span>
        </Link>

        <div className="relative">
          <button
            type="button"
            aria-label="เมนูหลัก"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:text-primary active:scale-95"
          >
            <MenuIcon className="h-6 w-6 stroke-[2.5]" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-11 z-50 flex w-52 flex-col gap-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
              <Link
                href="/create"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <PlusIcon className="h-4 w-4 text-primary" />
                <span>สร้างห้องใหม่</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsJoinModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors w-full text-left"
              >
                <EnterDoorIcon className="h-4 w-4 text-primary" />
                <span>เข้าร่วมห้อง</span>
              </button>
              <Link
                href="/how-to-play"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <BookOpenIcon className="h-4 w-4 text-primary" />
                <span>วิธีเล่นเกม</span>
              </Link>
              <Link
                href="/cards"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <CardsIcon className="h-4 w-4 text-primary" />
                <span>คลังการ์ด 231 ใบ</span>
              </Link>

              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={toggleMusic}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-gray-50 transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2">
                  {isMusicEnabled ? (
                    <MusicIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <MusicOffIcon className="h-4 w-4 text-gray-400" />
                  )}
                  <span>เพลงประกอบ</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isMusicEnabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isMusicEnabled ? 'เปิด' : 'ปิด'}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleSfx}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-gray-50 transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2">
                  {isSfxEnabled ? (
                    <VolumeIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <VolumeOffIcon className="h-4 w-4 text-gray-400" />
                  )}
                  <span>เสียงเอฟเฟกต์</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isSfxEnabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isSfxEnabled ? 'เปิด' : 'ปิด'}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex items-center justify-between gap-3 py-1">
        <div className="flex w-[150px] shrink-0 flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/hero/muffin-time-logo.jpg"
            alt="Muffin Time Logo"
            className="w-36 max-w-none object-contain drop-shadow-xs"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/hero/white-muffin-hero.jpg"
            alt="White Muffin Mascot"
            className="w-28 h-28 object-contain -mt-5 drop-shadow-xs"
          />
        </div>

        <div className="flex flex-col text-left flex-1 min-w-0 pr-1">
          <h2 className="text-[22px] font-black leading-[1.2] text-ink tracking-tight">
            <span className="text-primary font-black">เกมไพ่</span>สุดป่วน
            <br />
            สำหรับทุกคน!
          </h2>
          <p className="text-xs font-medium leading-snug text-ink-secondary mt-1.5">
            สร้างห้อง หรือเข้าร่วมห้อง
            <br />
            แล้วมาเริ่มความป่วนกันเลย!
          </p>
        </div>
      </section>

      {/* Primary & Secondary Action Buttons */}
      <div className="flex flex-col gap-2">
        <Link
          href="/create"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-6 text-base font-extrabold text-white shadow-[0_6px_16px_rgba(237,31,79,0.28)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <PlusIcon className="h-5 w-5 stroke-[3]" />
          <span>สร้างห้องใหม่</span>
        </Link>

        <button
          type="button"
          onClick={() => setIsJoinModalOpen(true)}
          className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/80 bg-white px-6 text-base font-extrabold text-primary shadow-[0_2px_8px_rgba(237,31,79,0.06)] transition-all hover:bg-primary/5 active:scale-[0.98]"
        >
          <span>เข้าร่วมห้อง</span>
        </button>
      </div>

      <GameBenefits />

      <Link
        href="/how-to-play"
        className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all hover:border-primary/30 active:scale-[0.99]"
      >
        <div className="flex items-center gap-2.5">
          <BookOpenIcon className="h-4 w-4 text-primary" />
          <span>วิธีเล่น / HOW TO PLAY</span>
        </div>
        <ChevronRightIcon className="h-3.5 w-3.5 text-ink-secondary" />
      </Link>

      <JoinRoomModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
      />
    </main>
  );
}
