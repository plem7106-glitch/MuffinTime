'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const PLAYER_ID_KEY = 'muffintime_player_id';
const PLAYER_NAME_KEY = 'muffintime_player_name';

export interface PlayerValue {
  playerId: string | null;
  playerName: string;
  setPlayerName: (name: string) => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState('');

  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(PLAYER_ID_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(PLAYER_ID_KEY, id);
      }
      setPlayerNameState(localStorage.getItem(PLAYER_NAME_KEY) ?? '');
    } catch {
      id = crypto.randomUUID();
    }
    setPlayerId(id);
  }, []);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    try {
      localStorage.setItem(PLAYER_NAME_KEY, name);
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  };

  return (
    <PlayerContext.Provider value={{ playerId, playerName, setPlayerName }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
