export type PlayerId = string;
export type CardCode = string;
export type Rng = () => number;

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
  status: 'lobby' | 'playing' | 'ended';
  hostId: PlayerId;
  turnOrder: PlayerId[];
  currentTurnIndex: number;
  direction: 1 | -1;
  muffinTimeTarget: number;
  drawPile: CardCode[];
  discardPile: CardCode[];
  players: Record<PlayerId, PlayerState>;
  maxPlayers?: number;
}
