import { PlayerAvatar } from './PlayerAvatar';
import type { PlayerState } from '../../game/types';

export function PlayerCard({ player, isCurrentTurn }: { player: PlayerState; isCurrentTurn: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-card p-1 ${isCurrentTurn ? 'ring-2 ring-primary' : ''}`}>
      <PlayerAvatar name={player.name} size={40} />
      <span className="text-xs font-semibold text-ink">{player.name}</span>
      <span className="text-[10px] text-ink-secondary">
        {player.hand.length} ใบ | กับดัก {player.traps.length} ใบ
      </span>
    </div>
  );
}
