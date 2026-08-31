import { PlayerAvatar } from './PlayerAvatar';
import type { PlayerId, PlayerState } from '../../game/types';

export function PlayerList({
  players,
  hostId,
  maxPlayers,
}: {
  players: Record<PlayerId, PlayerState>;
  hostId: PlayerId;
  maxPlayers: number;
}) {
  const playerIds = Object.keys(players);
  const emptySlots = Math.max(maxPlayers - playerIds.length, 0);

  return (
    <div className="flex flex-col gap-2">
      {playerIds.map((id) => (
        <div key={id} className="flex items-center gap-2 rounded-card border border-ink/10 bg-card p-2">
          <PlayerAvatar name={players[id].name} size={32} />
          <span className="font-semibold text-ink">{players[id].name}</span>
          {id === hostId && <span title="Host">👑</span>}
        </div>
      ))}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex items-center gap-2 rounded-card border border-dashed border-ink/20 p-2 text-ink-secondary"
        >
          <div className="h-8 w-8 rounded-full bg-ink/5" />
          <span>กำลังรอ...</span>
        </div>
      ))}
    </div>
  );
}
