'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

/**
 * For "needs a free-form number" Action cards (A135: pick the new Muffin
 * Time win target). Only card in this category so far -- see
 * needsNumberInput's doc comment in game/actionRules/types.ts.
 */
export function NumberInputModal({
  open,
  prompt,
  min = 1,
  max = 20,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  prompt: string;
  min?: number;
  max?: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(min);

  useEffect(() => {
    if (open) setValue(min);
  }, [open, min]);

  return (
    <BottomSheet open={open} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">เลือกจำนวน</h2>
        <p className="text-sm text-ink-secondary">{prompt}</p>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            setValue(Math.min(max, Math.max(min, n)));
          }}
          className="w-full rounded-card border border-ink/20 bg-card px-4 py-2 text-center text-lg font-bold text-ink"
        />
        <PrimaryButton tone="action" onClick={() => onConfirm(value)}>
          ยืนยัน
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
      </div>
    </BottomSheet>
  );
}
