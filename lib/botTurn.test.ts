import { describe, it, expect } from 'vitest';
import { decideBotTurn, fillBotActionInputs } from './botTurn';
import type { RoomState } from '../game/types';

function baseState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'bot-1'],
    currentTurnIndex: 1,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Tee', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bank', hand: ['A014', 'C09'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('decideBotTurn', () => {
  it('draws when the rng rolls above the play threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0.9);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('draws when the bot has no playable action cards in hand', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['C09'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('plays a targeted action against the human when the rng rolls below the threshold', () => {
    const decision = decideBotTurn(baseState(), 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'play', code: 'A014', targetId: 'me' });
  });

  it('plays a roster card WITH a filled roster instead of an empty payload', () => {
    // A001 is roster_select. A bot used to push a frame carrying no payload at
    // all, so rosterIdsFromFrame came back empty and the card resolved into
    // nothing -- the same silent no-op that hit every roster/outcome/number
    // card a bot could draw (A063 among them).
    const state = baseState();
    state.players['bot-1'].hand = ['A001'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision.action).toBe('play');
    expect(decision).toMatchObject({ code: 'A001' });
    expect((decision as { targetId?: string }).targetId).toBeUndefined();
    expect((decision as { customPayload?: { rosterIds?: string[] } }).customPayload?.rosterIds)
      .toEqual(['me']);
  });

  it('falls back to draw when there is nobody eligible to target', () => {
    const state = baseState();
    state.turnOrder = ['bot-1'];
    state.players = { 'bot-1': state.players['bot-1'] };
    state.players['bot-1'].hand = ['A014'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('selects from other players when multiple bots and a human are in a 5-player game', () => {
    const state = baseState();
    state.turnOrder = ['me', 'bot-1', 'bot-2', 'bot-3', 'bot-4'];
    state.players = {
      me: { name: 'Human', hand: ['A001'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-1': { name: 'Bot 1', hand: ['A014'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-2': { name: 'Bot 2', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-3': { name: 'Bot 3', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-4': { name: 'Bot 4', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    };
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision.action).toBe('play');
    if (decision.action === 'play') {
      expect(decision.code).toBe('A014');
      expect(decision.targetId).toBe('me');
    }
  });

  it('never plays A028 even when it is the only card in hand -- bots have no concept of its co-play mechanic', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['A028'];
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toEqual({ action: 'draw' });
  });

  it('never selects A028 out of a hand containing other playable actions', () => {
    const state = baseState();
    state.players['bot-1'].hand = ['A028', 'A001'];
    // rng() = 0 both picks "play" (below ACTION_PLAY_PROBABILITY) and,
    // if A028 were still a candidate, would deterministically index into
    // whichever candidate sorts first -- with only A001 left after
    // filtering, this must always resolve to A001.
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision).toMatchObject({ action: 'play', code: 'A001' });
  });

  it('handles bot vs bot targeting when no humans remain in candidates', () => {
    const state = baseState();
    state.turnOrder = ['bot-1', 'bot-2', 'bot-3'];
    state.players = {
      'bot-1': { name: 'Bot 1', hand: ['A014'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-2': { name: 'Bot 2', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      'bot-3': { name: 'Bot 3', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    };
    const decision = decideBotTurn(state, 'bot-1', () => 0);
    expect(decision.action).toBe('play');
    if (decision.action === 'play') {
      expect(decision.code).toBe('A014');
      expect(['bot-2', 'bot-3']).toContain(decision.targetId);
    }
  });
});

describe('fillBotActionInputs — bots must answer every question the UI would ask', () => {
  function table(): RoomState {
    const s = baseState();
    s.turnOrder = ['me', 'bot-1', 'bot-2'];
    s.players['bot-2'] = { name: 'Joe', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false };
    return s;
  }

  it('A063 gets a non-empty roster — the reported "no card and no player to pick" case', () => {
    const filled = fillBotActionInputs(table(), 'bot-1', 'A063', () => 0.5);
    const roster = filled?.customPayload?.rosterIds as string[] | undefined;
    expect(roster).toBeDefined();
    expect(roster!.length).toBeGreaterThan(0);
    expect(roster).not.toContain('bot-1'); // A063 steals TO the actor
  });

  it('fills an outcome for the cards that read one (A148/A150)', () => {
    // Note A006 is kind: 'outcome_entry' but does NOT set needsOutcomeEntry --
    // its winner pick IS the outcome, so it wants targetIds, not `outcome`.
    for (const code of ['A148', 'A150']) {
      const filled = fillBotActionInputs(table(), 'bot-1', code, () => 0.5);
      expect(typeof filled?.customPayload?.outcome, code).toBe('boolean');
    }
  });

  it('lets a bot pick itself for a card it could genuinely win', () => {
    // A006 is includeSelfAsCandidate: a bot competing in its own staring
    // contest must be allowed to be the winner.
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = fillBotActionInputs(table(), 'bot-1', 'A006', () => i / 40);
      if (r?.targetId) picks.add(r.targetId);
    }
    expect(picks.has('bot-1')).toBe(true);
  });

  it('draws instead of playing when the table cannot satisfy the card', () => {
    const solo = baseState();
    solo.turnOrder = ['bot-1'];
    solo.players = { 'bot-1': solo.players['bot-1'] };
    expect(fillBotActionInputs(solo, 'bot-1', 'A063', () => 0.5)).toBeNull();
  });

  it('leaves payload undefined for a card that needs no input at all', () => {
    const filled = fillBotActionInputs(table(), 'bot-1', 'A036', () => 0.5);
    expect(filled).not.toBeNull();
    expect(filled?.customPayload).toBeUndefined();
  });
});
