import { describe, expect, it } from 'vitest';
import { allCards } from '../../data/cards/index';
import { getCounterInteraction, getCounterStatus, getPlayableCounters, getPlayableCountersForActiveFrame, getZeroEligibleCounterResponderIds, isCounterImplemented } from './registry';
import { addPlayer, createRoom } from '../room';
import { areAllResponsesComplete, pushStackFrame, submitResponse } from '../reactionStack';

describe('counter capability registry', () => {
  it('uses the active top frame and pending responder when finding playable counters', () => {
    let state = createRoom('source', 'Source', 3);
    state = addPlayer(state, 'target', 'Target');
    state = addPlayer(state, 'other', 'Other');
    state.players.target.hand = ['C35'];

    state = pushStackFrame(state, {
      sourceType: 'action',
      sourceCode: 'A016',
      actorId: 'source',
      targetIds: ['target'],
    });
    expect(getPlayableCountersForActiveFrame(state, 'target')).toEqual(['C35']);

    state.players.target.hand = [];
    state = pushStackFrame(state, {
      sourceType: 'counter',
      sourceCode: 'C35',
      actorId: 'target',
      targetIds: ['source'],
    });
    expect(getPlayableCountersForActiveFrame(state, 'source')).toEqual([]);
    expect(getPlayableCountersForActiveFrame(state, 'target')).toEqual([]);
  });

  it('keeps a human C29 eligible against the active C17 Counter frame', () => {
    let state = createRoom('source', 'Source', 3);
    state = addPlayer(state, 'human', 'Human');
    state = addPlayer(state, 'other', 'Other');
    state.players.human.hand = ['C29'];
    state = pushStackFrame(state, {
      sourceType: 'counter', sourceCode: 'C17', actorId: 'other', targetIds: ['other'],
    });
    expect(getPlayableCountersForActiveFrame(state, 'human')).toEqual(['C29']);
  });

  it('identifies only pending responders with no playable Counter on the active frame', () => {
    let state = createRoom('source', 'Source', 3);
    state = addPlayer(state, 'human', 'Human');
    state = addPlayer(state, 'bot', 'Bot');
    state.players.human.hand = ['A001'];
    state.players.bot.hand = ['C17'];
    state = pushStackFrame(state, {
      sourceType: 'action', sourceCode: 'A016', actorId: 'source', targetIds: ['human'],
      eligibleResponderIds: ['human', 'bot'],
    });

    expect(getZeroEligibleCounterResponderIds(state)).toEqual(['human']);
    state = submitResponse(state, state.pendingResponse!.responseId, 'human', { status: 'skipped' });
    expect(areAllResponsesComplete(state.reactionStack![0])).toBe(false);
    expect(getZeroEligibleCounterResponderIds(state)).toEqual([]);
  });

  it('finds zero-card responders from a nested Counter frame and advances all of them normally', () => {
    let state = createRoom('source', 'Source', 4);
    state = addPlayer(state, 'p2', 'P2');
    state = addPlayer(state, 'p3', 'P3');
    state = addPlayer(state, 'counterer', 'Counterer');
    state.players.source.hand = ['A001'];
    state.players.p2.hand = ['A002'];
    state.players.p3.hand = ['A003'];
    state = pushStackFrame(state, {
      sourceType: 'action', sourceCode: 'A016', actorId: 'source', targetIds: ['counterer'],
    });
    state = pushStackFrame(state, {
      sourceType: 'counter', sourceCode: 'C35', actorId: 'counterer', targetIds: ['source'],
      eligibleResponderIds: ['source', 'p2', 'p3'],
    });

    expect(getZeroEligibleCounterResponderIds(state)).toEqual(['source', 'p2', 'p3']);
    for (const responderId of getZeroEligibleCounterResponderIds(state)) {
      state = submitResponse(state, state.pendingResponse!.responseId, responderId, { status: 'skipped' });
    }
    expect(areAllResponsesComplete(state.reactionStack![1])).toBe(true);
  });

  it('exposes generic target requirements for digital Counters', () => {
    expect(getCounterInteraction('C35')).toEqual({ requiresTarget: true, targetType: 'other_player', payloadKey: 'newTargetId' });
    expect(getCounterInteraction('C39')).toEqual({ requiresTarget: true, targetType: 'other_player', payloadKey: 'newTargetId' });
    expect(getCounterInteraction('C04')).toEqual({ requiresTarget: true, targetType: 'other_player', payloadKey: 'newVictimId' });
    expect(getCounterInteraction('C29')).toEqual({ requiresTarget: false });
  });
  it('classifies every canonical Counter without using a throwing resolver', () => {
    const counters = allCards.filter((card) => card.type === 'counter');
    expect(counters).toHaveLength(50);
    for (const card of counters) {
      expect(['implemented', 'not_implemented']).toContain(getCounterStatus(card.id));
      expect(typeof isCounterImplemented(card.id)).toBe('boolean');
    }
  });

  it('offers only implemented and eligible Counters', () => {
    expect(getPlayableCounters(['C41', 'C06', 'C09'], { kind: 'trap', code: 'T01' })).toEqual(['C09']);
    expect(getPlayableCounters(['C41', 'C06', 'C17'], { kind: 'action', code: 'A001' })).toEqual(['C17']);
  });
});
