'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { GameHeader } from './GameHeader';
import { PlayerList } from './PlayerList';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

export function WaitingRoom() {
  const router = useRouter();
  const { activeRoom, myPlayerId, joinNextBot, leaveRoom, startGame } = useGameSession();

  useEffect(() => {
    if (!activeRoom) return;
    const currentCount = Object.keys(activeRoom.state.players).length;
    if (currentCount >= activeRoom.maxPlayers) return;
    const timer = setTimeout(() => joinNextBot(), 900);
    return () => clearTimeout(timer);
  }, [activeRoom, joinNextBot]);

  if (!activeRoom) return null;
  const { state, maxPlayers, code } = activeRoom;
  const isHost = myPlayerId === state.hostId;
  const playerCount = Object.keys(state.players).length;
  const canStart = isHost && playerCount >= 3 && playerCount === maxPlayers;

  function handleLeave() {
    leaveRoom();
    router.push('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <GameHeader hostName={state.players[state.hostId].name} code={code} />
      <p className="text-sm text-ink-secondary">
        {playerCount} / {maxPlayers} คน
      </p>
      <PlayerList players={state.players} hostId={state.hostId} maxPlayers={maxPlayers} />

      <div className="mt-auto flex flex-col gap-2">
        {isHost ? (
          <PrimaryButton disabled={!canStart} onClick={startGame}>
            เริ่มเกม
          </PrimaryButton>
        ) : (
          <p className="text-center text-sm text-ink-secondary">รอเจ้าของห้องเริ่มเกม...</p>
        )}
        <SecondaryButton onClick={handleLeave}>ออกจากห้อง</SecondaryButton>
      </div>
    </main>
  );
}
