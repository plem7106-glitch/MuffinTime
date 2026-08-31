'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { EnterDoorIcon, InfoIcon } from '../ui/Icons';

export interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CODE_LENGTH = 4;

export function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const router = useRouter();
  const { rooms } = useGameSession();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(Array(CODE_LENGTH).fill(''));
      setError('');
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (index: number, val: string) => {
    setError('');
    const char = val.slice(-1).toUpperCase().trim();
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto-advance to next input if character was entered
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError('');
    const pasted = e.clipboardData.getData('text').trim().toUpperCase().replace(/\s+/g, '');
    if (!pasted) return;

    const chars = pasted.slice(0, CODE_LENGTH).split('');
    const newDigits = [...digits];
    for (let i = 0; i < CODE_LENGTH; i++) {
      newDigits[i] = chars[i] || '';
    }
    setDigits(newDigits);

    const nextIndex = Math.min(chars.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = digits.join('').trim();
    if (code.length < CODE_LENGTH) return;

    const targetRoom = rooms.find((r) => r.code === code);
    if (!targetRoom) {
      setError('ไม่พบห้องนี้');
      return;
    }

    if (targetRoom.currentPlayers >= targetRoom.maxPlayers) {
      setError('ห้องนี้เต็มแล้ว');
      return;
    }

    setError('');
    onClose();
    router.push(`/join/${code}`);
  };

  const isComplete = digits.every((d) => d.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Modal Dialog */}
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleJoin} className="flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-1">
              <EnterDoorIcon className="h-5 w-5 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-black text-ink">เข้าร่วมห้อง</h3>
            <p className="text-xs text-ink-secondary">
              กรอกรหัสห้องที่ได้รับจากเพื่อน
            </p>
          </div>

          {/* Separate OTP-Style Room Code Boxes */}
          <div className="flex justify-center items-center gap-2.5 my-1">
            {digits.map((digit, idx) => {
              const isFocused = inputRefs.current[idx] === document.activeElement;
              return (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  className={`h-14 w-13 text-center font-mono text-2xl font-black rounded-2xl border-2 transition-all focus:outline-none ${
                    error
                      ? 'border-red-400 bg-red-50/50 text-red-600'
                      : digit
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 bg-gray-50/60 text-ink focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15'
                  }`}
                />
              );
            })}
          </div>

          {/* Inline Error Message */}
          {error && (
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200/60 -mt-1">
              <InfoIcon className="h-3.5 w-3.5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            {/* Primary Join Button */}
            <button
              type="submit"
              disabled={!isComplete}
              className="flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] text-sm sm:text-base font-black text-white shadow-[0_4px_14px_rgba(237,31,79,0.3)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              เข้าร่วม
            </button>

            {/* Secondary Cancel Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary transition-colors hover:bg-gray-50 active:scale-[0.98]"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
