'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../../lib/session';
import { WaitingRoom } from '../../../components/room/WaitingRoom';
import { GameTable } from '../../../components/room/GameTable';
import { GameResult } from '../../../components/room/GameResult';

export default function RoomPage() {
  const router = useRouter();
  const { activeRoom } = useGameSession();

  useEffect(() => {
    if (!activeRoom) router.replace('/');
  }, [activeRoom, router]);

  if (!activeRoom) return null;

  switch (activeRoom.state.status) {
    case 'lobby':
      return <WaitingRoom />;
    case 'playing':
      return <GameTable />;
    case 'ended':
      return <GameResult />;
  }
}
