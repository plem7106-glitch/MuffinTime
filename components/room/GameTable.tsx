'use client';

import { useState } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { getDemoCard, type DemoCard } from '../../lib/demoCards';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import { ActionModal } from '../modals/ActionModal';
import { TrapModal } from '../modals/TrapModal';
import { TargetSelector } from '../modals/TargetSelector';
import type { CardCode, PlayerId } from '../../game/types';

export function GameTable() {
  const { activeRoom, myPlayerId, drawCard, declareMuffinTime, playAction, placeTrapCard, pendingResponse } =
    useGameSession();
  const [pendingCard, setPendingCard] = useState<DemoCard | null>(null);
  const [awaitingTarget, setAwaitingTarget] = useState(false);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = isMyTurn && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  function handleSelectCard(cardCode: CardCode) {
    if (!isMyTurn || pendingResponse) return;
    const card = getDemoCard(cardCode);
    if (card.type === 'action' || card.type === 'trap') {
      setPendingCard(card);
    }
  }

  function closeModals() {
    setPendingCard(null);
    setAwaitingTarget(false);
    setChosenTarget(null);
  }

  function handleConfirmCard() {
    if (!pendingCard) return;
    if (pendingCard.type === 'trap') {
      placeTrapCard(pendingCard.code);
      closeModals();
      return;
    }
    if (pendingCard.needsTarget) {
      setAwaitingTarget(true);
      return;
    }
    playAction(pendingCard.code);
    closeModals();
  }

  function handleConfirmTarget() {
    if (!pendingCard || !chosenTarget) return;
    playAction(pendingCard.code, chosenTarget);
    closeModals();
  }

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
        <CardHand hand={me.hand} selectedCode={pendingCard?.code ?? null} onSelect={handleSelectCard} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>

      {pendingCard?.type === 'action' && (
        <ActionModal card={awaitingTarget ? null : pendingCard} onConfirm={handleConfirmCard} onCancel={closeModals} />
      )}
      {pendingCard?.type === 'trap' && (
        <TrapModal card={pendingCard} onConfirm={handleConfirmCard} onCancel={closeModals} />
      )}
      <TargetSelector
        open={awaitingTarget}
        candidates={opponentIds.map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTarget}
        onSelect={setChosenTarget}
        onConfirm={handleConfirmTarget}
        onCancel={closeModals}
        prompt={pendingCard ? pendingCard.effect : ''}
      />
    </main>
  );
}
