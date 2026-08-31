'use client';

import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import type { CardCode } from '../../game/types';

export function GameTable() {
  const { activeRoom, myPlayerId, drawCard, declareMuffinTime } = useGameSession();
  const [selectedCode, setSelectedCode] = useState<CardCode | null>(null);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = isMyTurn && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden">
      <div className="shrink-0 p-3" style={{ flexBasis: '15%' }}>
        <GameHeader hostName={state.players[state.hostId].name} code={code} />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3" style={{ flexBasis: '45%' }}>
        <div className="flex flex-wrap justify-center gap-3">
          {opponentIds.map((id) => (
            <PlayerCard
              key={id}
              player={state.players[id]}
              isCurrentTurn={state.turnOrder[state.currentTurnIndex] === id}
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center gap-6">
          <Deck count={state.drawPile.length} />
          <DiscardPile count={state.discardPile.length} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 p-3" style={{ flexBasis: '40%' }}>
        <PlayerCard player={me} isCurrentTurn={isMyTurn} />
        <CardHand hand={me.hand} selectedCode={selectedCode} onSelect={setSelectedCode} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>
    </main>
  );
}
