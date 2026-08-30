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
}
