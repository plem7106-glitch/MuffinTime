import type { PlayerId, CardCode } from '../../game/types';

export type LiveStatusKind =
  | 'idle-turn'
  | 'draw'
  | 'action'
  | 'trap-placement'
  | 'trap-activation'
  | 'counter'
  | 'transfer'
  | 'discard'
  | 'waiting-response'
  | 'waiting-target'
  | 'waiting-discard'
  | 'waiting-choice'
  | 'muffin-time'
  | 'your-turn';

export interface LiveGameStatusData {
  kind: LiveStatusKind;
  actorId?: PlayerId;
  targetId?: PlayerId;
  affectedPlayerIds?: PlayerId[];
  cardCode?: CardCode;
  count?: number;
  emphasis?: 'normal' | 'viewer-targeted' | 'viewer-action-required';
  timestamp?: number;
}
