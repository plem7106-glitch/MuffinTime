# Group 1 Cluster D (A017, A028, A094, A108) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement A017 "นายตาบอด" (You're Blind), A028 "ทาเยอะไปหน่อย" (Bad Spread), A094
"พร้อมเพรียง" (In Sync), and A108 "เล่นใบนั้นสิ" (Play That One) — the last 4 cards of Group 1,
bringing the project from 168/173 to 172/173 implemented Action cards (A091/Cluster F is
separate, in-progress elsewhere).

**Architecture:** All four cards make one card's effect trigger another card's effect
mid-resolution. The existing `resolveCompletedStackFrames` loop in `lib/session.tsx` already
supports this for free: if a card's `executeEffect` calls the existing `pushStackFrame` to
spawn a nested frame, the loop picks it up automatically and gives it its own real
Counter-response window — verified by tracing the function, no changes needed to the loop
itself. A017 (blind-drawn card) and A108 (forced card) share one new helper,
`autoResolveInputFrame`, that fills in a card's required input (target/roster/outcome/etc.)
with sensible random defaults when there's no live player to ask. A094 replays a small new
history log (`RoomState.recentActionPlays`) verbatim under a new actor. A028 restricts to a
curated allow-list of "quantity" (draw/discard/steal-count) cards and doubles by invoking
`executeActionFrameEffect` twice on the paired card's frame — the one real change to existing
code, in `resolveCompletedStackFrames`. Full design/rationale, including all rulings
confirmed with the user, is at
`docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md` — **read it before starting.**

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

## Global Constraints

- `executeEffect: (state, frame) => RoomState` must stay a pure function of `(state, frame)`
  — no `Date.now()`/`Math.random()` calls with no way to inject determinism for tests. Two
  established patterns to follow, both from the design spec: (a) helper *functions* (not
  `executeEffect` itself) take `rng: Rng = Math.random` as a real parameter for testability
  (`game/pile.ts`'s `draw()`/`reshuffleDiscardIntoDraw()` already do this); (b) `today` is
  captured by the UI *before* the frame is pushed (the existing `needsTodayDate` convention)
  and read back via `todayFromFrame(frame)` — never derived inside `executeEffect`.
- All player-facing prompt/UI copy is Thai, matching every existing card/modal in this
  codebase.
- **New reset-checklist item**: `RoomState.recentActionPlays` (Task 1) must be reset in
  `startGame`, `resetForPlayAgain`, and `restartGame` (`game/room.ts`) — this project's
  single most common bug source in prior Group 1 clusters (flagged repeatedly in the handoff
  doc). Task 1 does this; don't reintroduce a leak in later tasks.
- No new `PlayerState` fields are added by this cluster.
- Cluster F (A091) has separate, unmerged, in-progress work on
  `origin/feature/group1-cluster-f` touching some of the same files
  (`definitions.ts`/`transfer.ts`/`primitives.ts`/`roster.ts`/`group.ts`). Reconciling the two
  branches is explicitly out of scope for this plan — don't attempt to merge or coordinate
  with that branch here.

---

## Before you start

- Confirm you're on branch `feature/group1-cluster-d` (not `main`) — `git branch --show-current`.
- Run the baseline: `npx vitest run --reporter=dot` (expect **818 passed, 60 files**) and
  `npx tsc --noEmit` (expect clean, no output). If either fails, stop and investigate before
  adding new code.
- Read `docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md` in full. Key rulings to
  internalize: A028 only pairs with "quantity" cards and is otherwise unplayable; A094's new
  actor is whoever plays A094, reusing the historical target/payload; A108's forced card is
  chosen at random from the target's hand (no card-picker UI); A017/A108's own required
  inputs (when they cause a *nested* card to need input) are auto-resolved with random
  defaults, not asked live.

---

### Task 1: `recentActionPlays` history log + reset checklist

**Files:**
- Modify: `game/types.ts`
- Modify: `lib/session.tsx`
- Modify: `game/room.ts`
- Test: `game/room.test.ts`

**Interfaces:**
- Produces: `RoomState.recentActionPlays?: RecentActionPlay[]` where `RecentActionPlay = {
  code: CardCode; actorId: PlayerId; targetIds: PlayerId[]; customPayload?:
  Record<string, unknown> }`, exported from `game/types.ts`. Task 6 (A094) reads it.

- [ ] **Step 1: Add the type and field to `game/types.ts`**

Find (in `game/types.ts`, right after the `bananaPeelArmed` field, around line 242):

```ts
  bananaPeelArmed?: boolean;
```

Replace with:

```ts
  bananaPeelArmed?: boolean;

  /** A094 "พร้อมเพรียง": a capped ring buffer (newest first, max 5) of the
   * most recent Action plays that actually RESOLVED (a Countered play is
   * never appended here, since its effect never happened). A094's
   * executeEffect walks this looking for the most recent entry whose code
   * isn't 'A094' itself, then replays it under a new actor. Appended by
   * lib/session.tsx's resolveCompletedStackFrames right where it already
   * branches on sourceType === 'action'. */
  recentActionPlays?: RecentActionPlay[];
```

Add the type definition itself near the top of the file, right after the existing
`StackFrame` interface (search for `export interface StackFrame` and add this immediately
after its closing `}`):

```ts
export interface RecentActionPlay {
  code: CardCode;
  actorId: PlayerId;
  targetIds: PlayerId[];
  customPayload?: Record<string, unknown>;
}
```

- [ ] **Step 2: Append to the history in `lib/session.tsx`**

Find (in `lib/session.tsx`'s `resolveCompletedStackFrames`, the branch that resolves a plain
Action frame):

```ts
        } else {
          next = executeActionFrameEffect(next, resolvingFrame);
        }
      }
```

Replace with:

```ts
        } else {
          next = executeActionFrameEffect(next, resolvingFrame);
          const entry: RecentActionPlay = {
            code: resolvingFrame.sourceCode,
            actorId: resolvingFrame.actorId,
            targetIds: resolvingFrame.targetIds,
            customPayload: resolvingFrame.customPayload,
          };
          next.recentActionPlays = [entry, ...(next.recentActionPlays ?? [])].slice(0, 5);
        }
      }
```

Add `RecentActionPlay` to the existing `import type { ... } from '../game/types';` (or
equivalent) import line at the top of `lib/session.tsx`.

- [ ] **Step 3: Write the failing reset tests**

In `game/room.test.ts`, inside the existing `describe('startGame', ...)` block, add (right
after the existing `'resets actionRedirect and pendingActionObligations...'` test):

```ts
  it('resets recentActionPlays left over from a prior game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    room.recentActionPlays = [{ code: 'A006', actorId: 'p3', targetIds: ['p2'] }];
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const next = startGame(room, allCodes, () => 0);
    expect(next.recentActionPlays ?? []).toEqual([]);
  });
```

Inside `describe('resetForPlayAgain', ...)`, add:

```ts
  it('resets recentActionPlays left over from the finished game', () => {
    let room = createRoom('host1', 'P1', 4);
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');
    const allCodes = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);
    const started = startGame(room, allCodes, () => 0);
    started.recentActionPlays = [{ code: 'A006', actorId: 'p3', targetIds: ['p2'] }];
    started.status = 'finished';
    const next = resetForPlayAgain(started);
    expect(next.recentActionPlays ?? []).toEqual([]);
  });
```

In the existing `restartGame` test (`'resets turn order to seatOrder[0]-first, ...'`), add
`recentActionPlays: [{ code: 'A006', actorId: 'host1', targetIds: ['p2'] }],` to the room
fixture object (next to the existing `lastResult: {...}` line) and add
`expect(next.recentActionPlays ?? []).toEqual([]);` to the assertions (next to the existing
`expect(next.actionRedirect).toBeNull();` line).

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run game/room.test.ts --reporter=dot`
Expected: 3 new FAILs (property doesn't exist / isn't reset yet), rest still pass.

- [ ] **Step 5: Add the resets in `game/room.ts`**

Find (in `startGame`, around line 166-167):

```ts
  next.actionRedirect = null;
  next.bananaPeelArmed = false;
```

Replace with (same replacement at all **three** call sites — `startGame` line ~166,
`resetForPlayAgain` line ~247, `restartGame` line ~334):

```ts
  next.actionRedirect = null;
  next.bananaPeelArmed = false;
  next.recentActionPlays = [];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run game/room.test.ts --reporter=dot`
Expected: PASS, all tests in the file green.

- [ ] **Step 7: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` (expect 821 passed, 60 files) and `npx tsc --noEmit`
(expect clean).

- [ ] **Step 8: Commit**

```bash
git add game/types.ts lib/session.tsx game/room.ts game/room.test.ts
git commit -m "feat: add recentActionPlays history log for A094, wired into reset checklist"
```

---

### Task 2: `autoResolveInputFrame` shared helper

**Files:**
- Create: `game/actionRules/autoResolve.ts`
- Test: `game/actionRules/autoResolve.test.ts`

**Interfaces:**
- Produces: `autoResolveInputFrame(state: RoomState, code: CardCode, actorId: PlayerId,
  today: string | undefined, rng?: Rng): { targetIds: PlayerId[]; customPayload?:
  Record<string, unknown> } | null`, exported from `game/actionRules/autoResolve.ts`. Tasks
  4 (A017) and 5 (A108) call this.

- [ ] **Step 1: Write the failing tests**

Create `game/actionRules/autoResolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { autoResolveInputFrame } from './autoResolve';
import type { RoomState } from '../types';

function threePlayerState(): RoomState {
  return {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2', 'p3'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  } as unknown as RoomState;
}

describe('autoResolveInputFrame', () => {
  it('returns null for an unimplemented code', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A999' as never, 'me', undefined, () => 0);
    expect(result).toBeNull();
  });

  it('needsTargetSelection: picks one candidate excluding the actor', () => {
    // A006 is an existing needsTargetSelection kind:'outcome_entry' card.
    const result = autoResolveInputFrame(threePlayerState(), 'A006', 'me', undefined, () => 0);
    expect(result?.targetIds).toHaveLength(1);
    expect(result?.targetIds[0]).not.toBe('me');
    expect(['p2', 'p3']).toContain(result?.targetIds[0]);
  });

  it('needsRosterSelection with no fixed count: defaults to all eligible candidates', () => {
    // A057 is an existing needsRosterSelection card with no rosterSelectionCount.
    const result = autoResolveInputFrame(threePlayerState(), 'A057', 'me', undefined, () => 0);
    expect(result?.targetIds.sort()).toEqual(['p2', 'p3']);
  });

  it('needsRosterSelection with a fixed count: picks exactly that many at random', () => {
    // A172 is an existing needsRosterSelection card with rosterSelectionCount: 2.
    const result = autoResolveInputFrame(threePlayerState(), 'A172', 'me', undefined, () => 0.99);
    expect(result?.targetIds).toHaveLength(2);
  });

  it('needsOutcomeEntry: produces a boolean outcome', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A006', 'me', undefined, () => 0);
    // A006 is needsTargetSelection + kind:'outcome_entry' but not needsOutcomeEntry --
    // use a genuine needsOutcomeEntry-flagged card instead if A006 doesn't set it;
    // confirm via `grep -n "needsOutcomeEntry: true" game/actionRules/definitions.ts`
    // and substitute a real matching code here during implementation.
    expect(result).not.toBeNull();
  });

  it('needsTodayDate: uses the passed-in today, not a derived one', () => {
    // A037 is an existing needsTodayDate card.
    const result = autoResolveInputFrame(threePlayerState(), 'A037', 'me', '05-20', () => 0);
    expect(result?.customPayload?.today).toBe('05-20');
  });

  it('needsNumberInput: produces a number within the card-defined bounds', () => {
    // A135 is an existing needsNumberInput card (numberInputMin/Max set).
    const result = autoResolveInputFrame(threePlayerState(), 'A135', 'me', undefined, () => 0.5);
    expect(typeof result?.customPayload?.numberInput).toBe('number');
  });

  it('plain auto with no flags: returns empty targetIds and no customPayload', () => {
    const result = autoResolveInputFrame(threePlayerState(), 'A127', 'me', undefined, () => 0);
    expect(result?.targetIds).toEqual([]);
  });
});
```

Before running, confirm the specific card codes referenced above (`A006`, `A057`, `A172`,
`A135`, `A127`, and a genuine `needsOutcomeEntry: true` example) actually carry the flags
assumed, via:

```bash
grep -n "needsTargetSelection: true\|needsRosterSelection: true\|rosterSelectionCount\|needsOutcomeEntry: true\|needsTodayDate: true\|needsNumberInput: true" game/actionRules/definitions.ts | head -40
```

Swap in whichever real codes match each flag if the ones above turn out wrong — the test
intent (one representative card per flag) matters more than the exact code literals.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/autoResolve.test.ts --reporter=dot`
Expected: FAIL with "Cannot find module './autoResolve'".

- [ ] **Step 3: Write the implementation**

Create `game/actionRules/autoResolve.ts`:

```ts
import type { CardCode, PlayerId, RoomState, Rng } from '../types';
import { getActionRule } from './registry';
import { pickRandomIndices } from '../util';

export interface AutoResolvedInput {
  targetIds: PlayerId[];
  customPayload?: Record<string, unknown>;
}

/**
 * Fills in a card's required manual input (target/roster/outcome/etc.) with
 * a sensible random default, for the two Cluster D cards (A017, A108) that
 * cause a DIFFERENT card's effect to resolve with no live player available
 * to ask -- see docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md.
 * Not used for A028 (input gathered live through the normal co-play UI) or
 * A094 (input reused verbatim from history). `rng` defaults to `Math.random`
 * per this codebase's established pattern for helper FUNCTIONS (not
 * executeEffect itself, which must stay a pure function of (state, frame)
 * with no injectable parameters at all -- see game/pile.ts's draw()).
 * Excludes the actor from candidate selection uniformly; this codebase's
 * per-card target lists occasionally allow self-targeting, a simplification
 * accepted for this auto-resolve path specifically (documented in the
 * design spec).
 */
export function autoResolveInputFrame(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  today: string | undefined,
  rng: Rng = Math.random
): AutoResolvedInput | null {
  const rule = getActionRule(code);
  if (!rule) return null;

  const others = Object.keys(state.players).filter((id) => id !== actorId);

  if (rule.needsDualTargetSelection) {
    if (others.length < 2) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 2, rng);
    return { targetIds: [], customPayload: { firstId: others[idx[0]], secondId: others[idx[1]] } };
  }

  if (rule.needsTargetThenOutcome) {
    if (others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]], customPayload: { outcome: rng() < 0.5 } };
  }

  if (rule.needsDrinkCheck) {
    const alreadyDrunk = rng() < 0.5;
    if (alreadyDrunk || others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]] };
  }

  if (rule.needsOutcomeEntry) {
    return { targetIds: [], customPayload: { outcome: rng() < 0.5 } };
  }

  if (rule.needsNumberInput) {
    const min = rule.numberInputMin ?? 1;
    const max = rule.numberInputMax ?? Math.max(min, 5);
    const numberInput = min + Math.floor(rng() * (max - min + 1));
    return { targetIds: [], customPayload: { numberInput } };
  }

  if (rule.needsRosterSelection) {
    if (rule.rosterSelectionCount !== undefined) {
      const count = Math.min(rule.rosterSelectionCount, others.length);
      const idx = pickRandomIndices(others.length, count, rng);
      return { targetIds: idx.map((i) => others[i]) };
    }
    return { targetIds: others };
  }

  if (rule.needsTodayDate) {
    return { targetIds: [], customPayload: { today: today ?? '01-01' } };
  }

  if (rule.needsTargetSelection) {
    if (others.length === 0) return { targetIds: [] };
    const idx = pickRandomIndices(others.length, 1, rng);
    return { targetIds: [others[idx[0]]] };
  }

  return { targetIds: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/autoResolve.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/autoResolve.ts game/actionRules/autoResolve.test.ts
git commit -m "feat: add autoResolveInputFrame helper for auto-resolved nested card inputs"
```

---

### Task 3: `resolvePostPlayDestination` helper (for A017's found card)

**Files:**
- Modify: `game/turnFlow.ts`
- Test: `game/turnFlow.test.ts`

**Interfaces:**
- Produces: `resolvePostPlayDestination(state: RoomState, code: CardCode): RoomState`,
  exported from `game/turnFlow.ts`. Task 4 (A017) calls this.

- [ ] **Step 1: Write the failing tests**

Add to `game/turnFlow.test.ts` (create the file if it doesn't already exist, matching the
existing `describe('applyActionRedirect', ...)` block's fixture style if one exists — check
first with `grep -n "describe(" game/turnFlow.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { resolvePostPlayDestination } from './turnFlow';
import type { RoomState } from './types';

function baseState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    status: 'playing',
    hostId: 'p1',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: [],
    discardPile: [],
    players: {
      p1: { name: 'One', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    actionRedirect: null,
    ...overrides,
  } as unknown as RoomState;
}

describe('resolvePostPlayDestination', () => {
  it('places the card on discardPile when no redirect is active', () => {
    const next = resolvePostPlayDestination(baseState(), 'A006');
    expect(next.discardPile).toEqual(['A006']);
  });

  it('redirects the card into the active redirect target hand instead, decrementing remaining', () => {
    const state = baseState({ actionRedirect: { toPlayerId: 'p2', remaining: 2 } });
    const next = resolvePostPlayDestination(state, 'A006');
    expect(next.discardPile).toEqual([]);
    expect(next.players.p2.hand).toEqual(['A006']);
    expect(next.actionRedirect).toEqual({ toPlayerId: 'p2', remaining: 1 });
  });

  it('clears actionRedirect once remaining hits 0', () => {
    const state = baseState({ actionRedirect: { toPlayerId: 'p2', remaining: 1 } });
    const next = resolvePostPlayDestination(state, 'A006');
    expect(next.actionRedirect).toBeNull();
  });

  it('falls back to discardPile when the redirect target no longer exists in the room', () => {
    const state = baseState({ actionRedirect: { toPlayerId: 'ghost', remaining: 2 } });
    const next = resolvePostPlayDestination(state, 'A006');
    expect(next.discardPile).toEqual(['A006']);
    expect(next.actionRedirect).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/turnFlow.test.ts --reporter=dot`
Expected: FAIL with "resolvePostPlayDestination is not a function" (or "no export").

- [ ] **Step 3: Write the implementation**

Add to `game/turnFlow.ts` (near the existing `applyActionRedirect`):

```ts
/**
 * A lighter sibling of applyActionRedirect for a card that never sat in a
 * hand to begin with -- A017's blind-drawn card comes straight out of
 * drawPile, so there is no hand to remove it from before deciding its
 * post-play destination. Still respects an active A040 redirect (Cluster
 * A's ruling: applies to ANY player's Action play, not just the original
 * actor who set it up), same as applyActionRedirect, just without the
 * hand-removal step.
 */
export function resolvePostPlayDestination(state: RoomState, code: CardCode): RoomState {
  const redirect = state.actionRedirect;
  if (!redirect || redirect.remaining <= 0 || !state.players[redirect.toPlayerId]) {
    const next = cloneState(state);
    next.discardPile.push(code);
    if (redirect) next.actionRedirect = null;
    return next;
  }
  const next = cloneState(state);
  next.players[redirect.toPlayerId].hand.push(code);
  next.actionRedirect = redirect.remaining - 1 > 0 ? { ...redirect, remaining: redirect.remaining - 1 } : null;
  return next;
}
```

Confirm `cloneState` is already imported at the top of `game/turnFlow.ts` (it's used by
`applyActionRedirect` already); add the import if it's missing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/turnFlow.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 6: Commit**

```bash
git add game/turnFlow.ts game/turnFlow.test.ts
git commit -m "feat: add resolvePostPlayDestination helper for cards not sourced from a hand"
```

---

### Task 4: A017 "นายตาบอด" card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Modify: `game/pile.ts` (read-only usage of `reshuffleDiscardIntoDraw`, no changes expected —
  confirm its signature first)
- Test: `game/actionRules/definitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `game/actionRules/definitions.test.ts` (find the existing `describe` block structure
and follow it — one `describe('A017', ...)` block):

```ts
describe('A017', () => {
  function stateWithDeck(drawPile: CardCode[], discardPile: CardCode[] = []): RoomState {
    return {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile,
      discardPile,
      players: {
        me: { name: 'Me', hand: ['A017'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
    } as unknown as RoomState;
  }

  function testFrame(overrides: Partial<StackFrame> = {}): StackFrame {
    return {
      frameId: 'frame-1',
      parentFrameId: null,
      sourceType: 'action',
      sourceCode: 'A017',
      actorId: 'me',
      targetIds: ['p2'],
      targetScope: 'single',
      eligibleResponderIds: [],
      responses: {},
      modifiers: [],
      status: 'resolving',
      turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      ...overrides,
    };
  }

  it('finds the top Action card, discarding Trap/Counter cards drawn along the way', () => {
    const rule = getActionRule('A017')!;
    const state = stateWithDeck(['A006', 'T01', 'C01']); // top of pile is last element
    const next = rule.executeEffect(state, testFrame());
    expect(next.discardPile).toContain('T01');
    expect(next.discardPile).toContain('C01');
  });

  it('makes the CHOSEN player (not the actor) the actor of the found card', () => {
    const rule = getActionRule('A017')!;
    const state = stateWithDeck(['A006']);
    const next = rule.executeEffect(state, testFrame());
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.sourceCode).toBe('A006');
    expect(pushed?.actorId).toBe('p2');
  });

  it('no-ops (drawPile/discardPile unchanged besides the discard-loop) when no Action card can be found', () => {
    const rule = getActionRule('A017')!;
    const state = stateWithDeck(['T01', 'C01']); // only Trap/Counter available anywhere
    const next = rule.executeEffect(state, testFrame());
    expect(next.reactionStack ?? []).toEqual([]);
  });

  it('respects an active A040 redirect for the found card\'s own post-play destination', () => {
    const rule = getActionRule('A017')!;
    const state = stateWithDeck(['A006']);
    state.actionRedirect = { toPlayerId: 'p3', remaining: 2 };
    const next = rule.executeEffect(state, testFrame());
    expect(next.players.p3.hand).toContain('A006');
    expect(next.discardPile).not.toContain('A006');
  });

  it('does not push a further nested frame once chainDepth reaches the cap', () => {
    const rule = getActionRule('A017')!;
    const state = stateWithDeck(['A006']);
    const next = rule.executeEffect(state, testFrame({ customPayload: { chainDepth: 20 } }));
    expect(next.reactionStack ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A017 --reporter=dot`
Expected: FAIL (`getActionRule('A017')` returns `undefined`).

- [ ] **Step 3: Write the implementation**

Add to `game/actionRules/definitions.ts`'s `ACTION_RULES_BATCH_1` object (imports needed at
the top of the file: `pushStackFrame`, `getTopFrame` from `../reactionStack`;
`resolvePostPlayDestination` from `../turnFlow`; `autoResolveInputFrame` from
`./autoResolve`; `reshuffleDiscardIntoDraw` from `../pile`; `todayFromFrame` already
imported):

```ts
  A017: {
    code: 'A017',
    name_en: "You're Blind",
    name_th: 'นายตาบอด',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้จั่วไพ่ใบบนสุดของกองและเล่นใบนั้น หากเป็น Trap หรือ Counter ให้ทิ้งไปจนกว่าจะได้ Action',
    kind: 'auto',
    needsTargetSelection: true,
    needsTodayDate: true,
    targetPrompt: 'เลือกผู้เล่นให้จั่วไพ่ใบบนสุดของกองและเล่นทันที',
    executeEffect: (state, frame) => {
      const chosenPlayerId = frame.targetIds[0];
      if (!chosenPlayerId || !state.players[chosenPlayerId]) return state;
      const chainDepth = (frame.customPayload?.chainDepth as number | undefined) ?? 0;
      if (chainDepth >= 20) return state;

      let next = cloneState(state);
      let foundCode: CardCode | undefined;
      const totalCards = next.drawPile.length + next.discardPile.length;
      let safety = 0;
      while (safety < totalCards + 1) {
        safety += 1;
        if (next.drawPile.length === 0) {
          next = reshuffleDiscardIntoDraw(next);
          if (next.drawPile.length === 0) break;
        }
        const card = next.drawPile.pop()!;
        const cardInfo = getCardById(card);
        if (cardInfo?.type === 'action') {
          foundCode = card;
          break;
        }
        next.discardPile.push(card);
      }
      if (!foundCode) return next;

      next = resolvePostPlayDestination(next, foundCode);
      const auto = autoResolveInputFrame(next, foundCode, chosenPlayerId, todayFromFrame(frame));
      if (!auto) return next;
      next = pushStackFrame(next, {
        sourceType: 'action',
        sourceCode: foundCode,
        actorId: chosenPlayerId,
        targetIds: auto.targetIds,
        customPayload: { ...auto.customPayload, chainDepth: chainDepth + 1 },
      });
      return next;
    },
  },
```

Check `getCardById`'s return shape first (`grep -n "export function getCardById" data/cards/index.ts`)
to confirm the exact field name for card type (`type`/`kind`/`category`) — adjust
`cardInfo?.type === 'action'` to match whatever that function actually returns.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A017 --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "feat: implement A017 (blind draw-and-play, chosen player becomes actor)"
```

---

### Task 5: A108 "เล่นใบนั้นสิ" card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a `describe('A108', ...)` block to `game/actionRules/definitions.test.ts`:

```ts
describe('A108', () => {
  function stateWithHands(p2Hand: CardCode[], p3Hand: CardCode[] = []): RoomState {
    return {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: ['A108'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: p2Hand, traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'Three', hand: p3Hand, traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
    } as unknown as RoomState;
  }

  function testFrame(overrides: Partial<StackFrame> = {}): StackFrame {
    return {
      frameId: 'frame-1',
      parentFrameId: null,
      sourceType: 'action',
      sourceCode: 'A108',
      actorId: 'me',
      targetIds: ['p2'],
      targetScope: 'single',
      eligibleResponderIds: [],
      responses: {},
      modifiers: [],
      status: 'resolving',
      turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      ...overrides,
    };
  }

  it('removes a random Action card from the target\'s hand and pushes a nested frame for it', () => {
    const rule = getActionRule('A108')!;
    const state = stateWithHands(['A006']);
    const next = rule.executeEffect(state, testFrame());
    expect(next.players.p2.hand).not.toContain('A006');
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.sourceCode).toBe('A006');
  });

  it('makes the FORCED player (not the actor) the actor of the chosen card', () => {
    const rule = getActionRule('A108')!;
    const state = stateWithHands(['A006']);
    const next = rule.executeEffect(state, testFrame());
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.actorId).toBe('p2');
  });

  it('only picks among implemented Action codes, ignoring non-Action cards in hand', () => {
    const rule = getActionRule('A108')!;
    const state = stateWithHands(['T01', 'A006']);
    const next = rule.executeEffect(state, testFrame());
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.sourceCode).toBe('A006');
    expect(next.players.p2.hand).toContain('T01');
  });

  it('no-ops when the target has no implemented Action cards', () => {
    const rule = getActionRule('A108')!;
    const state = stateWithHands(['T01']);
    const next = rule.executeEffect(state, testFrame());
    expect(next.reactionStack ?? []).toEqual([]);
    expect(next.players.p2.hand).toEqual(['T01']);
  });

  it('does not push a further nested frame once chainDepth reaches the cap', () => {
    const rule = getActionRule('A108')!;
    const state = stateWithHands(['A006']);
    const next = rule.executeEffect(state, testFrame({ customPayload: { chainDepth: 20 } }));
    expect(next.reactionStack ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A108 --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Add to `game/actionRules/definitions.ts` (needs `applyActionRedirect` from `../turnFlow`
already imported; `isActionImplemented` from `./registry`; `pickRandomIndices` from
`../util`):

```ts
  A108: {
    code: 'A108',
    name_en: 'Play That One',
    name_th: 'เล่นใบนั้นสิ',
    description_th: 'เลือก Action 1 ใบจากมือของผู้เล่นอีก 1 คน แล้วบังคับให้ผู้เล่นคนนั้นเล่นไพ่ใบนั้น',
    kind: 'auto',
    needsTargetSelection: true,
    needsTodayDate: true,
    targetPrompt: 'เลือกผู้เล่นที่มี Action การ์ดเพื่อบังคับให้เล่น',
    executeEffect: (state, frame) => {
      const forcedPlayerId = frame.targetIds[0];
      if (!forcedPlayerId || !state.players[forcedPlayerId]) return state;
      const chainDepth = (frame.customPayload?.chainDepth as number | undefined) ?? 0;
      if (chainDepth >= 20) return state;

      const candidates = state.players[forcedPlayerId].hand.filter((code) => isActionImplemented(code));
      if (candidates.length === 0) return state;
      const idx = pickRandomIndices(candidates.length, 1, Math.random)[0];
      const chosenCode = candidates[idx];

      let next = applyActionRedirect(cloneState(state), forcedPlayerId, chosenCode);
      const auto = autoResolveInputFrame(next, chosenCode, forcedPlayerId, todayFromFrame(frame));
      if (!auto) return next;
      next = pushStackFrame(next, {
        sourceType: 'action',
        sourceCode: chosenCode,
        actorId: forcedPlayerId,
        targetIds: auto.targetIds,
        customPayload: { ...auto.customPayload, chainDepth: chainDepth + 1 },
      });
      return next;
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A108 --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "feat: implement A108 (forced random Action play, forced player becomes actor)"
```

---

### Task 6: A094 "พร้อมเพรียง" card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a `describe('A094', ...)` block:

```ts
describe('A094', () => {
  function stateWithHistory(recentActionPlays: RecentActionPlay[]): RoomState {
    return {
      status: 'playing',
      hostId: 'me',
      turnOrder: ['me', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      muffinTimeTarget: 10,
      drawPile: [],
      discardPile: [],
      players: {
        me: { name: 'Me', hand: ['A094'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
        p3: { name: 'Three', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      },
      recentActionPlays,
    } as unknown as RoomState;
  }

  function testFrame(overrides: Partial<StackFrame> = {}): StackFrame {
    return {
      frameId: 'frame-1',
      parentFrameId: null,
      sourceType: 'action',
      sourceCode: 'A094',
      actorId: 'me',
      targetIds: [],
      targetScope: 'single',
      eligibleResponderIds: [],
      responses: {},
      modifiers: [],
      status: 'resolving',
      turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      ...overrides,
    };
  }

  it('replays the most recent non-A094 play, under A094\'s own actor', () => {
    const rule = getActionRule('A094')!;
    const state = stateWithHistory([{ code: 'A006', actorId: 'p3', targetIds: ['p2'] }]);
    const next = rule.executeEffect(state, testFrame());
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.sourceCode).toBe('A006');
    expect(pushed?.actorId).toBe('me');
    expect(pushed?.targetIds).toEqual(['p2']);
  });

  it('skips a most-recent entry that is itself A094', () => {
    const rule = getActionRule('A094')!;
    const state = stateWithHistory([
      { code: 'A094', actorId: 'p2', targetIds: [] },
      { code: 'A006', actorId: 'p3', targetIds: ['p2'] },
    ]);
    const next = rule.executeEffect(state, testFrame());
    const pushed = next.reactionStack?.[next.reactionStack.length - 1];
    expect(pushed?.sourceCode).toBe('A006');
  });

  it('no-ops when there is no eligible history', () => {
    const rule = getActionRule('A094')!;
    const next = rule.executeEffect(stateWithHistory([]), testFrame());
    expect(next.reactionStack ?? []).toEqual([]);
  });

  it('does not push a further nested frame once chainDepth reaches the cap', () => {
    const rule = getActionRule('A094')!;
    const state = stateWithHistory([{ code: 'A006', actorId: 'p3', targetIds: ['p2'] }]);
    const next = rule.executeEffect(state, testFrame({ customPayload: { chainDepth: 20 } }));
    expect(next.reactionStack ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A094 --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Add to `game/actionRules/definitions.ts`:

```ts
  A094: {
    code: 'A094',
    name_en: 'In Sync',
    name_th: 'พร้อมเพรียง',
    description_th: 'ใช้ Effect ของ Action ใบล่าสุดที่ถูกเล่นซ้ำอีกครั้ง',
    kind: 'auto',
    executeEffect: (state, frame) => {
      const chainDepth = (frame.customPayload?.chainDepth as number | undefined) ?? 0;
      if (chainDepth >= 20) return state;

      const history = state.recentActionPlays ?? [];
      const entry = history.find((play) => play.code !== 'A094');
      if (!entry) return state;

      return pushStackFrame(cloneState(state), {
        sourceType: 'action',
        sourceCode: entry.code,
        actorId: frame.actorId,
        targetIds: entry.targetIds,
        customPayload: { ...entry.customPayload, chainDepth: chainDepth + 1 },
      });
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A094 --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "feat: implement A094 (replay most recent non-A094 play under new actor)"
```

---

### Task 7: A028 quantity-card allow-list + doubling mechanism

**Files:**
- Create: `game/actionRules/quantityCards.ts`
- Modify: `lib/session.tsx`
- Test: `game/actionRules/quantityCards.test.ts`
- Test: `lib/session.test.ts` (create if it doesn't exist — check first)

**Interfaces:**
- Produces: `QUANTITY_EFFECT_CARDS: ReadonlySet<CardCode>` and `isQuantityEffectCard(code:
  CardCode): boolean`, exported from `game/actionRules/quantityCards.ts`. Task 8 (A028) uses
  both for playability gating and the UI candidate filter.

- [ ] **Step 1: Generate the candidate list**

Run this script to find every card whose `executeEffect` calls a draw/discard/steal-count
primitive:

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('game/actionRules/definitions.ts', 'utf8');
const blocks = src.split(/(?=^  A\d{3}: \{)/m);
const primitives = ['draw(', 'discard(', 'stealRandom(', 'executeRandomSteal(', 'executeAllRandomSteal(',
  'rosterDraws(', 'rosterDiscards(', 'everyoneDraws(', 'everyoneDiscards(', 'drawUntilCount(',
  'drawFromBottom(', 'rosterStolenBy(', 'swapHands('];
for (const block of blocks) {
  const m = block.match(/^  (A\d{3}): \{/);
  if (!m) continue;
  const code = m[1];
  const hit = primitives.some((p) => block.includes(p));
  if (hit) console.log(code);
}
" > /tmp/quantity-candidates.txt
wc -l /tmp/quantity-candidates.txt
```

This was already run during planning (excluding A017/A028/A094/A108 themselves and
A091/A092/A100/A119/A126/A130/A135 from other Group 1 clusters, to avoid pairing D with
in-progress or structurally special cards) — it matched **105** codes. Manual review against
`data/cards.json`'s `description_th` for each one found exactly **one** that needs excluding
beyond the mechanical script: **A084** "สลับไพ่ทั้งหมดในมือกับผู้เล่นอีก 1 คนที่คุณเลือก" (swap
your entire hand with another chosen player's) — since doubling means "invoke the effect
twice," and a swap invoked twice swaps back, A084 doubled via this mechanism is a no-op
(cancels itself out) rather than a stronger effect. This is structurally different from every
other matched card (all of which are purely additive — draw, discard, or steal a count — so
invoking twice always compounds rather than cancels). No other candidate had this problem;
the rest (including open-ended ones like A063 "steal however many cards from however many
players you want," and refresh-shaped ones like A020/A090 "discard your whole hand [and
redraw]") are additive or actor-controlled-per-invocation, so a second invocation always
does *something* further, even if modest, rather than reversing the first. The reviewed
final list (104 codes) is already populated into `game/actionRules/quantityCards.ts` in Step
4 below — Step 1 exists so a future re-audit (e.g. if new Action cards are added later) can
reproduce this list mechanically rather than starting from scratch.

- [ ] **Step 2: Write the failing test**

Create `game/actionRules/quantityCards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isQuantityEffectCard, QUANTITY_EFFECT_CARDS } from './quantityCards';

describe('quantityCards', () => {
  it('includes a known draw/discard/steal card', () => {
    // A006 or another already-implemented steal/discard card confirmed
    // during the Step 1 audit -- substitute the real code found there.
    expect(isQuantityEffectCard('A006')).toBe(true);
  });

  it('excludes a known non-quantity card', () => {
    expect(isQuantityEffectCard('A119')).toBe(false); // turn-order jump
  });

  it('excludes this cluster\'s own cards', () => {
    expect(isQuantityEffectCard('A017')).toBe(false);
    expect(isQuantityEffectCard('A028')).toBe(false);
    expect(isQuantityEffectCard('A094')).toBe(false);
    expect(isQuantityEffectCard('A108')).toBe(false);
  });

  it('QUANTITY_EFFECT_CARDS is non-empty', () => {
    expect(QUANTITY_EFFECT_CARDS.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run game/actionRules/quantityCards.test.ts --reporter=dot`
Expected: FAIL (module doesn't exist).

- [ ] **Step 4: Write the implementation**

Create `game/actionRules/quantityCards.ts`, hardcoding the reviewed list from Step 1:

```ts
import type { CardCode } from '../types';

/**
 * Action cards eligible to pair with A028 "ทาเยอะไปหน่อย" (doubles another
 * Action's effect) -- cards whose effect is fundamentally drawing,
 * discarding, or stealing a card count. Enumerated by a one-time audit of
 * game/actionRules/definitions.ts (see the script in this cluster's
 * implementation plan, Task 7) rather than derived automatically at
 * runtime, since "is this fundamentally a quantity effect" needs a human
 * read of the card text in the ambiguous cases -- see
 * docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md.
 */
export const QUANTITY_EFFECT_CARDS: ReadonlySet<CardCode> = new Set([
  'A001', 'A002', 'A004', 'A005', 'A006', 'A007', 'A008', 'A011', 'A012', 'A013',
  'A014', 'A016', 'A020', 'A022', 'A026', 'A029', 'A031', 'A033', 'A036', 'A038',
  'A039', 'A041', 'A042', 'A044', 'A045', 'A051', 'A052', 'A054', 'A055', 'A056',
  'A057', 'A058', 'A061', 'A062', 'A063', 'A065', 'A067', 'A068', 'A069', 'A070',
  'A073', 'A075', 'A077', 'A079', 'A081', 'A082', 'A083', 'A088', 'A090', 'A095',
  'A096', 'A097', 'A098', 'A099', 'A101', 'A102', 'A103', 'A104', 'A107', 'A111',
  'A112', 'A114', 'A115', 'A118', 'A120', 'A121', 'A125', 'A127', 'A129', 'A131',
  'A132', 'A133', 'A134', 'A136', 'A138', 'A139', 'A140', 'A141', 'A142', 'A143',
  'A144', 'A145', 'A146', 'A147', 'A148', 'A149', 'A150', 'A151', 'A152', 'A153',
  'A155', 'A157', 'A158', 'A159', 'A160', 'A162', 'A163', 'A165', 'A166', 'A167',
  'A168', 'A170', 'A171', 'A173',
  // A084 (hand swap) deliberately excluded -- see this file's implementation
  // plan (Task 7, Step 1) for why: doubling a swap via double-invoke cancels
  // itself out instead of compounding.
]);

export function isQuantityEffectCard(code: CardCode): boolean {
  return QUANTITY_EFFECT_CARDS.has(code);
}
```

This list (104 codes) was produced and reviewed during planning — see Step 1 above for the
full audit methodology and the A084 exclusion rationale. Sanity check after pasting it in:
`node -e "console.log(require('./game/actionRules/quantityCards.ts'))"` won't work directly
(TS), so instead just count entries and confirm no duplicates in an editor, or run the Step 5
test below.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run game/actionRules/quantityCards.test.ts --reporter=dot`
Expected: PASS (after substituting real confirmed codes into the test file from Step 2).

- [ ] **Step 6: Write the failing `doubled` resolution test**

Create `lib/session.test.ts` if it doesn't exist yet (check with
`ls lib/session.test.ts`), following whatever existing top-level test setup pattern this
project uses for `lib/session.tsx` (check `game/reactionStack.test.ts` for how a
`RoomState` + frame is constructed and resolved, since `resolveCompletedStackFrames` is a
`useCallback` inside the `GameSessionProvider` component — it may need to be extracted to a
plain exported function first if it isn't already testable in isolation; if so, that
extraction is an additional, in-scope step here: change `const resolveCompletedStackFrames =
useCallback((state) => {...}, [])` to a plain top-level exported function
`resolveCompletedStackFrames(state: RoomState): RoomState` in a new or existing
non-component module, and have the component wrap it in `useCallback` only where it's
consumed, or import it directly if `useCallback` isn't actually needed for a pure function —
confirm which by checking whether anything depends on referential stability).

Add:

```ts
it('a doubled action frame invokes executeActionFrameEffect twice', () => {
  const state = {
    status: 'playing',
    hostId: 'me',
    turnOrder: ['me', 'p2'],
    currentTurnIndex: 0,
    direction: 1,
    muffinTimeTarget: 10,
    drawPile: ['A01', 'A02', 'A03', 'A04'],
    discardPile: [],
    players: {
      me: { name: 'Me', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: [], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
    reactionStack: [{
      frameId: 'f1', parentFrameId: null, sourceType: 'action', sourceCode: 'A127',
      actorId: 'me', targetIds: [], targetScope: 'all', eligibleResponderIds: [], responses: {},
      modifiers: [], status: 'pending_responses',
      turnContext: { turnIndex: 0, phase: 'main', roundNumber: 1 },
      customPayload: { doubled: true },
    }],
  } as unknown as RoomState;
  const next = resolveCompletedStackFrames(state);
  // A127 "My Lemons" discards 4 cards from the actor's hand -- doubled means 8,
  // but the actor's hand is empty here, so assert discardPile grew by up to
  // 8 draws worth of cards is the WRONG assertion (A127 discards from hand,
  // not draws) -- instead assert executeActionFrameEffect ran twice via a
  // card whose count is directly observable, e.g. drawPile shrinking by 2x
  // a fixed draw amount. Swap A127 for an existing simple kind:'auto' draw-N
  // card (e.g. "A052" if it draws a fixed N with no target) confirmed via
  // `grep -n "A052:" -A5 game/actionRules/definitions.ts`, and assert
  // `next.players.me.hand.length` equals 2x that card's N.
});
```

Adjust the exact card code and assertion once you've confirmed a real simple fixed-N draw
card via the grep above — the intent (prove double-invocation empirically through an
observable count) is what must hold, not the specific card literal shown here.

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run lib/session.test.ts --reporter=dot`
Expected: FAIL (effect only applied once).

- [ ] **Step 8: Implement the `doubled` branch**

Find (in `lib/session.tsx`'s `resolveCompletedStackFrames`, after Task 1's edit):

```ts
        } else {
          next = executeActionFrameEffect(next, resolvingFrame);
          const entry: RecentActionPlay = {
```

Replace with:

```ts
        } else {
          next = executeActionFrameEffect(next, resolvingFrame);
          if (resolvingFrame.customPayload?.doubled) {
            next = executeActionFrameEffect(next, resolvingFrame);
          }
          const entry: RecentActionPlay = {
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run lib/session.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 10: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 11: Commit**

```bash
git add game/actionRules/quantityCards.ts game/actionRules/quantityCards.test.ts lib/session.tsx lib/session.test.ts
git commit -m "feat: add A028 quantity-card allow-list and doubled-effect resolution"
```

---

### Task 8: A028 "ทาเยอะไปหน่อย" card definition + `playDoubledAction` session method

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Modify: `lib/session.tsx`
- Test: `game/actionRules/definitions.test.ts`
- Test: `lib/session.test.ts`

**Interfaces:**
- Produces: `playDoubledAction(partnerCode: CardCode, targetId?: PlayerId, customPayload?:
  Record<string, unknown>): void`, added to `GameSessionValue` (`game/types.ts` or wherever
  that interface lives — check `lib/session.tsx`'s existing `playAction` export shape) and
  returned from `useGameSession()`. Task 10 (UI) calls this.

- [ ] **Step 1: Write the failing card-definition test**

A028 itself has no `executeEffect` that does anything by itself (the doubling happens via
`playDoubledAction` + the `doubled` flag from Task 7, not via A028's own `executeEffect`,
since A028 is never the `sourceCode` of the pushed frame). Add to
`game/actionRules/definitions.test.ts`:

```ts
describe('A028', () => {
  it('is registered as an implemented Action card', () => {
    expect(isActionImplemented('A028')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A028 --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Add A028's (minimal) definition**

Add to `game/actionRules/definitions.ts`:

```ts
  A028: {
    code: 'A028',
    name_en: 'Bad Spread',
    name_th: 'ทาเยอะไปหน่อย',
    description_th: 'เล่นไพ่ใบนี้พร้อมกับ Action อีก 1 ใบ เพื่อเพิ่ม Effect ของ Action ใบนั้นเป็น 2 เท่า',
    kind: 'no_op',
    // A028 is never itself the sourceCode of a pushed StackFrame -- playing
    // it goes through the dedicated playDoubledAction session method
    // (lib/session.tsx), which pushes a frame for the PAIRED card with
    // customPayload.doubled = true. This executeEffect exists only so the
    // registry has a complete entry; it should be unreachable in practice.
    executeEffect: (state) => state,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts -t A028 --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Write the failing `playDoubledAction` tests**

Add to `lib/session.test.ts` (following whatever pattern Task 7 established for testing
`lib/session.tsx` in isolation):

```ts
describe('playDoubledAction', () => {
  it('rejects when the partner code is not a qualifying quantity card', () => {
    // Set up a room where the actor holds A028 + a non-qualifying code
    // (e.g. A119, confirmed non-qualifying by Task 7's allow-list), call
    // playDoubledAction with that non-qualifying code as the partner, and
    // assert the room state is unchanged (both cards remain in hand, no
    // frame pushed).
  });

  it('discards both A028 and the partner card, pushing one frame with doubled: true', () => {
    // Set up a room where the actor holds A028 + a real qualifying code
    // from Task 7's finished allow-list. Call playDoubledAction with that
    // code and a target if the card needs one. Assert: both cards left the
    // actor's hand, exactly one frame is on reactionStack, its sourceCode
    // is the partner code, and customPayload.doubled === true.
  });
});
```

Fill in the actual room fixtures and a real qualifying card code from Task 7's finished
`QUANTITY_EFFECT_CARDS` set once that set is populated — this task depends on Task 7 being
complete first.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run lib/session.test.ts -t playDoubledAction --reporter=dot`
Expected: FAIL (`playDoubledAction` doesn't exist).

- [ ] **Step 7: Implement `playDoubledAction`**

Add to `lib/session.tsx`, near the existing `playAction`:

```ts
  const playDoubledAction = useCallback(
    (partnerCode: CardCode, targetId?: PlayerId, customPayload?: Record<string, unknown>) =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        if (state.globalRestrictions?.some((r) => r.type === 'no_actions')) return state;
        const actorId = myPlayerId!;
        const player = state.players[actorId];
        if (player?.hasDrawnThisTurn) return state;
        const usingBonusPlay = Boolean(player?.hasPlayedActionThisTurn) && (player?.bonusActionPlaysRemaining ?? 0) > 0;
        if (player?.hasPlayedActionThisTurn && !usingBonusPlay) return state;
        if (!player?.hand.includes('A028')) return state;
        if (!isQuantityEffectCard(partnerCode) || !player.hand.includes(partnerCode) || partnerCode === 'A028') return state;
        if (!isActionImplemented(partnerCode) || !getPlayableActions(state, actorId).includes(partnerCode)) return state;
        if (targetId && !state.players[targetId]) return state;

        let next = state;
        if (next.turnPhase === 'trap_placement' || !next.turnPhase) {
          next = engineSkipTrapPlacement(next, actorId);
        }
        if (next.turnPhase !== 'main') return state;

        let afterDiscard = applyActionRedirect(next, actorId, 'A028');
        afterDiscard = applyActionRedirect(afterDiscard, actorId, partnerCode);
        if (afterDiscard.players[actorId]) {
          if (usingBonusPlay) {
            afterDiscard.players[actorId].bonusActionPlaysRemaining = (afterDiscard.players[actorId].bonusActionPlaysRemaining ?? 0) - 1;
          } else {
            afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
          }
          afterDiscard.players[actorId].hasDrawnThisTurn = false;
        }
        const stackState = pushStackFrame(afterDiscard, {
          sourceType: 'action',
          sourceCode: partnerCode,
          actorId,
          targetIds: targetId ? [targetId] : [],
          customPayload: { ...(customPayload ?? {}), doubled: true },
        });
        const actionEvent = createGameEvent(GAME_EVENT_TYPES.ACTION_PLAYED, actorId, { actorId, actionCode: partnerCode, targetId }, [targetId ?? actorId]);
        appendGameEvent(stackState, actionEvent);
        return checkAndTriggerAutomaticTraps(stackState, actionEvent);
      }),
    [run, myPlayerId]
  );
```

Add `isQuantityEffectCard` to the imports from `../game/actionRules/quantityCards`. Add
`playDoubledAction` to the `GameSessionValue` interface (wherever `playAction` is declared —
likely `game/types.ts` or a `SessionContext` type in `lib/session.tsx` itself) and to the
value object returned by the provider (search for where `playAction` is added to the
returned/provided value and add `playDoubledAction` alongside it).

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/session.test.ts -t playDoubledAction --reporter=dot`
Expected: PASS.

- [ ] **Step 9: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 10: Commit**

```bash
git add game/actionRules/definitions.ts lib/session.tsx game/actionRules/definitions.test.ts lib/session.test.ts
git commit -m "feat: implement A028 registry entry and playDoubledAction session method"
```

---

### Task 9: UI — `today` stamping for target-needing cards + A108 candidate filter

**Files:**
- Modify: `components/room/GameTable.tsx`

This task fixes a real gap found while planning: `handlePlayActionDirect`'s existing
`needsTodayDate` stamping (lines ~218-230) only covers cards played with **no** target
(A037/A066/A137, the only prior `needsTodayDate` cards, none of which also need a target). A017
and A108 are the first cards to combine `needsTodayDate` with `needsTargetSelection`, which
routes through `handleRequestTarget`/`handleConfirmTargetAction` instead — a path that
currently never stamps `today` at all.

- [ ] **Step 1: Extract a shared `todayMMDD()` helper**

Find (in `GameTable.tsx`'s `handlePlayActionDirect`):

```ts
  const handlePlayActionDirect = (cardCode: CardCode) => {
    if (!canAct) return;
    // A037/A066/A137 need "today" to resolve their birthday comparison.
    // Stamped here (the actor's own device clock) rather than read inside
    // executeEffect, which must stay a pure function of (state, frame).
    if (getActionRule(cardCode)?.needsTodayDate) {
      const now = new Date();
      const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      playAction(cardCode, undefined, { today });
      return;
    }
    playAction(cardCode);
  };
```

Replace with:

```ts
  const todayMMDD = () => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const handlePlayActionDirect = (cardCode: CardCode) => {
    if (!canAct) return;
    // A037/A066/A137 need "today" to resolve their birthday comparison.
    // Stamped here (the actor's own device clock) rather than read inside
    // executeEffect, which must stay a pure function of (state, frame).
    if (getActionRule(cardCode)?.needsTodayDate) {
      playAction(cardCode, undefined, { today: todayMMDD() });
      return;
    }
    playAction(cardCode);
  };
```

- [ ] **Step 2: Stamp `today` for target-needing `needsTodayDate` cards (A017, A108)**

Find (in `handleConfirmTargetAction`):

```ts
  const handleConfirmTargetAction = () => {
    if (!pendingTargetCard) return;
    if (pendingActionRule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rosterSelectionCount !== undefined && chosenTargets.length !== rosterSelectionCount) return;
      playAction(pendingTargetCard.code, undefined, { rosterIds: chosenTargets });
    } else {
      if (!chosenTarget) return;
      playAction(pendingTargetCard.code, chosenTarget);
    }
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };
```

Replace with:

```ts
  const handleConfirmTargetAction = () => {
    if (!pendingTargetCard) return;
    const todayPayload = pendingActionRule?.needsTodayDate ? { today: todayMMDD() } : undefined;
    if (pendingActionRule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rosterSelectionCount !== undefined && chosenTargets.length !== rosterSelectionCount) return;
      playAction(pendingTargetCard.code, undefined, { rosterIds: chosenTargets, ...todayPayload });
    } else {
      if (!chosenTarget) return;
      playAction(pendingTargetCard.code, chosenTarget, todayPayload);
    }
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };
```

- [ ] **Step 3: Filter A108's candidate list to players holding an implemented Action card**

Find (the main `TargetSelector` wiring, `candidates={opponentCandidates}` at the block
handling `pendingTargetCard !== null && dualPickPhase === null && ...`):

```ts
      <TargetSelector
        open={pendingTargetCard !== null && dualPickPhase === null && !pendingActionRule?.needsOutcomeEntry && !pendingActionRule?.needsNumberInput && !pendingActionRule?.needsDrinkCheck && !pendingActionRule?.needsTargetThenOutcome}
        candidates={opponentCandidates}
```

Replace with:

```ts
      <TargetSelector
        open={pendingTargetCard !== null && dualPickPhase === null && !pendingActionRule?.needsOutcomeEntry && !pendingActionRule?.needsNumberInput && !pendingActionRule?.needsDrinkCheck && !pendingActionRule?.needsTargetThenOutcome}
        candidates={
          pendingTargetCard?.code === 'A108'
            ? opponentCandidates.filter((c) => getPlayableActions(state, c.id).length > 0)
            : opponentCandidates
        }
```

Add `getPlayableActions` to the existing import from `../../game/actionRules/registry` (it's
likely already imported for `getActionRule`/`isActionImplemented` — check first with
`grep -n "from '.*registry'" components/room/GameTable.tsx`).

- [ ] **Step 4: Manual verification (no automated UI test infrastructure exists in this project)**

Run the dev server (`npm run dev`), start a 3-player bot test-mode room, get A017 and A108
into a hand (may need to temporarily hand-edit test fixtures or play through — check if this
project already has a debug/dev shortcut for granting a specific card, e.g. via
`docs/superpowers/plans/2026-09-02-group1-cluster-a.md`'s testing section for how prior
clusters manually verified UI). Confirm: playing A017 shows only the opponent-target picker
(no separate date picker — `today` is invisible, stamped silently), and playing A108 shows
only opponents holding at least one Action card.

- [ ] **Step 5: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean (this task has no
new automated tests of its own, since `GameTable.tsx` has no existing test harness in this
project — confirm that's still true with `ls components/room/GameTable.test.tsx` before
assuming so).

- [ ] **Step 6: Commit**

```bash
git add components/room/GameTable.tsx
git commit -m "fix: stamp today for target-needing needsTodayDate cards, filter A108 candidates"
```

---

### Task 10: UI — A028 co-play flow

**Files:**
- Modify: `components/room/GameTable.tsx`

- [ ] **Step 1: Add local state for the co-play flow**

Find (near the existing `const [dualPickPhase, setDualPickPhase] = useState<'first' |
'second' | null>(null);`):

```ts
  const [dualPickPhase, setDualPickPhase] = useState<'first' | 'second' | null>(null);
```

Replace with:

```ts
  const [dualPickPhase, setDualPickPhase] = useState<'first' | 'second' | null>(null);
  const [pendingDoublePartner, setPendingDoublePartner] = useState<CardDisplay | null>(null);
```

- [ ] **Step 2: Add handlers for picking and confirming the partner card**

Add near `handleRequestTarget`:

```ts
  const handleRequestDoublePartner = () => {
    setPendingDoublePartner(null); // opens the partner picker (a hand-tray filtered view, see Step 3)
  };

  const qualifyingPartnerCandidates = me.hand.filter(
    (code) => code !== 'A028' && isQuantityEffectCard(code) && isActionImplemented(code)
  );

  const handlePickDoublePartner = (partnerCode: CardCode) => {
    const card = getCardDisplay(partnerCode);
    setPendingDoublePartner(card);
    setPendingTargetCard(card); // reuses the existing target-selection UI for the partner card
    setChosenTarget(null);
    setChosenTargets([]);
  };

  const handleConfirmDoubledTargetAction = () => {
    if (!pendingDoublePartner) return;
    const rule = getActionRule(pendingDoublePartner.code);
    const todayPayload = rule?.needsTodayDate ? { today: todayMMDD() } : undefined;
    if (rule?.needsRosterSelection) {
      if (chosenTargets.length === 0) return;
      if (rule.rosterSelectionCount !== undefined && chosenTargets.length !== rule.rosterSelectionCount) return;
      playDoubledAction(pendingDoublePartner.code, undefined, { rosterIds: chosenTargets, ...todayPayload });
    } else if (chosenTarget) {
      playDoubledAction(pendingDoublePartner.code, chosenTarget, todayPayload);
    } else {
      playDoubledAction(pendingDoublePartner.code, undefined, todayPayload);
    }
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };

  const handleCancelDoublePartner = () => {
    setPendingDoublePartner(null);
    setPendingTargetCard(null);
    setChosenTarget(null);
    setChosenTargets([]);
  };
```

Add `isQuantityEffectCard` (from `../../game/actionRules/quantityCards`) and
`playDoubledAction` (destructured from the session hook alongside the existing `playAction`)
to the imports/destructuring at the top of the component.

- [ ] **Step 3: Wire a partner-picker modal**

This reuses whatever component the hand tray already uses to show a filtered card list — if
no such generic "pick a card from your own hand" modal exists yet (confirm via `grep -rn
"pick.*hand\|hand.*picker" components/modals/`), add a minimal inline list using the existing
`TargetSelector`-adjacent modal styling, gated on A028 being tapped:

```tsx
      {pendingDoublePartner === null && awaitingDoublePartnerPick && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4">
            <p className="mb-3 text-center font-medium">เลือก Action การ์ดที่จะเพิ่ม Effect เป็น 2 เท่า</p>
            {qualifyingPartnerCandidates.length === 0 ? (
              <p className="text-center text-sm text-gray-500">ไม่มีการ์ดที่ใช้ร่วมกับ A028 ได้ในมือของคุณ</p>
            ) : (
              qualifyingPartnerCandidates.map((code) => (
                <button
                  key={code}
                  className="mb-2 w-full rounded-lg bg-gray-100 p-3 text-left"
                  onClick={() => {
                    setAwaitingDoublePartnerPick(false);
                    handlePickDoublePartner(code);
                  }}
                >
                  {getCardDisplay(code).name}
                </button>
              ))
            )}
            <button className="mt-2 w-full rounded-lg bg-gray-200 p-2" onClick={() => setAwaitingDoublePartnerPick(false)}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
```

Add `const [awaitingDoublePartnerPick, setAwaitingDoublePartnerPick] = useState(false);` next
to `pendingDoublePartner`'s declaration, and set it `true` where A028's hand-tray button is
tapped (wherever `handlePlayActionDirect(card.code)` is currently invoked from the hand tray
— check that call site and branch: `if (card.code === 'A028') { setAwaitingDoublePartnerPick(true); return; }` before the existing dispatch).

Reuse the existing `TargetSelector` block for the partner card's own target/roster input by
routing its `onConfirm` to `handleConfirmDoubledTargetAction` and `onCancel` to
`handleCancelDoublePartner` specifically when `pendingDoublePartner !== null` (add this as an
additional condition alongside the existing `pendingTargetCard !== null` checks — since
`pendingTargetCard` is also set by `handlePickDoublePartner` above, the existing
`TargetSelector` `open` conditions already cover this case; only its `onConfirm`/`onCancel`
need to branch on whether `pendingDoublePartner` is set).

Find (the main `TargetSelector`'s `onConfirm`/`onCancel`, from Task 9's context):

```ts
        onConfirm={handleConfirmTargetAction}
        onCancel={() => {
          setPendingTargetCard(null);
          setChosenTarget(null);
          setChosenTargets([]);
        }}
```

Replace with:

```ts
        onConfirm={pendingDoublePartner ? handleConfirmDoubledTargetAction : handleConfirmTargetAction}
        onCancel={pendingDoublePartner ? handleCancelDoublePartner : () => {
          setPendingTargetCard(null);
          setChosenTarget(null);
          setChosenTargets([]);
        }}
```

- [ ] **Step 4: Add the in-hand warning badge for A028**

Find wherever the hand tray renders each card (search `grep -n "hand.map\|hand.tray\|HandTray"
components/room/GameTable.tsx components/room -r` for the exact render site), and add a
conditional badge when rendering the A028 card specifically:

```tsx
{card.code === 'A028' && qualifyingPartnerCandidates.length === 0 && (
  <span className="absolute -top-1 -right-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
    ต้องมี Action ที่เพิ่ม/ลด/ขโมยไพ่ได้ในมือ
  </span>
)}
```

(Adjust to match whatever the actual hand-tray card wrapper markup looks like — the badge
just needs to render conditionally on `card.code === 'A028'` and an empty
`qualifyingPartnerCandidates`; exact styling classes should match the project's existing
Tailwind conventions in that file rather than the illustrative ones above.)

- [ ] **Step 5: Manual verification**

Run the dev server, get A028 plus a qualifying and non-qualifying card into a hand. Confirm:
tapping A028 with no qualifying partner shows the "no partner" message (or the badge alone
prevents the tap from doing anything meaningful, per your actual wiring); tapping A028 with a
qualifying partner opens the partner list, then the partner's own normal input flow, then both
cards leave the hand together.

- [ ] **Step 6: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean.

- [ ] **Step 7: Commit**

```bash
git add components/room/GameTable.tsx
git commit -m "feat: add A028 co-play UI (partner picker, warning badge)"
```

---

### Task 11: Card-conservation invariant tests + full-cluster regression

**Files:**
- Modify: `game/cardInvariant.test.ts`

- [ ] **Step 1: Write the failing invariant tests**

Add to `game/cardInvariant.test.ts`, following its existing `assertCardConservation`-based
style (check the file for that helper's exact signature first):

```ts
describe('Cluster D card conservation', () => {
  it('A017: found card moves from drawPile to discardPile (or redirect target), nothing lost or duplicated', () => {
    // Build a real started game (buildCanonicalDeck), force A017 into an
    // actor's hand, play it targeting another real player, assert
    // assertCardConservation holds before and after, and that the total
    // card count is unchanged.
  });

  it('A108: forced card moves from the forced player\'s hand to its post-play destination, nothing lost or duplicated', () => {
    // Same shape as above for A108.
  });

  it('A028: doubled effect does not duplicate or lose cards beyond the expected doubled count', () => {
    // Play A028 with a real qualifying quantity card and assert
    // assertCardConservation holds -- doubling a steal/discard moves twice
    // the cards but the TOTAL across all piles/hands is still conserved.
  });

  it('a chained A017 -> A094 sequence conserves cards end to end', () => {
    // Exercises the chainDepth-tracked nested-frame path across two
    // different Cluster D cards in sequence.
  });
});
```

Fill in each test body using the same `buildCanonicalDeck()`/`startGame()` setup pattern
already used elsewhere in `game/cardInvariant.test.ts` (e.g. the existing A064 tests
referenced in Cluster E's plan) — read a couple of the file's existing tests first for the
exact fixture-building idiom before writing these.

- [ ] **Step 2: Run tests to verify they fail or reveal real bugs**

Run: `npx vitest run game/cardInvariant.test.ts --reporter=dot`
Expected: PASS if Tasks 1-10 are correct; investigate and fix in the relevant task's file if
any conservation check fails (a genuine bug found here belongs fixed at its source, not
special-cased in this test file).

- [ ] **Step 3: Full regression + typecheck**

Run: `npx vitest run --reporter=dot` (expect roughly 850+ passed, exact count depends on how
many tests Tasks 1-10 added — record the actual number here) and `npx tsc --noEmit` — both
clean.

- [ ] **Step 4: Commit**

```bash
git add game/cardInvariant.test.ts
git commit -m "test: add card-conservation invariant tests for Cluster D"
```

---

### Task 12: Wrap-up — docs, push, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`

- [ ] **Step 1: Update the handoff doc**

Update the status line and the Group 1 section to mark Cluster D done (172/173), following
the exact structure/tone of the existing Cluster A/B/C/G/E write-ups in that file (each
covers: what the card(s) do, key implementation decisions, rulings confirmed with the user,
real bugs found during review, and current known gaps). Note explicitly that A091/Cluster F
remains the only unimplemented card, and that it has separate in-progress work on
`origin/feature/group1-cluster-f` that still needs to be reconciled with whatever branch this
work lands on.

- [ ] **Step 2: Final full regression**

Run: `npx vitest run --reporter=dot` and `npx tsc --noEmit` — both clean. Record the final
test count in the handoff doc update (matching the style of every prior cluster's "Last
known-good check" note).

- [ ] **Step 3: Commit the docs update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "docs: mark Group 1 Cluster D done in the remaining-work handoff (172/173)"
```

- [ ] **Step 4: Check for upstream divergence before pushing**

Run: `git fetch origin && git log --oneline main..origin/main`. If this has ANY output
(this has happened twice before on this project per the handoff doc — treat it as the
expected case, not a surprise), stop and investigate/reconcile before pushing, following the
same manual-merge approach (not rebase) used for the two prior divergences.

- [ ] **Step 5: Push and open a PR**

```bash
git push -u origin feature/group1-cluster-d
```

Check `which gh && gh auth status` — if available and authenticated, open a PR with `gh pr
create`. If not, hand the user this compare URL to open manually:
`https://github.com/plem7106-glitch/MuffinTime/compare/main...feature/group1-cluster-d?expand=1`

---

## Self-review notes (from writing this plan)

- **Spec coverage**: every per-card behavior, ruling, and data-model change from the design
  spec has a corresponding task (Tasks 1-8 for engine logic, 9-10 for UI, 11 for
  cross-cutting invariants, 12 for wrap-up).
- **Placeholder fix applied during self-review**: Task 7 originally left
  `QUANTITY_EFFECT_CARDS` as an empty `Set` with a "populate this later" comment — a real
  placeholder violation. Fixed by actually running the audit script during planning (105
  matches) and reviewing each against `data/cards.json`'s Thai text, which caught one genuine
  correctness issue not obvious from the mechanical script alone: A084 (hand swap) would
  cancel itself out under double-invocation rather than compounding, unlike every other
  additive draw/discard/steal candidate. The final reviewed 104-code list is baked directly
  into Task 7, Step 4 — no further audit needed before implementing.
- **Type consistency check**: `RecentActionPlay` (Task 1) is used with matching field names
  (`code`, `actorId`, `targetIds`, `customPayload`) in Tasks 1, 6, and 11. `chainDepth` is
  read/written identically (`frame.customPayload?.chainDepth as number | undefined) ?? 0`,
  cap `>= 20`) across Tasks 4, 5, and 6 — verified no drift between them.
- **Known follow-up not covered by this plan**: reconciling `feature/group1-cluster-d` with
  the separate, unmerged `feature/group1-cluster-f` branch (per the Global Constraints
  section) — explicitly out of scope, to be handled whenever both are ready to land.
