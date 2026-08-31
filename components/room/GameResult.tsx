'use client';

import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { checkWinnerAtTurnStart } from '../../game/turn';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

export function GameResult() {
  const router = useRouter();
  const { activeRoom, playAgain, leaveRoom } = useGameSession();

  if (!activeRoom) return null;
  const { state } = activeRoom;
  const winnerId = Object.keys(state.players).find((id) => checkWinnerAtTurnStart(state, id));
  const winnerName = winnerId ? state.players[winnerId].name : '—';

  function handleLeave() {
    leaveRoom();
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold text-primary">IT&apos;S MUFFIN TIME!</h1>
      <p className="text-lg font-bold text-ink">{winnerName} ชนะแล้ว!</p>
      <p className="text-sm text-ink-secondary">เริ่มเกมนี้ด้วยไพ่ {state.muffinTimeTarget} ใบพอดี</p>

      <div className="mt-4 flex w-full flex-col gap-2">
        <PrimaryButton onClick={playAgain}>เล่นอีกครั้ง</PrimaryButton>
        <SecondaryButton onClick={handleLeave}>ออกจากห้อง</SecondaryButton>
      </div>
    </main>
  );
}
