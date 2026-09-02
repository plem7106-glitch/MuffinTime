# Group 1 Cluster B (A119) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement A119 "จะรอทำไม?" (Why Wait? — choose another player, skip play forward
to their next turn), bringing the project from 163/173 to 164/173 implemented Action cards.

**Architecture:** A new `jumpToPlayerTurn(state, targetId)` in `game/turn.ts`, calling the
already-merged `beginTurn` for the flag-reset/restriction-clearing tail. A new
`resolveTurnArrival(state, currentId)` in `game/turn.ts` consolidates the
`resolvePendingWinChecks` → win-check → `resolvePendingActionObligations` chain currently
inlined in `lib/session.tsx`'s `advanceAndCheckWin`, so both a normal turn-end and A119's
immediate jump share one tested resolution path. Full design/rationale:
`docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md` — read it before starting.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

---

## Before you start

- Confirm you're on branch `feature/birthday-cards` (not `main`) — `git branch --show-current`.
- Run the baseline: `npx vitest run --reporter=dot` (expect 587 passed, 43 files) and
  `npx tsc --noEmit` (expect clean). If either fails, stop and investigate before adding
  new code.
- Read `docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md` in full, **including
  its "Update (post-merge with `main`)" note** — this branch was recently merged with
  divergent work from another contributor, and `game/turn.ts` now has a `beginTurn`
  function this plan builds on that didn't exist when Cluster A shipped.

---

### Task 1: Extract `resolveTurnArrival`

**Files:**
- Modify: `game/turn.ts`
- Test: `game/turn.test.ts`
- Modify: `lib/session.tsx`

- [ ] **Step 1: Write the failing tests for `resolveTurnArrival`**

In `game/turn.test.ts`, add `resolveTurnArrival` to the import from `./turn` (it currently
reads, in part, `resolvePendingWinChecks, resolvePendingActionObligations, canEndTurn` —
add `resolveTurnArrival` to that same list), and add this new `describe` block anywhere
after the existing `resolvePendingActionObligations` block:

```ts
describe('resolveTurnArrival', () => {
  it('is a no-op when there is nothing pending and no muffin-time win', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: [], hasCalledMuffinTime: false } },
    } as unknown as RoomState;
    expect(resolveTurnArrival(state, 'p1')).toEqual(state);
  });

  it('declares a winner from a pending win check', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1');
  });

  it('declares a winner when the player already called muffin time and still qualifies', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: Array(10).fill('A01'), hasCalledMuffinTime: true } },
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('p1');
  });

  it('resolves a pending action obligation when there is no win', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('playing');
    expect(next.players.p1.mustPlayActionThisTurn).toBe(true);
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not resolve obligations once a pending win check already finished the game', () => {
    const state = {
      status: 'playing',
      muffinTimeTarget: 10,
      players: { p1: { hand: ['A001'], hasCalledMuffinTime: false } },
      pendingWinChecks: [{ sourcePlayerId: 'p1', type: 'hand_nonempty' }],
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolveTurnArrival(state, 'p1');
    expect(next.status).toBe('finished');
    // Untouched -- resolveTurnArrival returns immediately once a win check
    // finishes the game, same short-circuit advanceAndCheckWin had inline.
    expect(next.pendingActionObligations).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/turn.test.ts -t "resolveTurnArrival" --reporter=verbose`
Expected: FAIL — `resolveTurnArrival is not a function` (doesn't exist yet).

- [ ] **Step 3: Implement `resolveTurnArrival`**

In `game/turn.ts`, add this new function right after `resolvePendingActionObligations`
(which currently ends right before `export function clearMuffinTimeDeclaration...` —
insert before that):

```ts
/**
 * The full "a player's turn has just started" resolution chain: pending win
 * checks (A023/A024/A027), then the standing muffin-time win check, then
 * pending action obligations (A035). Shared by lib/session.tsx's
 * advanceAndCheckWin (a normal turn-end) and A119's executeEffect (an
 * immediate mid-turn jump via jumpToPlayerTurn) so both turn-arrival paths
 * run the identical, single-tested chain instead of two copies drifting
 * apart.
 */
export function resolveTurnArrival(state: RoomState, currentId: PlayerId): RoomState {
  const afterPendingChecks = resolvePendingWinChecks(state, currentId);
  if (afterPendingChecks.status === 'finished') return afterPendingChecks;
  if (checkWinnerAtTurnStart(afterPendingChecks, currentId)) {
    return { ...afterPendingChecks, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return resolvePendingActionObligations(afterPendingChecks, currentId);
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/turn.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 5: Refactor `lib/session.tsx`'s `advanceAndCheckWin` to use it**

In `lib/session.tsx`, the import from `../game/turn` currently reads:

```ts
import {
  advanceTurn,
  emergencyForceSkipTurn,
  checkWinnerAtTurnStart,
  resolvePendingWinChecks,
  resolvePendingActionObligations,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
  hasCompletedMainChoice,
  canEndTurn,
} from '../game/turn';
```

Change it to (removing the three now-unused-here imports, adding the new one — keep
`hasCompletedMainChoice`/`canEndTurn` and everything else exactly as-is):

```ts
import {
  advanceTurn,
  emergencyForceSkipTurn,
  resolveTurnArrival,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
  hasCompletedMainChoice,
  canEndTurn,
} from '../game/turn';
```

Find `advanceAndCheckWin` (currently):

```ts
function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  const afterPendingChecks = resolvePendingWinChecks(advanced, currentId);
  if (afterPendingChecks.status === 'finished') return afterPendingChecks;
  if (checkWinnerAtTurnStart(afterPendingChecks, currentId)) {
    return { ...afterPendingChecks, status: 'finished', winnerId: currentId, finishReason: 'normal' };
  }
  return resolvePendingActionObligations(afterPendingChecks, currentId);
}
```

Replace it with:

```ts
function advanceAndCheckWin(room: RoomState): RoomState {
  const advanced = advanceTurn(room);
  const currentId = advanced.turnOrder[advanced.currentTurnIndex];
  return resolveTurnArrival(advanced, currentId);
}
```

- [ ] **Step 6: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (592, up from 587).
Run: `npx tsc --noEmit` — expect clean (confirms no other file referenced the three
imports removed from `lib/session.tsx` in a way that broke).

- [ ] **Step 7: Commit**

```bash
git add game/turn.ts game/turn.test.ts lib/session.tsx
git commit -m "$(cat <<'EOF'
refactor: extract resolveTurnArrival in game/turn.ts

Consolidates the resolvePendingWinChecks -> win-check ->
resolvePendingActionObligations chain that was inlined in
lib/session.tsx's advanceAndCheckWin into one tested function, so
Task 2's jumpToPlayerTurn (A119) can share it instead of duplicating
the chain for an immediate mid-turn turn transition.

Part of Group 1 Cluster B -- see
docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `jumpToPlayerTurn`

**Files:**
- Modify: `game/turn.ts`
- Test: `game/turn.test.ts`

- [ ] **Step 1: Write the failing tests for `jumpToPlayerTurn`**

In `game/turn.test.ts`, add `jumpToPlayerTurn` to the import from `./turn`, and add this
new `describe` block after the `resolveTurnArrival` block from Task 1:

```ts
describe('jumpToPlayerTurn (A119)', () => {
  it('lands on the target and resets their per-turn flags via beginTurn', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false },
        p3: { skipNextTurn: false, placedTrapThisTurn: true, hasDrawnThisTurn: true, hasPlayedActionThisTurn: true },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.currentTurnIndex).toBe(2);
    expect(next.turnPhase).toBe('trap_placement');
    expect(next.players.p3.placedTrapThisTurn).toBe(false);
    expect(next.players.p3.hasDrawnThisTurn).toBe(false);
    expect(next.players.p3.hasPlayedActionThisTurn).toBe(false);
  });

  it('leaves players strictly between the current position and the target untouched', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3', 'p4'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, hasDrawnThisTurn: true },
        p3: { skipNextTurn: false, hasPlayedActionThisTurn: true },
        p4: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p4');
    // p2 and p3 were jumped over -- their pre-existing per-turn state must
    // survive untouched, same treatment advanceTurn gives a skipNextTurn'd
    // player it steps past.
    expect(next.players.p2.hasDrawnThisTurn).toBe(true);
    expect(next.players.p3.hasPlayedActionThisTurn).toBe(true);
  });

  it('honors an existing skipNextTurn flag on the target itself, continuing past them', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: true },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p2');
    expect(next.currentTurnIndex).toBe(2); // landed on p3, not p2
    expect(next.players.p2.skipNextTurn).toBe(false); // cleared on the way past
  });

  it('bumps roundNumber when the jump crosses the start-of-lap boundary', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 2, // p3's turn
      direction: 1,
      roundNumber: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p1'); // wraps past index 0
    expect(next.currentTurnIndex).toBe(0);
    expect(next.roundNumber).toBe(2);
  });

  it('does not bump roundNumber when the jump stays within the current lap', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      roundNumber: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.roundNumber).toBe(1);
  });

  it("clears a GlobalRestriction sourced by the landed-on player", () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: { skipNextTurn: false }, p2: { skipNextTurn: false }, p3: { skipNextTurn: false } },
      globalRestrictions: [{ type: 'no_win', sourcePlayerId: 'p3' }],
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'p3');
    expect(next.globalRestrictions).toEqual([]);
  });

  it('is a no-op when targetId is not found in turnOrder', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: { p1: {}, p2: {}, p3: {} },
    } as unknown as RoomState;
    const next = jumpToPlayerTurn(state, 'nobody');
    expect(next.currentTurnIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/turn.test.ts -t "jumpToPlayerTurn" --reporter=verbose`
Expected: FAIL — `jumpToPlayerTurn is not a function`.

- [ ] **Step 3: Implement `jumpToPlayerTurn`**

In `game/turn.ts`, add this new function right after `resolveTurnArrival` (from Task 1):

```ts
/**
 * A119 "จะรอทำไม?" (Why Wait?): jumps play immediately to targetId's next
 * turn, skipping everyone in between for this cycle with zero side effects
 * (mirrors how advanceTurn's own loop treats a skipNextTurn-flagged player
 * it steps past -- see the design spec's "Design decisions made by
 * precedent" section). Two phases:
 *   1. Walk step-by-step from the current position to targetId's raw slot,
 *      touching nothing along the way.
 *   2. From targetId's slot onward, behave exactly like advanceTurn's own
 *      stepping loop -- if skipNextTurn is set, clear it and keep walking
 *      until landing on someone who isn't flagged.
 * Lands via beginTurn (flag reset + restriction clearing), same as
 * advanceTurn/emergencyForceSkipTurn.
 */
export function jumpToPlayerTurn(state: RoomState, targetId: PlayerId): RoomState {
  const next = cloneState(state);
  const order = next.turnOrder && next.turnOrder.length > 0 ? next.turnOrder : (next.seatOrder ?? []);
  const count = order.length;
  const targetIndex = order.indexOf(targetId);
  if (count <= 0 || targetIndex === -1) return next;

  const dir = next.direction ?? (next.playDirection === 'counterclockwise' ? -1 : 1);
  let index = next.currentTurnIndex;
  let wrapped = false;

  // Phase 1: walk to targetId's raw slot, no side effects along the way.
  let steps = 0;
  while (index !== targetIndex && steps <= count) {
    const nextIdx = (((index + dir) % count) + count) % count;
    if (nextIdx === 0) wrapped = true;
    index = nextIdx;
    steps++;
  }

  // Phase 2: from targetId's slot onward, honor skipNextTurn exactly like
  // advanceTurn's own loop.
  let attempts = 0;
  while (next.players[order[index]]?.skipNextTurn && attempts <= count) {
    next.players[order[index]].skipNextTurn = false;
    const nextIdx = (((index + dir) % count) + count) % count;
    if (nextIdx === 0) wrapped = true;
    index = nextIdx;
    attempts++;
  }

  next.currentTurnIndex = index;
  next.sequenceNumber = (next.sequenceNumber ?? 0) + 1;
  if (wrapped) {
    next.roundNumber = (next.roundNumber ?? 1) + 1;
  }

  const activePlayerId = order[index];
  return beginTurn(next, activePlayerId);
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/turn.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (599, up from 592 after
Task 1).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/turn.ts game/turn.test.ts
git commit -m "$(cat <<'EOF'
feat: add jumpToPlayerTurn to game/turn.ts

Two-phase walk to an arbitrary target's turn slot -- players strictly
in between get zero side effects (mirrors advanceTurn's own treatment
of a skipNextTurn-flagged player it steps past), then honors an
existing skipNextTurn flag on the target itself exactly like
advanceTurn's stepping loop does (ruling confirmed with the user).
Lands via the existing beginTurn (flag reset + restriction clearing).

Part of Group 1 Cluster B -- see
docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A119's card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

- [ ] **Step 1: Write the failing tests for A119's `executeEffect`**

In `game/actionRules/definitions.test.ts`, add at the end of the file (after A166's
`describe` block, following the Cluster A cards):

```ts
describe('A119 (skip play forward to a chosen player\'s next turn)', () => {
  it('jumps the current turn to the chosen target', () => {
    const state = threePlayerState();
    const next = executeActionFrameEffect(state, frameWithTargetAndPayload('A119', 'me', 'p3', {}));
    expect(next.turnOrder[next.currentTurnIndex]).toBe('p3');
  });

  it('is a no-op when no target was picked', () => {
    const state = threePlayerState();
    expect(resolveActionEffect(state, 'A119', 'me')).toEqual(state);
  });
});
```

(This reuses the `frameWithTargetAndPayload` helper already defined near the top of the
test file for A166 -- it builds a frame with a single `targetIds` entry and an empty
`customPayload`, which is exactly what A119 needs even though A119 itself never reads
`customPayload`.)

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A119" --reporter=verbose`
Expected: FAIL — `expected undefined to be 'p3'` (A119 isn't registered yet, and the
no-target case will already trivially pass since a missing rule is itself a no-op — that's
fine, the first assertion is the one that must fail here).

- [ ] **Step 3: Implement A119's card definition**

In `game/actionRules/definitions.ts`:

1. Update the import from `../turn` (currently `import { getNextPlayerId } from '../turn';`)
   to:

```ts
import { getNextPlayerId, jumpToPlayerTurn, resolveTurnArrival } from '../turn';
```

2. Add this block right after A040's entry (from Cluster A), still before the
   `// A064 "Banana Peel"...` comment:

```ts
  A119: {
    code: 'A119', name_en: 'Why Wait?', name_th: 'จะรอทำไม?', kind: 'auto',
    needsTargetSelection: true,
    targetPrompt: 'เลือกผู้เล่นที่จะข้ามไปยังเทิร์นของเขา',
    description_th: 'เลือกผู้เล่นอีก 1 คน แล้วข้ามการเล่นไปยังเทิร์นถัดไปของผู้เล่นคนนั้น',
    executeEffect: (state, frame) => {
      const targetId = frame.targetIds[0];
      if (!targetId) return state;
      const jumped = jumpToPlayerTurn(state, targetId);
      const currentId = jumped.turnOrder[jumped.currentTurnIndex];
      return resolveTurnArrival(jumped, currentId);
    },
  },

```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A119" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (601, up from 599 after
Task 2).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "$(cat <<'EOF'
feat: implement A119 Action card (skip to a chosen player's turn)

Choosing a target immediately jumps play to their next turn via
jumpToPlayerTurn, then runs the same resolveTurnArrival chain a
normal turn-end would (win checks, then pending obligations) for
whoever it lands on.

Part of Group 1 Cluster B -- see
docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md.

164/173 Action cards implemented -- Group 1 Cluster B is done; 9
cards remain across clusters C-G.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wrap-up — docs, push, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`

- [ ] **Step 1: Final full verification**

Run: `npx vitest run --reporter=dot` — expect 601 passed, 0 failed.
Run: `npx tsc --noEmit` — expect clean (no output).

- [ ] **Step 2: Manual smoke-check (optional but recommended)**

A119 mutates the turn/reaction-stack state in a way no prior card has (an immediate
mid-turn jump). If you have a way to run the app locally, play a 3+ player bot/local game,
have the active player play A119 targeting someone 2+ seats away, and confirm: the turn
UI immediately reflects the new active player, the skipped-over players' hands/traps are
untouched, and ending that new player's turn continues normal rotation from there. Not a
blocker if you can't run the app in this environment — note it as unverified in your report
instead.

- [ ] **Step 3: Update the handoff doc**

In `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`:
- Change the `## Status:` line to reflect 164/173 and that Cluster B is done.
- Update the "Branch state" section's test count (601) and card-infrastructure summary to
  mention `jumpToPlayerTurn`/`resolveTurnArrival` (both in `game/turn.ts`, no new
  `PlayerState`/`RoomState` fields).
- Under Group 1's entry, mark Cluster B (A119) done with a short "what shipped and why"
  paragraph, matching the style already used for Cluster A and Group 2/3's write-ups.

- [ ] **Step 4: Commit the doc update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "$(cat <<'EOF'
docs: mark Group 1 Cluster B done in the remaining-work handoff (164/173)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Check `main` hasn't moved, then push**

```bash
git fetch origin
git log --oneline main..origin/main
```

Expected: no output. If there IS output, stop and investigate before pushing — read those
commits first (this branch has already had one significant unplanned divergence with
`main` this session; don't assume it can't happen again).

```bash
git push origin feature/birthday-cards
```

- [ ] **Step 6: Update PR #3's description**

Run: `gh pr view 3 --json state,mergeable,url` to confirm it's open and mergeable. If
`mergeable` isn't `MERGEABLE`, stop and investigate before editing the description --
don't assume a conflict-check result more than a few minutes old is still accurate; GitHub
computes it asynchronously (query again after a few seconds if it reads `UNKNOWN`). If
open, update its body (`gh pr edit 3 --body "..."`) to add a bullet for Cluster B,
following the same format as the existing bullets. If PR #3 is no longer open, open a new
one into `main` instead.
