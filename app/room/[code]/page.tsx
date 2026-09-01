'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAuth } from '../../../lib/auth';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();

  useEffect(() => {
    if (!authLoading && !user && !activeRoom) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!activeRoom) {
      setAudioPhase('pre-game');
      router.replace('/');
      return;
    }

    if ((activeRoom.state.status === 'playing' || activeRoom.state.status === 'finished' || (activeRoom.state.status as string) === 'ended') && audioPhase !== 'gameplay') {
      setAudioPhase('gameplay');
    } else if (activeRoom.state.status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [authLoading, user, pathname, router, activeRoom, audioPhase, setAudioPhase]);

  if (authLoading || !user || !activeRoom) return null;

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


