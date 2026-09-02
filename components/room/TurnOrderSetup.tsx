'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { getTurnPreviewSequence } from '../../game/turn';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ClockwiseIcon,
  CounterClockwiseIcon,
  CrownIcon,
  LightbulbIcon,
  ChevronRightIcon,
  UsersIcon,
} from '../ui/Icons';

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

export function TurnOrderSetup() {
  const router = useRouter();
  const {
    activeRoom,
    myPlayerId,
    setSeatOrder,
    setPlayDirection,
    setGameSuggester,
    confirmTurnOrder,
    leaveRoom,
  } = useGameSession();

  const [isConfirming, setIsConfirming] = useState(false);

  if (!activeRoom) return null;

  const { state } = activeRoom;
  const isHost = myPlayerId === state.hostId;
  const playerIds = Object.keys(state.players);

  // Pure physical seat order without reversing; filters out any stale player IDs if someone left
  const seatOrder = useMemo(() => {
    const rawOrder =
      state.seatOrder && state.seatOrder.length > 0
        ? state.seatOrder
        : (state.joinOrder && state.joinOrder.length > 0 ? state.joinOrder : playerIds);
    return rawOrder.filter((id) => state.players[id] !== undefined);
  }, [state.seatOrder, state.joinOrder, state.players, playerIds]);

  const playDirection = state.playDirection ?? 'clockwise';

  // Stable avatar color assignment by player ID
  const playerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    playerIds.forEach((id, idx) => {
      map[id] = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    });
    return map;
  }, [playerIds]);

  // Turn Preview sequence calculated dynamically using direction without mutating seatOrder
  const turnPreview = useMemo(() => {
    return getTurnPreviewSequence(seatOrder, playDirection);
  }, [seatOrder, playDirection]);

  // Host: Move player up in physical seat order
  const handleMoveUp = (index: number) => {
    if (!isHost || index <= 0 || isConfirming) return;
    const newOrder = [...seatOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setSeatOrder(newOrder);
  };

  // Host: Move player down in physical seat order
  const handleMoveDown = (index: number) => {
    if (!isHost || index >= seatOrder.length - 1 || isConfirming) return;
    const newOrder = [...seatOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setSeatOrder(newOrder);
  };

  // Host: Toggle play direction
  const handleDirectionChange = (dir: 'clockwise' | 'counterclockwise') => {
    if (!isHost || isConfirming) return;
    setPlayDirection(dir);
  };

  // Host: Record who suggested playing this game (A118's steal target -- optional)
  const handleGameSuggesterChange = (playerId: string) => {
    if (!isHost || isConfirming || !playerId) return;
    setGameSuggester(playerId);
  };

  // Host: Confirm turn order and start gameplay
  const handleConfirm = () => {
    if (!isHost || isConfirming || seatOrder.length < 3) return;
    setIsConfirming(true);
    confirmTurnOrder();
  };

  const handleLeave = () => {
    leaveRoom();
    router.push('/');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4 pb-8 bg-gray-50/50">
      {/* 1. Header Section */}
      <header className="flex flex-col items-center text-center pt-1 pb-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-0.5 mb-1.5">
          <UsersIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-extrabold text-primary tracking-wide">
            ขั้นตอนก่อนเริ่มเกม
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
          กำหนดลำดับการเล่น
        </h1>
        <p className="text-xs font-semibold text-ink-secondary mt-0.5">
          ตกลงตำแหน่งและทิศทางการเล่นก่อนเริ่มเกม
        </p>
      </header>

      {/* 2. Helper Text Callout Card */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 p-3 shadow-xs">
        <LightbulbIcon className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="flex flex-col text-left">
          <p className="text-xs font-bold text-amber-950">
            ลำดับเริ่มต้นอ้างอิงจากลำดับที่เข้าห้อง
          </p>
          <p className="text-[11px] font-medium text-amber-800/90 mt-0.5 leading-snug">
            Host สามารถจัดลำดับให้ตรงกับตำแหน่งที่นั่งจริงได้
          </p>
        </div>
      </div>

      {/* 3. Seat Order Player List */}
      <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-black uppercase tracking-wider text-ink">
            ลำดับที่นั่ง ({seatOrder.length} คน)
          </h2>
          {isHost ? (
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Host ปรับตำแหน่งได้
            </span>
          ) : (
            <span className="text-[10px] font-bold text-ink-secondary bg-gray-100 px-2 py-0.5 rounded-full">
              มุมมองผู้เล่น
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {seatOrder.map((id, index) => {
            const player = state.players[id];
            if (!player) return null;
            const isPlayerHost = id === state.hostId;
            const isMe = id === myPlayerId;
            const colorClass = playerColorMap[id] || AVATAR_COLORS[0];
            const initial = player.name.charAt(0).toUpperCase() || 'P';

            return (
              <div
                key={id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/40 p-2.5 transition-all hover:border-gray-200 hover:bg-gray-50"
              >
                {/* Left: Seat Number + Avatar + Name + Badges */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Seat Number Badge */}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 text-xs font-black text-ink shadow-2xs">
                    {index + 1}
                  </span>

                  {/* Avatar */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black ${colorClass}`}
                  >
                    {initial}
                  </div>

                  {/* Name + Badges */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs sm:text-sm font-bold text-ink">
                      {player.name}
                    </span>
                    {isMe && (
                      <span className="rounded-full bg-gray-200/80 px-1.5 py-0.2 text-[9px] font-bold text-ink-secondary shrink-0">
                        คุณ
                      </span>
                    )}
                    {isPlayerHost && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.2 text-[9px] font-bold text-primary shrink-0">
                        <CrownIcon className="h-2.5 w-2.5 text-amber-500" />
                        <span>เจ้าของห้อง</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Host Reorder Controls (↑ / ↓) or Order Indicator */}
                {isHost ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      aria-label={`เลื่อน ${player.name} ขึ้น`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-ink transition-all hover:bg-gray-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === seatOrder.length - 1}
                      aria-label={`เลื่อน ${player.name} ลง`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-ink transition-all hover:bg-gray-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] font-bold text-ink-secondary shrink-0">
                    ตำแหน่งที่ {index + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Play Direction Controls */}
      <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-black uppercase tracking-wider text-ink">
            ทิศทางการเล่น
          </h2>
          {!isHost && (
            <span className="text-[11px] font-bold text-primary">
              {playDirection === 'clockwise' ? 'ตามเข็มนาฬิกา' : 'ทวนเข็มนาฬิกา'}
            </span>
          )}
        </div>

        {isHost ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDirectionChange('clockwise')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition-all active:scale-98 ${
                playDirection === 'clockwise'
                  ? 'border-2 border-primary bg-primary/10 text-primary shadow-xs font-black'
                  : 'border border-gray-200 bg-white text-ink hover:bg-gray-50'
              }`}
            >
              <ClockwiseIcon className="h-4 w-4" />
              <span>ตามเข็มนาฬิกา</span>
            </button>

            <button
              type="button"
              onClick={() => handleDirectionChange('counterclockwise')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition-all active:scale-98 ${
                playDirection === 'counterclockwise'
                  ? 'border-2 border-primary bg-primary/10 text-primary shadow-xs font-black'
                  : 'border border-gray-200 bg-white text-ink hover:bg-gray-50'
              }`}
            >
              <CounterClockwiseIcon className="h-4 w-4" />
              <span>ทวนเข็มนาฬิกา</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 py-2 text-xs font-bold text-ink">
            {playDirection === 'clockwise' ? (
              <>
                <ClockwiseIcon className="h-4 w-4 text-primary" />
                <span>ทิศทาง: ตามเข็มนาฬิกา</span>
              </>
            ) : (
              <>
                <CounterClockwiseIcon className="h-4 w-4 text-primary" />
                <span>ทิศทาง: ทวนเข็มนาฬิกา</span>
              </>
            )}
          </div>
        )}
      </section>

      {/* 4.5 Game Suggester Picker (A118's steal target -- optional, host-only) */}
      {(isHost || state.gameSuggesterId) && (
        <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-xs font-black uppercase tracking-wider text-ink">
              ใครเป็นคนชวนเล่นเกมนี้?
            </h2>
            <span className="text-[10px] font-bold text-ink-secondary bg-gray-100 px-2 py-0.5 rounded-full">
              ไม่บังคับ
            </span>
          </div>

          {isHost ? (
            <select
              value={state.gameSuggesterId ?? ''}
              disabled={isConfirming}
              onChange={(e) => handleGameSuggesterChange(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-ink disabled:opacity-50"
            >
              <option value="">ไม่ระบุ</option>
              {seatOrder.map((id) => {
                const player = state.players[id];
                if (!player) return null;
                return (
                  <option key={id} value={id}>
                    {player.name}
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 py-2 text-xs font-bold text-ink">
              {state.players[state.gameSuggesterId ?? '']?.name ?? 'ยังไม่ระบุ'}
            </div>
          )}
        </section>
      )}

      {/* 5. Turn Preview Section */}
      <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-black uppercase tracking-wider text-ink">
            ลำดับการเล่น (Turn Preview)
          </h2>
          <span className="text-[10px] font-bold text-ink-secondary">
            ทิศทาง: {playDirection === 'clockwise' ? 'ตามเข็มนาฬิกา' : 'ทวนเข็มนาฬิกา'}
          </span>
        </div>

        {/* Visual Sequence Preview Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-0.5 scrollbar-none">
          {turnPreview.map((id, idx) => {
            const player = state.players[id];
            if (!player) return null;
            const isFirst = idx === 0;
            const isLoopBack = idx === turnPreview.length - 1;
            const colorClass = playerColorMap[id] || AVATAR_COLORS[0];

            return (
              <div key={`preview-${idx}-${id}`} className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-2xs border ${
                    isFirst || isLoopBack
                      ? 'border-primary/40 bg-primary/5 text-primary font-black'
                      : 'border-gray-200 bg-white text-ink'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${colorClass}`}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  <span>{player.name}</span>
                  {isFirst && (
                    <span className="text-[9px] font-bold bg-primary text-white rounded-full px-1 py-0.2">
                      เริ่ม
                    </span>
                  )}
                </div>

                {!isLoopBack && (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-ink-secondary/70 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Guest Waiting Notice */}
      {!isHost && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs font-bold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
          <span>กำลังรอ Host กำหนดลำดับการเล่น...</span>
        </div>
      )}

      {/* 7. Bottom Action Buttons */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        {isHost && seatOrder.length < 3 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center text-xs font-bold text-amber-800">
            ต้องการผู้เล่นอย่างน้อย 3 คนในการเริ่มเกม (ปัจจุบันมี {seatOrder.length} คน)
          </div>
        )}

        {isHost ? (
          <>
            <button
              type="button"
              disabled={isConfirming || seatOrder.length < 3}
              onClick={handleConfirm}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-6 text-base font-black text-white shadow-[0_6px_16px_rgba(237,31,79,0.28)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <span>ยืนยันและเริ่มเกม</span>
            </button>


            <button
              type="button"
              onClick={handleLeave}
              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              ออกจากห้อง
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleLeave}
            className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-xs sm:text-sm font-bold text-ink-secondary hover:bg-gray-50 transition-colors active:scale-[0.98]"
          >
            ออกจากห้อง
          </button>
        )}
      </div>
    </main>
  );
}
