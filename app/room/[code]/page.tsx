'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';

export default function RoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ code: string }>();
  const roomCode = params.code || '';
  const { user, loading: authLoading } = useAuth();
  const { activeRoom, myPlayerId, resumeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();
  const resumeAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, user, router, pathname]);

  // Direct navigation or a page refresh lands here with no activeRoom yet — fetch + subscribe.
  useEffect(() => {
    if (!user) return;
    if (activeRoom?.code === roomCode) return;
    if (resumeAttemptRef.current === roomCode) return;
    resumeAttemptRef.current = roomCode;
    resumeRoom(roomCode).catch(() => {
      router.replace(`/join/${roomCode}`);
    });
  }, [user, roomCode, activeRoom, resumeRoom, router]);

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

  if (authLoading || !user) return null;
  if (!activeRoom || activeRoom.code !== roomCode) return null;

  switch (activeRoom.state.status) {
    case 'lobby':
      return <WaitingRoom />;
    case 'setup':
      return <TurnOrderSetup />;
    case 'playing':
    case 'finished':
    case 'ended':
      return <GameTable />;
  }
}
