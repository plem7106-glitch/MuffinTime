'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { useAudio } from '../../../lib/audio';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { TurnOrderSetup } from '../../../components/room/TurnOrderSetup';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const { activeRoom } = useGameSession();
  const { audioPhase, setAudioPhase } = useAudio();

  useEffect(() => {
    if (!activeRoom) {
      setAudioPhase('pre-game');
      router.replace('/');
      return;
    }

    if (activeRoom.state.status === 'playing' && audioPhase !== 'gameplay') {
      setAudioPhase('gameplay');
    } else if (activeRoom.state.status === 'lobby' && audioPhase !== 'pre-game') {
      setAudioPhase('pre-game');
    }
  }, [activeRoom, router, audioPhase, setAudioPhase]);

  if (!activeRoom) return null;

  switch (activeRoom.state.status) {
    case 'lobby':
      return <WaitingRoom />;
    case 'setup':
      return <TurnOrderSetup />;
    case 'playing':
      return <GameTable />;
    case 'ended':
      return <GameResult />;
  }
}

