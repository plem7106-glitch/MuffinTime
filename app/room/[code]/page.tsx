'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { usePlayer } from '../../../lib/player';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const roomCode = params.code || '';
  const { playerId } = usePlayer();
  const { activeRoom, myPlayerId, error, resumeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();
  const resumeAttemptRef = useRef<string | null>(null);

  // Direct navigation or a page refresh lands here with no activeRoom yet — fetch + subscribe (or load bot room).
  useEffect(() => {
    if (!playerId) return;
    if (activeRoom?.code === roomCode) return;
    if (resumeAttemptRef.current === roomCode) return;
    resumeAttemptRef.current = roomCode;
    resumeRoom(roomCode).catch(() => {
      router.replace(`/join/${roomCode}`);
    });
  }, [playerId, roomCode, activeRoom, resumeRoom, router]);

  useEffect(() => {
    if (!activeRoom || activeRoom.code !== roomCode) return;
    if (myPlayerId && !activeRoom.state.players[myPlayerId]) {
      router.replace(`/join/${roomCode}`);
      return;
    }

    const status = activeRoom.state.status;
    if (
      (status === 'playing' || status === 'finished' || (status as string) === 'ended') &&
      audioPhase !== 'gameplay'
    ) {
      setAudioPhase('gameplay');
    } else if (status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [activeRoom, roomCode, myPlayerId, router, audioPhase, setAudioPhase]);

  if (!playerId) return null;
  if (!activeRoom || activeRoom.code !== roomCode) return null;

  let content: ReactNode = null;
  switch (activeRoom.state.status) {
    case 'lobby':
      content = <WaitingRoom />;
      break;
    case 'setup':
      content = <TurnOrderSetup />;
      break;
    case 'playing':
    case 'finished':
    case 'ended':
      content = <GameTable />;
      break;
  }

  return (
    <>
      {error && (
        <div className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 shadow-lg">
          {error}
        </div>
      )}
      {content}
    </>
  );
}
