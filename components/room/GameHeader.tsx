'use client';

import { SettingsIcon, ChevronLeftIcon } from '../ui/Icons';

export function GameHeader({
  hostName,
  code,
  onOpenSettings,
  onLeavePrompt,
}: {
  hostName: string;
  code: string;
  onOpenSettings: () => void;
  onLeavePrompt?: () => void;
}) {
  return (
    <header className="flex items-center justify-between py-1 px-0.5 select-none shrink-0">
      {/* Left: Back / Leave Prompt + Room Info */}
      <div className="flex items-center gap-2 min-w-0">
        {onLeavePrompt && (
          <button
            type="button"
            onClick={onLeavePrompt}
            aria-label="ย้อนกลับ / ออกจากห้อง"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-gray-100 active:scale-95"
          >
            <ChevronLeftIcon className="h-5 w-5 stroke-[2.5]" />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <h1 className="truncate text-xs sm:text-sm font-black text-ink leading-tight">
            ห้องของ {hostName}
          </h1>
          <span className="text-[10px] font-bold text-ink-secondary tracking-wide">
            รหัสห้อง: <span className="font-mono font-black text-primary">{code}</span>
          </span>
        </div>
      </div>

      {/* Right: Settings / Gear Button */}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="การตั้งค่าเกม"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-ink shadow-2xs transition-colors hover:bg-gray-50 hover:text-primary active:scale-95"
      >
        <SettingsIcon className="h-4 w-4 stroke-[2.2]" />
      </button>
    </header>
  );
}
