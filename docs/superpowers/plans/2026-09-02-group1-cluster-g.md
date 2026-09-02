# Group 1 Cluster G (A092) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement A092 "ฉันบ้าไปแล้ว!" (I'm Crazy! — put all cards back into the deck,
shuffle, restart the entire game, mid-match), bringing the project from 165/173 to 166/173
implemented Action cards.

**Architecture:** Extract a `resetPlayerPerTurnFlags(player)` helper in `game/turn.ts` (the
5-field per-turn reset checklist, currently duplicated in `beginTurn` and, inline, in
`game/room.ts`'s `startGame`/`resetForPlayAgain`), then add a new `restartGame(state, rng)`
in `game/room.ts` that pools every physical card currently in play, reshuffles, deals 3
fresh cards per player, and resets turn order/win state/reaction-stack state while
preserving room/social identity fields. A092's card definition is a thin one-line delegate
to `restartGame`. Full design/rationale:
`docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md` — read it before starting.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

---

## Before you start

- Confirm you're on branch `feature/birthday-cards` (not `main`) — `git branch --show-current`.
- Run the baseline: `npx vitest run --reporter=dot` (expect 609 passed, 43 files) and
  `npx tsc --noEmit` (expect clean, no output). If either fails, stop and investigate before
  adding new code.
- Read `docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md` in full — it documents
  three rulings confirmed with the user (turn order resets to `seatOrder[0]`, not
  actor-first; `muffinTimeTarget` resets to 10 even if A135 changed it earlier;
  `gameSuggesterId` is preserved, not cleared) and why `gameEvents` is deliberately left
  untouched (out of scope, flagged not silently skipped).

---

### Task 1: Extract `resetPlayerPerTurnFlags`

**Files:**
- Modify: `game/turn.ts`
- Test: `game/turn.test.ts`

- [ ] **Step 1: Write the failing test for `resetPlayerPerTurnFlags`**

In `game/turn.test.ts`, change the type import (currently `import type { RoomState } from
'./types';`) to also pull in `PlayerState`:

```ts
import type { RoomState, PlayerState } from './types';
```

Add `resetPlayerPerTurnFlags` to the import from `./turn` (currently starts `import {
advanceTurn, isMuffinTimeEligible, ...`) — add it anywhere in that list, e.g. right after
`advanceTurn,`.

Add this new `describe` block anywhere in the file (e.g. right before `describe('advanceTurn'`):

```ts
describe('resetPlayerPerTurnFlags', () => {
  it('resets all five per-turn fields on the given player object, in place', () => {
    const player: PlayerState = {
      name: 'P', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false,
      placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true,
      bonusActionPlaysRemaining: 2, mustPlayActionThisTurn: true,
    };
    resetPlayerPerTurnFlags(player);
    expect(player.placedTrapThisTurn).toBe(false);
    expect(player.hasDrawnThisTurn).toBe(false);
    expect(player.hasPlayedActionThisTurn).toBe(false);
    expect(player.bonusActionPlaysRemaining).toBe(0);
    expect(player.mustPlayActionThisTurn).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run game/turn.test.ts -t "resetPlayerPerTurnFlags" --reporter=verbose`
Expected: FAIL — `resetPlayerPerTurnFlags is not a function` (doesn't exist yet).

- [ ] **Step 3: Implement `resetPlayerPerTurnFlags` and use it in `beginTurn`**

In `game/turn.ts`, update the type import at the top (currently `import type { RoomState,
PlayerId, PlayDirection, PendingWinCheck } from './types';`) to also pull in `PlayerState`:

```ts
import type { RoomState, PlayerId, PlayerState, PlayDirection, PendingWinCheck } from './types';
```

Add this new exported function right before `beginTurn`:

```ts
/**
 * The 5-field per-turn PlayerState reset checklist, shared by beginTurn,
 * game/room.ts's startGame/resetForPlayAgain, and restartGame (A092) --
 * extracted so a future caller of "start this player's turn fresh" doesn't
 * need a fifth copy of this list.
 */
export function resetPlayerPerTurnFlags(player: PlayerState): void {
  player.placedTrapThisTurn = false;
  player.hasDrawnThisTurn = false;
  player.hasPlayedActionThisTurn = false;
  player.bonusActionPlaysRemaining = 0;
  player.mustPlayActionThisTurn = false;
}
```

Then change `beginTurn` (currently):

```ts
export function beginTurn(state: RoomState, activePlayerId: PlayerId): RoomState {
  const next = cloneState(state);
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
    next.players[activePlayerId].mustPlayActionThisTurn = false;
  }
  next.turnPhase = 'trap_placement';
```

to:

```ts
export function beginTurn(state: RoomState, activePlayerId: PlayerId): RoomState {
  const next = cloneState(state);
  if (next.players[activePlayerId]) {
    resetPlayerPerTurnFlags(next.players[activePlayerId]);
  }
  next.turnPhase = 'trap_placement';
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/turn.test.ts --reporter=dot`
Expected: all tests in the file PASS (this is a pure refactor of already-tested `beginTurn`
behavior — every existing `advanceTurn`/`jumpToPlayerTurn` test that exercises `beginTurn`
indirectly must still pass unchanged).

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 610 passed (up from 609), 43 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/turn.ts game/turn.test.ts
git commit -m "$(cat <<'EOF'
refactor: extract resetPlayerPerTurnFlags in game/turn.ts

The 5-field per-turn PlayerState reset checklist was duplicated in
beginTurn and, inline, in game/room.ts's startGame/resetForPlayAgain.
Extracting it lets A092's restartGame (Task 3) reuse the identical
checklist instead of writing a fourth copy.

Part of Group 1 Cluster G -- see
docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UxREYNtZ19ywqoQLCDy7y9
EOF
)"
```

---

### Task 2: Wire `resetPlayerPerTurnFlags` into `game/room.ts`

**Files:**
- Modify: `game/room.ts`

This is a pure refactor (no behavior change, no new tests) — `startGame` and
`resetForPlayAgain`'s existing test suites in `game/room.test.ts` already cover this
behavior and must keep passing unchanged.

- [ ] **Step 1: Update the import**

In `game/room.ts`, change the import from `./turn` (currently `import { beginTurn } from
'./turn';`) to:

```ts
import { beginTurn, resetPlayerPerTurnFlags } from './turn';
```

- [ ] **Step 2: Replace the inline reset loop in `startGame`**

Find (inside `startGame`):

```ts
  for (const pid of Object.keys(next.players)) {
    next.players[pid].placedTrapThisTurn = false;
    next.players[pid].hasDrawnThisTurn = false;
    next.players[pid].hasPlayedActionThisTurn = false;
    next.players[pid].bonusActionPlaysRemaining = 0;
    next.players[pid].mustPlayActionThisTurn = false;
  }
```

Replace with:

```ts
  for (const pid of Object.keys(next.players)) {
    resetPlayerPerTurnFlags(next.players[pid]);
  }
```

- [ ] **Step 3: Replace the inline reset fields in `resetForPlayAgain`**

Find (inside `resetForPlayAgain`'s per-player loop):

```ts
  for (const pid of playerIds) {
    next.players[pid] = {
      ...next.players[pid],
      hand: [],
      traps: [],
      hasCalledMuffinTime: false,
      skipNextTurn: false,
      placedTrapThisTurn: false,
      hasDrawnThisTurn: false,
      hasPlayedActionThisTurn: false,
      bonusActionPlaysRemaining: 0,
      mustPlayActionThisTurn: false,
    };
  }
```

Replace with:

```ts
  for (const pid of playerIds) {
    next.players[pid] = { ...next.players[pid], hand: [], traps: [], hasCalledMuffinTime: false, skipNextTurn: false };
    resetPlayerPerTurnFlags(next.players[pid]);
  }
```

- [ ] **Step 4: Run the tests, confirm nothing broke**

Run: `npx vitest run game/room.test.ts --reporter=dot`
Expected: all tests in the file PASS unchanged (no count change from Task 1's 610 — this
task adds zero new tests).

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 610 passed, 43 files (unchanged from Task 1).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/room.ts
git commit -m "$(cat <<'EOF'
refactor: use resetPlayerPerTurnFlags in game/room.ts

startGame and resetForPlayAgain each had their own inline copy of the
5-field per-turn reset checklist. Switches both to the helper
extracted in game/turn.ts, closing the drift risk before Task 3 adds
a fourth call site (restartGame).

Part of Group 1 Cluster G -- see
docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UxREYNtZ19ywqoQLCDy7y9
EOF
)"
```

---

### Task 3: `restartGame`

**Files:**
- Modify: `game/room.ts`
- Test: `game/room.test.ts`
- Test: `game/cardInvariant.test.ts`

- [ ] **Step 1: Write the failing tests in `game/room.test.ts`**

In `game/room.test.ts`, update the import from `./room` (currently `import { createRoom,
addPlayer, removePlayer, startGame, startSetup, setGameSuggester, resetForPlayAgain,
GLOBAL_MIN_PLAYERS, GLOBAL_MAX_PLAYERS } from './room';`) to add `restartGame`:

```ts
import { createRoom, addPlayer, removePlayer, startGame, startSetup, setGameSuggester, resetForPlayAgain, restartGame, GLOBAL_MIN_PLAYERS, GLOBAL_MAX_PLAYERS } from './room';
```

Add this new `describe` block at the end of the file:

```ts
describe('restartGame (A092)', () => {
  function playingRoom() {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 15 }, (_, i) => `A${i + 1}`);
    return startGame(room, allCodes, () => 0);
  }

  it('pools drawPile, discardPile, every hand, and every trap, then deals 3 fresh cards per player', () => {
    const room = playingRoom();
    // Simulate a card already in the discard pile and a placed trap before A092 fires.
    room.discardPile = [room.drawPile.pop()!, room.drawPile.pop()!];
    room.players.p3.traps = [room.drawPile.pop()!];

    const before = new Set([
      ...room.drawPile, ...room.discardPile,
      ...room.players.host1.hand, ...room.players.p2.hand, ...room.players.p3.hand,
      ...room.players.p3.traps,
    ]);

    const next = restartGame(room, () => 0);

    expect(next.status).toBe('playing');
    expect(next.discardPile).toEqual([]);
    expect(next.players.host1.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
    expect(next.players.p3.traps).toEqual([]);
    const after = new Set([
      ...next.drawPile,
      ...next.players.host1.hand, ...next.players.p2.hand, ...next.players.p3.hand,
    ]);
    expect(after).toEqual(before);
    expect(next.drawPile.length).toBe(before.size - 9);
  });

  it('resets turn order to seatOrder[0]-first, muffinTimeTarget to 10, and clears win/end-of-game and reaction-stack state', () => {
    const room = {
      status: 'playing',
      hostId: 'host1',
      seatOrder: ['host1', 'p2', 'p3'],
      turnOrder: ['p2', 'p3', 'host1'],
      currentTurnIndex: 2,
      direction: 1,
      muffinTimeTarget: 6,
      drawPile: ['A01', 'A02', 'A03'],
      discardPile: ['A04'],
      players: {
        host1: { name: 'Host', hand: ['A05'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'P2', hand: ['A06'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'P3', hand: ['A07'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      winnerId: 'p2',
      finishReason: 'normal',
      gameEndReason: 'muffin_time',
      winnerPlayerIds: ['p2'],
      finalHandCounts: { p2: 6 },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p2' }],
      pendingWinChecks: [{ sourcePlayerId: 'host1', type: 'hand_nonempty' }],
      pendingActionObligations: ['p3'],
      actionRedirect: { toPlayerId: 'p3', remaining: 2 },
      reactionStack: [{ frameId: 'f1', sourceType: 'action' }],
      pendingResponse: { responseId: 'r1', kind: 'action', code: 'A092', actorId: 'host1' },
      pendingInteraction: { interactionId: 'i1', type: 'date_invite', sourceCardCode: 'T10', initiatorId: 'host1', targetPlayerId: 'p2', timestamp: 0 },
      lastResult: { kind: 'action', code: 'A092', actorId: 'host1', countered: false },
      isShufflingDrawPile: true,
      shuffleSequence: 5,
      placedTrapMeta: { fake: { ownerId: 'p3', placedSequence: 1, placedRound: 1, placedByPlayerTurnIndex: 0 } },
      pendingForcedDiscards: { fake: { operationId: 'op1', targetPlayerId: 'p3', requestedCount: 1, cardCodes: [], originalDestination: 'discard', intercepted: false, status: 'pending' } },
      roundNumber: 4,
    } as unknown as RoomState;

    const next = restartGame(room, () => 0);

    expect(next.turnOrder).toEqual(['host1', 'p2', 'p3']);
    expect(next.currentTurnIndex).toBe(0);
    expect(next.muffinTimeTarget).toBe(10);
    expect(next.winnerId).toBeUndefined();
    expect(next.finishReason).toBeUndefined();
    expect(next.gameEndReason).toBeUndefined();
    expect(next.winnerPlayerIds).toBeUndefined();
    expect(next.finalHandCounts).toBeUndefined();
    expect(next.globalRestrictions).toEqual([]);
    expect(next.pendingWinChecks).toEqual([]);
    expect(next.pendingActionObligations).toBeUndefined();
    expect(next.actionRedirect).toBeNull();
    expect(next.reactionStack).toEqual([]);
    expect(next.pendingResponse).toBeNull();
    expect(next.pendingInteraction).toBeNull();
    expect(next.lastResult).toBeNull();
    expect(next.isShufflingDrawPile).toBe(false);
    expect(next.shuffleSequence).toBe(0);
    expect(next.placedTrapMeta).toEqual({});
    expect(next.pendingForcedDiscards).toEqual({});
    expect(next.roundNumber).toBe(1);
  });

  it('preserves hostId, joinOrder, maxPlayers, gameSuggesterId, and per-player name/connected/birthdayMMDD', () => {
    const room = playingRoom();
    room.gameSuggesterId = 'p2';
    room.players.p3.birthdayMMDD = '05-10';
    room.players.p2.connected = false;

    const next = restartGame(room, () => 0);

    expect(next.hostId).toBe('host1');
    expect(next.joinOrder).toEqual(room.joinOrder);
    expect(next.maxPlayers).toBe(room.maxPlayers);
    expect(next.gameSuggesterId).toBe('p2');
    expect(next.players.p3.birthdayMMDD).toBe('05-10');
    expect(next.players.p2.connected).toBe(false);
    expect(next.players.host1.name).toBe('P1');
  });

  it('is a no-op outside "playing" status', () => {
    const room = {
      status: 'lobby', hostId: 'host1', turnOrder: [], currentTurnIndex: 0, direction: 1,
      muffinTimeTarget: 10, drawPile: [], discardPile: [], players: {},
    } as unknown as RoomState;
    expect(restartGame(room)).toEqual(room);
  });
});
```

This test file needs `RoomState` in scope for the `as unknown as RoomState` casts — add it
to `game/room.test.ts`'s imports. If the file currently has no type import, add:

```ts
import type { RoomState } from './types';
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/room.test.ts -t "restartGame" --reporter=verbose`
Expected: FAIL — `restartGame is not a function` (doesn't exist yet).

- [ ] **Step 3: Implement `restartGame`**

In `game/room.ts`, add this new exported function right after `resetForPlayAgain` (at the
end of the file):

```ts
/**
 * A092 "ฉันบ้าไปแล้ว!" (I'm Crazy!): mid-game full restart. Unlike
 * resetForPlayAgain (which requires status 'finished'/'ended' and detours
 * through 'lobby'), this fires while status stays 'playing' -- it pools
 * every card currently anywhere in the game (not a fresh canonical deck,
 * per the card's own text), reshuffles, deals 3 fresh cards per player, and
 * resets turn order/win state/reaction-stack state. Room/social identity
 * fields (hostId, joinOrder, maxPlayers, gameSuggesterId, playDirection,
 * and each PlayerState's name/connected/birthdayMMDD) are deliberately left
 * untouched -- see the design spec's rulings for why gameSuggesterId in
 * particular is preserved rather than cleared.
 */
export function restartGame(state: RoomState, rng: Rng = Math.random): RoomState {
  if (state.status !== 'playing') return cloneState(state);
  const next = cloneState(state);
  const playerIds = Object.keys(next.players);

  // "นำไพ่ทั้งหมดกลับเข้ากอง" -- pool every card currently anywhere in the
  // game (not a fresh canonical deck).
  const pool: CardCode[] = [...next.drawPile, ...next.discardPile];
  for (const pid of playerIds) {
    pool.push(...next.players[pid].hand, ...next.players[pid].traps);
  }
  next.drawPile = shuffle(pool, rng);
  next.discardPile = [];

  const seatOrder =
    next.seatOrder && next.seatOrder.length === playerIds.length && next.seatOrder.every((id) => next.players[id])
      ? next.seatOrder
      : playerIds;
  next.seatOrder = [...seatOrder];
  next.turnOrder = [...seatOrder];
  next.direction = next.playDirection === 'counterclockwise' ? -1 : 1;

  for (const pid of playerIds) {
    next.players[pid].hand = [];
    next.players[pid].traps = [];
    next.players[pid].hasCalledMuffinTime = false;
    next.players[pid].skipNextTurn = false;
    resetPlayerPerTurnFlags(next.players[pid]);
  }
  for (const pid of next.turnOrder) {
    for (let i = 0; i < 3; i++) {
      next.players[pid].hand.push(next.drawPile.pop()!);
    }
  }

  next.currentTurnIndex = 0;
  next.muffinTimeTarget = 10;
  next.winnerId = undefined;
  next.finishReason = undefined;
  next.gameEndReason = undefined;
  next.winnerPlayerIds = undefined;
  next.finalHandCounts = undefined;
  next.globalRestrictions = [];
  next.pendingWinChecks = [];
  next.pendingActionObligations = undefined;
  next.actionRedirect = null;
  next.reactionStack = [];
  next.pendingResponse = null;
  next.pendingInteraction = null;
  next.lastResult = null;
  next.isShufflingDrawPile = false;
  next.shuffleSequence = 0;
  next.placedTrapMeta = {};
  next.pendingForcedDiscards = {};
  next.roundNumber = 1;
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;

  const firstPlayerId = next.turnOrder[0];
  return beginTurn(next, firstPlayerId);
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/room.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 5: Write the failing card-conservation test in `game/cardInvariant.test.ts`**

In `game/cardInvariant.test.ts`, update the import from `./room` (currently `import {
addPlayer, createRoom, startGame } from './room';`) to add `restartGame`:

```ts
import { addPlayer, createRoom, restartGame, startGame } from './room';
```

Add this new `it` inside the existing `describe('card conservation invariant', ...)` block
(after the existing "preserves every card through draw, discard, trap, transfer, swap, and
reaction metadata" test):

```ts
  it('preserves every card through restartGame, including a placed trap and reaction-stack metadata', () => {
    let state = startedRoom();
    const trapIndex = state.drawPile.findIndex((code) => code.startsWith('T'));
    const trapCode = state.drawPile.splice(trapIndex, 1)[0];
    state.players.p1.hand.push(trapCode);
    state = placeTrap(state, 'p1', trapCode);
    assertCardConservation(state);
    state = pushStackFrame(state, {
      sourceType: 'trap',
      sourceCode: trapCode,
      actorId: 'p1',
      targetIds: ['p2'],
      targetScope: 'single',
      eligibleResponderIds: ['p2'],
    });
    assertCardConservation(state);

    const next = restartGame(state, () => 0.5);
    assertCardConservation(next);
    expect(next.reactionStack).toEqual([]);
  });
```

- [ ] **Step 6: Run the test, confirm it fails**

Run: `npx vitest run game/cardInvariant.test.ts -t "restartGame" --reporter=verbose`
Expected: FAIL only if Step 3 wasn't applied correctly -- since `restartGame` already
exists from Step 3 above, this should actually PASS immediately. Run it anyway to confirm
the card-conservation invariant genuinely holds through `restartGame`, not just that the
function runs without throwing.

- [ ] **Step 7: Full verification**

Run: `npx vitest run --reporter=dot` — expect 615 passed (up from 610 after Task 2: +4 in
`room.test.ts`, +1 in `cardInvariant.test.ts`), 43 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 8: Commit**

```bash
git add game/room.ts game/room.test.ts game/cardInvariant.test.ts
git commit -m "$(cat <<'EOF'
feat: add restartGame to game/room.ts

Mid-game full restart for A092 -- pools every card currently in play
(not a fresh canonical deck, per the card's own text), reshuffles,
deals 3 fresh cards per player, and resets turn order (to
seatOrder[0], not actor-first), muffinTimeTarget (back to 10), and
all win/reaction-stack state, while preserving room/social identity
fields (hostId, joinOrder, maxPlayers, gameSuggesterId,
playDirection, name/connected/birthdayMMDD). Verified against the
existing card-conservation invariant, including a placed-trap and
mid-resolution reaction-stack scenario.

Part of Group 1 Cluster G -- see
docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UxREYNtZ19ywqoQLCDy7y9
EOF
)"
```

---

### Task 4: A092's card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

- [ ] **Step 1: Write the failing tests for A092's `executeEffect`**

In `game/actionRules/definitions.test.ts`, add this new `describe` block at the end of the
file:

```ts
describe('A092 (put all cards back, reshuffle, and restart the entire game)', () => {
  it('delegates to restartGame', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A092', 'me');
    expect(next.status).toBe('playing');
    expect(next.muffinTimeTarget).toBe(10);
    expect(next.players.me.hand.length).toBe(3);
    expect(next.players.p2.hand.length).toBe(3);
    expect(next.players.p3.hand.length).toBe(3);
  });

  it('is a no-op when the game is not currently playing', () => {
    const state = { ...threePlayerState(), status: 'finished' } as RoomState;
    expect(resolveActionEffect(state, 'A092', 'me')).toEqual(state);
  });
});
```

(This reuses the `threePlayerState` helper already defined near the top of the test file.)

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A092" --reporter=verbose`
Expected: FAIL — `expected undefined to be 'playing'` (A092 isn't registered yet, and a
missing rule is itself a no-op, so the second test will trivially pass already; the first
assertion is the one that must fail here).

- [ ] **Step 3: Implement A092's card definition**

In `game/actionRules/definitions.ts`:

1. Add a new import line for `restartGame` (there is currently no import from `../room` in
   this file) — add it anywhere among the existing imports, e.g. right after the `../turn`
   import:

```ts
import { restartGame } from '../room';
```

2. Add this block right after A119's entry (from Cluster B):

```ts
  A092: {
    code: 'A092', name_en: "I'm Crazy", name_th: 'ฉันบ้าไปแล้ว!', kind: 'auto',
    description_th: 'นำไพ่ทั้งหมดกลับเข้ากอง สับไพ่ แล้วเริ่มเกมใหม่ทั้งหมด',
    executeEffect: (state) => restartGame(state),
  },

```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A092" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 617 passed (up from 615 after Task 3), 43 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "$(cat <<'EOF'
feat: implement A092 Action card (mid-game full restart)

A thin one-line delegate to restartGame -- kind: 'auto', no target,
no new UI wiring, matching A035's existing precedent of omitting the
unused frame parameter entirely.

Part of Group 1 Cluster G -- see
docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md.

166/173 Action cards implemented -- Group 1 Cluster G is done; 8
cards remain across clusters C, D, E, F.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UxREYNtZ19ywqoQLCDy7y9
EOF
)"
```

---

### Task 5: Wrap-up — docs, push, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`

- [ ] **Step 1: Final full verification**

Run: `npx vitest run --reporter=dot` — expect 617 passed, 0 failed, 43 files.
Run: `npx tsc --noEmit` — expect clean (no output).

- [ ] **Step 2: Manual smoke-check (optional but recommended)**

A092 is the first card that resets the game to a fresh 3-card deal for every player
mid-match while `status` stays `'playing'`. If you have a way to run the app locally, play
a 3+ player bot/local game, have the active player play A092, and confirm: every player's
hand visibly resets to 3 cards, any placed traps disappear, the discard pile empties, turn
order returns to the original seat order starting from seat 1, and if muffin-time target
had been changed earlier in the session it visibly reverts to 10. Not a blocker if you
can't run the app in this environment — note it as unverified in your report instead.

- [ ] **Step 3: Update the handoff doc**

In `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`:
- Change the `## Status:` line to reflect 166/173 and that Cluster G is done.
- Update the "Branch state" section's test count (617) and card-infrastructure summary to
  mention `resetPlayerPerTurnFlags`/`restartGame` (both new in this cluster, no new
  `PlayerState`/`RoomState` fields).
- Under Group 1's entry, mark Cluster G (A092) done with a short "what shipped and why"
  paragraph, matching the style already used for Clusters A and B. Note that Clusters C, D,
  E, F (8 cards) remain.

- [ ] **Step 4: Commit the doc update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "$(cat <<'EOF'
docs: mark Group 1 Cluster G done in the remaining-work handoff (166/173)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UxREYNtZ19ywqoQLCDy7y9
EOF
)"
```

- [ ] **Step 5: Check `main` hasn't moved, then push**

```bash
git fetch origin
git log --oneline main..origin/main
```

Expected: no output. If there IS output, stop and investigate before pushing — read those
commits first (this branch already had one significant unplanned divergence with `main`
earlier this session; don't assume it can't happen again).

```bash
git push origin feature/birthday-cards
```

- [ ] **Step 6: Update PR #3's description**

Run: `gh pr view 3 --json state,mergeable,url` to confirm it's open and mergeable. If
`mergeable` isn't `MERGEABLE`, stop and investigate before editing the description — don't
assume a conflict-check result more than a few minutes old is still accurate; GitHub
computes it asynchronously (query again after a few seconds if it reads `UNKNOWN`). If
open, update its body (`gh pr edit 3 --body "..."`) to add a bullet for Cluster G,
following the same format as the existing bullets. If PR #3 is no longer open, open a new
one into `main` instead.
