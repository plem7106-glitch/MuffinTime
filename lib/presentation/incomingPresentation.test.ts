import { describe, expect, it } from 'vitest';
import { getIncomingPresentationKey, getEligibleCounterSelection, isBlockingIncomingEvent, shouldShowIncomingCounter } from './incomingPresentation';

describe('incoming presentation coordination', () => {
  it('uses the authoritative frame identity to deduplicate related events', () => {
    expect(getIncomingPresentationKey({ frameId: 'frame-7', eventId: 'event-1', cardCode: 'A016' })).toBe('frame:frame-7');
    expect(getIncomingPresentationKey({ frameId: undefined, eventId: 'event-1', cardCode: 'A016' })).toBe('event:event-1');
  });

  it('keeps every canonical eligible Counter available for player choice', () => {
    expect(getEligibleCounterSelection(['C05', 'C07', 'C09'], ['C05', 'C07'])).toEqual(['C05', 'C07']);
  });

  it('blocks targeted incoming card events until the player continues', () => {
    expect(isBlockingIncomingEvent({ type: 'ACTION_PLAYED', targetId: 'human' })).toBe(true);
    expect(isBlockingIncomingEvent({ type: 'COUNTER_PLAYED', targetId: 'human' })).toBe(true);
    expect(isBlockingIncomingEvent({ type: 'TRAP_ACTIVATED', targetId: 'human' })).toBe(false);
    expect(isBlockingIncomingEvent({ type: 'ACTION_PLAYED' })).toBe(false);
  });

  it('does not show an unrelated Bot-vs-Bot Counter to the Human', () => {
    expect(shouldShowIncomingCounter({
      viewerId: 'human', actorId: 'bot-a', eventTargetIds: ['bot-b'],
      parentFrame: { actorId: 'bot-b', affectedPlayerIds: ['bot-b'], targetIds: ['bot-b'] },
    })).toBe(false);
    expect(shouldShowIncomingCounter({
      viewerId: 'human', actorId: 'bot-a', eventTargetIds: ['human'],
      parentFrame: { actorId: 'human', affectedPlayerIds: ['human'], targetIds: ['human'] },
    })).toBe(true);
  });
});
