'use client';

import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { PendingInteraction, RoomState } from '../../game/types';

export function DateInviteModal({
  interaction,
  state,
  onAccept,
  onRefuse,
}: {
  interaction: PendingInteraction | null;
  state: RoomState | null;
  onAccept: () => void;
  onRefuse: () => void;
  isOpen?: boolean;
}) {
  if (!interaction) return null;
  const initiatorName = state?.players[interaction.initiatorId]?.name ?? 'ผู้เล่น';

  return (
    <BottomSheet open={Boolean(interaction)} onClose={() => {}}>
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-3xl">
          💌
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-black uppercase tracking-wider text-pink-600">
            คำชวนไปเดต (TRAP T10)
          </span>
          <h2 className="text-xl font-black text-ink">
            {initiatorName} ชวนคุณไปเดต!
          </h2>
          <p className="text-sm text-ink-secondary">
            {initiatorName} ได้เปิดใช้งานกับดัก T10 เพื่อชวนคุณไปเดต คุณต้องการตอบรับหรือปฏิเสธ?
          </p>
        </div>

        <div className="rounded-2xl border border-pink-200 bg-pink-50/50 p-3 text-left text-xs text-pink-950">
          <p className="font-bold">⚠️ กฎของกับดัก T10:</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px] text-pink-900">
            <li>หากคุณ <b>ตอบรับ (Accept)</b>: คำชวนสำเร็จ กับดักจะไม่ทำงานและไม่ถูกขโมยไพ่</li>
            <li>หากคุณ <b>ปฏิเสธ (Refuse)</b>: เงื่อนไขกับดักสำเร็จ! {initiatorName} จะขโมยไพ่จากคุณ 3 ใบ</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <PrimaryButton onClick={onAccept}>
            💖 ตอบรับ (Accept Date)
          </PrimaryButton>
          <SecondaryButton onClick={onRefuse}>
            💔 ปฏิเสธ (Refuse Date)
          </SecondaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}
