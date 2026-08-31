'use client';

import { useState } from 'react';

export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is already visible on screen
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-secondary">รหัสห้อง: {code}</span>
      <button onClick={handleCopy} className="text-sm font-semibold text-primary">
        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
      </button>
    </div>
  );
}
