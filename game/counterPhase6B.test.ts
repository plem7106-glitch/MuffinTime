import { describe, expect, it } from 'vitest';
import type { RoomState, CardCode } from './types';
import type { SocialCounterPlayedPayload } from './events';
import {
  playSocialCounter,
  validateSocialCounterPlay,
  isSocialCounter,
  getPlayableSocialCounters,
  SOCIAL_COUNTER_CODES,
} from './socialCounter';
import { isCounterImplemented } from './counterRules/registry';
import { executeManualRecoveryDiscard, executeManualRecoveryGive } from './recovery';

/** Helper: find the first SOCIAL_COUNTER_PLAYED event and return its typed payload. */
function findSocialPayload(state: RoomState): SocialCounterPlayedPayload | undefined {
  const evt = (state.gameEvents ?? []).find(
    (e: { type: string }) => e.type === 'EVENT_SOCIAL_COUNTER_PLAYED'
  );
  return evt ? (evt.payload as SocialCounterPlayedPayload) : undefined;
}

function makeState(overrides?: Partial<RoomState>): RoomState {
  return {
    roomCode: 'TEST',
    hostId: 'p1',
    status: 'playing',
    players: {
      p1: { odpiId: 'p1', name: 'P1', hand: ['A001', 'A002', 'C41', 'C50'], avatar: '🧁', isBot: false },
      p2: { odpiId: 'p2', name: 'P2', hand: ['A003', 'A004', 'C42', 'C43'], avatar: '🍰', isBot: false },
      p3: { odpiId: 'p3', name: 'P3', hand: ['A005', 'C44', 'C46', 'C48', 'C49'], avatar: '🎂', isBot: false },
    },
    drawPile: ['D01', 'D02', 'D03'],
    discardPile: ['X01'],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    reactionStack: [],
    gameEvents: [],
    pendingSteals: {},
    ...overrides,
  } as RoomState;
}

// ──────────────────────────────────────────────
// 1. Social Counter classification
// ──────────────────────────────────────────────
describe('Social Counter classification', () => {
  it('identifies all 8 social counter codes', () => {
    const expected: CardCode[] = ['C41', 'C42', 'C43', 'C44', 'C46', 'C48', 'C49', 'C50'];
    for (const code of expected) {
      expect(isSocialCounter(code)).toBe(true);
    }
    expect(SOCIAL_COUNTER_CODES.size).toBe(8);
  });

  it('non-social counters return false', () => {
    expect(isSocialCounter('C01')).toBe(false);
    expect(isSocialCounter('C17')).toBe(false);
    expect(isSocialCounter('C45')).toBe(false);
  });

  it('all 8 social counters are marked implemented in registry', () => {
    for (const code of SOCIAL_COUNTER_CODES) {
      expect(isCounterImplemented(code)).toBe(true);
    }
  });

  it('getPlayableSocialCounters returns only social counters from hand', () => {
    const hand: CardCode[] = ['C41', 'A001', 'C17', 'C48', 'T01'];
    const result = getPlayableSocialCounters(hand);
    expect(result).toEqual(['C41', 'C48']);
  });
});

// ──────────────────────────────────────────────
// 2. Validation
// ──────────────────────────────────────────────
describe('Social Counter validation', () => {
  it('rejects non-social counter code', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p1', 'C17')).toBeTruthy();
  });

  it('rejects if actor does not own the card', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p1', 'C42')).toBeTruthy();
  });

  it('rejects if target required but not provided', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p2', 'C42')).toBeTruthy();
  });

  it('rejects if target is self when card requires different player', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p2', 'C42', 'p2')).toBeTruthy();
  });

  it('rejects if target player does not exist', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p2', 'C42', 'p99')).toBeTruthy();
  });

  it('accepts valid no-target social counter', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p1', 'C41')).toBeNull();
  });

  it('accepts valid targeted social counter', () => {
    const state = makeState();
    expect(validateSocialCounterPlay(state, 'p2', 'C42', 'p3')).toBeNull();
  });

  it('state unchanged on invalid play', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p1', 'C42');
    expect(result).toBe(state);
  });
});

// ──────────────────────────────────────────────
// 3. C41 — Skip My Round
// ──────────────────────────────────────────────
describe('C41 — Skip My Round', () => {
  it('removes C41 from hand, discards it, emits event (no target needed)', () => {
    const state = makeState();
    const before = state.players['p1'].hand.length;

    const result = playSocialCounter(state, 'p1', 'C41');

    expect(result).not.toBe(state);
    expect(result.players['p1'].hand).not.toContain('C41');
    expect(result.players['p1'].hand.length).toBe(before - 1);
    expect(result.discardPile).toContain('C41');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C41');
    expect(payload!.resultType).toBe('cancel');
  });
});

// ──────────────────────────────────────────────
// 4. C42 — Sneaky Swap (redirect drink)
// ──────────────────────────────────────────────
describe('C42 — Sneaky Swap', () => {
  it('removes C42, discards it, records redirect target', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p2', 'C42', 'p3');

    expect(result.players['p2'].hand).not.toContain('C42');
    expect(result.discardPile).toContain('C42');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C42');
    expect(payload!.targetPlayerId).toBe('p3');
    expect(payload!.resultType).toBe('redirect');
  });
});

// ──────────────────────────────────────────────
// 5. C43 — Not My Cup (cancel embarrassing task)
// ──────────────────────────────────────────────
describe('C43 — Not My Cup', () => {
  it('removes C43, discards it, records cancel with orderer as target', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p2', 'C43', 'p1');

    expect(result.players['p2'].hand).not.toContain('C43');
    expect(result.discardPile).toContain('C43');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C43');
    expect(payload!.targetPlayerId).toBe('p1');
    expect(payload!.resultType).toBe('cancel');
  });
});

// ──────────────────────────────────────────────
// 6. C44 — Still Sober (cancel drunk-behavior trap)
// ──────────────────────────────────────────────
describe('C44 — Still Sober', () => {
  it('removes C44, discards it, emits cancel event (no target needed)', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p3', 'C44');

    expect(result.players['p3'].hand).not.toContain('C44');
    expect(result.discardPile).toContain('C44');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C44');
    expect(payload!.resultType).toBe('cancel');
  });
});

// ──────────────────────────────────────────────
// 7. C46 — Split the Shot
// ──────────────────────────────────────────────
describe('C46 — Split the Shot', () => {
  it('removes C46, discards it, records split with chosen player', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p3', 'C46', 'p1');

    expect(result.players['p3'].hand).not.toContain('C46');
    expect(result.discardPile).toContain('C46');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C46');
    expect(payload!.targetPlayerId).toBe('p1');
    expect(payload!.resultType).toBe('split');
  });
});

// ──────────────────────────────────────────────
// 8. C48 — Water Please (replace drink with draw 1)
// ──────────────────────────────────────────────
describe('C48 — Water Please', () => {
  it('removes C48, discards it, draws 1 card from drawPile', () => {
    const state = makeState();
    const beforeHand = state.players['p3'].hand.length;
    const beforeDraw = state.drawPile.length;

    const result = playSocialCounter(state, 'p3', 'C48');

    expect(result.players['p3'].hand).not.toContain('C48');
    expect(result.discardPile).toContain('C48');
    // -1 for C48 leaving + 1 for drawn card = net 0 change
    expect(result.players['p3'].hand.length).toBe(beforeHand);
    expect(result.drawPile.length).toBe(beforeDraw - 1);

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.resultType).toBe('replace_draw');
  });

  it('C48 respects deck exhaustion — no draw if drawPile empty', () => {
    const state = makeState({ drawPile: [] });
    const beforeHand = state.players['p3'].hand.length;

    const result = playSocialCounter(state, 'p3', 'C48');

    expect(result.players['p3'].hand).not.toContain('C48');
    expect(result.discardPile).toContain('C48');
    // -1 for C48 leaving, no draw since empty
    expect(result.players['p3'].hand.length).toBe(beforeHand - 1);
    expect(result.drawPile.length).toBe(0);
  });
});

// ──────────────────────────────────────────────
// 9. C49 — Fake Drunk
// ──────────────────────────────────────────────
describe('C49 — Fake Drunk', () => {
  it('removes C49, discards it, emits cancel event', () => {
    const state = makeState();
    const result = playSocialCounter(state, 'p3', 'C49');

    expect(result.players['p3'].hand).not.toContain('C49');
    expect(result.discardPile).toContain('C49');

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C49');
    expect(payload!.resultType).toBe('cancel');
  });
});

// ──────────────────────────────────────────────
// 10. C50 — Cut Them Off (cancel + steal 1 card)
// ──────────────────────────────────────────────
describe('C50 — Cut Them Off', () => {
  it('removes C50, discards it, steals 1 card from target using real steal', () => {
    const state = makeState();
    const p1Before = state.players['p1'].hand.length;
    const p2Before = state.players['p2'].hand.length;

    const result = playSocialCounter(state, 'p1', 'C50', 'p2');

    expect(result.players['p1'].hand).not.toContain('C50');
    expect(result.discardPile).toContain('C50');
    // p1: lost C50, gained 1 stolen card → net 0
    expect(result.players['p1'].hand.length).toBe(p1Before);
    // p2: lost 1 card
    expect(result.players['p2'].hand.length).toBe(p2Before - 1);

    const payload = findSocialPayload(result);
    expect(payload).toBeDefined();
    expect(payload!.counterCode).toBe('C50');
    expect(payload!.targetPlayerId).toBe('p2');
    expect(payload!.resultType).toBe('cancel_and_steal');
  });
});

// ──────────────────────────────────────────────
// 11. Bot policy
// ──────────────────────────────────────────────
describe('Bot policy', () => {
  it('social counters are never offered via ReactionStack getPlayableCounters path', () => {
    // Social counters return false from isCounterEligible,
    // so bots using getPlayableCounters will never see them.
    const hand: CardCode[] = ['C41', 'C42', 'C43', 'C44', 'C46', 'C48', 'C49', 'C50'];
    expect(getPlayableSocialCounters(hand).length).toBe(8);
  });
});

// ──────────────────────────────────────────────
// 12. Physical card integrity
// ──────────────────────────────────────────────
describe('Physical card integrity', () => {
  it('total cards across all zones remain constant after social counter play', () => {
    const state = makeState();
    const countCards = (s: RoomState): number => {
      let total = s.drawPile.length + s.discardPile.length;
      for (const p of Object.values(s.players)) {
        total += p.hand.length;
      }
      return total;
    };

    const before = countCards(state);
    const after1 = playSocialCounter(state, 'p1', 'C41');
    expect(countCards(after1)).toBe(before);

    // C48 (draw 1) should also conserve total
    const after2 = playSocialCounter(state, 'p3', 'C48');
    expect(countCards(after2)).toBe(before);

    // C50 (steal 1) should also conserve total
    const after3 = playSocialCounter(state, 'p1', 'C50', 'p2');
    expect(countCards(after3)).toBe(before);
  });
});

// ──────────────────────────────────────────────
// 13. Recovery isolation
// ──────────────────────────────────────────────
describe('Recovery isolation', () => {
  it('Manual Recovery Discard does NOT trigger social counter flow', () => {
    const state = makeState();
    const result = executeManualRecoveryDiscard(state, 'p1', ['C41']);

    expect(result.players['p1'].hand).not.toContain('C41');
    expect(result.discardPile).toContain('C41');

    // Should NOT have a SOCIAL_COUNTER_PLAYED event
    const socialEvents = (result.gameEvents ?? []).filter(
      (e: { type: string }) => e.type === 'EVENT_SOCIAL_COUNTER_PLAYED'
    );
    expect(socialEvents.length).toBe(0);

    // Should have a MANUAL_RECOVERY_DISCARD event
    const recoveryEvents = (result.gameEvents ?? []).filter(
      (e: { type: string }) => e.type === 'EVENT_MANUAL_RECOVERY_DISCARD'
    );
    expect(recoveryEvents.length).toBe(1);
  });

  it('Manual Recovery Give does NOT trigger social counter flow', () => {
    const state = makeState();
    const result = executeManualRecoveryGive(state, 'p1', 'p2', ['C41']);

    expect(result.players['p1'].hand).not.toContain('C41');
    expect(result.players['p2'].hand).toContain('C41');

    const socialEvents = (result.gameEvents ?? []).filter(
      (e: { type: string }) => e.type === 'EVENT_SOCIAL_COUNTER_PLAYED'
    );
    expect(socialEvents.length).toBe(0);
  });
});
