'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameSession } from '../../lib/session';
import { getNextPlayerId, isMuffinTimeEligible, canEndTurn } from '../../game/turn';
import { getPlayableCountersForActiveFrame, getCounterInteraction } from '../../game/counterRules/registry';
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
import { NumberInputModal } from '../modals/NumberInputModal';
import { DateInviteModal } from '../modals/DateInviteModal';
import { canActivateManualTrap } from '../../game/trapRules/engine';
import { getTrapRule } from '../../game/trapRules/registry';
import { getActionRule, getPlayableActions, isActionImplemented } from '../../game/actionRules/registry';
import type { ActionRuleDefinition } from '../../game/actionRules/types';
import { isQuantityEffectCard } from '../../game/actionRules/quantityCards';
import { getSocialCounterConfig, isSocialCounter } from '../../game/socialCounter';

import { TrapModal } from '../modals/TrapModal';
import { TrapAlertModal } from '../modals/TrapAlertModal';
import { CounterModal } from '../modals/CounterModal';
import { TrapResultModal } from '../modals/TrapResultModal';
import { CounterResultModal } from '../modals/CounterResultModal';
import { ActionResultModal } from '../modals/ActionResultModal';
import { DiscardPileModal } from '../modals/DiscardPileModal';
import { HostSkipConfirmModal } from './HostSkipConfirmModal';
import { PresentationProvider } from '../../lib/presentation/presentationContext';
import { PresentationOverlay } from './PresentationOverlay';
import { ActivityFeed } from './ActivityFeed';
import { PresentationBridge } from './PresentationBridge';
import { LiveGameStatus } from './LiveGameStatus';
import { ManualDiscardModal } from './ManualDiscardModal';
import { ManualGiveModal } from './ManualGiveModal';


import { CardsIcon, TrapIcon, CardStackIcon, CheckIcon, CloseIcon } from '../ui/Icons';
import type { CardCode, PlayerId } from '../../game/types';


// True if the given ActionRuleDefinition needs ANY of its own UI input or
// auto-stamped value (all 8 needsX flags on ActionRuleDefinition: target
// selection, roster selection, outcome entry, dual-target picks, today's
// date, number input, drink-check, and target-then-outcome) before its
// effect can resolve. Used by handlePickDoublePartner (A028's co-play
// partner picker) to decide whether a chosen partner card needs special
// handling at all or, for a truly flagless card, can skip straight to
// playing it -- exactly mirroring what "normal" (non-doubled) play does for
// that same card. Deliberately checks the rule's actual flags rather than a
// hardcoded list of currently-flagless allow-listed codes, so a future card
// added to QUANTITY_EFFECT_CARDS with a flag this function already checks
// is handled correctly without touching this file -- that guarantee only
// holds against the 8 flags checked here today; if ActionRuleDefinition
// ever grows a 9th needsX flag, this function must be updated too, the same
// as needsTodayDate had to be added here.
//
// needsTodayDate is a special case even though it's included below: it
// needs a *value* (the actor's device date) stamped into the play payload,
// not a *picker* UI. handlePickDoublePartner does not use this function's
// result directly to decide whether to open a picker -- it checks
// rule?.needsTodayDate separately (see below) so a rule whose only true
// flag is needsTodayDate still skips the picker, the same way
// handlePlayActionDirect does for solo (non-doubled) play.
function hasAnyInputFlag(rule: ActionRuleDefinition | undefined): boolean {
  if (!rule) return false;
  return Boolean(
    rule.needsTargetSelection ||
      rule.needsRosterSelection ||
      rule.needsOutcomeEntry ||
      rule.needsDualTargetSelection ||
      rule.needsTodayDate ||
      rule.needsNumberInput ||
      rule.needsDrinkCheck ||
      rule.needsTargetThenOutcome
  );
}

export function GameTable() {
  const router = useRouter();
  const {
    activeRoom,
    myPlayerId,
    drawCard,
    endTurn,
    hostSkipTurn,
    canActAsHost,
    declareMuffinTime,
    playAction,
    playDoubledAction,
    placeTrapCard,
    skipTrapPlacement,
    openTrapCard,
    initiateTrapInteraction,
    respondToTrapInteraction,
    respondToDelegatedTargetPick,
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
    manualDiscard,
    manualGiveCard,
    playSocialCounter,
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
  const [isManualDiscardOpen, setIsManualDiscardOpen] = useState(false);
  const [isManualGiveOpen, setIsManualGiveOpen] = useState(false);

  // Action Target Flow State
  const [pendingTargetCard, setPendingTargetCard] = useState<CardDisplay | null>(null);
  const [chosenTarget, setChosenTarget] = useState<PlayerId | null>(null);
  const [chosenTargets, setChosenTargets] = useState<PlayerId[]>([]);
  const [pendingSocialCard, setPendingSocialCard] = useState<CardDisplay | null>(null);
  const [chosenSocialTarget, setChosenSocialTarget] = useState<PlayerId | null>(null);

  // Dual-role target flow (A115: tallest, then shortest -- two sequential
  // single-target picks, since click order in a multi-select roster can't
  // safely disambiguate two distinct roles).
  const [dualPickPhase, setDualPickPhase] = useState<'first' | 'second' | null>(null);
  const [dualPickFirstId, setDualPickFirstId] = useState<PlayerId | null>(null);

  // A028 "Bad Spread" co-play flow: A028 is never played directly (its
  // executeEffect is an unreachable stub -- see game/actionRules/definitions.ts).
  // Tapping it opens a picker for a "quantity effect" partner card already in
  // hand, which then goes through ITS OWN normal input flow (reusing the
  // existing TargetSelector/OutcomeToggle/etc. below), and on confirm pushes
  // one doubled frame via playDoubledAction instead of the normal playAction.
  const [pendingDoublePartner, setPendingDoublePartner] = useState<CardDisplay | null>(null);
  const [awaitingDoublePartnerPick, setAwaitingDoublePartnerPick] = useState(false);

  // Honor-system drink-check flow (A158: outcome toggle, then -- only if
  // "haven't drunk yet" -- a single target pick. No persistent drink
  // tracking anywhere; resolved live at play time.)
  const [drinkCheckPhase, setDrinkCheckPhase] = useState<'outcome' | 'target' | null>(null);

  // Target-then-outcome flow (A166: pick a target, then report a binary
  // outcome for that specific target -- each outcome has a different
  // recipient, so both pieces of input are needed before the frame is pushed)
  const [targetThenOutcomePhase, setTargetThenOutcomePhase] = useState<'target' | 'outcome' | null>(null);

  // Trap Open Flow State
  const [pendingTrapCode, setPendingTrapCode] = useState<CardCode | null>(null);
  const [trapTargetPrompt, setTrapTargetPrompt] = useState<string>('เลือกผู้เล่นเป้าหมาย');
  const [pendingTrapOpen, setPendingTrapOpen] = useState<CardDisplay | null>(null);
  const [awaitingTrapTarget, setAwaitingTrapTarget] = useState(false);
  const [chosenTrapTarget, setChosenTrapTarget] = useState<PlayerId | null>(null);
  const [chosenTrapTargets, setChosenTrapTargets] = useState<PlayerId[]>([]);
  const [delegatedPick, setDelegatedPick] = useState<{ interactionId: string; targetId: PlayerId } | null>(null);

  // Generic digital Counter target flow state. Selection is local until Confirm.
  const [pendingCounterCode, setPendingCounterCode] = useState<CardCode | null>(null);
  const [chosenCounterTarget, setChosenCounterTarget] = useState<PlayerId | null>(null);
  const [pendingCounterCount, setPendingCounterCount] = useState<CardCode | null>(null);

  // Auto-close trap open flow or C04 target flow if a counter response window opens or closes
  useEffect(() => {
    if (pendingResponse && (pendingTrapOpen !== null || pendingTrapCode !== null || awaitingTrapTarget)) {
      setPendingTrapOpen(null);
      setPendingTrapCode(null);
      setAwaitingTrapTarget(false);
      setChosenTrapTarget(null);
    }
    if (!pendingResponse && pendingCounterCode !== null) {
      setPendingCounterCode(null);
      setChosenCounterTarget(null);
    }
  }, [pendingResponse, pendingTrapOpen, pendingTrapCode, awaitingTrapTarget, pendingCounterCode]);

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
  // A035 "Come Out to Play" -- blocks ending this turn until an obligated Action is played.
  const mustPlayActionFirst = Boolean(me.mustPlayActionThisTurn) && !me.hasPlayedActionThisTurn;

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

  // The whole table, actor included, in the same seat order. Used only by rules
  // that set includeSelfAsCandidate -- a mini-game the actor is competing in
  // ("who won the staring contest?") or a factual question about everyone
  // ("who is oldest?"). Handing those the opponents-only list doesn't hide an
  // option, it fixes the answer: the actor could never win their own duel.
  const tableCandidates = useMemo(() => {
    return seatOrder
      .filter((id) => state.players[id] !== undefined)
      .map((id) => ({ id, player: state.players[id] }));
  }, [seatOrder, state.players]);

  // Handlers for Hand Tray Actions
  const todayMMDD = () => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // A028 co-play: which cards currently in hand are eligible partners
  // (excludes A028 itself, must be a "quantity effect" card per the Task 7
  // allow-list, and must actually be implemented in the registry).
  const qualifyingPartnerCandidates = me.hand.filter(
    (code) => code !== 'A028' && isQuantityEffectCard(code) && isActionImplemented(code)
  );

  const handlePlayActionDirect = (cardCode: CardCode) => {
    if (!canAct) return;
    // A028 "Bad Spread" must NEVER resolve through the plain single-card
    // play path -- its executeEffect is an unreachable no-op stub. Route it
    // to the co-play partner picker instead, and stop here.
    if (cardCode === 'A028') {
      setAwaitingDoublePartnerPick(true);
      return;
    }
    // A037/A066/A137 need "today" to resolve their birthday comparison.
    // Stamped here (the actor's own device clock) rather than read inside
    // executeEffect, which must stay a pure function of (state, frame).
    if (getActionRule(cardCode)?.needsTodayDate) {
      playAction(cardCode, undefined, { today: todayMMDD() });
      return;
    }
    playAction(cardCode);
  };

  const handlePickDoublePartner = (partnerCode: CardCode) => {
    const card = getCardDisplay(partnerCode);
    setAwaitingDoublePartnerPick(false);
    const rule = getActionRule(card.code);
    // Flagless partner (e.g. A127): its normal solo-play flow is "no picker
    // at all, immediate play" (see handlePlayActionDirect) -- routing it
    // through pendingTargetCard would open the primary TargetSelector below
    // regardless, since that selector's `open` condition has no positive
    // check for needsTargetSelection/needsRosterSelection, only negative
    // checks for the OTHER flows' flags, all of which are false/undefined
    // here too. Skip straight to playDoubledAction instead, mirroring
    // handlePlayActionDirect's flagless branch exactly.
    //
    // needsTodayDate is deliberately excluded from this picker-open check
    // (via the { needsTodayDate: false } override below) even though
    // hasAnyInputFlag itself checks it: needsTodayDate needs a stamped
    // value, not a picker, so a rule whose ONLY true flag is needsTodayDate
    // must still take this no-picker branch -- it just also needs "today"
    // stamped into the dispatched payload, mirroring how
    // handlePlayActionDirect/todayMMDD() already handle needsTodayDate for
    // solo play. Currently inert: no code in the QUANTITY_EFFECT_CARDS
    // allow-list is needsTodayDate-only (the only needsTodayDate cards --
    // A037/A066/A137/A017/A108 -- either aren't in the allow-list or also
    // carry needsTargetSelection, which already forces the picker branch
    // below), so this is untested by any real-card test; a fake card code
    // would test something that can't occur with real data, so it's left
    // as a documented gap instead.
    if (!hasAnyInputFlag(rule ? { ...rule, needsTodayDate: false } : rule)) {
      setPendingDoublePartner(null);
      const todayPayload = rule?.needsTodayDate ? { today: todayMMDD() } : undefined;
      playDoubledAction(card.code, undefined, todayPayload);
      return;
    }
    setPendingDoublePartner(card);
    setPendingTargetCard(card); // reuses the existing target-selection UI for the partner card
    setChosenTarget(null);
    setChosenTargets([]);
    // Mirror handleRequestTarget's phase-initialization exactly -- the
    // partner card may need the dual-pick (A115), drink-check (A158), or
    // target-then-outcome (A166) flows below, not just the plain single/
    // roster TargetSelector, and those flows are gated on this phase state.
    setDualPickPhase(rule?.needsDualTargetSelection ? 'first' : null);
    setDualPickFirstId(null);
    setDrinkCheckPhase(rule?.needsDrinkCheck ? 'outcome' : null);
    setTargetThenOutcomePhase(rule?.needsTargetThenOutcome ? 'target' : null);
  };

  const handleConfirmDoubledTargetAction = () => {
    if (!pendingDoublePartner) return;
    const rule = getActionRule(pendingDoublePartner.code);
    const todayPayload = rule?.needsTodayDate ? { today: todayMMDD() } : undefined;
    if (rule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rule.rosterSelectionCount !== undefined && chosenTargets.length !== rule.rosterSelectionCount) return;
      playDoubledAction(pendingDoublePartner.code, undefined, { rosterIds: chosenTargets, ...todayPayload });
    } else if (chosenTarget) {
      playDoubledAction(pendingDoublePartner.code, chosenTarget, todayPayload);
    } else {
      playDoubledAction(pendingDoublePartner.code, undefined, todayPayload);
    }
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };

  const handleCancelDoublePartner = () => {
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
    setDualPickPhase(null);
    setDualPickFirstId(null);
    setDrinkCheckPhase(null);
    setTargetThenOutcomePhase(null);
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
    setDrinkCheckPhase(rule?.needsDrinkCheck ? 'outcome' : null);
    setTargetThenOutcomePhase(rule?.needsTargetThenOutcome ? 'target' : null);
  };

  const pendingActionRule = pendingTargetCard ? getActionRule(pendingTargetCard.code) : undefined;
  const rosterSelectionCount = pendingActionRule?.rosterSelectionCount;

  const handleConfirmTargetAction = () => {
    if (!pendingTargetCard) return;
    const todayPayload = pendingActionRule?.needsTodayDate ? { today: todayMMDD() } : undefined;
    if (pendingActionRule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rosterSelectionCount !== undefined && chosenTargets.length !== rosterSelectionCount) return;
      playAction(pendingTargetCard.code, undefined, { rosterIds: chosenTargets, ...todayPayload });
    } else {
      if (!chosenTarget) return;
      playAction(pendingTargetCard.code, chosenTarget, todayPayload);
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
    if (pendingDoublePartner) {
      playDoubledAction(pendingTargetCard.code, undefined, { firstId: dualPickFirstId, secondId: chosenTarget });
    } else {
      playAction(pendingTargetCard.code, undefined, { firstId: dualPickFirstId, secondId: chosenTarget });
    }
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setDualPickPhase(null);
    setDualPickFirstId(null);
  };

  const handleDualPickCancel = () => {
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setDualPickPhase(null);
    setDualPickFirstId(null);
  };

  const handleOutcomeSelect = (outcome: boolean) => {
    if (!pendingTargetCard) return;
    if (pendingDoublePartner) {
      playDoubledAction(pendingTargetCard.code, undefined, { outcome });
    } else {
      playAction(pendingTargetCard.code, undefined, { outcome });
    }
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
  };

  const handleNumberInputConfirm = (numberInput: number) => {
    if (!pendingTargetCard) return;
    playAction(pendingTargetCard.code, undefined, { numberInput });
    setPendingTargetCard(null);
  };

  const handleDrinkCheckCancel = () => {
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setDrinkCheckPhase(null);
  };

  const handleDrinkOutcomeSelect = (alreadyDrunk: boolean) => {
    if (!pendingTargetCard) return;
    if (alreadyDrunk) {
      if (pendingDoublePartner) {
        playDoubledAction(pendingTargetCard.code);
      } else {
        playAction(pendingTargetCard.code);
      }
      handleDrinkCheckCancel();
      return;
    }
    setDrinkCheckPhase('target');
  };

  const handleDrinkTargetConfirm = () => {
    if (!pendingTargetCard || !chosenTarget) return;
    if (pendingDoublePartner) {
      playDoubledAction(pendingTargetCard.code, chosenTarget);
    } else {
      playAction(pendingTargetCard.code, chosenTarget);
    }
    handleDrinkCheckCancel();
  };

  const handleTargetThenOutcomeCancel = () => {
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setTargetThenOutcomePhase(null);
  };

  const handleTargetThenOutcomeTargetConfirm = () => {
    if (!pendingTargetCard || !chosenTarget) return;
    setTargetThenOutcomePhase('outcome');
  };

  const handleTargetThenOutcomeSelect = (outcome: boolean) => {
    if (!pendingTargetCard || !chosenTarget) return;
    if (pendingDoublePartner) {
      playDoubledAction(pendingTargetCard.code, chosenTarget, { outcome });
    } else {
      playAction(pendingTargetCard.code, chosenTarget, { outcome });
    }
    handleTargetThenOutcomeCancel();
  };

  // Handlers for Opening Active Traps
  const handleOpenTrapTap = (trapCode: CardCode) => {
    if (pendingResponse || state.pendingInteraction) return;
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
    return getPlayableCountersForActiveFrame(state, myPlayerId);
  }, [myPlayerId, state]);

  const counterTargetCandidates = useMemo(() => {
    return opponentCandidates.filter((c) => c.id !== pendingResponse?.actorId && c.id !== myPlayerId);
  }, [opponentCandidates, pendingResponse?.actorId, myPlayerId]);


  return (
    <PresentationProvider>
      <PresentationBridge state={state} viewerId={myPlayerId} />
      <PresentationOverlay />
      <ActivityFeed />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-start p-3 pb-28 bg-gradient-to-b from-gray-50/70 via-white to-gray-50/70 overflow-x-hidden" data-player-anchor={myPlayerId}>
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
      <div className="flex-1 min-h-[12px]" />

      {/* =================================================== */}
      {/* C. ACTIVE TRAPS & LIVE GAME STATUS                  */}
      {/* =================================================== */}
      <div className="flex flex-col gap-1.5 shrink-0 mt-auto mb-2">
        {/* 5. Section 4: My Active Traps (Always 3 portrait 2:3 slots) */}
        <ActiveTrapsSection
          traps={me.traps}
          onOpenTrap={handleOpenTrapTap}
          onAddTrapSlotClick={() => setIsHandTrayOpen(true)}
          disabled={pendingResponse !== null || Boolean(state.pendingInteraction) || isShuffling || isRoundTransitionActive}
        />

        {/* Live Gameplay Status Pill (Directly below Active Traps, above Bottom Action Bar) */}
        <LiveGameStatus viewerId={myPlayerId} players={state.players} />

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

        {/* A035 "Come Out to Play" obligation banner -- blocks ending this turn */}
        {isMyTurn && mustPlayActionFirst && (
          <div className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 shrink-0">
            <span>ต้องเล่น Action ก่อนจบเทิร์นนี้ (A035)</span>
          </div>
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
        hasBonusActionPlays={(me.bonusActionPlaysRemaining ?? 0) > 0}
        isTrapPlacementPhase={state.turnPhase === 'trap_placement'}
        trapsCount={me.traps.length}
        onClose={() => setIsHandTrayOpen(false)}
        onPlayAction={handlePlayActionDirect}
        onPlaceTrap={handlePlaceTrap}
        onRequestTarget={handleRequestTarget}
        onPlaySocialCounter={(card) => {
          if (card.needsTarget || Boolean(getSocialCounterConfig(card.code)?.needsTarget)) {
            setPendingSocialCard(card);
            setChosenSocialTarget(null);
          } else {
            playSocialCounter(card.code);
          }
        }}
      />

      {/* 9.5 A028 "Bad Spread" Co-Play Partner Picker (pick a quantity-effect
          Action card from hand to double -- its own input flow then reuses
          the TargetSelector/OutcomeToggle/etc. below via pendingDoublePartner) */}
      {awaitingDoublePartnerPick && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="flex-1" onClick={() => setAwaitingDoublePartnerPick(false)} />
          <div className="flex max-h-[85vh] w-full max-w-md mx-auto flex-col rounded-t-3xl border-t border-gray-100 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <h2 className="text-sm sm:text-base font-black text-ink">
                เลือก Action การ์ดที่จะเพิ่ม Effect เป็น 2 เท่า
              </h2>
              <button
                type="button"
                onClick={() => setAwaitingDoublePartnerPick(false)}
                aria-label="ปิด"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-gray-100 active:scale-95 transition-colors"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 min-h-[80px]">
              {qualifyingPartnerCandidates.length === 0 ? (
                <p className="text-center text-xs font-bold text-ink-secondary py-4">
                  ไม่มีการ์ดที่ใช้ร่วมกับ A028 ได้ในมือของคุณ
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {qualifyingPartnerCandidates.map((cardCode) => {
                    const partnerDisplay = getCardDisplay(cardCode);
                    return (
                      <button
                        key={cardCode}
                        type="button"
                        onClick={() => handlePickDoublePartner(cardCode)}
                        className="w-full rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-left transition-colors hover:bg-gray-100 active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-ink-secondary">{cardCode}</span>
                          <span className="text-sm font-black text-ink">{partnerDisplay.th}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-secondary leading-relaxed">{partnerDisplay.effect}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAwaitingDoublePartnerPick(false)}
              className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-xs font-bold text-ink-secondary hover:bg-gray-100 transition-colors active:scale-95"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* 10. Action Card Target Selector (single target, or multi-select roster
          when the card's rule needs a roster_select -- e.g. "who matches this
          condition" cards like the Family A / classification-doc examples) */}
      <TargetSelector
        open={pendingTargetCard !== null && dualPickPhase === null && !pendingActionRule?.needsOutcomeEntry && !pendingActionRule?.needsNumberInput && !pendingActionRule?.needsDrinkCheck && !pendingActionRule?.needsTargetThenOutcome}
        candidates={
          pendingTargetCard?.code === 'A108'
            ? opponentCandidates.filter((c) => getPlayableActions(state, c.id).length > 0)
            : pendingActionRule?.includeSelfAsCandidate
              ? tableCandidates
              : opponentCandidates
        }
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
        onConfirm={pendingDoublePartner ? handleConfirmDoubledTargetAction : handleConfirmTargetAction}
        onCancel={
          pendingDoublePartner
            ? handleCancelDoublePartner
            : () => {
                setPendingTargetCard(null);
                setChosenTarget(null);
                setChosenTargets([]);
              }
        }
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
        candidates={
          (pendingActionRule?.includeSelfAsCandidate ? tableCandidates : opponentCandidates)
            .filter((c) => dualPickPhase !== 'second' || c.id !== dualPickFirstId)
        }
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
        onCancel={() => {
          setPendingDoublePartner(null);
          setPendingTargetCard(null);
        }}
      />

      {/* 10.6 Action Card Number Input (free-form number, e.g. A135's new
          Muffin Time target) */}
      <NumberInputModal
        open={pendingTargetCard !== null && pendingActionRule?.needsNumberInput === true}
        prompt={pendingActionRule?.numberInputPrompt ?? pendingTargetCard?.effect ?? ''}
        min={pendingActionRule?.numberInputMin}
        max={pendingActionRule?.numberInputMax}
        onConfirm={handleNumberInputConfirm}
        onCancel={() => setPendingTargetCard(null)}
      />

      {/* 10.7 Action Card Drink Check (A158: honor-system outcome toggle,
          then -- only if "haven't drunk yet" -- a single target pick) */}
      <OutcomeToggle
        open={pendingTargetCard !== null && pendingActionRule?.needsDrinkCheck === true && drinkCheckPhase === 'outcome'}
        prompt={pendingActionRule?.outcomePrompt ?? pendingTargetCard?.effect ?? ''}
        yesLabel={pendingActionRule?.outcomeYesLabel}
        noLabel={pendingActionRule?.outcomeNoLabel}
        onSelect={handleDrinkOutcomeSelect}
        onCancel={handleDrinkCheckCancel}
      />
      <TargetSelector
        open={pendingTargetCard !== null && pendingActionRule?.needsDrinkCheck === true && drinkCheckPhase === 'target'}
        candidates={opponentCandidates}
        selectedId={chosenTarget}
        onSelect={(id) => setChosenTarget(id)}
        onConfirm={handleDrinkTargetConfirm}
        onCancel={handleDrinkCheckCancel}
        prompt={pendingActionRule?.targetPrompt ?? pendingTargetCard?.effect ?? 'เลือกผู้เล่นเป้าหมาย'}
      />

      {/* 10.8 Action Card Target-Then-Outcome (A166: pick a target, then
          report a binary outcome for that specific target -- each outcome
          has a different recipient) */}
      <TargetSelector
        open={pendingTargetCard !== null && pendingActionRule?.needsTargetThenOutcome === true && targetThenOutcomePhase === 'target'}
        candidates={opponentCandidates}
        selectedId={chosenTarget}
        onSelect={(id) => setChosenTarget(id)}
        onConfirm={handleTargetThenOutcomeTargetConfirm}
        onCancel={handleTargetThenOutcomeCancel}
        prompt={pendingActionRule?.targetPrompt ?? pendingTargetCard?.effect ?? 'เลือกผู้เล่นเป้าหมาย'}
      />
      <OutcomeToggle
        open={pendingTargetCard !== null && pendingActionRule?.needsTargetThenOutcome === true && targetThenOutcomePhase === 'outcome'}
        prompt={pendingActionRule?.outcomePrompt ?? pendingTargetCard?.effect ?? ''}
        yesLabel={pendingActionRule?.outcomeYesLabel}
        noLabel={pendingActionRule?.outcomeNoLabel}
        onSelect={handleTargetThenOutcomeSelect}
        onCancel={handleTargetThenOutcomeCancel}
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

      {/* 12.6 Delegated Target Pick Modal (Group 1 Cluster C: A126, A130 --
          the player the actor chose must now pick one further player,
          excluding themselves, before the card's effect resolves) */}
      <TargetSelector
        open={Boolean(
          state.pendingInteraction?.type === 'delegated_target_pick' &&
          state.pendingInteraction.targetPlayerId === myPlayerId
        )}
        candidates={opponentCandidates}
        selectedId={delegatedPick !== null && delegatedPick.interactionId === state.pendingInteraction?.interactionId ? delegatedPick.targetId : null}
        onSelect={(id) => {
          if (state.pendingInteraction) {
            setDelegatedPick({ interactionId: state.pendingInteraction.interactionId, targetId: id });
          }
        }}
        onConfirm={() => {
          if (state.pendingInteraction && delegatedPick?.interactionId === state.pendingInteraction.interactionId) {
            respondToDelegatedTargetPick(state.pendingInteraction.interactionId, delegatedPick.targetId);
            setDelegatedPick(null);
          }
        }}
        prompt={state.pendingInteraction?.prompt ?? ''}
      />

      {/* 13. Trap Alert & Counter Decision Modal (When local player is hit by a Trap) */}
      <TrapAlertModal
        open={Boolean(isLocalTrapTarget && pendingResponse)}
        trapCode={pendingResponse?.kind === 'trap' ? pendingResponse.code : null}
        actorId={pendingResponse?.actorId}
        actorName={pendingResponse?.actorId ? state.players[pendingResponse.actorId]?.name : 'ฝ่ายตรงข้าม'}
        counterCards={validCounterCards}
        responseId={pendingResponse?.responseId}
        onPlayCounter={(code) => {
          if (!pendingResponse) return;
          if (code === 'C01') {
            setPendingCounterCount(code);
            return;
          }
          if (getCounterInteraction(code).requiresTarget) {
            setPendingCounterCode(code);
            setChosenCounterTarget(null);
            return;
          }
          playCounter(code, pendingResponse.responseId);
        }}
        onDecline={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />

      {/* 14. Counter Card Response Window Modal (For Action responses) */}
      <CounterModal
        open={(pendingResponse?.kind === 'action' || pendingResponse?.kind === 'counter') && validCounterCards.length > 0}
        counterCards={validCounterCards}
        onPlay={(code) => {
          if (!pendingResponse) return;
          if (code === 'C01') {
            setPendingCounterCount(code);
            return;
          }
          if (getCounterInteraction(code).requiresTarget) {
            setPendingCounterCode(code);
            setChosenCounterTarget(null);
            return;
          }
          playCounter(code, pendingResponse.responseId);
        }}
        onSkip={() => pendingResponse && skipCounter(pendingResponse.responseId)}
      />

      {/* 14.5 Generic target selector for digital Counters */}
      <TargetSelector
        open={pendingSocialCard !== null}
        candidates={opponentCandidates}
        selectedId={chosenSocialTarget}
        onSelect={setChosenSocialTarget}
        onConfirm={() => {
          if (!pendingSocialCard || !chosenSocialTarget) return;
          playSocialCounter(pendingSocialCard.code, chosenSocialTarget);
          setPendingSocialCard(null);
          setChosenSocialTarget(null);
        }}
        onCancel={() => {
          setPendingSocialCard(null);
          setChosenSocialTarget(null);
        }}
        prompt={pendingSocialCard?.effect ?? 'เลือกผู้เล่นเป้าหมาย'}
      />
      <NumberInputModal
        open={pendingCounterCount === 'C01' && pendingResponse !== null}
        prompt="จำนวนไพ่ที่จะขโมย"
        min={1}
        max={pendingResponse ? state.players[pendingResponse.actorId]?.hand.length ?? 1 : 1}
        onConfirm={(value) => {
          if (!pendingResponse || pendingCounterCount !== 'C01') return;
          playCounter('C01', pendingResponse.responseId, undefined, { stealCount: value });
          setPendingCounterCount(null);
        }}
        onCancel={() => setPendingCounterCount(null)}
      />
      <TargetSelector
        open={pendingCounterCode !== null && pendingResponse !== null}
        candidates={counterTargetCandidates}
        selectedId={chosenCounterTarget}
        onSelect={(id) => setChosenCounterTarget(id)}
        onConfirm={() => {
          if (pendingResponse && pendingCounterCode && chosenCounterTarget) {
            const payloadKey = getCounterInteraction(pendingCounterCode).payloadKey;
            playCounter(pendingCounterCode, pendingResponse.responseId, undefined, {
              [payloadKey ?? 'targetPlayerId']: chosenCounterTarget,
            });
            setPendingCounterCode(null);
            setChosenCounterTarget(null);
          }
        }}
        onCancel={() => {
          setPendingCounterCode(null);
          setChosenCounterTarget(null);
        }}
        prompt={pendingCounterCode ? getCardDisplay(pendingCounterCode).effect : 'เลือกผู้เล่นเป้าหมาย'}
      />



      {/* 14. Action & Trap Result Notification Modals */}
      <TrapResultModal
        result={lastResult}
        ownerName={lastResult ? state.players[lastResult.actorId]?.name ?? '' : ''}
        targetName={lastResult?.targetId ? state.players[lastResult.targetId]?.name : undefined}
        onClose={clearLastResult}
      />

      <ActionResultModal
        result={lastResult}
        actorName={lastResult ? state.players[lastResult.actorId]?.name ?? '' : ''}
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
        canActAsHost={canActAsHost}
        onClose={() => setIsSettingsOpen(false)}
        onOpenCardGallery={() => setIsCardGalleryOpen(true)}
        onOpenShuffleConfirm={() => setIsShuffleConfirmOpen(true)}
        isShuffleDisabled={isShuffleDisabled}
        shuffleDisabledReason={shuffleDisabledReason}
        onOpenManualFinish={() => setIsManualFinishOpen(true)}
        onOpenHostUnstick={() => setIsHostSkipConfirmOpen(true)}
        hostUnstickLabel={pendingResponse ? 'บังคับข้ามการตอบโต้ที่ค้าง' : 'บังคับข้ามเทิร์นที่ค้าง'}
        onOpenManualDiscard={() => setIsManualDiscardOpen(true)}
        onOpenManualGive={() => setIsManualGiveOpen(true)}
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

      {/* 19. Bug Recovery Modals */}
      <ManualDiscardModal
        isOpen={isManualDiscardOpen}
        hand={me?.hand ?? []}
        onClose={() => setIsManualDiscardOpen(false)}
        onConfirmDiscard={(cardCodes) => manualDiscard(cardCodes)}
      />

      {myPlayerId && (
        <ManualGiveModal
          isOpen={isManualGiveOpen}
          hand={me?.hand ?? []}
          players={state.players}
          myPlayerId={myPlayerId}
          onClose={() => setIsManualGiveOpen(false)}
          onConfirmGive={(recipientId, cardCodes) => manualGiveCard(recipientId, cardCodes)}
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
              คุณจะกลับสู่หน้าหลัก แต่ที่นั่งของคุณยังอยู่ในเกมจนกว่าโฮสต์จะกด "บังคับข้ามที่ค้าง"
              เพื่อไม่ให้ไพ่ในมือของคุณหายไปกลางเกม
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
    </PresentationProvider>
  );
}

