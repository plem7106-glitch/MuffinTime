/**
 * Whole-deck regression sweep: starts a real 4-player game and plays every one
 * of the 289 cards through the same engine entry point the app uses
 * (executeActionFrameEffect / the trap + counter equivalents), asserting no
 * card crashes, loses or duplicates a card, or corrupts player state.
 *
 * The DISCRIMINATION case at the bottom plants four known defects and requires
 * the sweep to catch all four -- without it, "0 findings" would be worthless.
 */
import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { canonicalCardCodes } from '../data/cards/deck';
import { allCards } from '../data/cards/index';
import { executeActionFrameEffect } from './actionRules/registry';
import { getActionRule, isActionImplemented } from './actionRules/registry';
import { getTrapRule, isTrapImplemented } from './trapRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { isCounterImplemented } from './counterRules/registry';
import type { RoomState, CardCode, PlayerId, StackFrame } from './types';

const PLAYERS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const ACTOR = 'p1';

/** Deterministic rng so a failure is reproducible. */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Counts EVERY physical zone, banishedCards included -- unlike
 * inspectCardConservation, so a card that banishes isn't a false positive. */
function census(state: RoomState): Map<CardCode, number> {
  const counts = new Map<CardCode, number>();
  const all: CardCode[] = [
    ...state.drawPile,
    ...state.discardPile,
    ...(state.banishedCards ?? []),
    ...Object.values(state.players).flatMap((p) => [...p.hand, ...p.traps]),
  ];
  for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

function conservationDelta(before: RoomState, after: RoomState): string[] {
  const b = census(before);
  const a = census(after);
  const problems: string[] = [];
  const codes = new Set([...b.keys(), ...a.keys()]);
  for (const code of codes) {
    const bc = b.get(code) ?? 0;
    const ac = a.get(code) ?? 0;
    if (bc !== ac) problems.push(`${code}: ${bc}->${ac}`);
  }
  return problems;
}

function structuralProblems(state: RoomState): string[] {
  const bad: string[] = [];
  for (const pid of PLAYERS) {
    const p = state.players[pid];
    if (!p) { bad.push(`player ${pid} vanished`); continue; }
    if (!Array.isArray(p.hand)) { bad.push(`${pid}.hand not an array`); continue; }
    if (!Array.isArray(p.traps)) bad.push(`${pid}.traps not an array`);
    if (p.hand.some((c) => c == null)) bad.push(`${pid}.hand has null entries`);
    const fl = p.forcedLossSinceLastTurn;
    if (fl !== undefined && (!Number.isFinite(fl) || fl < 0)) bad.push(`${pid}.forcedLossSinceLastTurn=${fl}`);
  }
  if (!Array.isArray(state.drawPile)) bad.push('drawPile not an array');
  if (!Array.isArray(state.discardPile)) bad.push('discardPile not an array');
  if (state.drawPile?.some((c) => c == null)) bad.push('drawPile has null entries');
  if (!Number.isFinite(state.currentTurnIndex) || state.currentTurnIndex < 0) {
    bad.push(`currentTurnIndex=${state.currentTurnIndex}`);
  }
  if (state.muffinTimeTarget !== undefined && !Number.isFinite(state.muffinTimeTarget)) {
    bad.push(`muffinTimeTarget=${state.muffinTimeTarget}`);
  }
  return bad;
}

/** A genuine dealt game, exactly as pressing "start game" produces. */
function freshGame(seed = 42): RoomState {
  let s = createRoom(ACTOR, 'Fix');
  s = addPlayer(s, 'p2', 'Player 2');
  s = addPlayer(s, 'p3', 'Player 3');
  s = addPlayer(s, 'p4', 'Player 4');
  s = startGame(s, canonicalCardCodes, seededRng(seed));
  // Give everyone a trap and a fuller hand so target-a-trap / discard-N cards
  // have something real to act on instead of silently no-opping.
  for (const pid of PLAYERS) {
    for (let i = 0; i < 4; i++) s.players[pid].hand.push(s.drawPile.pop()!);
    s.players[pid].traps.push(s.drawPile.pop()!);
    s.players[pid].birthdayMMDD = '01-15';
  }
  s.discardPile.push(s.drawPile.pop()!);
  s.gameSuggesterId = 'p2';
  return s;
}

/**
 * Replicates the real play order: the played card is already on the discard
 * pile by the time executeEffect runs (lib/session.tsx discards, then
 * resolves). A049/A078/A164's handOffPlayedCard and A064 both read the played
 * card back out of discardPile, so putting it in hand instead makes them
 * silently no-op.
 */
function playCard(state: RoomState, code: CardCode): RoomState {
  const s: RoomState = JSON.parse(JSON.stringify(state));
  const zones: CardCode[][] = [s.drawPile, s.discardPile, ...Object.values(s.players).flatMap((p) => [p.hand, p.traps])];
  for (const zone of zones) {
    const i = zone.indexOf(code);
    if (i !== -1) { zone.splice(i, 1); break; }
  }
  s.discardPile.push(code);
  return s;
}

/** Relocates one card into `dest`, moving it rather than copying so the
 * baseline census stays exact. */
function moveCard(s: RoomState, code: CardCode, dest: CardCode[]): void {
  const zones: CardCode[][] = [s.drawPile, s.discardPile, ...Object.values(s.players).flatMap((p) => [p.hand, p.traps])];
  for (const zone of zones) {
    const i = zone.indexOf(code);
    if (i !== -1) { zone.splice(i, 1); break; }
  }
  dest.push(code);
}

/** Preconditions that make an otherwise-conditional card actually fire, so its
 * real branch gets exercised instead of its guard clause. */
function prime(state: RoomState, code: CardCode): RoomState {
  const s: RoomState = JSON.parse(JSON.stringify(state));
  // distinct birthdays so "nearest birthday" cards have a unique winner;
  // the actor's matches `today` so A037's instant-win branch actually fires
  s.players.p1.birthdayMMDD = '01-15';
  s.players.p2.birthdayMMDD = '01-20';
  s.players.p3.birthdayMMDD = '07-04';
  s.players.p4.birthdayMMDD = '11-30';
  // A091: cards were taken from the actor since their last turn
  s.players[ACTOR].forcedLossSinceLastTurn = 3;
  // A094: there is a previous Action play to repeat
  s.recentActionPlays = [{ code: 'A002', actorId: 'p2', targetIds: ['p3'], customPayload: {} }] as never;
  // A075: another player's hand size matches the actor's exactly.
  // Moved, never copied -- copying would bake a duplicate into the baseline.
  while (s.players.p2.hand.length < s.players[ACTOR].hand.length) s.players.p2.hand.push(s.drawPile.pop()!);
  while (s.players.p2.hand.length > s.players[ACTOR].hand.length) s.drawPile.push(s.players.p2.hand.pop()!);
  // A022: this card is the only one in hand
  if (code === 'A022') {
    while (s.players[ACTOR].hand.length > 0) s.drawPile.push(s.players[ACTOR].hand.pop()!);
  }
  // A021 needs Magical Pony (A097) sitting in the discard pile;
  // A048 needs another player actually holding My Lemons (A127).
  if (code === 'A021') moveCard(s, 'A097', s.discardPile);
  if (code === 'A048') moveCard(s, 'A127', s.players.p2.hand);
  return s;
}

function makeFrame(code: CardCode, outcome: boolean): StackFrame {
  return {
    frameId: 'sweep',
    parentFrameId: null,
    sourceType: 'action',
    sourceCode: code,
    actorId: ACTOR,
    targetIds: ['p2'],
    targetScope: 'single',
    eligibleResponderIds: [],
    responses: {},
    modifiers: [],
    status: 'resolving',
    turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
    customPayload: {
      rosterIds: ['p2', 'p3'],
      winnerId: 'p2',
      outcome,
      firstId: 'p2',
      secondId: 'p3',
      today: '01-15',
      numberInput: 4,
      newVictimId: 'p3',
      newTargetId: 'p3',
    },
  } as StackFrame;
}

interface Finding { code: CardCode; kind: string; detail: string }
const findings: Finding[] = [];
/** Cards whose effect left the whole state byte-identical -- they were called
 * but did nothing, so a "pass" for them proves nothing. */



/** A card counts as exercised if it moved the state in EITHER setup: some cards
 * only fire on a bare table, others only once preconditions are primed. */
const everActive = new Set<CardCode>();

function sweep(code: CardCode, label: string, run: (s: RoomState) => RoomState, primed = true) {
  const base = playCard(freshGame(), code);
  const before = primed ? prime(base, code) : base;
  let after: RoomState;
  try {
    after = run(before);
  } catch (err) {
    findings.push({ code, kind: 'THROWS', detail: `${label}: ${(err as Error).message}` });
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) everActive.add(code);
  if (!after || typeof after !== 'object') {
    findings.push({ code, kind: 'BAD_RETURN', detail: `${label}: returned ${typeof after}` });
    return;
  }
  const drift = conservationDelta(before, after);
  if (drift.length > 0) {
    findings.push({ code, kind: 'CARD_DRIFT', detail: `${label}: ${drift.slice(0, 6).join(', ')}` });
  }
  const structural = structuralProblems(after);
  if (structural.length > 0) {
    findings.push({ code, kind: 'BAD_STATE', detail: `${label}: ${structural.join('; ')}` });
  }
}

describe('full-deck play sweep on a real started game', () => {
  const actions = allCards.filter((c) => c.type === 'action').map((c) => c.id);
  const counters = allCards.filter((c) => c.type === 'counter').map((c) => c.id);
  const traps = allCards.filter((c) => c.type === 'trap').map((c) => c.id);

  it('deals a real game of exactly 289 cards', () => {
    const s = freshGame();
    expect(canonicalCardCodes.length).toBe(289);
    const total = [...census(s).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(289);
    expect(s.status).toBe('playing');
  });

  it('plays every ACTION card both ways and reports every failure', () => {
    for (const code of actions) {
      if (!isActionImplemented(code)) {
        findings.push({ code, kind: 'NOT_IMPLEMENTED', detail: 'no rule registered' });
        continue;
      }
      sweep(code, 'primed/outcome=yes', (s) => executeActionFrameEffect(s, makeFrame(code, true)));
      sweep(code, 'primed/outcome=no', (s) => executeActionFrameEffect(s, makeFrame(code, false)));
      sweep(code, 'bare/outcome=yes', (s) => executeActionFrameEffect(s, makeFrame(code, true)), false);
    }
    expect(true).toBe(true);
  });

  it('plays every TRAP card and reports every failure', () => {
    for (const code of traps) {
      if (!isTrapImplemented(code)) {
        findings.push({ code, kind: 'NOT_IMPLEMENTED', detail: 'no rule registered' });
        continue;
      }
      const rule = getTrapRule(code)!;
      sweep(code, 'trap', (s) => {
        const frame = makeFrame(code, true);
        (frame as { sourceType: string }).sourceType = 'trap';
        return rule.executeEffect(s, frame);
      });
    }
    expect(true).toBe(true);
  });

  it('plays every COUNTER card and reports every failure', () => {
    for (const code of counters) {
      if (!isCounterImplemented(code)) {
        findings.push({ code, kind: 'NOT_IMPLEMENTED', detail: 'not in registry' });
        continue;
      }
      sweep(code, 'counter', (s) => {
        const parent = makeFrame('A001', true);
        parent.frameId = 'parent';
        parent.actorId = 'p2';
        const child = makeFrame(code, true);
        child.parentFrameId = 'parent';
        (child as { sourceType: string }).sourceType = 'counter';
        const withStack: RoomState = { ...s, reactionStack: [parent, child] };
        return resolveCounterEffect(withStack, code, ACTOR, child);
      });
    }
    expect(true).toBe(true);
  });

  it('no card crashes, loses a card, duplicates one, or corrupts state', () => {
    // Assert, don't print: a regression has to FAIL the run, not scroll past in
    // the log. The message carries the detail a bare count would lose.
    const detail = findings.map((f) => `${f.code} [${f.kind}] ${f.detail}`).join('; ');
    expect(detail, `${findings.length} card defect(s): ${detail}`).toBe('');
  });

  /**
   * Cards that legitimately move nothing in either setup. Each is either
   * `kind: 'no_op'` by design (social/honour-system cards, "nothing happens",
   * and the peek/reveal cards that have no per-viewer visibility channel), a
   * trap that fires on a game event rather than on play, or -- A044 -- a card
   * whose adjustment is a no-op because the fixture already sits at its target
   * hand size. Anything joining this list means a card silently stopped
   * working; anything leaving it means the list is stale.
   */
  const EXPECTED_INERT = [
    'A025', 'A028', 'A030', 'A044', 'A071', 'A086', 'A109', 'A128', 'A154', 'A161', 'A169',
    'T09', 'T23', 'T30', 'T31', 'T39', 'T43',
  ];

  it('every other card actually moves the game state', () => {
    const neverMoved = allCards.map((c) => c.id).filter((c) => !everActive.has(c)).sort();
    expect(neverMoved).toEqual([...EXPECTED_INERT].sort());
  });

  it('DISCRIMINATION: the sweep actually catches a planted bug', () => {
    const planted: Finding[] = [];
    const save = findings.length;
    // 1. a rule that throws
    sweep('A001', 'planted-throw', () => { throw new Error('boom'); });
    // 2. a rule that destroys a card (conservation violation)
    sweep('A002', 'planted-loss', (s) => {
      const n: RoomState = JSON.parse(JSON.stringify(s));
      n.players.p2.hand.pop();
      return n;
    });
    // 3. a rule that duplicates a card
    sweep('A003', 'planted-dupe', (s) => {
      const n: RoomState = JSON.parse(JSON.stringify(s));
      n.players.p2.hand.push(n.players.p3.hand[0]);
      return n;
    });
    // 4. a rule that corrupts state
    sweep('A004', 'planted-corrupt', (s) => {
      const n: RoomState = JSON.parse(JSON.stringify(s));
      n.players.p2.forcedLossSinceLastTurn = -5;
      return n;
    });
    planted.push(...findings.splice(save));
    expect(planted.map((p) => p.kind).sort()).toEqual(['BAD_STATE', 'CARD_DRIFT', 'CARD_DRIFT', 'THROWS']);
  });
});
