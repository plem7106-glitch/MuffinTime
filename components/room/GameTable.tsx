'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { getNextPlayerId, isMuffinTimeEligible, canEndTurn } from '../../game/turn';
import { getPlayableCounters } from '../../game/counterRules/registry';
import { getCardDisplay, type CardDisplay } from '../../data/cards/display';
import { GameHeader } from './GameHeader';

import { TurnStatusBar } from './TurnStatusBar';
import { PlayerDensityGrid } from './PlayerDensityGrid';
import { CenterTable } from './CenterTable';
import { ActiveTrapsSection } from './ActiveTrapsSection';
import { HandTrayModal } from './HandTrayModal';
import { GameSettingsModal } from './GameSettingsModal';
import { InGameCardGalleryModal } from './InGameCardGalleryModal';
import { ManualFinishModal } from './ManualFinishModal';
import { WinnerCelebrationOverlay } from './WinnerCelebrationOverlay';
import { ShuffleConfirmModal } from './ShuffleConfirmModal';
import { ShuffleDrawPileOverlay } from './ShuffleDrawPileOverlay';
import { RoundTransitionOverlay } from './RoundTransitionOverlay';
import { TargetSelector } from '../modals/TargetSelector';
import { OutcomeToggle } from '../modals/OutcomeToggle';
import { DateInviteModal } from '../modals/DateInviteModal';
import { canActivateManualTrap } from '../../game/trapRules/engine';
import { getTrapRule } from '../../game/trapRules/registry';
import { getActionRule } from '../../game/actionRules/registry';

import { TrapModal } from '../modals/TrapModal';
import { TrapAlertModal } from '../modals/TrapAlertModal';
import { CounterModal } from '../modals/CounterModal';
import { TrapResultModal } from '../modals/TrapResultModal';
import { CounterResultModal } from '../modals/CounterResultModal';
import { DiscardPileModal } from '../modals/DiscardPileModal';
import { HostSkipConfirmModal } from './HostSkipConfirmModal';


import { CardsIcon, TrapIcon, CardStackIcon, CheckIcon } from '../ui/Icons';
import type { CardCode, PlayerId } from '../../game/types';


export function GameTable() {
  const router = useRouter();
  const {
    activeRoom,
    myPlayerId,
    drawCard,
    endTurn,
    hostSkipTurn,
    declareMuffinTime,
    playAction,
    placeTrapCard,
    skipTrapPlacement,
    openTrapCard,
    initiateTrapInteraction,
    respondToTrapInteraction,
    pendingResponse,
    playCounter,
    skipCounter,
    lastResult,
    clearLastResult,
    finishGame,
    playAgain,
    shuffleDrawPile,
    finishShuffleDrawPile,
    leaveRoom,
  } = useGameSession();

  // Modals & Panels State
  const [isHandTrayOpen, setIsHandTrayOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCardGalleryOpen, setIsCardGalleryOpen] = useState(false);
  const [isDiscardPileOpen, setIsDiscardPileOpen] = useState(false);
  const [isManualFinishOpen, setIsManualFinishOpen] = useState(false);
  const [isShuffleConfirmOpen, setIsShuffleConfirmOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isHostSkipConfirmOpen, setIsHostSkipConfirmOpen] = useState(false);

  // Action Target Flow State
  const [pendingTargetCard, setPendingTargetCard] = useState<CardDisplay | null>(null);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);
  const [chosenTargets, setChosenTargets] = useState<PlayerId[]>([]);

  // Dual-role target flow (A115: tallest, then shortest -- two sequential
  // single-target picks, since click order in a multi-select roster can't
  // safely disambiguate two distinct roles).
  const [dualPickPhase, setDualPickPhase] = useState<'first' | 'second' | null>(null);
  const [dualPickFirstId, setDualPickFirstId] = useState<PlayerId | null>(null);

  // Trap Open Flow State
  const [pendingTrapCode, setPendingTrapCode] = useState<CardCode | null>(null);
  const [trapTargetPrompt, setTrapTargetPrompt] = useState<string>('เลือกผู้เล่นเป้าหมาย');
  const [pendingTrapOpen, setPendingTrapOpen] = useState<CardDisplay | null>(null);
  const [awaitingTrapTarget, setAwaitingTrapTarget] = useState(false);
  const [chosenTrapTarget, setChosenTrapTarget] = useState<PlayerId | null>(null);
  const [chosenTrapTargets, setChosenTrapTargets] = useState<PlayerId[]>([]);

  // Auto-close trap open flow if a counter response window opens
  useEffect(() => {
    if (pendingResponse && (pendingTrapOpen !== null || pendingTrapCode !== null || awaitingTrapTarget)) {
      setPendingTrapOpen(null);
      setPendingTrapCode(null);
      setAwaitingTrapTarget(false);
      setChosenTrapTarget(null);
    }
  }, [pendingResponse, pendingTrapOpen, pendingTrapCode, awaitingTrapTarget]);

  if (!activeRoom || !myPlayerId) return null;

  const { state, code } = activeRoom;
  const me = state.players[myPlayerId];
  if (!me) return null;

  const hostName = state.players[state.hostId]?.name ?? 'เจ้าของห้อง';
  const playerIds = Object.keys(state.players);

  // Physical seating order from room state (without reversing)
  const seatOrder =
    state.seatOrder && state.seatOrder.length === playerIds.length && state.seatOrder.every((id) => state.players[id])
      ? state.seatOrder
      : (state.turnOrder && state.turnOrder.length === playerIds.length ? state.turnOrder : playerIds);

  const playDirection = state.playDirection ?? 'clockwise';
  const currentTurnPlayerId = state.turnOrder[state.currentTurnIndex] || seatOrder[0];
  const isMyTurn = currentTurnPlayerId === myPlayerId;
  const isHost = myPlayerId === state.hostId;
  const isFinished = state.status === 'finished' || (state.status as string) === 'ended';
  const isShuffling = !!state.isShufflingDrawPile;

  // Round tracking & transition presentation
  const currentRound = state.roundNumber ?? 1;
  const [presentedRound, setPresentedRound] = useState<number>(1);

  useEffect(() => {
    // If a game reset occurs (Play Again), reset presentedRound back to 1
    if (currentRound === 1 && presentedRound > 1) {
      setPresentedRound(1);
    }
  }, [currentRound, presentedRound]);

  const isRoundTransitionActive = currentRound > 1 && currentRound > presentedRound;

  const canAct = isMyTurn && !pendingResponse && !isFinished && !isShuffling && !isRoundTransitionActive;
  const canDeclare = !pendingResponse && !isFinished && !isShuffling && !isRoundTransitionActive && isMuffinTimeEligible(state, myPlayerId) && !me.hasCalledMuffinTime;

  const isShuffleDisabled = !isHost || !!pendingResponse || isShuffling || isRoundTransitionActive || state.drawPile.length <= 1;
  const shuffleDisabledReason = pendingResponse
    ? 'รอให้การเล่นไพ่ปัจจุบันเสร็จก่อน'
    : state.drawPile.length <= 1
    ? 'ไพ่ในกองจั่วไม่พอ'
    : isShuffling
    ? 'กำลังสับไพ่'
    : isRoundTransitionActive
    ? 'กำลังเริ่มรอบใหม่'
    : undefined;

  // Check if local player is the target of an active Trap response
  const isLocalTrapTarget = Boolean(
    pendingResponse?.kind === 'trap' &&
      pendingResponse.actorId !== myPlayerId &&
      (!pendingResponse.targetId || pendingResponse.targetId === myPlayerId) &&
      pendingResponse.responses?.[myPlayerId]?.status !== 'skipped' &&
      pendingResponse.responses?.[myPlayerId]?.status !== 'countered'
  );





  // Opponents ordered in physical seat order
  const opponentCandidates = useMemo(() => {
    return seatOrder
      .filter((id) => id !== myPlayerId && state.players[id] !== undefined)
      .map((id) => ({ id, player: state.players[id] }));
  }, [seatOrder, myPlayerId, state.players]);

  // Handlers for Hand Tray Actions
  const handlePlayActionDirect = (cardCode: CardCode) => {
    if (!canAct) return;
    playAction(cardCode);
  };

  const handlePlaceTrap = (cardCode: CardCode) => {
    if (!canAct || me.traps.length >= 3) return;
    placeTrapCard(cardCode);
  };

  const handleRequestTarget = (card: CardDisplay) => {
    setPendingTargetCard(card);
    setChosenTarget(null);
    setChosenTargets([]);
    const rule = getActionRule(card.code);
    setDualPickPhase(rule?.needsDualTargetSelection ? 'first' : null);
    setDualPickFirstId(null);
  };

  const pendingActionRule = pendingTargetCard ? getActionRule(pendingTargetCard.code) : undefined;
  const rosterSelectionCount = pendingActionRule?.rosterSelectionCount;

  const handleConfirmTargetAction = () => {
    if (!pendingTargetCard) return;
    if (pendingActionRule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rosterSelectionCount !== undefined && chosenTargets.length !== rosterSelectionCount) return;
      playAction(pendingTargetCard.code, undefined, { rosterIds: chosenTargets });
    } else {
      if (!chosenTarget) return;
      playAction(pendingTargetCard.code, chosenTarget);
    }
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };

  const handleDualPickConfirm = () => {
    if (!pendingTargetCard || !chosenTarget) return;
    if (dualPickPhase === 'first') {
      setDualPickFirstId(chosenTarget);
      setChosenTarget(null);
      setDualPickPhase('second');
      return;
    }
    playAction(pendingTargetCard.code, undefined, { firstId: dualPickFirstId, secondId: chosenTarget });
    setPendingTargetCard(null);
    setChosenTarget(null);
    setDualPickPhase(null);
    setDualPickFirstId(null);
  };

  const handleDualPickCancel = () => {
    setPendingTargetCard(null);
    setChosenTarget(null);
    setDualPickPhase(null);
    setDualPickFirstId(null);
  };

  const handleOutcomeSelect = (outcome: boolean) => {
    if (!pendingTargetCard) return;
    playAction(pendingTargetCard.code, undefined, { outcome });
    setPendingTargetCard(null);
  };

  // Handlers for Opening Active Traps
  const handleOpenTrapTap = (trapCode: CardCode) => {
    if (pendingResponse) return;
    if (!canActivateManualTrap(state, myPlayerId, trapCode)) return;
    const card = getCardDisplay(trapCode);
    setPendingTrapOpen(card);
  };

  const handleConfirmOpenTrap = () => {
    if (!pendingTrapOpen) return;
    const trapCode = pendingTrapOpen.code;
    const rule = getTrapRule(trapCode);
    const card = pendingTrapOpen;

    setPendingTrapOpen(null);

    const needsTarget = Boolean((rule && rule.needsTargetSelection) || card.needsTarget);
    if (needsTarget) {
      setPendingTrapCode(trapCode);
      setTrapTargetPrompt(rule?.targetPrompt ?? 'เลือกผู้เล่นเป้าหมายสำหรับกับดัก');
      setAwaitingTrapTarget(true);
      if (trapCode === 'T12') setChosenTrapTargets([]);
      return;
    }

    openTrapCard(trapCode);
  };

  const handleConfirmTrapTarget = () => {
    if (pendingTrapCode === 'T12') {
      if (chosenTrapTargets.length === 0) return;
      openTrapCard(pendingTrapCode, chosenTrapTargets);
      setPendingTrapCode(null); setAwaitingTrapTarget(false); setChosenTrapTargets([]); setChosenTrapTarget(null);
      return;
    }
    if (!pendingTrapCode || !chosenTrapTarget) return;
    if (pendingTrapCode === 'T10') {
      initiateTrapInteraction('T10', chosenTrapTarget);
    } else {
      openTrapCard(pendingTrapCode, chosenTrapTarget);
    }
    setPendingTrapCode(null);
    setAwaitingTrapTarget(false);
    setChosenTrapTarget(null);
  };

  const handleConfirmLeave = () => {
    leaveRoom();
    router.push('/');
  };

  // Legally valid Counter response cards available in local hand for the active pendingResponse
  const validCounterCards = useMemo(() => {
    return getPlayableCounters(me.hand, pendingResponse);
  }, [me.hand, pendingResponse]);


  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-start p-3 pb-24 bg-gradient-to-b from-gray-50/70 via-white to-gray-50/70 overflow-x-hidden">
      {/* =================================================== */}
      {/* A. UPPER GAMEPLAY CONTENT (Tightly Stacked at Top)  */}
      {/* =================================================== */}
      <div className="flex flex-col gap-2 shrink-0">
        {/* 1. Header Section (Compact Room Info & Settings) */}
        <GameHeader
          hostName={hostName}
          code={code}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLeavePrompt={() => setIsLeaveConfirmOpen(true)}
        />

        {/* 2. Section 1: Current Turn Status */}
        <TurnStatusBar
          currentTurnPlayerId={currentTurnPlayerId}
          myPlayerId={myPlayerId}
          players={state.players}
          seatOrder={seatOrder}
          playDirection={playDirection}
        />

        {/* 3. Section 2: All Players (Responsive grid, no horizontal scroll, all visible) */}
        <PlayerDensityGrid
          seatOrder={seatOrder}
          players={state.players}
          currentTurnPlayerId={currentTurnPlayerId}
          myPlayerId={myPlayerId}
          hostId={state.hostId}
        />

        {/* 4. Section 3: Draw Pile + Discard Pile (Side-by-side center table with portrait 2:3 cards) */}
        <CenterTable
          drawPileCount={state.drawPile.length}
          discardPile={state.discardPile}
          isMyTurn={isMyTurn}
          canAct={canAct}
          hasDrawnThisTurn={Boolean(me.hasDrawnThisTurn)}
          hasPlayedActionThisTurn={Boolean(me.hasPlayedActionThisTurn)}
          isTrapPlacementPhase={state.turnPhase === 'trap_placement'}
          onDraw={drawCard}
          onOpenDiscardPile={() => setIsDiscardPileOpen(true)}
        />

      </div>

      {/* =================================================== */}
      {/* B. FLEXIBLE SPACER (Only between CenterTable & Traps)*/}
      {/* =================================================== */}
      <div className="flex-1 min-h-[16px]" />

      {/* =================================================== */}
      {/* C. ACTIVE TRAPS (Anchored near bottom above Bar)    */}
      {/* =================================================== */}
      <div className="flex flex-col gap-1.5 shrink-0 mt-auto mb-2">
        {/* 5. Section 4: My Active Traps (Always 3 portrait 2:3 slots) */}
        <ActiveTrapsSection
          traps={me.traps}
          onOpenTrap={handleOpenTrapTap}
          onAddTrapSlotClick={() => setIsHandTrayOpen(true)}
          disabled={pendingResponse !== null || isShuffling || isRoundTransitionActive}
        />

        {/* Declare Muffin Time Button (Compact banner if eligible) */}
        {canDeclare && (
          <button
            type="button"
            onClick={declareMuffinTime}
            className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-amber-500/20 transition-all hover:opacity-95 active:scale-[0.98] animate-bounce shrink-0"
          >
            <span>🧁 ประกาศ MUFFIN TIME! (มีไพ่ครบ 10 ใบ)</span>
          </button>
        )}
      </div>

      {/* =================================================== */}
      {/* D. BOTTOM ACTION BAR (Persistent fixed bar)         */}
      {/* =================================================== */}
      {(() => {
        const isEndTurnAllowed = canEndTurn(state, myPlayerId) && !isRoundTransitionActive;

        return (
          <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center p-2.5 bg-white/95 backdrop-blur-md border-t border-gray-200/80 shadow-lg pointer-events-auto">
            <div className="max-w-md w-full flex items-center gap-2 px-3">
              {/* Left Action: Open Hand Tray */}
              <button
                type="button"
                onClick={() => setIsHandTrayOpen(true)}
                className="flex-1 flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#FF2E63] via-[#ED1F4F] to-[#E52B50] px-3 text-xs sm:text-sm font-black text-white shadow-md shadow-primary/25 transition-all hover:opacity-95 active:scale-[0.98]"
              >
                <CardsIcon className="h-4 w-4 stroke-[2.5]" />
                <span>ดูไพ่ในมือ ({me.hand.length})</span>
              </button>

              {/* Right Action: End Turn (จบเทิร์น) */}
              <button
                type="button"
                onClick={endTurn}
                disabled={!isEndTurnAllowed}
                className={`flex-1 flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl border-2 px-3 text-xs sm:text-sm font-black transition-all ${
                  isEndTurnAllowed
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.98] cursor-pointer animate-pulse'
                    : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                }`}
              >
                <CheckIcon className="h-4 w-4 stroke-[2.5]" />
                <span>จบเทิร์น</span>
              </button>
            </div>
          </div>
        );
      })()}




      {/* 9. Hand Tray Modal (Horizontal scrollable hand + tap card to play) */}
      <HandTrayModal
        isOpen={isHandTrayOpen}
        hand={me.hand}
        isMyTurn={isMyTurn}
        canAct={canAct}
        hasDrawnThisTurn={Boolean(me.hasDrawnThisTurn)}
        hasPlayedActionThisTurn={Boolean(me.hasPlayedActionThisTurn)}
        isTrapPlacementPhase={state.turnPhase === 'trap_placement'}
        trapsCount={me.traps.length}
        onClose={() => setIsHandTrayOpen(false)}
        onPlayAction={handlePlayActionDirect}
        onPlaceTrap={handlePlaceTrap}
        onRequestTarget={handleRequestTarget}
      />

      {/* 10. Action Card Target Selector (single target, or multi-select roster
          when the card's rule needs a roster_select -- e.g. "who matches this
          condition" cards like the Family A / classification-doc examples) */}
      <TargetSelector
        open={pendingTargetCard !== null && dualPickPhase === null && !pendingActionRule?.needsOutcomeEntry}
        candidates={opponentCandidates}
        selectedId={chosenTarget}
        multiSelect={pendingActionRule?.needsRosterSelection === true}
        requiredCount={rosterSelectionCount}
        selectedIds={chosenTargets}
        onSelect={(id) => {
          if (!pendingActionRule?.needsRosterSelection) {
            setChosenTarget(id);
            return;
          }
          setChosenTargets((current) => {
            if (current.includes(id)) return current.filter((item) => item !== id);
            if (rosterSelectionCount !== undefined && current.length >= rosterSelectionCount) return current;
            return [...current, id];
          });
        }}
        onConfirm={handleConfirmTargetAction}
        onCancel={() => {
          setPendingTargetCard(null);
          setChosenTarget(null);
          setChosenTargets([]);
        }}
        prompt={
          (pendingActionRule?.needsRosterSelection ? pendingActionRule.rosterPrompt : pendingActionRule?.targetPrompt) ??
          pendingTargetCard?.effect ??
          'เลือกผู้เล่นเป้าหมาย'
        }
      />

      {/* 10.4 Action Card Dual-Role Target Selector (A115: pick "tallest",
          then pick "shortest" -- two sequential single-target picks so the
          two roles can never be silently swapped by click order) */}
      <TargetSelector
        open={pendingTargetCard !== null && dualPickPhase !== null}
        candidates={dualPickPhase === 'second' ? opponentCandidates.filter((c) => c.id !== dualPickFirstId) : opponentCandidates}
        selectedId={chosenTarget}
        onSelect={(id) => setChosenTarget(id)}
        onConfirm={handleDualPickConfirm}
        onCancel={handleDualPickCancel}
        prompt={
          (dualPickPhase === 'first'
            ? pendingActionRule?.dualTargetPrompts?.first
            : pendingActionRule?.dualTargetPrompts?.second) ??
          pendingTargetCard?.effect ??
          'เลือกผู้เล่นเป้าหมาย'
        }
      />

      {/* 10.5 Action Card Outcome Toggle (binary verdict cards, e.g. E4/E8) */}
      <OutcomeToggle
        open={pendingTargetCard !== null && pendingActionRule?.needsOutcomeEntry === true}
        prompt={pendingActionRule?.outcomePrompt ?? pendingTargetCard?.effect ?? ''}
        yesLabel={pendingActionRule?.outcomeYesLabel}
        noLabel={pendingActionRule?.outcomeNoLabel}
        onSelect={handleOutcomeSelect}
        onCancel={() => setPendingTargetCard(null)}
      />

      {/* 11. Trap Card Open Modal */}
      <TrapModal
        card={awaitingTrapTarget ? null : pendingTrapOpen}
        mode="open"
        onConfirm={handleConfirmOpenTrap}
        onCancel={() => {
          setPendingTrapOpen(null);
          setAwaitingTrapTarget(false);
        }}
      />

      {/* 12. Trap Card Target Selector */}
      <TargetSelector
        open={awaitingTrapTarget}
        candidates={opponentCandidates}
        selectedId={chosenTrapTarget}
        onConfirm={handleConfirmTrapTarget}
        onCancel={() => {
          setPendingTrapCode(null);
          setPendingTrapOpen(null);
          setAwaitingTrapTarget(false);
          setChosenTrapTarget(null);
        }}
        prompt={trapTargetPrompt}
        multiSelect={pendingTrapCode === 'T12'}
        selectedIds={chosenTrapTargets}
        onSelect={(id) => {
          if (pendingTrapCode !== 'T12') { setChosenTrapTarget(id); return; }
          setChosenTrapTargets((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
        }}
      />

      {/* 12.5 Interactive Trap Modal (e.g. T10 Date Invite) */}
      <DateInviteModal
        interaction={
          state.pendingInteraction?.type === 'date_invite' &&
          state.pendingInteraction.targetPlayerId === myPlayerId
            ? state.pendingInteraction
            : null
        }
        state={state}
        onAccept={() => {
          if (state.pendingInteraction) {
            respondToTrapInteraction(state.pendingInteraction.interactionId, 'accept');
          }
        }}
        onRefuse={() => {
          if (state.pendingInteraction) {
            respondToTrapInteraction(state.pendingInteraction.interactionId, 'refuse');
          }
        }}
      />

      {/* 13. Trap Alert & Counter Decision Modal (When local player is hit by a Trap) */}
      <TrapAlertModal
        open={Boolean(isLocalTrapTarget && pendingResponse)}
        trapCode={pendingResponse?.kind === 'trap' ? pendingResponse.code : null}
        actorId={pendingResponse?.actorId}
        actorName={pendingResponse?.actorId ? state.players[pendingResponse.actorId]?.name : 'ฝ่ายตรงข้าม'}
        counterCards={validCounterCards}
        responseId={pendingResponse?.responseId}
        onPlayCounter={(code) => pendingResponse && playCounter(code, pendingResponse.responseId)}
        onDecline={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />

      {/* 14. Counter Card Response Window Modal (For Action responses) */}
      <CounterModal
        open={pendingResponse?.kind === 'action' && validCounterCards.length > 0}
        counterCards={validCounterCards}
        onPlay={(code) => pendingResponse && playCounter(code, pendingResponse.responseId)}
        onSkip={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />



      {/* 14. Action & Trap Result Notification Modals */}
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

      {/* 15. In-Game Settings Bottom Sheet */}
      <GameSettingsModal
        isOpen={isSettingsOpen}
        isHost={isHost}
        onClose={() => setIsSettingsOpen(false)}
        onOpenCardGallery={() => setIsCardGalleryOpen(true)}
        onOpenShuffleConfirm={() => setIsShuffleConfirmOpen(true)}
        isShuffleDisabled={isShuffleDisabled}
        shuffleDisabledReason={shuffleDisabledReason}
        onOpenManualFinish={() => setIsManualFinishOpen(true)}
        onOpenHostUnstick={() => setIsHostSkipConfirmOpen(true)}
        hostUnstickLabel={pendingResponse ? 'บังคับข้ามการตอบโต้ที่ค้าง' : 'บังคับข้ามเทิร์นที่ค้าง'}
      />

      <HostSkipConfirmModal
        isOpen={isHostSkipConfirmOpen}
        currentPlayerName={state.players[state.turnOrder[state.currentTurnIndex]]?.name ?? 'ผู้เล่นปัจจุบัน'}
        nextPlayerName={state.players[getNextPlayerId(state.turnOrder, state.turnOrder[state.currentTurnIndex], state.direction)]?.name ?? 'ผู้เล่นถัดไป'}
        onClose={() => setIsHostSkipConfirmOpen(false)}
        onConfirm={() => {
          setIsHostSkipConfirmOpen(false);
          hostSkipTurn();
        }}
      />

      {/* 16. In-Game Card Gallery Browser Modal */}
      <InGameCardGalleryModal
        isOpen={isCardGalleryOpen}
        onClose={() => setIsCardGalleryOpen(false)}
      />

      {/* 17. Discard Pile Viewer Modal (View-only inspection of all discarded cards) */}
      <DiscardPileModal
        isOpen={isDiscardPileOpen}
        onClose={() => setIsDiscardPileOpen(false)}
        discardPile={state.discardPile}
      />


      {/* 17. Host-Only Shuffle Draw Pile Confirm Modal */}
      {isShuffleConfirmOpen && (
        <ShuffleConfirmModal
          isOpen={isShuffleConfirmOpen}
          drawPileCount={state.drawPile.length}
          onClose={() => setIsShuffleConfirmOpen(false)}
          onConfirm={shuffleDrawPile}
        />
      )}

      {/* 18. Transient Animated Shuffle Draw Pile Overlay (Synced for all players) */}
      {isShuffling && (
        <ShuffleDrawPileOverlay
          key={state.shuffleSequence ?? 1}
          isHost={isHost}
          onComplete={finishShuffleDrawPile}
        />
      )}

      {/* 19. Transient Animated Round Transition Overlay (When advancing to Round 2, 3, 4...) */}
      {isRoundTransitionActive && (
        <RoundTransitionOverlay
          key={`round-${currentRound}`}
          roundNumber={currentRound}
          activePlayerId={currentTurnPlayerId}
          myPlayerId={myPlayerId}
          activePlayerName={state.players[currentTurnPlayerId]?.name || 'ผู้เล่น'}
          onComplete={() => setPresentedRound(currentRound)}
        />
      )}


      {/* 20. Host-Only Manual Finish Game Modal */}
      {isManualFinishOpen && (
        <ManualFinishModal
          isOpen={isManualFinishOpen}
          seatOrder={seatOrder}
          players={state.players}
          hostId={state.hostId}
          myPlayerId={myPlayerId}
          onClose={() => setIsManualFinishOpen(false)}
          onConfirmWinner={(winnerId) => {
            finishGame(winnerId, 'manual');
            setIsManualFinishOpen(false);
          }}
        />
      )}


      {/* 20. Winner Celebration & Post-Game Overlay (Full-screen celebration for all players) */}
      {isFinished && (
        <WinnerCelebrationOverlay
          winnerId={state.winnerId || seatOrder[0]}
          finishReason={state.finishReason ?? 'normal'}
          players={state.players}
          isHost={isHost}
          myPlayerId={myPlayerId}
          onPlayAgain={playAgain}
          onLeaveRoom={handleConfirmLeave}
        />
      )}



      {/* 19. Leave Room Direct Confirm Modal */}
      {isLeaveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-2xl">
            <h3 className="text-base font-black text-ink">ออกจากห้องเกม?</h3>
            <p className="text-xs text-ink-secondary mt-1">
              คุณต้องการออกจากห้องเกมนี้และกลับสู่หน้าหลักใช่หรือไม่?
            </p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all"
              >
                ออกจากห้อง
              </button>
              <button
                type="button"
                onClick={() => setIsLeaveConfirmOpen(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-bold text-ink-secondary hover:bg-gray-100 active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

