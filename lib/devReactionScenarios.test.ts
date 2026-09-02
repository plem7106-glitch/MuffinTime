import { describe, expect, it } from 'vitest';
import { createDevReactionScenario } from './devReactionScenarios';

describe('development reaction scenarios', () => {
  it('seeds a legal Human Action -> Bot Counter browser scenario without runtime reaction state', () => {
    const state = createDevReactionScenario('r7-human-action-counter', 'me', 'Tester');
    expect(state.currentTurnIndex).toBe(1);
    expect(state.players.me.hand).toEqual(['A016']);
    expect(state.players['bot-2'].hand).toEqual(['C17']);
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
  });
  it.each([
    ['s1-c43', 'C43'], ['s2-c48', 'C48'], ['s3-c50', 'C50'], ['s4-c41', 'C41'],
  ] as const)('creates %s with the social card in the tester hand and no runtime state', (scenario, card) => {
    const state = createDevReactionScenario(scenario, 'me', 'Tester');
    expect(state.status).toBe('playing');
    expect(state.players.me.hand).toEqual([card]);
    expect(state.currentTurnIndex).toBe(1);
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
    expect(state.pendingSteals ?? {}).toEqual({});
    const zones = Object.values(state.players).flatMap((p) => p.hand).concat(state.drawPile, state.discardPile, state.banishedCards ?? []);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('creates the C01 fixture with a natural A063 source action and no reaction state', () => {
    const state = createDevReactionScenario('c01-a063', 'me', 'Tester');
    expect(state.players.me.hand).toEqual(['C01']);
    expect(state.players['bot-1'].hand).toEqual(['A063', 'A001', 'A002', 'A003']);
    expect(state.devForcedBotAction).toEqual({ code: 'A063', targetId: 'me' });
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
    const zones = Object.values(state.players).flatMap((p) => p.hand).concat(state.drawPile, state.discardPile, state.banishedCards ?? []);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('gives S2 a deterministic physical deck top without creating a draw result', () => {
    const state = createDevReactionScenario('s2-c48', 'me', 'Tester');
    expect(state.drawPile.slice(0, 2)).toEqual(['A003', 'A004']);
    expect(state.players.me.hand).toEqual(['C48']);
  });
  it('creates a clean C35 starting state without reaction state', () => {
    const state = createDevReactionScenario('r2-c35', 'me', 'Tester');
    expect(state.status).toBe('playing');
    expect(state.devScenario).toBe('r2-c35');
    expect(state.turnOrder).toEqual(['bot-1', 'me', 'bot-2']);
    expect(state.players.me.hasDrawnThisTurn).toBe(false);
    expect(state.players.me.hand).toEqual(['C35']);
    expect(state.players['bot-1'].hand).toEqual(['A016']);
    expect(state.players['bot-2'].hand).toEqual(['A002']);
    expect(state.devForcedBotAction).toEqual({ code: 'A016', targetId: 'me' });
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
    const zones = Object.values(state.players).flatMap((p) => p.hand).concat(state.drawPile, state.discardPile, state.banishedCards ?? []);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('creates a legal R5 target topology without prebuilt reaction state', () => {
    const state = createDevReactionScenario('r5-counter-chain', 'me', 'Tester');
    expect(state.players['bot-1'].hand).toEqual(['A016']);
    expect(state.players.me.hand).toEqual(['C29']);
    expect(state.players['bot-2'].hand).toEqual(['C17']);
    expect(state.devForcedBotAction).toEqual({ code: 'A016', targetId: 'bot-2' });
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
    const zones = Object.values(state.players).flatMap((p) => p.hand).concat(state.drawPile, state.discardPile, state.banishedCards ?? []);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('creates an untargeted R6 action with two Counter responders', () => {
    const state = createDevReactionScenario('r6-multiple-responders', 'me', 'Tester');
    expect(state.players['bot-1'].hand).toEqual(['A019']);
    expect(state.players.me.hand).toEqual(['C17']);
    expect(state.players['bot-2'].hand).toEqual(['C17']);
    expect(state.devForcedBotAction).toEqual({ code: 'A019' });
    expect(state.reactionStack ?? []).toHaveLength(0);
    expect(state.pendingResponse ?? null).toBeNull();
  });
});
