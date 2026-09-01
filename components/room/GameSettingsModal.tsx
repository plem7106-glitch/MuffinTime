'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { useAudio } from '../../lib/audio';
import {
  SettingsIcon,
  CloseIcon,
  BookOpenIcon,
  CardsIcon,
  MusicIcon,
  MusicOffIcon,
  VolumeIcon,
  VolumeOffIcon,
  EnterDoorIcon,
  ShuffleIcon,
} from '../ui/Icons';


export function GameSettingsModal({
  isOpen,
  isHost = false,
  onClose,
  onOpenCardGallery,
  onOpenShuffleConfirm,
  isShuffleDisabled = false,
  shuffleDisabledReason,
  onOpenManualFinish,
  onHostUnstick,
  hostUnstickLabel,
}: {
  isOpen: boolean;
  isHost?: boolean;
  onClose: () => void;
  onOpenCardGallery: () => void;
  onOpenShuffleConfirm?: () => void;
  isShuffleDisabled?: boolean;
  shuffleDisabledReason?: string;
  onOpenManualFinish?: () => void;
  onHostUnstick?: () => void;
  hostUnstickLabel?: string;
}) {

  const router = useRouter();
  const { leaveRoom } = useGameSession();
  const { isMusicEnabled, isSfxEnabled, toggleMusic, toggleSfx } = useAudio();
  const [showRules, setShowRules] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (!isOpen) return null;

  const handleConfirmLeave = () => {
    leaveRoom();
    onClose();
    router.push('/');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Main Settings Modal Container */}
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-ink">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <h2 className="text-base font-black text-ink">เมนูการตั้งค่า</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนูการตั้งค่า"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Menu Options */}
        <div className="flex flex-col gap-1.5 py-3">
          {/* 1. Rules (กติกาการเล่น) */}
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-3 text-xs font-bold text-ink hover:bg-primary/5 hover:text-primary transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <BookOpenIcon className="h-4 w-4 text-primary" />
              <span>กติกาการเล่น</span>
            </div>
            <span className="text-[10px] text-ink-secondary">วิธีเล่นฉบับย่อ →</span>
          </button>

          {/* 2. Card Gallery (ดูข้อมูลไพ่) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCardGallery();
            }}
            className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-3 text-xs font-bold text-ink hover:bg-primary/5 hover:text-primary transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <CardsIcon className="h-4 w-4 text-primary" />
              <span>ดูข้อมูลไพ่ (231 ใบ)</span>
            </div>
            <span className="text-[10px] text-ink-secondary">ค้นหาการ์ด →</span>
          </button>

          {/* 3. Audio Controls */}
          <div className="my-1 border-t border-gray-100 pt-2" />
          <span className="px-1 text-[10px] font-bold text-ink-secondary uppercase tracking-wider">
            เสียงประกอบ
          </span>

          <div className="grid grid-cols-2 gap-2 mt-0.5">
            <button
              type="button"
              onClick={toggleMusic}
              className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-bold transition-all ${
                isMusicEnabled
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isMusicEnabled ? <MusicIcon className="h-4 w-4" /> : <MusicOffIcon className="h-4 w-4" />}
                <span>เพลง</span>
              </div>
              <span className="text-[10px] font-black">{isMusicEnabled ? 'เปิด' : 'ปิด'}</span>
            </button>

            <button
              type="button"
              onClick={toggleSfx}
              className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-bold transition-all ${
                isSfxEnabled
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isSfxEnabled ? <VolumeIcon className="h-4 w-4" /> : <VolumeOffIcon className="h-4 w-4" />}
                <span>เอฟเฟกต์</span>
              </div>
              <span className="text-[10px] font-black">{isSfxEnabled ? 'เปิด' : 'ปิด'}</span>
            </button>
          </div>

          {/* 4. Host-only: Shuffle Draw Pile */}
          {isHost && onOpenShuffleConfirm && (
            <>
              <div className="my-1 border-t border-gray-100 pt-2" />
              <button
                type="button"
                disabled={isShuffleDisabled}
                onClick={() => {
                  onClose();
                  onOpenShuffleConfirm();
                }}
                className={`flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-3.5 text-xs font-bold transition-all ${
                  isShuffleDisabled
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-75'
                    : 'border-blue-200 bg-blue-50/70 text-blue-900 hover:bg-blue-100/80 active:scale-[0.98]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShuffleIcon className="h-4 w-4 text-blue-600" />
                  <span>สับกองไพ่</span>
                </div>
                {isShuffleDisabled && shuffleDisabledReason ? (
                  <span className="text-[9px] font-medium text-gray-500">
                    {shuffleDisabledReason}
                  </span>
                ) : (
                  <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-800 uppercase tracking-wide">
                    Host เท่านั้น
                  </span>
                )}
              </button>
            </>
          )}

          {/* 5. Host-only: Manual Finish Game */}
          {isHost && onOpenManualFinish && (
            <>
              <div className="my-1 border-t border-gray-100 pt-2" />
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManualFinish();
                }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-amber-300/80 bg-amber-50/80 px-3.5 text-xs font-black text-amber-900 hover:bg-amber-100 transition-colors active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                  <span>จบเกม (เลือกผู้ชนะ)</span>
                </div>
                <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[9px] font-black text-amber-950 uppercase tracking-wide">
                  Host เท่านั้น
                </span>
              </button>
            </>
          )}

          {/* 5.5. Host-only: Unstick a hung turn / response window (e.g. a player left mid-game) */}
          {isHost && onHostUnstick && (
            <>
              <div className="my-1 border-t border-gray-100 pt-2" />
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onHostUnstick();
                }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50/70 px-3.5 text-xs font-bold text-ink-secondary hover:bg-gray-100 transition-colors active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-gray-400" />
                  <span>{hostUnstickLabel ?? 'บังคับข้ามที่ค้าง'}</span>
                </div>
                <span className="text-[9px] text-gray-400">ใช้เมื่อเกมค้าง</span>
              </button>
            </>
          )}

          {/* 6. Leave Room */}
          <div className="my-1 border-t border-gray-100 pt-2" />
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors active:scale-[0.98]"
          >
            <EnterDoorIcon className="h-4 w-4" />
            <span>ออกจากห้อง</span>
          </button>
        </div>



        {/* Leave Confirmation Overlay */}
        {showLeaveConfirm && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-white p-5 text-center shadow-xl animate-in fade-in duration-150">
            <h3 className="text-base font-black text-ink">ยืนยันการออกจากห้อง?</h3>
            <p className="text-xs text-ink-secondary mt-1">
              การออกจากห้องจะทำให้คุณออกจากการเล่นในรอบนี้ทันที
            </p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
              >
                ออกจากห้อง
              </button>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Rules Sheet Overlay */}
        {showRules && (
          <div className="absolute inset-0 z-20 flex flex-col rounded-3xl bg-white p-4 shadow-xl animate-in fade-in duration-150 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpenIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-black text-ink">กติกาการเล่นฉบับย่อ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 text-xs leading-relaxed text-ink space-y-2.5">
              <div className="rounded-xl bg-primary/5 p-2.5 border border-primary/10">
                <span className="font-black text-primary">🧁 เป้าหมายชนะเกม:</span>
                <p className="text-ink-secondary mt-0.5">
                  สะสมไพ่ในมือให้ครบ <strong>10 ใบ</strong> และประกาศ <em>&quot;Muffin Time!&quot;</em> หากถึงรอบเทิร์นถัดไปของคุณแล้วยังมีไพ่ครบ 10 ใบ คุณจะชนะทันที!
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-ink">ในเทิร์นของคุณ (เลือกทำ 1 อย่าง):</span>
                <ul className="list-disc pl-4 text-ink-secondary space-y-0.5">
                  <li><strong>จั่วไพ่ 1 ใบ</strong> จากกองจั่ว</li>
                  <li><strong>ใช้ไพ่ Action 1 ใบ</strong> เพื่อสร้างความป่วน</li>
                  <li><strong>วางไพ่ Trap 1 ใบ</strong> คว่ำหน้าไว้บนโต๊ะ (สูงสุด 3 ใบ)</li>
                </ul>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-ink">ประเภทไพ่:</span>
                <ul className="list-disc pl-4 text-ink-secondary space-y-0.5">
                  <li><strong className="text-action">Action (สีฟ้า):</strong> ใช้ในเทิร์นของคุณเพื่อเล่นผลเอฟเฟกต์</li>
                  <li><strong className="text-trap">Trap (สีแดง):</strong> วางไว้บนโต๊ะ เปิดใช้เมื่อผู้เล่นคนอื่นทำตามเงื่อนไข</li>
                  <li><strong className="text-counter">Counter (สีเขียว):</strong> ใช้ขัดขวางการ์ดคนอื่นได้ทันทีเมื่อถูกใช้งาน</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
