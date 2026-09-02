export type PlayerId = string;
export type CardCode = string;
export type Rng = () => number;
export type PlayDirection = 'clockwise' | 'counterclockwise';

export type TurnPhase = 'trap_placement' | 'main' | 'resolving_stack' | 'interrupted';
export type FrameSourceType = 'action' | 'trap' | 'counter';
export type FrameStatus = 'pending_responses' | 'resolving' | 'resolved' | 'cancelled';
export type TargetScope = 'single' | 'multi' | 'all_others' | 'all' | 'self';

export type EffectModifierType =
  | 'cancel_all'
  | 'protect_target'
  | 'protect_other'
  | 'redirect'
  | 'reflect'
  | 'modify_count'
  | 'negate_counter';

export interface EffectModifier {
  modifierId: string;
  sourceFrameId: string;
  type: EffectModifierType;
  affectedTargetIds?: PlayerId[];
  newTargetIds?: PlayerId[];
  deltaCount?: number;
}

export interface PlayerResponseStatus {
  status: 'pending' | 'skipped' | 'countered';
  counterCode?: CardCode;
  selectedCards?: CardCode[];
  submittedAt?: number;
}

export interface TriggerContext {
  triggerType: 'manual_declaration' | 'game_event';
  eventId?: string;
  triggerPlayerIds: PlayerId[];
  note?: string;
}

export interface StackFrame {
  frameId: string;
  parentFrameId: string | null;
  sourceType: FrameSourceType;
  sourceCode: CardCode;
  actorId: PlayerId;
  triggerPlayerIds?: PlayerId[];
  affectedPlayerIds?: PlayerId[];
  targetIds: PlayerId[];
  targetScope: TargetScope;
  eligibleResponderIds: PlayerId[];
  responses: Record<PlayerId, PlayerResponseStatus>;
  modifiers: EffectModifier[];
  status: FrameStatus;
  triggerContext?: TriggerContext;
  turnContext: {
    turnIndex: number;
    phase: TurnPhase;
    roundNumber: number;
  };
  customPayload?: Record<string, unknown>;
}

export type UnderCountPolicy =
  | 'clamp_to_available'
  | 'all_or_nothing'
  | 'penalize_if_unable'
  | 'rule_delegate';

export interface CardCountEvaluation {
  requestedCount: number;
  availableCount: number;
  resolvedCount: number;
  policy: UnderCountPolicy;
  unfulfilledCount: number;
}

export interface PendingResponse {
  responseId: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  triggerPlayerIds?: PlayerId[];
  affectedPlayerIds?: PlayerId[];
  targetId?: PlayerId;
  targetIds?: PlayerId[];
  targetScope?: TargetScope;
  eligibleResponderIds?: PlayerId[];
  responses?: Record<PlayerId, PlayerResponseStatus>;
  triggerContext?: TriggerContext;
}

export interface LastResult {
  responseId?: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  triggerPlayerIds?: PlayerId[];
  affectedPlayerIds?: PlayerId[];
  targetId?: PlayerId;
  targetIds?: PlayerId[];
  countered: boolean;
  counteredBy?: PlayerId;
  counterCode?: CardCode;
}

export interface PlayerState {
  name: string;
  hand: CardCode[];
  traps: CardCode[];
  connected: boolean;
  hasCalledMuffinTime: boolean;
  skipNextTurn: boolean;
  placedTrapThisTurn?: boolean;
  hasDrawnThisTurn?: boolean;
  hasPlayedActionThisTurn?: boolean;
  /** Optional, self-reported, month-and-day only ("MM-DD") -- deliberately
   * never a full date. Used only by A037/A066/A137. A player who never sets
   * this is simply excluded from those cards' birthday comparisons. */
  birthdayMMDD?: string;
  /** A100: extra Action plays available this turn, beyond the normal 1.
   * Reset to 0 every turn by advanceTurn, same as hasPlayedActionThisTurn. */
  bonusActionPlaysRemaining?: number;
  /** A035: this player is obligated to play an Action before ending their
   * current turn. Set only by resolvePendingActionObligations when it finds
   * them holding ≥1 Action card at their obligated turn's start. Reset to
   * false every turn by advanceTurn. */
  mustPlayActionThisTurn?: boolean;
}

export interface PendingInteraction {
  interactionId: string;
  type: 'date_invite' | string;
  sourceCardCode: CardCode;
  initiatorId: PlayerId;
  targetPlayerId: PlayerId;
  prompt?: string;
  timestamp: number;
}

/**
 * A temporary table-wide rule suspension ("...until your next turn" Action
 * cards -- A019/A072/A085). Cleared by game/turn.ts's advanceTurn the moment
 * play returns to sourcePlayerId -- no expiry counter/index needed, since
 * "until your next turn" is naturally "until it's your turn again".
 */
export interface GlobalRestriction {
  type: 'no_counters' | 'no_actions' | 'no_win';
  sourcePlayerId: PlayerId;
}

/**
 * A win/lose evaluation deferred to sourcePlayerId's own next turn
 * (A023/A024/A027's "by your next turn..." Action cards) -- there is no
 * mechanism for arbitrary future-turn effects, so this is scoped narrowly to
 * "declare a winner (or not) the moment play returns to sourcePlayerId".
 * Pushed by the card's executeEffect, consumed exactly once (removed
 * regardless of outcome) by game/turn.ts's resolvePendingWinChecks, which
 * lib/session.tsx's advanceAndCheckWin calls on every turn transition --
 * mirrors GlobalRestriction's "until your next turn" lifecycle above.
 */
export interface PendingWinCheck {
  sourcePlayerId: PlayerId;
  /** hand_nonempty: A023 (actor still holds cards) -- fewest_hand: A024
   * (least cards wins, tie = no winner) -- most_hand: A027 (most cards
   * wins, tie = no winner). */
  type: 'hand_nonempty' | 'fewest_hand' | 'most_hand';
}

export interface RoomState {
  status: 'lobby' | 'setup' | 'playing' | 'ended' | 'finished';
  hostId: PlayerId;
  joinOrder?: PlayerId[];
  seatOrder?: PlayerId[];
  /** Whoever suggested playing this game, host-picked during setup once the
   * roster is locked (game/room.ts's setGameSuggester). Optional/self-serve
   * -- a room where the host skips this simply never has an A118 target.
   * Used only by A118. */
  gameSuggesterId?: PlayerId;
  playDirection?: PlayDirection;
  turnOrder: PlayerId[];
  currentTurnIndex: number;
  direction: 1 | -1;
  muffinTimeTarget: number;
  drawPile: CardCode[];
  discardPile: CardCode[];
  players: Record<PlayerId, PlayerState>;
  maxPlayers?: number;
  winnerId?: PlayerId;
  finishReason?: 'normal' | 'manual';
  gameEndReason?: 'deck_exhausted' | 'muffin_time' | 'manual';
  winnerPlayerIds?: PlayerId[];
  finalHandCounts?: Record<PlayerId, number>;
  isShufflingDrawPile?: boolean;
  shuffleSequence?: number;
  roundNumber?: number;
  sequenceNumber?: number;
  gameEvents?: import('./events').GameEvent[];
  pendingForcedDiscards?: Record<string, import('./forcedDiscard').ForcedDiscardOperation>;

  // Reaction Stack and Turn Phase
  turnPhase?: TurnPhase;
  reactionStack?: StackFrame[];

  // Interactive Trap / Event State (e.g. T10 date invite)
  pendingInteraction?: PendingInteraction | null;
  placedTrapMeta?: Record<string, { ownerId: PlayerId; placedSequence: number; placedRound: number; placedByPlayerTurnIndex: number }>;

  // Temporary table-wide rule suspensions (e.g. A019/A072/A085)
  globalRestrictions?: GlobalRestriction[];

  // Win/lose checks deferred to a specific player's own next turn (A023/A024/A027)
  pendingWinChecks?: PendingWinCheck[];

  /** A035: player IDs still owed an obligation check on their own next turn.
   * Consumed exactly once per player by resolvePendingActionObligations,
   * mirroring PendingWinCheck/resolvePendingWinChecks's lifecycle. */
  pendingActionObligations?: PlayerId[];

  /** A040: an active "next N Action plays redirect to my hand" effect.
   * null/undefined when inactive. Cleared to null when remaining hits 0.
   * Any player's Action play counts, not just the actor who set it up. */
  actionRedirect?: { toPlayerId: PlayerId; remaining: number } | null;

  // Backward-compatibility bridge
  pendingResponse?: PendingResponse | null;
  lastResult?: LastResult | null;
}





