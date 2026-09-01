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
  isShufflingDrawPile?: boolean;
  shuffleSequence?: number;
  roundNumber?: number;
  sequenceNumber?: number;

  // Reaction Stack and Turn Phase
  turnPhase?: TurnPhase;
  reactionStack?: StackFrame[];

  // Interactive Trap / Event State (e.g. T10 date invite)
  pendingInteraction?: PendingInteraction | null;

  // Backward-compatibility bridge
  pendingResponse?: PendingResponse | null;
  lastResult?: LastResult | null;
}





