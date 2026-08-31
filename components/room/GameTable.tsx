'use client';

import { useState, useEffect } from 'react';
import { useGameSession } from '../../lib/session';
import { isMuffinTimeEligible } from '../../game/turn';
import { getDemoCard, demoCardsOfType, type DemoCard } from '../../lib/demoCards';
import { GameHeader } from './GameHeader';
import { PlayerCard } from './PlayerCard';
import { BottomActionBar } from './BottomActionBar';
import { Deck } from '../card/Deck';
import { DiscardPile } from '../card/DiscardPile';
import { CardHand } from '../card/CardHand';
import { ActionModal } from '../modals/ActionModal';
import { TrapModal } from '../modals/TrapModal';
import { TargetSelector } from '../modals/TargetSelector';
import { CounterModal } from '../modals/CounterModal';
import { TrapResultModal } from '../modals/TrapResultModal';
import { CounterResultModal } from '../modals/CounterResultModal';
import type { CardCode, PlayerId } from '../../game/types';

export function GameTable() {
  const {
    activeRoom,
    myPlayerId,
    drawCard,
    declareMuffinTime,
    playAction,
    placeTrapCard,
    openTrapCard,
    pendingResponse,
    playCounter,
    skipCounter,
    lastResult,
    clearLastResult,
  } = useGameSession();

  const [pendingCard, setPendingCard] = useState<DemoCard | null>(null);
  const [awaitingTarget, setAwaitingTarget] = useState(false);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);

  const [pendingTrapOpen, setPendingTrapOpen] = useState<DemoCard | null>(null);
  const [awaitingTrapTarget, setAwaitingTrapTarget] = useState(false);
  const [chosenTrapTarget, setChosenTrapTarget] = useState<PlayerId | null>(null);

  useEffect(() => {
    if (pendingResponse && (pendingTrapOpen !== null || awaitingTrapTarget)) {
      setPendingTrapOpen(null);
      setAwaitingTrapTarget(false);
      setChosenTrapTarget(null);
    }
  }, [pendingResponse, pendingTrapOpen, awaitingTrapTarget]);

  if (!activeRoom || !myPlayerId) return null;
  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === myPlayerId;
  const canDeclare = !pendingResponse && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;
  const opponentIds = state.turnOrder.filter((id) => id !== myPlayerId);

  function handleSelectCard(cardCode: CardCode) {
    if (!isMyTurn || pendingResponse) return;
    const card = getDemoCard(cardCode);
    if (card.type === 'trap' && me.traps.length >= 3) return;
    if (card.type === 'action' || card.type === 'trap') {
      setPendingCard(card);
    }
  }

  function closeHandFlow() {
    setPendingCard(null);
    setAwaitingTarget(false);
    setChosenTarget(null);
  }

  function handleConfirmCard() {
    if (!pendingCard) return;
    if (pendingCard.type === 'trap') {
      placeTrapCard(pendingCard.code);
      closeHandFlow();
      return;
    }
    if (pendingCard.needsTarget) {
      setAwaitingTarget(true);
      return;
    }
    playAction(pendingCard.code);
    closeHandFlow();
  }

  function handleConfirmTarget() {
    if (!pendingCard || !chosenTarget) return;
    playAction(pendingCard.code, chosenTarget);
    closeHandFlow();
  }

  function closeTrapOpenFlow() {
    setPendingTrapOpen(null);
    setAwaitingTrapTarget(false);
    setChosenTrapTarget(null);
  }

  function handleOpenTrapTap(trapCode: CardCode) {
    if (pendingResponse) return;
    setPendingTrapOpen(getDemoCard(trapCode));
  }

  function handleConfirmOpenTrap() {
    if (!pendingTrapOpen) return;
    if (pendingTrapOpen.needsTarget) {
      setAwaitingTrapTarget(true);
      return;
    }
    openTrapCard(pendingTrapOpen.code);
    closeTrapOpenFlow();
  }

  function handleConfirmTrapTarget() {
    if (!pendingTrapOpen || !chosenTrapTarget) return;
    openTrapCard(pendingTrapOpen.code, chosenTrapTarget);
    closeTrapOpenFlow();
  }

  const counterCards = pendingResponse
    ? me.hand.filter((c) => demoCardsOfType('counter').some((counter) => counter.code === c))
    : [];

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
        {me.traps.length > 0 && (
          <div className="flex gap-2">
            {me.traps.map((trapCode, i) => (
              <button
                key={`${trapCode}-${i}`}
                onClick={() => handleOpenTrapTap(trapCode)}
                className="min-h-[36px] rounded-card border border-trap px-2 text-xs font-semibold text-trap"
              >
                เปิดกับดัก
              </button>
            ))}
          </div>
        )}
        <CardHand hand={me.hand} selectedCode={pendingCard?.code ?? null} onSelect={handleSelectCard} />
        <BottomActionBar isMyTurn={isMyTurn} onDraw={drawCard} canDeclare={canDeclare} onDeclare={declareMuffinTime} />
      </div>

      {pendingCard?.type === 'action' && (
        <ActionModal card={awaitingTarget ? null : pendingCard} onConfirm={handleConfirmCard} onCancel={closeHandFlow} />
      )}
      {pendingCard?.type === 'trap' && (
        <TrapModal card={pendingCard} mode="place" onConfirm={handleConfirmCard} onCancel={closeHandFlow} />
      )}
      <TargetSelector
        open={awaitingTarget}
        candidates={opponentIds.map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTarget}
        onSelect={setChosenTarget}
        onConfirm={handleConfirmTarget}
        onCancel={closeHandFlow}
        prompt={pendingCard ? pendingCard.effect : ''}
      />

      <TrapModal
        card={awaitingTrapTarget ? null : pendingTrapOpen}
        mode="open"
        onConfirm={handleConfirmOpenTrap}
        onCancel={closeTrapOpenFlow}
      />
      <TargetSelector
        open={awaitingTrapTarget}
        candidates={Object.keys(state.players)
          .filter((id) => id !== myPlayerId)
          .map((id) => ({ id, player: state.players[id] }))}
        selectedId={chosenTrapTarget}
        onSelect={setChosenTrapTarget}
        onConfirm={handleConfirmTrapTarget}
        onCancel={closeTrapOpenFlow}
        prompt={pendingTrapOpen ? pendingTrapOpen.effect : ''}
      />

      <TrapResultModal
        result={lastResult}
        ownerName={lastResult ? state.players[lastResult.actorId]?.name ?? '' : ''}
        targetName={lastResult?.targetId ? state.players[lastResult.targetId]?.name : undefined}
        onClose={clearLastResult}
      />
      <CounterResultModal
        result={lastResult}
        counterActorName={lastResult?.counteredBy ? state.players[lastResult.counteredBy]?.name ?? '' : ''}
        onClose={clearLastResult}
      />
      <CounterModal
        open={pendingResponse !== null && counterCards.length > 0}
        counterCards={counterCards}
        onPlay={playCounter}
        onSkip={skipCounter}
      />
    </main>
  );
}
