/**
 * Softlock regression: hunts for cards that leave the game unable to continue --
 * no crash, but no legal way forward. Four hang shapes are checked after every
 * card resolves:
 *   1. a response window nobody is eligible to close
 *   2. a pending forced-discard/steal/draw left non-terminal with a dead owner
 *   3. the turn no longer being able to advance to a real player
 *   4. an empty draw pile making a draw card throw or spin
 */
import { describe, it, expect } from 'vitest';
import { createRoom, addPlayer, startGame } from './room';
import { advanceTurn } from './turn';
import { areAllResponsesComplete } from './reactionStack';
import { canonicalCardCodes } from '../data/cards/deck';
import { allCards } from '../data/cards/index';
import { executeActionFrameEffect, isActionImplemented } from './actionRules/registry';
import { getTrapRule, isTrapImplemented } from './trapRules/registry';
import { resolveCounterEffect } from './counterRules/engine';
import { isCounterImplemented } from './counterRules/registry';
import type { RoomState, CardCode, PlayerId, StackFrame } from './types';

const PLAYERS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const ACTOR = 'p1';
const NON_TERMINAL_OP = new Set(['awaiting_reaction', 'prepared', 'ready_to_finalize']);

function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function freshGame(seed = 42): RoomState {
  let s = createRoom(ACTOR, 'Fix');
  s = addPlayer(s, 'p2', 'Player 2');
  s = addPlayer(s, 'p3', 'Player 3');
  s = addPlayer(s, 'p4', 'Player 4');
  s = startGame(s, canonicalCardCodes, seededRng(seed));
  for (const pid of PLAYERS) {
    for (let i = 0; i < 4; i++) s.players[pid].hand.push(s.drawPile.pop()!);
    s.players[pid].traps.push(s.drawPile.pop()!);
    s.players[pid].birthdayMMDD = '01-15';
  }
  s.discardPile.push(s.drawPile.pop()!);
  s.gameSuggesterId = 'p2';
  return s;
}

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

function makeFrame(code: CardCode, sourceType: string): StackFrame {
  return {
    frameId: 'hang', parentFrameId: null, sourceType, sourceCode: code,
    actorId: ACTOR, targetIds: ['p2'], targetScope: 'single',
    eligibleResponderIds: [], responses: {}, modifiers: [], status: 'resolving',
    turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
    customPayload: {
      rosterIds: ['p2', 'p3'], winnerId: 'p2', outcome: true,
      firstId: 'p2', secondId: 'p3', today: '01-15', numberInput: 4,
      newVictimId: 'p3', newTargetId: 'p3',
    },
  } as unknown as StackFrame;
}

interface Hang { code: CardCode; kind: string; detail: string }
const hangs: Hang[] = [];

/** Every way the game can stop moving after this card resolved. */
function checkHangs(code: CardCode, scenario: string, s: RoomState): void {
  // 1. A response window that can never complete. Judged with the engine's OWN
  //    rule (areAllResponsesComplete), not a guess: a slot whose status is
  //    still 'pending' is an UNANSWERED slot, and an empty eligible list counts
  //    as already complete. The only true softlock is a window still waiting on
  //    responders none of whom exist any more -- nobody can ever answer it.
  for (const f of s.reactionStack ?? []) {
    if (f.status !== 'pending_responses') continue;
    if (areAllResponsesComplete(f)) continue;
    const eligible = f.eligibleResponderIds ?? [];
    const live = eligible.filter((id) => s.players[id]);
    const outstanding = eligible.filter((id) => !f.responses?.[id] || f.responses[id].status === 'pending');
    const liveOutstanding = outstanding.filter((id) => s.players[id]);
    if (eligible.length > 0 && live.length === 0) {
      hangs.push({ code, kind: 'DEAD_RESPONSE_WINDOW', detail: `${scenario}: frame ${f.sourceCode} waits on [${eligible.join(',')}] -- none exist` });
    } else if (outstanding.length > 0 && liveOutstanding.length === 0) {
      hangs.push({ code, kind: 'UNANSWERABLE_WINDOW', detail: `${scenario}: frame ${f.sourceCode} still owes answers from departed [${outstanding.join(',')}]` });
    }
  }
  // 2. a pending operation stranded on a player who no longer exists
  const ops: Array<[string, Record<string, { status?: string; victimId?: string; targetPlayerId?: string; playerId?: string }>]> = [
    ['forcedDiscard', s.pendingForcedDiscards ?? {}],
    ['steal', s.pendingSteals ?? {}],
    ['forcedDraw', s.pendingForcedDraws ?? {}],
  ];
  for (const [label, bag] of ops) {
    for (const [id, op] of Object.entries(bag)) {
      if (!op?.status || !NON_TERMINAL_OP.has(op.status)) continue;
      const owner = op.victimId ?? op.targetPlayerId ?? op.playerId;
      if (owner && !s.players[owner]) {
        hangs.push({ code, kind: 'ORPHANED_OP', detail: `${scenario}: ${label} ${id} stuck at "${op.status}" for missing player ${owner}` });
      }
    }
  }
  // 3. the turn must still be able to move to a real player
  try {
    const advanced = advanceTurn(s);
    const order = advanced.turnOrder?.length ? advanced.turnOrder : (advanced.seatOrder ?? []);
    const active = order[advanced.currentTurnIndex];
    if (order.length > 0 && (!active || !advanced.players[active])) {
      hangs.push({ code, kind: 'TURN_STUCK', detail: `${scenario}: advanceTurn landed on "${active}" which is not a live player` });
    }
  } catch (err) {
    hangs.push({ code, kind: 'TURN_THROWS', detail: `${scenario}: advanceTurn threw ${(err as Error).message}` });
  }
}

function runScenario(code: CardCode, scenario: string, build: () => RoomState, run: (s: RoomState) => RoomState): void {
  let before: RoomState;
  try { before = build(); } catch { return; }
  let after: RoomState;
  const started = Date.now();
  try {
    after = run(before);
  } catch (err) {
    hangs.push({ code, kind: 'THROWS', detail: `${scenario}: ${(err as Error).message}` });
    return;
  }
  if (Date.now() - started > 2000) {
    hangs.push({ code, kind: 'SLOW', detail: `${scenario}: took ${Date.now() - started}ms -- possible spin` });
  }
  if (after && typeof after === 'object') checkHangs(code, scenario, after);
}

describe('softlock hunt across all 289 cards', () => {
  const actions = allCards.filter((c) => c.type === 'action').map((c) => c.id);
  const counters = allCards.filter((c) => c.type === 'counter').map((c) => c.id);
  const traps = allCards.filter((c) => c.type === 'trap').map((c) => c.id);

  /** normal table */
  const normal = (code: CardCode) => () => playCard(freshGame(), code);
  /** draw pile completely empty -- every "draw N" card must cope */
  const emptyDeck = (code: CardCode) => () => {
    const s = playCard(freshGame(), code);
    s.discardPile.push(...s.drawPile.splice(0));
    return s;
  };
  /** everyone else holds nothing -- every "steal/discard from them" card must cope */
  const emptyHands = (code: CardCode) => () => {
    const s = playCard(freshGame(), code);
    for (const pid of ['p2', 'p3', 'p4']) s.drawPile.push(...s.players[pid].hand.splice(0));
    return s;
  };
  /** minimum legal table: exactly 3 players */
  const threePlayers = (code: CardCode) => () => {
    const s = playCard(freshGame(), code);
    s.drawPile.push(...s.players.p4.hand.splice(0), ...s.players.p4.traps.splice(0));
    delete s.players.p4;
    s.turnOrder = s.turnOrder.filter((id) => id !== 'p4');
    s.seatOrder = (s.seatOrder ?? []).filter((id) => id !== 'p4');
    return s;
  };

  it('ACTION cards under four table states', () => {
    for (const code of actions) {
      if (!isActionImplemented(code)) continue;
      const go = (s: RoomState) => executeActionFrameEffect(s, makeFrame(code, 'action'));
      runScenario(code, 'normal', normal(code), go);
      runScenario(code, 'empty-deck', emptyDeck(code), go);
      runScenario(code, 'empty-hands', emptyHands(code), go);
      runScenario(code, '3-players', threePlayers(code), go);
    }
    expect(true).toBe(true);
  });

  it('TRAP cards under four table states', () => {
    for (const code of traps) {
      if (!isTrapImplemented(code)) continue;
      const rule = getTrapRule(code)!;
      const go = (s: RoomState) => rule.executeEffect(s, makeFrame(code, 'trap'));
      runScenario(code, 'normal', normal(code), go);
      runScenario(code, 'empty-deck', emptyDeck(code), go);
      runScenario(code, 'empty-hands', emptyHands(code), go);
      runScenario(code, '3-players', threePlayers(code), go);
    }
    expect(true).toBe(true);
  });

  it('COUNTER cards under four table states', () => {
    for (const code of counters) {
      if (!isCounterImplemented(code)) continue;
      const go = (s: RoomState) => {
        const parent = makeFrame('A001', 'action');
        parent.frameId = 'parent';
        parent.actorId = 'p2';
        const child = makeFrame(code, 'counter');
        child.parentFrameId = 'parent';
        return resolveCounterEffect({ ...s, reactionStack: [parent, child] }, code, ACTOR, child);
      };
      runScenario(code, 'normal', normal(code), go);
      runScenario(code, 'empty-deck', emptyDeck(code), go);
      runScenario(code, 'empty-hands', emptyHands(code), go);
      runScenario(code, '3-players', threePlayers(code), go);
    }
    expect(true).toBe(true);
  });

  /** The realistic softlock: a card opens a response window, then the player it
   * is waiting on leaves the room. Nobody left can answer -> the window can
   * never complete on its own. */
  it('a responder leaving mid-window: which cards strand the game', () => {
    const stranded: string[] = [];
    for (const code of actions) {
      if (!isActionImplemented(code)) continue;
      let after: RoomState;
      try {
        after = executeActionFrameEffect(playCard(freshGame(), code), makeFrame(code, 'action'));
      } catch { continue; }
      const waiting = (after.reactionStack ?? []).filter(
        (f) => f.status === 'pending_responses' && !areAllResponsesComplete(f)
      );
      if (waiting.length === 0) continue;
      // evict everyone the open windows are waiting on
      const owed = new Set<PlayerId>();
      for (const f of waiting) {
        for (const id of f.eligibleResponderIds ?? []) {
          if (!f.responses?.[id] || f.responses[id].status === 'pending') owed.add(id);
        }
      }
      const evicted: RoomState = JSON.parse(JSON.stringify(after));
      for (const id of owed) {
        delete evicted.players[id];
        evicted.turnOrder = evicted.turnOrder.filter((x) => x !== id);
        evicted.seatOrder = (evicted.seatOrder ?? []).filter((x) => x !== id);
      }
      const before = hangs.length;
      checkHangs(code, 'responder-left', evicted);
      if (hangs.length > before) stranded.push(`${code}(${[...owed].join(',')})`);
    }
    // These seven open a response window and are therefore the cards that can
    // leave a table waiting on someone who is gone. That is survivable -- the
    // host, or the deputy when the host is the one who vanished, can force the
    // window shut (see canActAsHost in lib/session.tsx) -- but a card JOINING
    // this list is a new way to stall a game and should be a deliberate choice.
    const KNOWN_WINDOW_OPENERS = ['A005', 'A017', 'A052', 'A108', 'A121', 'A124', 'A140'];
    expect(stranded.map((s) => s.split('(')[0]).sort()).toEqual([...KNOWN_WINDOW_OPENERS].sort());
  });

  it('the turn loop survives every player being skip-flagged', () => {
    const s = freshGame();
    for (const pid of PLAYERS) s.players[pid].skipNextTurn = true;
    const started = Date.now();
    const out = advanceTurn(s);
    const order = out.turnOrder;
    const active = order[out.currentTurnIndex];
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out.players[active]).toBeDefined();
  });

  it('no card leaves normal play unable to continue', () => {
    // The responder-left scenario above owns its own expectation; everything
    // reaching here came from ordinary play, where nothing may stall.
    const fromNormalPlay = hangs.filter((h) => !h.detail.startsWith('responder-left'));
    const detail = fromNormalPlay.map((h) => `${h.code} [${h.kind}] ${h.detail}`).join('; ');
    expect(detail, `${fromNormalPlay.length} softlock(s): ${detail}`).toBe('');
  });

  it('DISCRIMINATION: the detector catches planted softlocks', () => {
    const save = hangs.length;
    // a response window with no live responders
    runScenario('A001', 'planted-dead-window', normal('A001'), (s) => ({
      ...s,
      reactionStack: [{ ...makeFrame('A001', 'action'), status: 'pending_responses', eligibleResponderIds: ['ghost'], responses: {} }],
    }));
    // a pending steal stranded on a player who left
    runScenario('A002', 'planted-orphan', normal('A002'), (s) => ({
      ...s,
      pendingSteals: { op1: { status: 'awaiting_reaction', victimId: 'ghost' } },
    } as unknown as RoomState));
    // a turn order pointing at nobody
    runScenario('A003', 'planted-turn-stuck', normal('A003'), (s) => ({ ...s, turnOrder: ['ghost'], currentTurnIndex: 0 }));
    const caught = hangs.splice(save);
    expect(caught.map((c) => c.kind).sort()).toEqual(['DEAD_RESPONSE_WINDOW', 'ORPHANED_OP', 'TURN_STUCK']);
  });
});
