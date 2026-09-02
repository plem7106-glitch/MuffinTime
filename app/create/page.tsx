'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import type { DevReactionScenario } from '../../lib/devReactionScenarios';
import { usePlayer } from '../../lib/player';
import {
  ChevronLeftIcon,
  UsersIcon,
  InfoIcon,
  EnterDoorIcon,
  UserIcon,
} from '../../components/ui/Icons';

type CreateMode = 'friends' | 'bots';

function CreateRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'bots' ? 'bots' : 'friends';
  const [mode, setMode] = useState<CreateMode>(initialMode);

  const { playerName, setPlayerName, playerBirthday, setPlayerBirthday } = usePlayer();
  const { createRoom, createBotRoom } = useGameSession();

  const [nameInput, setNameInput] = useState('');
  useEffect(() => {
    setNameInput(playerName);
  }, [playerName]);

  // "YYYY-MM-DD" for the native date input; only the MM-DD part is ever
  // persisted or sent anywhere (see usePlayer's playerBirthday).
  const [birthdayInput, setBirthdayInput] = useState('');
  useEffect(() => {
    setBirthdayInput(playerBirthday ? `2000-${playerBirthday}` : '');
  }, [playerBirthday]);
  const birthdayMMDD = birthdayInput ? birthdayInput.slice(5) : undefined;

  // Friends room state
  const [friendsMaxPlayers, setFriendsMaxPlayers] = useState(3);
  const [isCreatingFriends, setIsCreatingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState('');

  // Bot room state
  const [botMaxPlayers, setBotMaxPlayers] = useState(3);
  const [isCreatingBots, setIsCreatingBots] = useState(false);
  const [scenario, setScenario] = useState<DevReactionScenario | ''>('');

  // Submit Friends Room
  async function handleFriendsSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isCreatingFriends) return;
    const finalName = nameInput.trim() || 'ผู้เล่น';
    setPlayerName(finalName);
    if (birthdayMMDD) setPlayerBirthday(birthdayMMDD);
    setIsCreatingFriends(true);
    setFriendsError('');
    try {
      const code = await createRoom(friendsMaxPlayers, finalName, birthdayMMDD);
      router.push(`/room/${code}`);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
      setIsCreatingFriends(false);
    }
  }

  // Submit Bot Room
  function handleBotSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isCreatingBots) return;
    const finalName = nameInput.trim() || 'ผู้เล่น';
    setPlayerName(finalName);
    if (birthdayMMDD) setPlayerBirthday(birthdayMMDD);
    setIsCreatingBots(true);
    try {
      const code = createBotRoom(botMaxPlayers, finalName, birthdayMMDD, scenario || undefined);
      router.push(`/room/${code}`);
    } catch {
      setIsCreatingBots(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3.5 p-4 pb-8 bg-white">
      {/* Header */}
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

      {/* Mode Selector Tabs (1. Play with Friends, 2. Play with Bots) */}
      <section className="flex rounded-2xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setMode('friends')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all ${
            mode === 'friends'
              ? 'bg-white text-primary shadow-xs'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          <span>👥 เล่นกับเพื่อน (Online)</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('bots')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all ${
            mode === 'bots'
              ? 'bg-white text-primary shadow-xs'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          <span>🤖 เล่นกับบอท (Test Mode)</span>
        </button>
      </section>

      {/* Hero Banner */}
      <section className="flex items-center justify-between gap-3 py-1">
        <div className="flex w-28 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/create-room/white-muffin-card.jpg"
            alt="White Muffin holding Red Card"
            className="h-24 w-24 object-contain drop-shadow-xs"
          />
        </div>

        <div className="flex flex-col text-left flex-1 min-w-0">
          <h2 className="text-xl font-black text-ink leading-tight">
            {mode === 'friends' ? (
              <>
                <span className="text-primary">สร้างห้อง</span> เล่นกับเพื่อน
              </>
            ) : (
              <>
                <span className="text-primary">โหมดทดสอบ</span> บอท
              </>
            )}
          </h2>
          <p className="text-xs font-medium text-ink-secondary leading-snug mt-1">
            {mode === 'friends'
              ? 'สร้างห้องออนไลน์เพื่อชวนเพื่อนมาเล่นด้วยกัน'
              : 'ทดสอบหน้าจอและระบบการเล่นได้ทันที โดยไม่ต้องเข้าสู่ระบบ'}
          </p>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 1. PLAY WITH FRIENDS (ONLINE MULTIPLAYER — REQUIRES SUPABASE AUTH)         */}
      {/* ========================================================================= */}
      {mode === 'friends' && (
        <form onSubmit={handleFriendsSubmit} className="flex flex-col gap-3.5 flex-1">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-primary">
                  <UserIcon className="h-4 w-4" />
                  <label htmlFor="friendsPlayerName" className="text-sm font-bold text-ink">
                    ชื่อของคุณในเกม
                  </label>
                </div>
                <input
                  id="friendsPlayerName"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="กรอกชื่อของคุณ"
                  maxLength={20}
                  className="w-full min-h-[48px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-primary">
                  <span>🎂</span>
                  <label htmlFor="friendsBirthday" className="text-sm font-bold text-ink">
                    วันเกิด (ไม่บังคับ)
                  </label>
                </div>
                <p className="text-xs text-ink-secondary">ใช้กับการ์ดบางใบที่เกี่ยวกับวันเกิดเท่านั้น เก็บแค่วัน-เดือน ไม่เก็บปี</p>
                <input
                  id="friendsBirthday"
                  type="date"
                  value={birthdayInput}
                  onChange={(e) => setBirthdayInput(e.target.value)}
                  className="w-full min-h-[48px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-primary">
                  <UsersIcon className="h-4 w-4" />
                  <span className="text-sm font-bold text-ink">จำนวนผู้เล่น</span>
                </div>
                <p className="text-xs text-ink-secondary">
                  เลือกจำนวนผู้เล่นในห้อง (รองรับ 3 – 15 คน)
                </p>

                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mt-1">
                  <button
                    type="button"
                    onClick={() => setFriendsMaxPlayers((prev) => Math.max(3, prev - 1))}
                    disabled={friendsMaxPlayers <= 3}
                    aria-label="ลดจำนวนผู้เล่น"
                    className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    −
                  </button>

                  <span className="text-2xl font-black text-ink">{friendsMaxPlayers} คน</span>

                  <button
                    type="button"
                    onClick={() => setFriendsMaxPlayers((prev) => Math.min(15, prev + 1))}
                    disabled={friendsMaxPlayers >= 15}
                    aria-label="เพิ่มจำนวนผู้เล่น"
                    className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    +
                  </button>
                </div>

                <div className="flex justify-center mt-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0F3] px-3.5 py-1 text-xs font-bold text-primary border border-primary/10">
                    <span>⭐</span>
                    <span>แนะนำ 3 – 8 คน</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-200 my-0.5" />

              <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-primary mb-0.5">
                    <InfoIcon className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-bold text-ink">เกี่ยวกับจำนวนผู้เล่น</span>
                  </div>

                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-extrabold text-primary shrink-0 w-16">3 – 8 คน</span>
                    <span className="text-[11px] text-ink-secondary leading-tight">เกมสมดุลที่สุด เล่นสนุกและกระชับ</span>
                  </div>

                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-extrabold text-primary shrink-0 w-16">9 – 15 คน</span>
                    <span className="text-[11px] text-ink-secondary leading-tight">เหมาะกับปาร์ตี้ใหญ่ อาจมีเทิร์นรอนานขึ้น</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/create-room/brown-muffin-info.jpg"
                    alt="Muffin mascot"
                    className="h-16 w-16 object-contain drop-shadow-xs"
                  />
                </div>
              </div>

              {friendsError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
                  {friendsError}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreatingFriends}
                className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
                <span>{isCreatingFriends ? 'กำลังสร้างห้อง...' : 'สร้างห้องออนไลน์'}</span>
              </button>
        </form>
      )}

      {/* ========================================================================= */}
      {/* 2. PLAY WITH BOTS (LOCAL TEST MODE — NO LOGIN REQUIRED)                    */}
      {/* ========================================================================= */}
      {mode === 'bots' && (
        <form onSubmit={handleBotSubmit} className="flex flex-col gap-3.5 flex-1">
          {/* Player Display Name Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-primary">
              <UserIcon className="h-4 w-4" />
              <label htmlFor="botPlayerName" className="text-sm font-bold text-ink">
                ชื่อของคุณในเกม
              </label>
            </div>
            <input
              id="botPlayerName"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="กรอกชื่อของคุณ"
              maxLength={20}
              className="w-full min-h-[48px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink placeholder:text-gray-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {/* Player Birthday Input (optional) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-primary">
              <span>🎂</span>
              <label htmlFor="botBirthday" className="text-sm font-bold text-ink">
                วันเกิด (ไม่บังคับ)
              </label>
            </div>
            <p className="text-xs text-ink-secondary">ใช้กับการ์ดบางใบที่เกี่ยวกับวันเกิดเท่านั้น เก็บแค่วัน-เดือน ไม่เก็บปี</p>
            <input
              id="botBirthday"
              type="date"
              value={birthdayInput}
              onChange={(e) => setBirthdayInput(e.target.value)}
              className="w-full min-h-[48px] rounded-2xl border-2 border-primary/80 bg-white px-4 text-base font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {/* Number of Players Selector */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-primary">
              <UsersIcon className="h-4 w-4" />
              <span className="text-sm font-bold text-ink">จำนวนผู้เล่นรวม (คุณ + บอท)</span>
            </div>
            <p className="text-xs text-ink-secondary">
              เลือกจำนวนผู้เล่นในห้อง (3 – 15 คน)
            </p>

            <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mt-1">
              <button
                type="button"
                onClick={() => setBotMaxPlayers((prev) => Math.max(3, prev - 1))}
                disabled={botMaxPlayers <= 3}
                aria-label="ลดจำนวนผู้เล่น"
                className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
              >
                −
              </button>

              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-ink">{botMaxPlayers} คน</span>
                <span className="text-[10px] font-bold text-primary">
                  (คุณ 1 + บอท {botMaxPlayers - 1} ตัว)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setBotMaxPlayers((prev) => Math.min(15, prev + 1))}
                disabled={botMaxPlayers >= 15}
                aria-label="เพิ่มจำนวนผู้เล่น"
                className="flex h-12 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-xs transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
              >
                +
              </button>
            </div>
          </div>

          {/* Info Card */}
          <div className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-3.5 flex items-start gap-2.5">
            <InfoIcon className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div className="flex flex-col gap-1 text-[11px] text-ink-secondary leading-snug">
              <span className="font-bold text-ink">คำแนะนำการเล่นกับบอท:</span>
              <span>• บอทจะจั่วการ์ดและเล่นการ์ด Action อัตโนมัติเมื่อถึงเทิร์น</span>
              <span>• เหมาะสำหรับการทดสอบ UI, ตารางเกม, และลองใช้การ์ดต่างๆ</span>
            </div>
          </div>

          {process.env.NODE_ENV !== 'production' && (
            <label className="flex flex-col gap-1 text-xs font-bold text-ink">
              DEV Reaction Scenario
              <select value={scenario} onChange={(e) => setScenario(e.target.value as DevReactionScenario | '')} className="min-h-[44px] rounded-xl border border-primary/30 bg-white px-3">
                <option value="">Random Game</option>
                <option value="r1-simple-counter">R1 Simple Counter</option>
                <option value="r2-c35">R2 C35 Redirect</option>
                <option value="r5-counter-chain">R5 Counter-to-Counter</option>
                <option value="r6-multiple-responders">R6 Multiple Responders</option>
                <option value="r7-human-action-counter">R7 Human Action → Bot Counter</option>
                <option value="s1-c43">S1 C43 Target + Cancel</option>
                <option value="s2-c48">S2 C48 Draw</option>
                <option value="s3-c50">S3 C50 Steal</option>
                <option value="s4-c41">S4 C41 Pure Social</option>
                <option value="c01-a063">C01 A063 Steal Count</option>
              </select>
            </label>
          )}

          <button
            type="submit"
            disabled={isCreatingBots}
            className="mt-auto flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-black text-white shadow-[0_6px_18px_rgba(237,31,79,0.3)] transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
            <span>{isCreatingBots ? 'กำลังสร้างห้อง...' : 'เริ่มเล่นกับบอท'}</span>
          </button>
        </form>
      )}
    </main>
  );
}

export default function CreateRoomPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white">
          <p className="text-xs text-ink-secondary">กำลังโหลด...</p>
        </main>
      }
    >
      <CreateRoomContent />
    </Suspense>
  );
}
