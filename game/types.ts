export type PlayerId = string;
export type CardCode = string;
export type Rng = () => number;
export type PlayDirection = 'clockwise' | 'counterclockwise';

export interface PendingResponse {
  responseId: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
}

export interface LastResult {
  responseId?: string;
  kind: 'action' | 'trap';
  code: CardCode;
  actorId: PlayerId;
  targetId?: PlayerId;
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
}

// No `log` field: the original design's Firebase sketch mentioned one, but no
// engine function reads or writes it — add it when a real producer exists.
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
  pendingResponse?: PendingResponse | null;
  lastResult?: LastResult | null;
}





