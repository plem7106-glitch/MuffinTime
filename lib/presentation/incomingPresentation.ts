import type { CardCode } from '../../game/types';
import type { PlayerId, StackFrame } from '../../game/types';

export interface IncomingIdentity {
  frameId?: string;
  eventId?: string;
  cardCode?: CardCode;
}

export function getIncomingPresentationKey(identity: IncomingIdentity): string {
  if (identity.frameId) return `frame:${identity.frameId}`;
  if (identity.eventId) return `event:${identity.eventId}`;
  return `card:${identity.cardCode ?? 'unknown'}`;
}

export function getEligibleCounterSelection(hand: CardCode[], eligible: CardCode[]): CardCode[] {
  const allowed = new Set(eligible);
  return hand.filter((code) => allowed.has(code));
}

export function isBlockingIncomingEvent(event: { type: string; targetId?: string }): boolean {
  return Boolean(event.targetId && ['ACTION_PLAYED', 'COUNTER_PLAYED'].includes(event.type));
}

export function shouldShowIncomingCounter(args: {
  viewerId: PlayerId;
  actorId: PlayerId;
  eventTargetIds?: PlayerId[];
  parentFrame?: Pick<StackFrame, 'actorId' | 'affectedPlayerIds' | 'targetIds'>;
}): boolean {
  const parent = args.parentFrame;
  if (!parent) return (args.eventTargetIds ?? []).includes(args.viewerId);
  return parent.actorId === args.viewerId ||
    (parent.affectedPlayerIds ?? []).includes(args.viewerId) ||
    (parent.targetIds ?? []).includes(args.viewerId) ||
    (args.eventTargetIds ?? []).includes(args.viewerId);
}
