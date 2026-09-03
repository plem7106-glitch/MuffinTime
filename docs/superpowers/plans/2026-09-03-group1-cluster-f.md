# Group 1 Cluster F (A091) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `A091` "ฉันเป็นหมอ" — draw N cards where N is how many cards this
player has had stolen or forced-discarded (by anyone else's card/trap/counter) since
their last turn began.

**Architecture:** One new optional `PlayerState.forcedLossSinceLastTurn` counter, reset
at the single existing per-turn reset point (`resetPlayerPerTurnFlags`). A shared
`trackForcedLoss` helper increments it. Two thin wrappers (`forceDiscard`/`forceSteal`)
add tracking on top of the existing untracked `discard()`/`stealRandom()` primitives;
three already-centralized pipeline functions (`finalizeForcedDiscard`, `finalizeSteal`,
`executeFullHandTransfer`) get one tracking call each; `roster.ts` and `trapPile.ts` get
their own small tracked wrappers; then every "someone other than the acting player loses
cards" call site in `game/actionRules/definitions.ts` is swapped onto the tracked
version. A091's own card entry just reads the counter.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- A loss counts as "forced" (tracked) exactly when the player losing cards is **not**
  the player who played the card/counter causing the loss. Self-inflicted costs of your
  own played card (discarding your own cards, choosing to give cards away, a mandatory
  "then discard the extra" side effect of your own steal, being swept into a
  group-effect you triggered yourself) are **not** tracked.
- Hand swaps/redeals/rotations (`executeHandSwapAndDeal`, `poolShuffleRedeal`,
  `passHands`) have no directional victim and are **never** tracked.
- `returnTrapsToHand` moves a player's own traps back into their own hand — no card
  leaves their control, so it is **never** tracked regardless of who the target is.
- Track the **actual** count moved (post-clamp), never the requested count.
- Every new/changed function must keep the project's existing `Rng = Math.random`
  default-parameter convention for anything touching randomness.
- Full source of truth for the design is
  `docs/superpowers/specs/2026-09-03-group1-cluster-f-design.md` — read it if anything
  in a task brief seems to contradict this plan; this plan is the executable breakdown
  of that spec, not a replacement for it.
- Baseline before Task 1: `npx vitest run --reporter=dot` → 818 passed, 60 files;
  `npx tsc --noEmit` → clean. Branch `feature/group1-cluster-f`, forked from `main` at
  `a9e1c85` (already includes Cluster E's merged work).
- Every task's file-line references were correct when this plan was written. Line
  numbers can drift once earlier tasks land — locate each edit by its surrounding card
  code / function name and confirm with a fresh `grep -n` before editing, never trust a
  bare line number blindly.

---

### Task 1: Core field, tracker, and reset wiring

**Files:**
- Modify: `game/types.ts` (`PlayerState` interface, ~line 109-132)
- Modify: `game/turn.ts` (`resetPlayerPerTurnFlags`, ~line 83-89)
- Modify: `game/util.ts`
- Test: `game/util.test.ts`, `game/turn.test.ts`

**Interfaces:**
- Produces: `PlayerState.forcedLossSinceLastTurn?: number`;
  `trackForcedLoss(state: RoomState, victimId: PlayerId, count: number): RoomState`
  exported from `game/util.ts`.

- [ ] **Step 1: Write the failing test for `trackForcedLoss`**

Add to `game/util.test.ts`:

```ts
import { trackForcedLoss } from './util';
import type { RoomState } from './types';

function forcedLossState(): RoomState {
  return {
    status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
    direction: 1, muffinTimeTarget: 10, drawPile: [], discardPile: [],
    players: {
      p1: { name: 'One', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

describe('trackForcedLoss', () => {
  it('increments from undefined and accumulates across calls', () => {
    let state = forcedLossState();
    state = trackForcedLoss(state, 'p2', 2);
    expect(state.players.p2.forcedLossSinceLastTurn).toBe(2);
    state = trackForcedLoss(state, 'p2', 1);
    expect(state.players.p2.forcedLossSinceLastTurn).toBe(3);
  });

  it('no-ops for count <= 0', () => {
    const state = forcedLossState();
    const next = trackForcedLoss(state, 'p2', 0);
    expect(next.players.p2.forcedLossSinceLastTurn).toBeUndefined();
  });

  it('no-ops for an unknown player id', () => {
    const state = forcedLossState();
    const next = trackForcedLoss(state, 'ghost', 3);
    expect(next.players.p1.forcedLossSinceLastTurn).toBeUndefined();
    expect(next.players.p2.forcedLossSinceLastTurn).toBeUndefined();
  });

  it('leaves other players untouched', () => {
    const state = trackForcedLoss(forcedLossState(), 'p2', 5);
    expect(state.players.p1.forcedLossSinceLastTurn).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run game/util.test.ts`
Expected: FAIL — `trackForcedLoss` is not exported from `./util`.

- [ ] **Step 3: Add the field to `PlayerState`**

In `game/types.ts`, inside `export interface PlayerState { ... }`, add after
`mustPlayActionThisTurn?: boolean;`:

```ts
  /** A091: cards involuntarily lost (stolen from you, or forced-discarded by
   * someone else's card/trap/counter) since your last turn began. Incremented
   * by trackForcedLoss (game/util.ts) at every forced-loss site; read (not
   * reset) by A091's own executeEffect -- if A091 is played twice in one turn
   * (e.g. via A100's bonus plays), both reads see the same accumulated total
   * unless something forces a loss in between, matching the card's literal
   * "since your last turn" wording rather than "since you last played this
   * card." Reset to 0 by resetPlayerPerTurnFlags, same as every other
   * per-turn field on this interface. */
  forcedLossSinceLastTurn?: number;
```

- [ ] **Step 4: Add `trackForcedLoss` to `game/util.ts`**

`game/util.ts` currently only imports `type { Rng }`. Change its import line and add the
function at the end of the file:

```ts
import type { PlayerId, Rng, RoomState } from './types';
```

```ts
export function trackForcedLoss(state: RoomState, victimId: PlayerId, count: number): RoomState {
  if (count <= 0) return state;
  const next = cloneState(state);
  const player = next.players[victimId];
  if (player) player.forcedLossSinceLastTurn = (player.forcedLossSinceLastTurn ?? 0) + count;
  return next;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run game/util.test.ts`
Expected: PASS (4 new tests).

- [ ] **Step 6: Write the failing test for the reset wiring**

`game/turn.test.ts` already has a `describe('resetPlayerPerTurnFlags', ...)` block whose
one test is titled `'resets all five per-turn fields on the given player object, in
place'` — once this field is added there will be six, so update that test in place
(both the title and the body) rather than leaving a stale "five" and adding a separate
test next to it:

```ts
describe('resetPlayerPerTurnFlags', () => {
  it('resets all six per-turn fields on the given player object, in place', () => {
    const player: PlayerState = {
      name: 'P', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false,
      placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true,
      bonusActionPlaysRemaining: 2, mustPlayActionThisTurn: true, forcedLossSinceLastTurn: 4,
    };
    resetPlayerPerTurnFlags(player);
    expect(player.placedTrapThisTurn).toBe(false);
    expect(player.hasDrawnThisTurn).toBe(false);
    expect(player.hasPlayedActionThisTurn).toBe(false);
    expect(player.bonusActionPlaysRemaining).toBe(0);
    expect(player.mustPlayActionThisTurn).toBe(false);
    expect(player.forcedLossSinceLastTurn).toBe(0);
  });
});
```

Also add `beginTurn` to the file's existing multi-line import from `./turn` (it
currently imports `advanceTurn`, `resetPlayerPerTurnFlags`, and others, but not
`beginTurn`), and add a new test modeled directly on the existing
`describe('jumpToPlayerTurn (A119)', ...)` block's first test (`'lands on the target and
resets their per-turn flags via beginTurn'`, ~line 538), which already builds an inline
`as unknown as RoomState` fixture in exactly this shape:

```ts
describe('beginTurn', () => {
  it('resets forcedLossSinceLastTurn only for the player starting their turn', () => {
    const state = {
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false, forcedLossSinceLastTurn: 3 },
        p2: { skipNextTurn: false, forcedLossSinceLastTurn: 5 },
      },
    } as unknown as RoomState;
    const next = beginTurn(state, 'p1');
    expect(next.players.p1.forcedLossSinceLastTurn).toBe(0);
    expect(next.players.p2.forcedLossSinceLastTurn).toBe(5);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run game/turn.test.ts`
Expected: FAIL — `forcedLossSinceLastTurn` stays `4`/`3`/undefined, not reset.

- [ ] **Step 8: Wire the reset**

In `game/turn.ts`, inside `resetPlayerPerTurnFlags`, add one line:

```ts
export function resetPlayerPerTurnFlags(player: PlayerState): void {
  player.placedTrapThisTurn = false;
  player.hasDrawnThisTurn = false;
  player.hasPlayedActionThisTurn = false;
  player.bonusActionPlaysRemaining = 0;
  player.mustPlayActionThisTurn = false;
  player.forcedLossSinceLastTurn = 0;
}
```

Do not touch `game/room.ts` — `startGame`, `resetForPlayAgain`, and `restartGame` all
already call `resetPlayerPerTurnFlags(next.players[pid])` for every player (verified
directly against current source), so this one line covers all four reset paths.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run game/turn.test.ts game/util.test.ts`
Expected: PASS.

- [ ] **Step 10: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`
Expected: all pass, clean.

- [ ] **Step 11: Commit**

```bash
git add game/types.ts game/turn.ts game/util.ts game/util.test.ts game/turn.test.ts
git commit -m "feat: add forcedLossSinceLastTurn field and trackForcedLoss tracker"
```

---

### Task 2: `forceDiscard` / `forceSteal` wrappers

**Files:**
- Modify: `game/pile.ts`
- Modify: `game/transfer.ts`
- Test: `game/pile.test.ts`, `game/transfer.test.ts`

**Interfaces:**
- Consumes: `trackForcedLoss` from `game/util.ts` (Task 1).
- Produces: `forceDiscard(state, victimId, n, cardCodes?, rng?): RoomState` from
  `game/pile.ts`; `forceSteal(state, victimId, thiefId, n, rng?): RoomState` from
  `game/transfer.ts`.

- [ ] **Step 1: Write the failing tests**

`game/pile.test.ts` already has a `baseState()` builder (`drawPile: ['A01','A02','A03'],
discardPile: ['A10'], players: { p1: { hand: [] } }`, cast `as unknown as RoomState` —
only one player, `p1`). Reuse it directly; `forceDiscard` only needs one player (the
victim), no second player required. Add to `game/pile.test.ts`:

```ts
import { forceDiscard } from './pile';

describe('forceDiscard', () => {
  it('discards like discard() and tracks the actual count moved', () => {
    let state = baseState();
    state.players.p1.hand = ['A01', 'A02', 'A03'];
    state = forceDiscard(state, 'p1', 2, ['A01', 'A02']);
    expect(state.players.p1.hand).toEqual(['A03']);
    expect(state.discardPile).toEqual(expect.arrayContaining(['A01', 'A02']));
    expect(state.players.p1.forcedLossSinceLastTurn).toBe(2);
  });

  it('tracks only the actual (clamped) count when the hand is smaller than requested', () => {
    let state = baseState();
    state.players.p1.hand = ['A01'];
    state = forceDiscard(state, 'p1', 3);
    expect(state.players.p1.hand).toEqual([]);
    expect(state.players.p1.forcedLossSinceLastTurn).toBe(1);
  });
});
```

Add to `game/transfer.test.ts` (this file already imports `stealRandom` — add
`forceSteal` to that same import):

```ts
describe('forceSteal', () => {
  it('steals like stealRandom() and tracks the actual count moved', () => {
    let state = baseState(); // reuse this file's existing builder
    state.players.p1.hand = ['A001', 'A002'];
    state.players.p2.hand = [];
    state = forceSteal(state, 'p1', 'p2', 2, () => 0);
    expect(state.players.p1.hand).toEqual([]);
    expect(state.players.p2.hand.length).toBe(2);
    expect(state.players.p1.forcedLossSinceLastTurn).toBe(2);
  });

  it('tracks only the actual (clamped) count when the victim has fewer cards than requested', () => {
    let state = baseState();
    state.players.p1.hand = ['A001'];
    state.players.p2.hand = [];
    state = forceSteal(state, 'p1', 'p2', 5, () => 0);
    expect(state.players.p1.forcedLossSinceLastTurn).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/pile.test.ts game/transfer.test.ts`
Expected: FAIL — `forceDiscard`/`forceSteal` not exported.

- [ ] **Step 3: Implement `forceDiscard` in `game/pile.ts`**

Add `import { trackForcedLoss } from './util';` (extend the existing
`import { cloneState, shuffle, pickRandomIndices } from './util';` line) and, after the
existing `discard` function:

```ts
export function forceDiscard(
  state: RoomState,
  victimId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  const before = state.players[victimId]?.hand.length ?? 0;
  const discarded = discard(state, victimId, n, cardCodes, rng);
  const after = discarded.players[victimId]?.hand.length ?? 0;
  return trackForcedLoss(discarded, victimId, before - after);
}
```

- [ ] **Step 4: Implement `forceSteal` in `game/transfer.ts`**

Add `import { trackForcedLoss } from './util';` (extend the existing
`import { cloneState, pickRandomIndices } from './util';` line) and, after `stealRandom`:

```ts
export function forceSteal(
  state: RoomState,
  victimId: PlayerId,
  thiefId: PlayerId,
  n: number,
  rng: Rng = Math.random
): RoomState {
  const before = state.players[victimId]?.hand.length ?? 0;
  const stolen = stealRandom(state, victimId, thiefId, n, rng);
  const after = stolen.players[victimId]?.hand.length ?? 0;
  return trackForcedLoss(stolen, victimId, before - after);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run game/pile.test.ts game/transfer.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add game/pile.ts game/transfer.ts game/pile.test.ts game/transfer.test.ts
git commit -m "feat: add forceDiscard/forceSteal tracked wrappers"
```

---

### Task 3: Centralized pipeline tracking

**Files:**
- Modify: `game/forcedDiscard.ts` (`finalizeForcedDiscard`)
- Modify: `game/steal.ts` (`finalizeSteal`)
- Modify: `game/primitives.ts` (`executeFullHandTransfer`)
- Test: `game/forcedDiscard.test.ts`, new `game/steal.test.ts`,
  `game/primitives.test.ts`

**Interfaces:**
- Consumes: `trackForcedLoss` from `game/util.ts` (Task 1); `forceDiscard` from
  `game/pile.ts` (Task 2, needed for `finalizeSteal`'s C19 branch in Step 6).

- [ ] **Step 1: Write the failing test for `finalizeForcedDiscard`**

Add to `game/forcedDiscard.test.ts` (reuse the file's existing `state()` builder and
`completeForcedDiscard`/`prepareForcedDiscard` helpers already imported there):

```ts
it('tracks the victim\'s forced loss with the actual moved count', () => {
  const prepared = prepareForcedDiscard(state(), 'p2', 2, 'p1', 'op-track');
  const completed = completeForcedDiscard(prepared);
  const next = finalizeForcedDiscard(state(), completed, completed.finalDestination);
  expect(next.players.p2.forcedLossSinceLastTurn).toBe(2);
});
```

- [ ] **Step 2: Write the failing test for `finalizeSteal`**

Create `game/steal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prepareSteal, finalizeSteal } from './steal';
import type { RoomState } from './types';

const state = (): RoomState => ({
  status: 'playing', hostId: 'p1', turnOrder: ['p1', 'p2'], currentTurnIndex: 0,
  direction: 1, muffinTimeTarget: 10, drawPile: [], discardPile: [],
  players: {
    p1: { name: 'One', hand: ['A001', 'A002'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
  },
});

describe('finalizeSteal forced-loss tracking', () => {
  it('tracks the victim\'s forced loss with the actual stolen count', () => {
    const operation = prepareSteal(state(), 'p1', 'p2', 2);
    const next = finalizeSteal(state(), operation, () => 0);
    expect(next.players.p1.forcedLossSinceLastTurn).toBe(2);
  });

  it('does not track when nothing was stolen (empty victim hand)', () => {
    let empty = state();
    empty.players.p1.hand = [];
    const operation = prepareSteal(empty, 'p1', 'p2', 2);
    const next = finalizeSteal(empty, operation, () => 0);
    expect(next.players.p1.forcedLossSinceLastTurn).toBeUndefined();
  });
});
```

- [ ] **Step 3: Write the failing test for `executeFullHandTransfer`**

Add to `game/primitives.test.ts`, inside the existing
`describe('executeFullHandTransfer & executeHandSwapAndDeal', ...)` block, reusing the
file's existing `createMockRoom()` builder (the same one the adjacent
`'transfers full hand from victim to receiver'` test uses, where `p1`'s hand transfers
to `p3` as `['C1', 'A1', 'A2', 'A3']`):

```ts
it('tracks the victim\'s forced loss with their full hand count', () => {
  const state = createMockRoom();
  const handSizeBefore = state.players.p1.hand.length;
  const next = executeFullHandTransfer(state, 'p1', 'p3');
  expect(next.players.p1.forcedLossSinceLastTurn).toBe(handSizeBefore);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run game/forcedDiscard.test.ts game/steal.test.ts game/primitives.test.ts`
Expected: FAIL (new assertions, counter stays `undefined`).

- [ ] **Step 5: Wire `finalizeForcedDiscard`**

In `game/forcedDiscard.ts`, add `import { trackForcedLoss } from './util';` and, inside
`finalizeForcedDiscard`, insert the tracking call right before its `return
checkAndTriggerAutomaticTraps(next, event);` line:

```ts
export function finalizeForcedDiscard(state: RoomState, operation: ForcedDiscardOperation, destination: ForcedDiscardDestination = operation.originalDestination) {
  // ...existing body unchanged up through appendGameEvent(next, event);...
  appendGameEvent(next, event);
  const tracked = trackForcedLoss(next, operation.targetPlayerId, moved.length);
  return checkAndTriggerAutomaticTraps(tracked, event);
}
```

(Only the last two lines change: track before triggering traps on the resulting state.)

- [ ] **Step 6: Wire `finalizeSteal`**

`finalizeSteal` has a second, easy-to-miss forced-loss site: after a successful steal,
if the stolen cards include `C19` (a Counter card), the *thief* is forced to discard
their entire hand as `C19`'s passive trigger — a loss forced on the thief by the
victim's card, not something the thief chose, so it needs tracking too, via
`forceDiscard` (Task 2) rather than the raw `discard` this branch currently calls.

In `game/steal.ts`, change the import line `import { discard } from './pile';` to
`import { forceDiscard } from './pile';`, and add
`import { trackForcedLoss } from './util';`. Then replace the tail of `finalizeSteal`
(from `if (stolen.length > 0) {` to the function's closing `}`) with:

```ts
  if (stolen.length > 0) {
    thief.hand.push(...stolen);
    const event = createGameEvent(
      GAME_EVENT_TYPES.CARD_STOLEN,
      operation.thiefId,
      {
        victimId: operation.victimId,
        thiefId: operation.thiefId,
        count: stolen.length,
        stolenCards: stolen,
        operationId: operation.operationId,
      },
      [operation.victimId]
    );
    appendGameEvent(next, event);
    const tracked = trackForcedLoss(next, operation.victimId, stolen.length);

    // C19 passive trigger: If C19 was stolen from victim, thief discards their entire hand
    if (stolen.includes('C19')) {
      const thiefHand = [...tracked.players[operation.thiefId].hand];
      return forceDiscard(tracked, operation.thiefId, thiefHand.length, thiefHand);
    }
    return tracked;
  }

  return next;
}
```

Add one more test to `game/steal.test.ts` covering the C19 branch:

```ts
it('tracks the thief\'s forced loss when stealing C19 triggers its passive discard-hand', () => {
  let seeded = state();
  seeded.players.p1.hand = ['C19'];
  seeded.players.p2.hand = ['A001', 'A002'];
  const operation = prepareSteal(seeded, 'p1', 'p2', 1);
  const next = finalizeSteal(seeded, operation, () => 0);
  expect(next.players.p1.forcedLossSinceLastTurn).toBe(1); // the C19 stolen from p1
  expect(next.players.p2.forcedLossSinceLastTurn).toBe(2); // p2's whole hand, forced by p1's C19
});
```

- [ ] **Step 7: Wire `executeFullHandTransfer`**

In `game/primitives.ts`, add `trackForcedLoss` to the existing
`import { appendGameEvent, createGameEvent, GAME_EVENT_TYPES } from './events';` line's
neighborhood (new import line, `import { trackForcedLoss } from './util';`), and inside
`executeFullHandTransfer`, right after the existing `appendGameEvent(next, event);` call:

```ts
  if (count > 0) {
    const stolen = [...victim.hand];
    receiver.hand.push(...stolen);
    victim.hand = [];
    appendGameEvent(next, createGameEvent(GAME_EVENT_TYPES.CARD_STOLEN, receiverId, {
      victimId, thiefId: receiverId, count, stolenCards: stolen,
    }, [victimId]));
    return trackForcedLoss(next, victimId, count);
  }
  return next;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run game/forcedDiscard.test.ts game/steal.test.ts game/primitives.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

This task touches functions used by every trap/counter that forces a discard or steal —
watch for any pre-existing test elsewhere in the suite that does a strict `toEqual` on a
full `RoomState` object without expecting the new `forcedLossSinceLastTurn` field; if the
full suite run surfaces one, that test's expected state needs the new field added
(usually `undefined`, since most existing fixtures build states without ever visiting
the new tracked paths, or an explicit new value on the ones that do).

- [ ] **Step 10: Commit**

```bash
git add game/forcedDiscard.ts game/steal.ts game/primitives.ts game/forcedDiscard.test.ts game/steal.test.ts game/primitives.test.ts
git commit -m "feat: track forced loss in the centralized discard/steal pipeline"
```

---

### Task 4: `roster.ts` wiring

**Files:**
- Modify: `game/roster.ts`
- Test: `game/roster.test.ts`

**Interfaces:**
- Consumes: `forceDiscard`, `forceSteal` from Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `game/roster.test.ts` (reuse whatever base-state builder the existing
`rosterDiscards`/`rosterStolenBy` tests in this file already use):

```ts
it('rosterDiscards tracks forced loss for every affected roster member', () => {
  let state = baseState();
  state = rosterDiscards(state, ['p2', 'p3'], 1, () => 0);
  expect(state.players.p2.forcedLossSinceLastTurn).toBe(1);
  expect(state.players.p3.forcedLossSinceLastTurn).toBe(1);
});

it('rosterStolenBy tracks forced loss for every victim, never the thief', () => {
  let state = baseState();
  state = rosterStolenBy(state, 'p1', ['p2', 'p3'], 1, () => 0);
  expect(state.players.p2.forcedLossSinceLastTurn).toBe(1);
  expect(state.players.p3.forcedLossSinceLastTurn).toBe(1);
  expect(state.players.p1.forcedLossSinceLastTurn).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/roster.test.ts`

- [ ] **Step 3: Swap the internal calls**

In `game/roster.ts`, change the import line from
`import { draw, discard } from './pile';` to `import { draw, forceDiscard } from
'./pile';`, and change `import { stealRandom } from './transfer';` to
`import { forceSteal } from './transfer';`. Then update the two function bodies:

```ts
export function rosterDiscards(state: RoomState, playerIds: PlayerId[], n: number, rng: Rng = Math.random): RoomState {
  let next = cloneState(state);
  for (const playerId of playerIds) {
    next = forceDiscard(next, playerId, n, null, rng);
  }
  return next;
}
```

```ts
export function rosterStolenBy(
  state: RoomState,
  thiefId: PlayerId,
  victimIds: PlayerId[],
  n: number,
  rng: Rng = Math.random
): RoomState {
  let next = cloneState(state);
  for (const victimId of victimIds) {
    if (victimId === thiefId) continue;
    next = forceSteal(next, victimId, thiefId, n, rng);
  }
  return next;
}
```

`rosterDraws` and `rosterSkipTurn` are unchanged — draws and skips are never forced
losses.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/roster.test.ts`

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add game/roster.ts game/roster.test.ts
git commit -m "feat: track forced loss in roster-targeted discard/steal"
```

---

### Task 5: `trapPile.ts` wrappers

**Files:**
- Modify: `game/trapPile.ts`
- Test: `game/trapPile.test.ts`

**Interfaces:**
- Consumes: `trackForcedLoss` from `game/util.ts` (Task 1).
- Produces: `forceDiscardTraps(state, victimId, n, cardCodes?, rng?): RoomState`,
  `forceDiscardAllTraps(state, victimId): RoomState`, both from `game/trapPile.ts`.

Full audit of every current caller of `game/trapPile.ts`'s functions (verified against
current source; `stealTrap` at line 64 is dead code with no callers anywhere and is left
untouched):

| Call site | Function | Loses cards? | Tracked? |
|---|---|---|---|
| `definitions.ts` A003, `discardTraps(state, frame.actorId, 3)` | self | no | no |
| `definitions.ts` A015, `discardAllTraps(state, targetId)` | targetId | yes | **yes** (Task 6) |
| `definitions.ts` A034 loop, `discardTraps(next, id, 1)` over all players | each `id` incl. actor | yes except actor | **yes for non-actor** (Task 6) |
| `definitions.ts` A053, `returnTrapsToHand(state, targetId)` | nobody (same-player zone move) | no | no |
| `definitions.ts` A113 loop, `discardAllTraps(next, id)` over all players | each `id` incl. actor | yes except actor | **yes for non-actor** (Task 6) |
| `definitions.ts` local `stealRandomTrapToHand`, wraps `stealTrapToHand(state, targetId, actorId, code)` | targetId | yes | **yes** (Task 7) |
| `counterRules/engine.ts` C10, `discardAllTraps(state, actorId)` | actorId (self, own counter choice) | no | no |

- [ ] **Step 1: Write the failing tests**

Add to `game/trapPile.test.ts` (reuse whatever base-state builder the existing
`discardTraps`/`discardAllTraps` tests in this file already use):

```ts
it('forceDiscardTraps discards traps like discardTraps() and tracks the actual count moved', () => {
  let state = baseState();
  state.players.p2.traps = ['T001', 'T002', 'T003'];
  state = forceDiscardTraps(state, 'p2', 2, ['T001', 'T002']);
  expect(state.players.p2.traps).toEqual(['T003']);
  expect(state.players.p2.forcedLossSinceLastTurn).toBe(2);
});

it('forceDiscardAllTraps discards all traps like discardAllTraps() and tracks the count', () => {
  let state = baseState();
  state.players.p2.traps = ['T001', 'T002'];
  state = forceDiscardAllTraps(state, 'p2');
  expect(state.players.p2.traps).toEqual([]);
  expect(state.players.p2.forcedLossSinceLastTurn).toBe(2);
});

it('forceDiscardAllTraps tracks 0 (no-op) when the player has no traps placed', () => {
  let state = baseState();
  state.players.p2.traps = []; // baseState() defaults p2 to ['T04']; clear it for this case
  state = forceDiscardAllTraps(state, 'p2');
  expect(state.players.p2.forcedLossSinceLastTurn).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/trapPile.test.ts`

- [ ] **Step 3: Implement both wrappers**

In `game/trapPile.ts`, add `import { trackForcedLoss } from './util';` (extend the
existing `import { cloneState, pickRandomIndices } from './util';` line), and add after
`discardAllTraps`:

```ts
export function forceDiscardTraps(
  state: RoomState,
  victimId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  const before = state.players[victimId]?.traps.length ?? 0;
  const discarded = discardTraps(state, victimId, n, cardCodes, rng);
  const after = discarded.players[victimId]?.traps.length ?? 0;
  return trackForcedLoss(discarded, victimId, before - after);
}

export function forceDiscardAllTraps(state: RoomState, victimId: PlayerId): RoomState {
  const count = state.players[victimId]?.traps.length ?? 0;
  return trackForcedLoss(discardAllTraps(state, victimId), victimId, count);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/trapPile.test.ts`

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add game/trapPile.ts game/trapPile.test.ts
git commit -m "feat: add forceDiscardTraps/forceDiscardAllTraps tracked wrappers"
```

---

### Task 6: `definitions.ts` discard-side call-site sweep

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

**Interfaces:**
- Consumes: `forceDiscard` (Task 2), `forceDiscardAllTraps`/`forceDiscardTraps` (Task 5).

This task swaps every raw `discard(`/`discardAllTraps(`/`discardTraps(` call in
`game/actionRules/definitions.ts` where the player losing cards is **not**
`frame.actorId`, onto its tracked equivalent. Before making any edit, run
`grep -n "discard(\|discardAllTraps(\|discardTraps(" game/actionRules/definitions.ts`
and confirm each line below still matches — if a line has moved or the surrounding code
looks different from what's quoted here, re-read that card's full entry before editing
it, don't blindly pattern-match.

**Add to the existing import lines at the top of the file:**

```ts
import { draw, discard, forceDiscard } from '../pile';
```
(replacing the current `import { draw, discard } from '../pile';`)

```ts
import { discardTraps, discardAllTraps, returnTrapsToHand, stealTrapToHand, forceDiscardTraps, forceDiscardAllTraps } from '../trapPile';
```
(replacing the current
`import { discardTraps, discardAllTraps, returnTrapsToHand, stealTrapToHand } from '../trapPile';`)

**Sites to swap `discard(` → `forceDiscard(` (someone other than `frame.actorId` loses
the cards) — verified against current source, one `old_string`/`new_string` pair per
site (each `old_string` here is unique in the file; use it as-is with the Edit tool):**

1. `discardAllOfType` helper (near line 237-244) — both its current callers pass
   `targetId`, never `frame.actorId`:
   - old: `  return discard(state, playerId, matching.length, matching);`
   - new: `  return forceDiscard(state, playerId, matching.length, matching);`

2. Near line 310 (a "target discards whole hand" card):
   - old: `      return discard(state, targetId, state.players[targetId].hand.length);`
   - new: `      return forceDiscard(state, targetId, state.players[targetId].hand.length);`

3. Near line 557:
   - old: `      return targetId ? discard(state, targetId, count) : state;`
   - new: `      return targetId ? forceDiscard(state, targetId, count) : state;`

4. Near line 568:
   - old: `      return targetId ? discard(state, targetId, 5) : state;`
   - new: `      return targetId ? forceDiscard(state, targetId, 5) : state;`

5. Near line 578 (A041 "you and a chosen player both discard 3" — **only** the
   `targetId` half; the `afterSelf` line right above it, `const afterSelf = discard(state,
   frame.actorId, 3);`, stays untouched):
   - old: `      return targetId ? discard(afterSelf, targetId, 3) : afterSelf;`
   - new: `      return targetId ? forceDiscard(afterSelf, targetId, 3) : afterSelf;`

6. Near line 588 (A045 "target discards whole hand then draws 3"):
   - old: `      const discarded = discard(state, targetId, state.players[targetId].hand.length);`
   - new: `      const discarded = forceDiscard(state, targetId, state.players[targetId].hand.length);`

7-11. Five near-identical `discard(state, targetId, 3)`/`discard(state, targetId, 4)`
   lines in the 1358-1485 range (each belongs to a different card — locate by the
   surrounding `code: 'A0XX'` a few lines above each one before editing, since the lines
   themselves are not unique in isolation). For each, change `discard(` to `forceDiscard(`
   leaving the rest of the line identical:
   - `      return targetId ? discard(state, targetId, 3) : state;` (three occurrences —
     use the Edit tool's `replace_all: true` only if you've confirmed via grep that
     every remaining match in the file is genuinely a `targetId`-losing site; if unsure,
     edit each with enough surrounding context — the card's `code:`/`description_th:`
     lines above it — to target one at a time)
   - `      return targetId ? discard(state, targetId, 4) : state;` (two occurrences,
     same caution)

**Site to leave untouched (self-caused, do not edit):** the `discard(state, frame.actorId,
...)` calls at lines 374, 428, 439, the `afterSelf` half at 576, 1406, both halves of
1537/1545, the inner `discard(state, frame.actorId, 2)` half of 1584, and 1632.

**Trap-related sites:**

12. A015 (near line 810):
    - old: `      return targetId ? discardAllTraps(state, targetId) : state;`
    - new: `      return targetId ? forceDiscardAllTraps(state, targetId) : state;`

13. A034's loop (near line 836) — every player except the actor is forced (the actor's
    own trap loss, as part of playing their own card, is self-caused). Its
    `executeEffect` currently only destructures `state`, not `frame` — the signature
    line changes too:
    - old:
      ```ts
        executeEffect: (state) => {
          let next = state;
          for (const id of Object.keys(next.players)) next = discardTraps(next, id, 1);
          return next;
        },
      ```
    - new:
      ```ts
        executeEffect: (state, frame) => {
          let next = state;
          for (const id of Object.keys(next.players)) next = id === frame.actorId ? discardTraps(next, id, 1) : forceDiscardTraps(next, id, 1);
          return next;
        },
      ```

14. A113's loop (near line 870) — same reasoning, same signature change:
    - old:
      ```ts
        executeEffect: (state) => {
          let next = state;
          for (const id of Object.keys(next.players)) next = discardAllTraps(next, id);
          return next;
        },
      ```
    - new:
      ```ts
        executeEffect: (state, frame) => {
          let next = state;
          for (const id of Object.keys(next.players)) next = id === frame.actorId ? discardAllTraps(next, id) : forceDiscardAllTraps(next, id);
          return next;
        },
      ```

**Leave untouched:** A003's `discardTraps(state, frame.actorId, 3)` (self) and A053's
`returnTrapsToHand(state, targetId)` (not a loss — same player, different zone).

- [ ] **Step 1: Write the failing tests**

Add to `game/actionRules/definitions.test.ts` (reuse `baseState()`/`threePlayerState()`):

```ts
it('A038 (target discards) tracks the target\'s forced loss, not the actor\'s', () => {
  const state = threePlayerState();
  state.players.p2.hand = ['a', 'b', 'c', 'd', 'e', 'f'];
  const next = resolveActionEffect(state, 'A038', 'me', 'p2');
  expect(next.players.p2.forcedLossSinceLastTurn).toBe(3);
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
});

it('A056 (self-discard) does not track any forced loss', () => {
  const next = resolveActionEffect(threePlayerState(), 'A056', 'me');
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
});

it('A034 (everyone discards a trap) tracks every player except the actor', () => {
  const state = threePlayerState();
  state.players.me.traps = ['T001'];
  state.players.p2.traps = ['T002'];
  state.players.p3.traps = ['T003'];
  const next = resolveActionEffect(state, 'A034', 'me');
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
  expect(next.players.p2.forcedLossSinceLastTurn).toBe(1);
  expect(next.players.p3.forcedLossSinceLastTurn).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts`

- [ ] **Step 3: Apply the edits listed above**

Use the Edit tool for each numbered site. Re-grep after each batch of edits to confirm
no unintended site was changed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts`

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "feat: track forced loss across definitions.ts discard/trap call sites"
```

---

### Task 7: `definitions.ts` steal-side call-site sweep

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

**Interfaces:**
- Consumes: `forceSteal` (Task 2), `trackForcedLoss` (Task 1, for the two local helpers
  that don't go through `forceSteal`/`forceDiscard` at all).

**Add to the import lines:**

```ts
import { stealRandom, swapHands, forceSteal } from '../transfer';
```
(replacing the current `import { stealRandom, swapHands } from '../transfer';`)

```ts
import { cloneState, shuffle, trackForcedLoss } from '../util';
```
(replacing the current `import { cloneState, shuffle } from '../util';`)

**Sites to swap `stealRandom(` → `forceSteal(` (the `fromId` argument is someone other
than `frame.actorId`) — same caution as Task 6: re-grep and confirm each line before
editing, since several are not textually unique without their surrounding card context:**

Near lines 453, 462, 471, 482, 491, 502, 513 (all `stealRandom(state, targetId,
frame.actorId, N)` for various `N`), 697, 1001, 1013 (`stealRandom(state, suggesterId,
frame.actorId, 3)`), 1293, 1302, 1320, 1329, 1338, 1347, 1496, 1505, and 1724
(`stealRandom(state, tallestId, shortestId, 3)`).

For each, the edit is mechanical: change the function name only, e.g.:
- old: `      return targetId ? stealRandom(state, targetId, frame.actorId, 3) : state;`
- new: `      return targetId ? forceSteal(state, targetId, frame.actorId, 3) : state;`

and for line 1724:
- old: `      return stealRandom(state, tallestId, shortestId, 3);`
- new: `      return forceSteal(state, tallestId, shortestId, 3);`

**Sites to leave untouched (the actor is the `fromId` — giving cards away or choosing to
have their own hand stolen from, self-caused):** near lines 295 (A014), 649 (A079), 668
(A107), and 659 (`stealRandom(afterDraw, frame.actorId, targetId, 1)` — the actor gives
away a card after drawing 2, same self-caused pattern as A079/A107).

**Group-loop helpers (actor can be legitimately swept into the loop; track everyone
except the actor):**

- `everyoneGivesOneTo` (near line 79) — add an `actorId` parameter and branch inside the
  loop:

```ts
function everyoneGivesOneTo(state: RoomState, recipientIds: PlayerId[], actorId: PlayerId, rng: Rng = Math.random): RoomState {
  let next = state;
  for (const giverId of Object.keys(state.players)) {
    if (recipientIds.includes(giverId)) continue;
    const recipientId = recipientIds[Math.floor(rng() * recipientIds.length)];
    next = giverId === actorId ? stealRandom(next, giverId, recipientId, 1, rng) : forceSteal(next, giverId, recipientId, 1, rng);
  }
  return next;
}
```

  Update its one call site (A066, near line 1100) from `return everyoneGivesOneTo(state,
  recipients);` to `return everyoneGivesOneTo(state, recipients, frame.actorId);` (the
  enclosing `executeEffect` already destructures `frame`).

- `everyoneStealsOneFrom` (near line 91) — same shape:

```ts
function everyoneStealsOneFrom(state: RoomState, targetIds: PlayerId[], actorId: PlayerId, rng: Rng = Math.random): RoomState {
  let next = state;
  for (const stealerId of Object.keys(state.players)) {
    if (targetIds.includes(stealerId)) continue;
    const targetId = targetIds[Math.floor(rng() * targetIds.length)];
    next = targetId === actorId ? stealRandom(next, targetId, stealerId, 1, rng) : forceSteal(next, targetId, stealerId, 1, rng);
  }
  return next;
}
```

  Update its one call site (A137, near line 1112) to
  `return everyoneStealsOneFrom(state, targets, frame.actorId);`.

- `stealFromRightNeighbor` (near line 195) — same shape:

```ts
function stealFromRightNeighbor(state: RoomState, actorId: PlayerId, rng: Rng = Math.random): RoomState {
  const order = getSeatOrder(state);
  const count = order.length;
  let next = state;
  for (let i = 0; i < count; i++) {
    const thief = order[i];
    const victim = order[(i + 1) % count];
    if (thief === victim) continue;
    next = victim === actorId ? stealRandom(next, victim, thief, 1, rng) : forceSteal(next, victim, thief, 1, rng);
  }
  return next;
}
```

  Its one call site (A080, near line 725) currently only destructures `state`:
  - old: `    executeEffect: (state) => stealFromRightNeighbor(state),`
  - new: `    executeEffect: (state, frame) => stealFromRightNeighbor(state, frame.actorId),`

**Two local helpers with no existing wrapper (hand-to-hand steals that don't route
through `transfer.ts` at all) — track directly inside their own bodies, since both are
only ever called with a non-actor victim:**

- `stealAllActionCards` (near line 23):

```ts
function stealAllActionCards(state: RoomState, fromId: PlayerId, toId: PlayerId): RoomState {
  const hand = state.players[fromId].hand;
  const matching = hand.filter((code) => getCardById(code)?.type === 'action');
  if (matching.length === 0) return state;
  let next = cloneState(state);
  for (const code of matching) {
    const pos = next.players[fromId].hand.indexOf(code);
    if (pos === -1) continue;
    next.players[fromId].hand.splice(pos, 1);
    next.players[toId].hand.push(code);
  }
  return trackForcedLoss(next, fromId, matching.length);
}
```

- `stealRandomTrapToHand` (near line 122) — read its current body first (it picks one
  random trap code from `fromId`'s traps, then calls `stealTrapToHand`); wrap its
  `return stealTrapToHand(state, fromId, toId, code);` line as
  `return trackForcedLoss(stealTrapToHand(state, fromId, toId, code), fromId, 1);`.

- [ ] **Step 1: Write the failing tests**

Add to `game/actionRules/definitions.test.ts`:

```ts
it('A029-style steal (target loses to actor) tracks the target\'s forced loss', () => {
  const state = threePlayerState();
  const next = resolveActionEffect(state, 'A029', 'me', 'p2');
  expect(next.players.p2.forcedLossSinceLastTurn).toBeGreaterThan(0);
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
});

it('A014 (actor chooses to have their own hand stolen from) does not track forced loss', () => {
  const next = resolveActionEffect(baseState(), 'A014', 'me', 'bot-1');
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
});

it('A080 (everyone steals from their right neighbor) does not track the actor\'s own loss', () => {
  const state = threePlayerState();
  const next = resolveActionEffect(state, 'A080', 'me');
  expect(next.players.me.forcedLossSinceLastTurn).toBeUndefined();
  // p2/p3 are each some other seat's right neighbor -- at least one of them lost a card.
  const totalTracked = (next.players.p2.forcedLossSinceLastTurn ?? 0) + (next.players.p3.forcedLossSinceLastTurn ?? 0);
  expect(totalTracked).toBeGreaterThan(0);
});
```

Before writing these, confirm `A029`'s exact `stealRandom(` call signature (which
argument is `fromId`) against the file — the design doc's table lists it as a
target-loses site, but verify directly since this task's own edits change the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts`

- [ ] **Step 3: Apply the edits listed above**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts`

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "feat: track forced loss across definitions.ts steal call sites"
```

---

### Task 8: A091's own card entry, registry test fix, and end-to-end coverage

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Modify: `game/actionRules/registry.test.ts`
- Test: `game/actionRules/definitions.test.ts`, `game/cardInvariant.test.ts`

**Interfaces:**
- Consumes: `PlayerState.forcedLossSinceLastTurn` (Task 1) and every tracked call site
  from Tasks 2-7.

`game/actionRules/registry.test.ts` currently asserts `A091` is **not** implemented, as
its negative-path example:

```ts
    expect(isActionImplemented('A091')).toBe(false);
    expect(getActionStatus('A091')).toBe('not_implemented');
    expect(resolveActionEffect(state(), 'A091', 'p1')).toEqual(state());
```

Once this task implements `A091`, that test breaks. `A017` (Group 1 Cluster D, not yet
implemented — confirmed absent from `definitions.ts` as of this plan) replaces it as the
negative-path example.

- [ ] **Step 1: Write the failing test for A091's own behavior**

Add to `game/actionRules/definitions.test.ts`:

```ts
it('A091 draws 0 cards when the actor has no tracked forced loss', () => {
  const next = resolveActionEffect(threePlayerState(), 'A091', 'me');
  expect(next.players.me.hand.length).toBe(1);
});

it('A091 draws exactly forcedLossSinceLastTurn cards', () => {
  const state = threePlayerState();
  state.players.me.forcedLossSinceLastTurn = 3;
  const next = resolveActionEffect(state, 'A091', 'me');
  expect(next.players.me.hand.length).toBe(4);
});

it('A091 clamps to however many cards remain in the draw pile', () => {
  const state = threePlayerState();
  state.drawPile = ['A001', 'A002'];
  state.players.me.forcedLossSinceLastTurn = 5;
  const next = resolveActionEffect(state, 'A091', 'me');
  expect(next.players.me.hand.length).toBe(1 + 2);
  expect(next.drawPile).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts`
Expected: FAIL — `A091` unresolved (`resolveActionEffect` treats it as unimplemented and
returns state unchanged).

- [ ] **Step 3: Add A091's card entry**

In `game/actionRules/definitions.ts`, immediately after `A004`'s closing `},` (before the
blank line preceding `A008`):

```ts

  A091: {
    code: 'A091', name_en: "I'm A Doctor", name_th: 'ฉันเป็นหมอ',
    description_th: 'จั่วไพ่เท่ากับจำนวนไพ่ที่ถูกขโมยหรือถูกบังคับให้ทิ้งจากคุณ นับตั้งแต่เทิร์นก่อนหน้าของคุณ',
    kind: 'auto',
    executeEffect: (state, frame) => draw(state, frame.actorId, state.players[frame.actorId].forcedLossSinceLastTurn ?? 0),
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix `registry.test.ts`'s stale negative-path example**

In `game/actionRules/registry.test.ts`:

```ts
  it('classifies implemented demo Actions and rejects unsupported Actions', () => {
    expect(getImplementedActions()).toEqual(expect.arrayContaining(['A001', 'A004', 'A008', 'A014', 'A016', 'A064', 'A091']));
    expect(isActionImplemented('A064')).toBe(true);
    expect(getActionStatus('A064')).toBe('implemented');
    expect(isActionImplemented('A017')).toBe(false);
    expect(getActionStatus('A017')).toBe('not_implemented');
    expect(resolveActionEffect(state(), 'A017', 'p1')).toEqual(state());
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run game/actionRules/registry.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the card-conservation regression test**

Add to `game/cardInvariant.test.ts`. Change its existing
`import { draw, discard } from './pile';` to
`import { draw, discard, forceDiscard } from './pile';`, and its existing
`import { stealRandom, swapHands } from './transfer';` to
`import { stealRandom, swapHands, forceSteal } from './transfer';`. Reuse the file's
existing `startedRoom()` helper:

```ts
it('preserves every card through a forced discard, a forced steal, and an A091 draw', () => {
  let state = startedRoom();
  const [p1, p2] = state.turnOrder;
  assertCardConservation(state);

  state = forceDiscard(state, p2, Math.min(1, state.players[p2].hand.length));
  assertCardConservation(state);

  if (state.players[p1].hand.length > 0) {
    state = forceSteal(state, p1, p2, 1, () => 0);
    assertCardConservation(state);
  }

  const expectedDraw = state.players[p2].forcedLossSinceLastTurn ?? 0;
  const drawPileBefore = state.drawPile.length;
  const handBefore = state.players[p2].hand.length;
  state = resolveActionEffect(state, 'A091', p2);
  assertCardConservation(state);
  const actualDrawn = state.players[p2].hand.length - handBefore;
  expect(actualDrawn).toBe(Math.min(expectedDraw, drawPileBefore));
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run game/cardInvariant.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite + typecheck**

Run: `npx vitest run --reporter=dot && npx tsc --noEmit`
Expected: all pass (818 baseline + every test added across Tasks 1-8), clean.

- [ ] **Step 10: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/registry.test.ts game/actionRules/definitions.test.ts game/cardInvariant.test.ts
git commit -m "feat: implement A091 Action card (forced-loss draw)"
```

---

## After all tasks: final whole-branch review

Once Task 8 is complete and the full suite is green, this plan's execution model
(`superpowers:subagent-driven-development`) calls for one final whole-branch code
review (most capable available model) before handing off to
`superpowers:finishing-a-development-branch`, the same shape used for Clusters C and E.
Do not skip it just because every task was individually reviewed — a change this wide
(9 files touched across 8 tasks) is exactly the case the final review exists to catch
cross-task interactions in (e.g. a call site missed by both Task 6 and Task 7's
inventories, or a self/forced classification that looked right in isolation but is wrong
once you see the whole card).
