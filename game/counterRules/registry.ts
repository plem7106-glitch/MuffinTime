import { getCardsByType } from '../../data/cards/index';
import type { CardCode, PlayerId, RoomState } from '../types';
import type { ForcedDiscardOperation } from '../forcedDiscard';
import type { StealOperation } from '../steal';

export type CounterStatus = 'implemented' | 'not_implemented';
const IMPLEMENTED_COUNTERS = new Set<CardCode>([
  'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C23', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29', 'C30', 'C31', 'C32', 'C33', 'C34', 'C35', 'C36', 'C37', 'C38', 'C39', 'C40', 'C41', 'C42', 'C43', 'C44', 'C45', 'C46', 'C47', 'C48', 'C49', 'C50'
]);

export function isCounterImplemented(code: CardCode): boolean { return IMPLEMENTED_COUNTERS.has(code); }
export function getCounterStatus(code: CardCode): CounterStatus { return isCounterImplemented(code) ? 'implemented' : 'not_implemented'; }

export interface CounterContext {
  actorId?: PlayerId;
  targetPlayerId?: PlayerId;
  actionActorId?: PlayerId;
  operationKind?: 'forced_discard' | 'steal' | 'forced_draw';
  forcedDiscardOp?: ForcedDiscardOperation;
  stealOp?: StealOperation;
  forcedDrawOp?: import('../forcedDraw').ForcedDrawOperation;
  roomState?: RoomState;
}

export function isCounterEligible(
  code: CardCode,
  pending: { kind: 'action' | 'trap' | 'counter'; code: CardCode },
  context?: CounterContext
): boolean {
  if (!isCounterImplemented(code)) return false;
  if (code === 'C01') return pending.kind === 'action' && pending.code === 'A063';
  if (code === 'C05') return (pending.kind === 'action' || pending.kind === 'trap' || pending.kind === 'counter') && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL';
  if (code === 'C07') return (pending.kind === 'action' || pending.kind === 'trap') && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL' && pending.code !== 'FORCED_DRAW';
  if (code === 'C09') return pending.kind === 'trap';
  if (code === 'C10') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD';
  if (code === 'C11') return pending.kind === 'trap';
  if (code === 'C13') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL' && pending.code !== 'FORCED_DRAW';
  if (code === 'C14') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD') return false;
    const actionActorId = context?.actionActorId ?? context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.actorId : undefined);
    if (context?.actorId !== undefined && actionActorId !== undefined) {
      return context.actorId !== actionActorId;
    }
    return true;
  }
  if (code === 'C15') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C16') return pending.kind === 'action' && pending.code === 'A099';
  if (code === 'C17') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD';
  if (code === 'C18') return pending.kind === 'counter';
  if (code === 'C19') return false; // Passive trigger when stolen
  if (code === 'C20') return (pending.kind === 'action' || pending.kind === 'trap') && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL';
  if (code === 'C21') return pending.kind === 'counter';
  if (code === 'C22') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL' && pending.code !== 'FORCED_DRAW';
  if (code === 'C23') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C24') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL';
  if (code === 'C25') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL';
  if (code === 'C27') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL') return false;
    const actionActorId = context?.actionActorId ?? context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.actorId : undefined);
    if (context?.actorId !== undefined && actionActorId !== undefined) {
      return context.actorId !== actionActorId;
    }
    return true;
  }
  if (code === 'C29') return pending.kind === 'action' || pending.kind === 'trap' || pending.kind === 'counter';
  if (code === 'C31') return pending.kind === 'action' && pending.code === 'A101';
  if (code === 'C32') return pending.kind === 'trap';
  if (code === 'C33') return pending.kind === 'action' && pending.code === 'A097';
  if (code === 'C34') {
    if ((pending.kind !== 'action' && pending.kind !== 'trap') || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? context?.actionActorId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C35') {
    if ((pending.kind !== 'action' && pending.kind !== 'trap') || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? context?.actionActorId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C36') {
    if (pending.kind !== 'trap') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C37') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD';
  if (code === 'C39') {
    if ((pending.kind !== 'action' && pending.kind !== 'trap') || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C40') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C45') {
    if (pending.kind !== 'action' || pending.code === 'FORCED_DISCARD' || pending.code === 'STEAL' || pending.code === 'FORCED_DRAW') return false;
    const targetPlayerId = context?.targetPlayerId ?? (context?.roomState ? context.roomState.reactionStack?.[context.roomState.reactionStack.length - 1]?.targetIds?.[0] : undefined);
    if (context?.actorId !== undefined && targetPlayerId !== undefined) {
      return context.actorId === targetPlayerId;
    }
    return true;
  }
  if (code === 'C47') return pending.kind === 'action' && pending.code !== 'FORCED_DISCARD' && pending.code !== 'STEAL' && pending.code !== 'FORCED_DRAW';

  // Social Counters — these use the manual social counter flow, not the ReactionStack.
  // They return false here because they are player-declared, not triggered by a digital pending frame.
  if (code === 'C41') return false; // "Stop an action card that forces you to drink."
  if (code === 'C42') return false; // "Stop a card forcing you to drink, then choose another player to drink instead."
  if (code === 'C43') return false; // "Stop another player from ordering you to do an embarrassing task."
  if (code === 'C44') return false; // "You are not affected by the current drunk-behavior trap card."
  if (code === 'C46') return false; // "If forced to drink, split it with another player of your choice."
  if (code === 'C48') return false; // "Stop being forced to drink and draw 1 card instead."
  if (code === 'C49') return false; // "Stop the current drunk-behavior trap card from triggering."
  if (code === 'C50') return false; // "Stop another player from controlling you, then steal 1 card from them."

  // Forced Discard Counters (C02, C03, C30)
  if (context?.operationKind === 'forced_discard' && context.forcedDiscardOp) {
    const op = context.forcedDiscardOp;
    if (op.cardCodes.length === 0 || op.status === 'canceled' || op.status === 'completed') return false;

    if (code === 'C02') {
      // C02: "Stop another player from discarding their cards."
      return context.actorId !== undefined && context.actorId !== op.targetPlayerId;
    }
    if (code === 'C03') {
      // C03: "If you're being forced to discard cards, keep 2 of them."
      return context.actorId === op.targetPlayerId;
    }
    if (code === 'C30') {
      // C30: "Stop being forced to discard cards and draw that many instead."
      return context.actorId === op.targetPlayerId;
    }
  }

  // Steal Counters (C04, C06, C08, C12, C26, C28, C38)
  if (context?.operationKind === 'steal' && context.stealOp) {
    const op = context.stealOp;
    if (op.actualCount === 0 || op.status === 'canceled' || op.status === 'completed') return false;

    if (code === 'C04') {
      // C04: "Stop your cards from being stolen and choose another player to have their cards stolen instead."
      if (context.actorId !== op.victimId) return false;
      if (context.roomState) {
        const hasAlternateVictim = Object.keys(context.roomState.players).some(
          (pid) => pid !== op.thiefId && pid !== op.victimId
        );
        if (!hasAlternateVictim) return false;
      }
      return true;
    }
    if (code === 'C06') {
      // C06 (Steal branch): "Stop being forced to draw or steal cards."
      return context.actorId === op.victimId;
    }
    if (code === 'C08') {
      // C08: "If another player attempts to steal your cards, discard that many instead."
      return context.actorId === op.victimId;
    }
    if (code === 'C12') {
      // C12: "Stop another player from stealing your cards or another player's."
      return context.actorId !== undefined && context.actorId !== op.thiefId;
    }
    if (code === 'C26') {
      // C26: "Stop another player stealing your cards and instead steal that many from them."
      return context.actorId === op.victimId;
    }
    if (code === 'C28') {
      // C28: "Stop another player from stealing your cards."
      return context.actorId === op.victimId;
    }
    if (code === 'C38') {
      // C38: "Stop another player stealing your cards but skip your next turn."
      return context.actorId === op.victimId;
    }
  }

  // Forced Draw Counters (C06)
  if (context?.operationKind === 'forced_draw' && context.forcedDrawOp) {
    const op = context.forcedDrawOp;
    if (op.status === 'canceled' || op.status === 'completed') return false;

    if (code === 'C06') {
      // C06 (Forced Draw branch): "Stop being forced to draw or steal cards."
      return context.actorId === op.targetPlayerId;
    }
  }

  return false;
}

export function getPlayableCounters(
  hand: CardCode[],
  pending: { kind: 'action' | 'trap' | 'counter'; code: CardCode } | null,
  context?: CounterContext
): CardCode[] {
  if (!pending) return [];
  const canonicalCounters = new Set(getCardsByType('counter').map((card) => card.id));
  return hand.filter((code) => canonicalCounters.has(code) && isCounterEligible(code, pending, context));
}
