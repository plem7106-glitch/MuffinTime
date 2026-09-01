'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAudio } from '../../lib/audio';
import { Card } from '../card/Card';
import { getCardById } from '../../data/cards/index';
import { getCardDisplay } from '../../data/cards/display';
import { WarningIcon, ShieldIcon, CloseIcon } from '../ui/Icons';
import type { CardCode, PlayerId } from '../../game/types';




export function TrapAlertModal({
  open,
  trapCode,
  actorId,
  actorName,
  counterCards,
  responseId,
  onPlayCounter,
  onDecline,
}: {
  open: boolean;
  trapCode: CardCode | null;
  actorId?: PlayerId;
  actorName?: string;
  counterCards: CardCode[];
  responseId?: string;
  onPlayCounter: (code: CardCode) => void;
  onDecline: () => void;
}) {
  const { playTrapAlert } = useAudio();
  const [stage, setStage] = useState<'alert' | 'decision'>('alert');
  const [isSelectingCounter, setIsSelectingCounter] = useState(false);

  // Retrieve full Trap card info
  const fullTrapCard = useMemo(() => {
    if (!trapCode) return null;
    const fromDb = getCardById(trapCode);
    if (fromDb) return fromDb;
    try {
      const demo = getCardDisplay(trapCode);
      return {
        id: demo.code,
        number: 0,
        name_th: demo.th,
        name_en: demo.th,
        type: 'trap' as const,
        description_th: demo.effect,
        description_en: demo.effect,
        image: undefined,
      };
    } catch {
      return {
        id: trapCode,
        number: 0,
        name_th: trapCode,
        name_en: trapCode,
        type: 'trap' as const,
        description_th: 'กับดักทำงาน',
        description_en: 'Trap triggered',
        image: undefined,
      };
    }
  }, [trapCode]);

  // When a new trap response is received, play audio and start alert stage
  useEffect(() => {
    if (!open || !trapCode) {
      setStage('alert');
      setIsSelectingCounter(false);
      return;
    }

    // Play TRAP.mp3 alert
    playTrapAlert();
    setStage('alert');
    setIsSelectingCounter(false);

    // Transition from initial alert flash to decision state after 0.9s
    const timer = setTimeout(() => {
      setStage('decision');
    }, 900);

    return () => clearTimeout(timer);
  }, [open, trapCode, responseId, playTrapAlert]);

  if (!open || !trapCode || !fullTrapCard) return null;

  const hasCounters = counterCards.length > 0;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="trap-alert-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs select-none pointer-events-auto animate-in fade-in duration-200"
    >
      {/* 1. Stage 1: Initial Dramatic Alert Pop (0.0s - 0.9s) */}
      {stage === 'alert' && (
        <div className="relative flex w-full max-w-xs flex-col items-center justify-center rounded-3xl border-2 border-red-500 bg-gradient-to-b from-red-600 via-rose-600 to-pink-600 p-6 text-center text-white shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-in zoom-in-75 duration-200">
          {/* Urgent Glow & Pulse */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 shadow-inner mb-3 animate-bounce">
            <WarningIcon className="h-9 w-9 text-white stroke-[2.5]" />
          </div>

          <span className="rounded-full bg-white/25 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-white mb-1.5">
            TRAP TRIGGERED!
          </span>

          <h2 id="trap-alert-title" className="text-2xl font-black tracking-tight text-white drop-shadow-md">
            คุณโดนกับดัก!
          </h2>

          <p className="mt-1 text-xs font-bold text-white/90">
            {actorName ? `${actorName} ได้เปิดใช้กับดัก!` : 'มีกับดักเปิดทำงานใส่คุณ!'}
          </p>

          <div className="mt-4 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white animate-ping" />
            <span className="h-2 w-2 rounded-full bg-white/80" />
            <span className="h-2 w-2 rounded-full bg-white/60" />
          </div>
        </div>
      )}

      {/* 2. Stage 2: Trap Card + Counter Decision (From 0.9s onward) */}
      {stage === 'decision' && !isSelectingCounter && (
        <div className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border-2 border-red-200 bg-white p-4 sm:p-5 text-center shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
          {/* Header Title & Badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-red-100/80 px-3 py-1 text-red-600 border border-red-200 mb-2">
            <WarningIcon className="h-4 w-4 stroke-[2.5]" />
            <span className="text-xs font-black uppercase tracking-wide">คุณโดนกับดัก!</span>
          </div>

          <p className="text-xs text-ink-secondary mb-3 font-medium">
            {actorName ? <span className="font-bold text-ink">{actorName}</span> : 'ฝ่ายตรงข้าม'}{' '}
            เปิดกับดักใบนี้ใส่คุณ
          </p>

          {/* Actual Trap Card (Using reusable Card component) */}
          <div className="my-1 flex justify-center w-full">
            <div className="w-40 sm:w-44 shrink-0 shadow-md rounded-2xl overflow-hidden pointer-events-none">
              <Card
                card={fullTrapCard}
                type="trap"
                id={fullTrapCard.id}
                title={fullTrapCard.name_th}
                description={fullTrapCard.description_th}
                image={fullTrapCard.image}
                variant="full"
              />
            </div>
          </div>

          {/* Decision Prompt */}
          <h3 className="mt-3 text-sm sm:text-base font-black text-ink">
            {hasCounters ? 'จะใช้การ์ด Counter ไหม?' : 'คุณไม่มีการ์ด Counter ในมือ'}
          </h3>

          <p className="mt-0.5 text-[11px] text-ink-secondary mb-3.5">
            {hasCounters
              ? 'เลือกใช้การ์ดตอบโต้จากมือเพื่อยกเลิกผลของกับดักนี้'
              : 'กับดักนี้จะส่งผลต่อคุณทันทีเมื่อกดรับผล'}
          </p>

          {/* Action Buttons */}
          <div className="flex w-full flex-col gap-2">
            {hasCounters ? (
              <div className="flex w-full gap-2">
                {/* 1. Use Counter Button */}
                <button
                  type="button"
                  onClick={() => setIsSelectingCounter(true)}
                  className="flex-1 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00B4D8] via-[#0096C7] to-[#0077B6] px-3 py-2 text-xs sm:text-sm font-black text-white shadow-md shadow-cyan-500/25 transition-all hover:opacity-95 active:scale-[0.98]"
                >
                  <ShieldIcon className="h-4 w-4 stroke-[2.5]" />
                  <span>ใช้ Counter ({counterCards.length})</span>
                </button>

                {/* 2. Decline / Do Not Use Button */}
                <button
                  type="button"
                  onClick={onDecline}
                  className="flex-1 flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs sm:text-sm font-bold text-ink-secondary hover:bg-gray-100 active:scale-[0.98] transition-all"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                  <span>ไม่ใช้</span>
                </button>
              </div>
            ) : (
              /* No Counters in hand -> Clear Accept Trap Effect Button */
              <button
                type="button"
                onClick={onDecline}
                className="w-full flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-md shadow-red-500/25 transition-all hover:opacity-95 active:scale-[0.98]"
              >
                <span>รับผลกับดัก</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Sub-View: Counter Card Selection Tray (When "ใช้ Counter" is pressed) */}
      {stage === 'decision' && isSelectingCounter && (
        <div className="relative flex w-full max-w-md flex-col rounded-3xl border-2 border-cyan-200 bg-white p-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 text-cyan-600">
              <ShieldIcon className="h-4 w-4 stroke-[2.5]" />
              <span className="text-xs sm:text-sm font-black">เลือกการ์ด Counter ที่จะใช้</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSelectingCounter(false)}
              className="rounded-lg p-1 text-ink-secondary hover:bg-gray-100"
              aria-label="ย้อนกลับ"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>


          <p className="text-[11px] text-ink-secondary mt-2 mb-3">
            แตะการ์ด Counter ในมือที่คุณต้องการใช้ตอบโต้กับดักนี้
          </p>

          {/* Horizontal Scrollable Counter Cards List */}
          <div className="flex items-center gap-3 overflow-x-auto py-2 px-1 justify-center">
            {counterCards.map((code, idx) => {
              const fullCounter = getCardById(code);
              const demo = fullCounter ? null : getCardDisplay(code);
              const cardProps = fullCounter
                ? {
                    card: fullCounter,
                    type: 'counter' as const,
                    id: fullCounter.id,
                    title: fullCounter.name_th,
                    description: fullCounter.description_th,
                    image: fullCounter.image,
                  }
                : {
                    type: 'counter' as const,
                    id: code,
                    title: demo?.th ?? code,
                    description: demo?.effect ?? 'การ์ดตอบโต้',
                  };

              return (
                <div
                  key={`${code}-${idx}`}
                  className="w-32 sm:w-36 shrink-0 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  onClick={() => onPlayCounter(code)}
                >
                  <Card {...cardProps} variant="full" />
                </div>
              );
            })}
          </div>

          {/* Bottom Cancel Button */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex gap-2">
            <button
              type="button"
              onClick={() => setIsSelectingCounter(false)}
              className="flex-1 rounded-xl border border-gray-300 bg-white py-2 text-xs font-bold text-ink-secondary hover:bg-gray-50 active:scale-95 transition-all"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-bold text-red-600 hover:bg-gray-200 active:scale-95 transition-all"
            >
              ไม่ใช้ Counter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
