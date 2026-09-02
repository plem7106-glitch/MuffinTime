'use client';

import { usePresentation } from '../../lib/presentation/presentationContext';
import { formatLiveStatus } from '../../lib/presentation/liveStatusFormatter';
import type { PlayerId, PlayerState } from '../../game/types';

interface LiveGameStatusProps {
  viewerId: PlayerId;
  players: Record<PlayerId, PlayerState>;
}

export function LiveGameStatus({ viewerId, players }: LiveGameStatusProps) {
  const { liveStatus } = usePresentation();

  const formatted = formatLiveStatus(liveStatus, viewerId, players);

  if (!formatted) return null;

  const { text, subtext, isViewerTargeted, isViewerActionRequired } = formatted;

  return (
    <div className="flex w-full justify-center px-1 pointer-events-none z-10 shrink-0 my-0.5 animate-in fade-in duration-200">
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border px-4 py-2 text-center shadow-lg transition-all duration-300 backdrop-blur-md max-w-sm w-full ${
          isViewerActionRequired
            ? 'border-amber-400/80 bg-gradient-to-r from-amber-950/90 via-amber-900/90 to-amber-950/90 text-amber-100 ring-2 ring-amber-400/50 animate-pulse'
            : isViewerTargeted
            ? 'border-rose-500/80 bg-gradient-to-r from-rose-950/90 via-rose-900/90 to-rose-950/90 text-rose-100 ring-2 ring-rose-500/50'
            : 'border-slate-700/80 bg-slate-900/85 text-slate-100 shadow-slate-950/40'
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {isViewerActionRequired || isViewerTargeted ? (
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          ) : (
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-black tracking-wide leading-tight drop-shadow-sm">
            {text}
          </span>
        </div>

        {subtext ? (
          <span className="text-[10px] sm:text-xs font-semibold text-amber-200/90 mt-0.5 animate-pulse">
            {subtext}
          </span>
        ) : null}
      </div>
    </div>
  );
}
