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

export interface RoomState {
  status: 'lobby' | 'setup' | 'playing' | 'ended' | 'finished';
  hostId: PlayerId;
  joinOrder?: PlayerId[];
  seatOrder?: PlayerId[];
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

  // Backward-compatibility bridge
  pendingResponse?: PendingResponse | null;
  lastResult?: LastResult | null;
}





