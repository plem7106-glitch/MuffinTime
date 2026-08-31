'use client';

import { useState, useEffect } from 'react';
import type { PlayerId, PlayerState } from '../../game/types';
import { CloseIcon, CrownIcon, WarningIcon, CheckIcon } from '../ui/Icons';


const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

export function ManualFinishModal({
  isOpen,
  seatOrder,
  players,
  hostId,
  myPlayerId,
  onClose,
  onConfirmWinner,
}: {
  isOpen: boolean;
  seatOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  hostId: PlayerId;
  myPlayerId: PlayerId;
  onClose: () => void;
  onConfirmWinner: (winnerId: PlayerId) => void;
}) {
  const [selectedWinnerId, setSelectedWinnerId] = useState<PlayerId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedWinnerId(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;


  const isHost = myPlayerId === hostId;
  const selectedPlayer = selectedWinnerId ? players[selectedWinnerId] : null;

  const handleConfirm = () => {
    if (!isHost || !selectedWinnerId || isSubmitting) return;
    setIsSubmitting(true);
    onConfirmWinner(selectedWinnerId);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="flex w-full max-w-sm flex-col rounded-3xl border border-gray-100 bg-white p-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <CrownIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-ink">จบเกม (Host)</h2>
              <p className="text-[11px] font-semibold text-ink-secondary">
                เลือกผู้ชนะของเกมนี้
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Warning Callout */}
        <div className="my-2.5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/80 p-2.5">
          <WarningIcon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold text-amber-900 leading-snug">
            ใช้สำหรับกรณีที่ต้องการจบเกมด้วยตนเอง การกระทำนี้จะสิ้นสุดรอบการเล่นทันที
          </p>
        </div>

        {/* Player List in Seat Order */}
        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto py-1 pr-0.5">
          {seatOrder.map((id, index) => {
            const player = players[id];
            if (!player) return null;

            const isSelected = selectedWinnerId === id;
            const isPlayerHost = id === hostId;
            const isMe = id === myPlayerId;
            const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const initial = player.name.charAt(0).toUpperCase() || 'P';

            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedWinnerId(id)}
                className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-xs ring-2 ring-primary/30'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black ${colorClass}`}
                  >
                    {initial}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs sm:text-sm font-bold text-ink">
                      {player.name}
                    </span>
                    {isMe && (
                      <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full shrink-0">
                        คุณ
                      </span>
                    )}
                    {isPlayerHost && (
                      <CrownIcon className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>

                {/* Selection Indicator */}
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <CheckIcon className="h-3 w-3 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            disabled={!selectedWinnerId || isSubmitting || !isHost}
            onClick={handleConfirm}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 px-4 text-xs sm:text-sm font-black text-white shadow-md shadow-red-500/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <span>
              {selectedPlayer
                ? `ยืนยันให้ ${selectedPlayer.name} ชนะ`
                : 'ยืนยันผู้ชนะ'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex min-h-[40px] w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
