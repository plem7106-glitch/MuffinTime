# Group 1 Cluster A (A100, A035, A040) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 3 Action cards in Group 1 Cluster A — A100 (bonus Action plays),
A035 (a table-wide "must play an Action next turn" obligation), and A040 (redirect the
next 3 played Actions into the actor's hand) — bringing the project from 160/173 to
163/173 implemented Action cards.

**Architecture:** Extends two patterns already built for Group 2: a per-player scheduled
check consumed once at turn-start (mirroring `RoomState.pendingWinChecks` /
`resolvePendingWinChecks`) for A035, and simple per-turn `PlayerState` counters/flags
(reset in `advanceTurn`, alongside `hasDrawnThisTurn` etc.) for A100/A035. A040 gets its
own small pure function, `applyActionRedirect`, that intercepts the single call site
where a played Action card is discarded. Full design/rulings:
`docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md` — read it before starting,
it has the "why" behind every decision below.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

---

## Before you start

- Confirm you're on branch `feature/birthday-cards` (not `main`) — `git branch --show-current`.
- Run the baseline: `npx vitest run --reporter=dot` (expect 533 passed) and
  `npx tsc --noEmit` (expect clean). If either fails, stop and investigate before adding
  new code — you need a known-good baseline first.
- Read `docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md` in full.

---

### Task 1: A100 "โรงงานมัฟฟิน" (Muffin Factory) — bonus Action plays

**Files:**
- Modify: `game/types.ts`
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`
- Modify: `game/turn.ts`
- Test: `game/turn.test.ts`
- Modify: `lib/session.tsx`
- Modify: `components/room/GameTable.tsx`
- Modify: `components/room/HandTrayModal.tsx`

- [ ] **Step 1: Add the new `PlayerState` field**

In `game/types.ts`, find the `PlayerState` interface (currently ends with the
`birthdayMMDD?` field just before its closing `}`). Add:

```ts
  /** A100: extra Action plays available this turn, beyond the normal 1.
   * Reset to 0 every turn by advanceTurn, same as hasPlayedActionThisTurn. */
  bonusActionPlaysRemaining?: number;
```

- [ ] **Step 2: Write the failing test for A100's `executeEffect`**

In `game/actionRules/definitions.test.ts`, add at the end of the file (after A166's
`describe` block):

```ts
describe('A100 (grants 2 bonus Action plays this turn)', () => {
  it('adds 2 to bonusActionPlaysRemaining for the actor', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A100', 'me');
    expect(next.players.me.bonusActionPlaysRemaining).toBe(2);
  });

  it('stacks on top of an existing bonus if played again', () => {
    const state = threePlayerState();
    state.players.me.bonusActionPlaysRemaining = 1;
    const next = resolveActionEffect(state, 'A100', 'me');
    expect(next.players.me.bonusActionPlaysRemaining).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A100" --reporter=verbose`
Expected: both tests FAIL with `expected undefined to be 2` (or similar) — A100 doesn't
exist in the registry yet, so `resolveActionEffect` returns the state unchanged.

- [ ] **Step 4: Implement A100's card definition**

In `game/actionRules/definitions.ts`, find the comment block right after A166's entry
that starts with `// A064 "Banana Peel" (Family H1) intentionally NOT included here`.
Insert this new block immediately **before** that comment:

```ts
  // -- Group 1 Cluster A (classification doc's Phase 2 batch, spec:
  // docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md) --

  A100: {
    code: 'A100', name_en: 'Muffin Factory', name_th: 'โรงงานมัฟฟิน', kind: 'auto',
    description_th: 'คุณสามารถเล่น Action เพิ่มอีก 2 ใบในเทิร์นนี้',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      const player = next.players[frame.actorId];
      player.bonusActionPlaysRemaining = (player.bonusActionPlaysRemaining ?? 0) + 2;
      return next;
    },
  },

```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A100" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 6: Write the failing test for the per-turn reset**

In `game/turn.test.ts`, add a new test inside the existing `describe('advanceTurn', ...)`
block (anywhere among the other `it(...)` calls):

```ts
  it('resets bonusActionPlaysRemaining to 0 for the incoming player', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, bonusActionPlaysRemaining: 2 },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.players.p2.bonusActionPlaysRemaining).toBe(0);
  });
```

- [ ] **Step 7: Run the test, confirm it fails**

Run: `npx vitest run game/turn.test.ts -t "resets bonusActionPlaysRemaining" --reporter=verbose`
Expected: FAIL — `expected 2 to be 0` (advanceTurn doesn't touch this field yet).

- [ ] **Step 8: Implement the reset in `advanceTurn` and `emergencyForceSkipTurn`**

In `game/turn.ts`, `advanceTurn` has this block (around line 79-83):

```ts
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
  }
```

Change it to:

```ts
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
  }
```

`emergencyForceSkipTurn` has an identical block (around line 243-247) — make the same
change there too, for consistency (a stuck-game recovery shouldn't leave a stale bonus
count behind):

```ts
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
  }
```

- [ ] **Step 9: Run the test, confirm it passes**

Run: `npx vitest run game/turn.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 10: Wire the bonus-play gate into `lib/session.tsx`'s `playAction`**

In `lib/session.tsx`, find this block inside `playAction`'s callback (around line
448-457):

```ts
        const actorId = myPlayerId!;
        const player = state.players[actorId];
        if (player?.hasPlayedActionThisTurn) return state;
        if (!isActionImplemented(code) || !getPlayableActions(state, actorId).includes(code)) return state;
        if ((code === 'A014' || code === 'A016') && !targetId) return state;
        if (targetId && !state.players[targetId]) return state;
        const afterDiscard = discard(state, actorId, 1, [code]);
        if (afterDiscard.players[actorId]) {
          afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
        }
```

Replace it with:

```ts
        const actorId = myPlayerId!;
        const player = state.players[actorId];
        const usingBonusPlay = Boolean(player?.hasPlayedActionThisTurn) && (player?.bonusActionPlaysRemaining ?? 0) > 0;
        if (player?.hasPlayedActionThisTurn && !usingBonusPlay) return state;
        if (!isActionImplemented(code) || !getPlayableActions(state, actorId).includes(code)) return state;
        if ((code === 'A014' || code === 'A016') && !targetId) return state;
        if (targetId && !state.players[targetId]) return state;
        const afterDiscard = discard(state, actorId, 1, [code]);
        if (afterDiscard.players[actorId]) {
          if (usingBonusPlay) {
            afterDiscard.players[actorId].bonusActionPlaysRemaining = (afterDiscard.players[actorId].bonusActionPlaysRemaining ?? 0) - 1;
          } else {
            afterDiscard.players[actorId].hasPlayedActionThisTurn = true;
          }
        }
```

(Task 3 below will change the `discard(...)` line again for A040 — that's expected, do
not treat it as a conflict.)

- [ ] **Step 11: Update the "already played your action" banner in the UI**

In `components/room/GameTable.tsx`, find where `HandTrayModal` is rendered (search for
`hasPlayedActionThisTurn={Boolean(me.hasPlayedActionThisTurn)}`) and add a new prop right
after it:

```tsx
        hasPlayedActionThisTurn={Boolean(me.hasPlayedActionThisTurn)}
        hasBonusActionPlays={(me.bonusActionPlaysRemaining ?? 0) > 0}
```

In `components/room/HandTrayModal.tsx`:

1. Add `hasBonusActionPlays` to the props destructuring and its type:

```ts
export function HandTrayModal({
  isOpen,
  hand,
  isMyTurn,
  canAct,
  hasDrawnThisTurn,
  hasPlayedActionThisTurn,
  hasBonusActionPlays,
  isTrapPlacementPhase,
  trapsCount,
  onClose,
  onPlayAction,
  onPlaceTrap,
  onRequestTarget,
}: {
  isOpen: boolean;
  hand: CardCode[];
  isMyTurn: boolean;
  canAct: boolean;
  hasDrawnThisTurn?: boolean;
  hasPlayedActionThisTurn?: boolean;
  hasBonusActionPlays?: boolean;
  isTrapPlacementPhase?: boolean;
  trapsCount: number;
  onClose: () => void;
  onPlayAction: (code: CardCode) => void;
  onPlaceTrap: (code: CardCode) => void;
  onRequestTarget: (card: CardDisplay) => void;
}) {
```

2. Find this line (the branch that shows the "already used your action" banner):

```tsx
                  ) : hasPlayedActionThisTurn ? (
```

Change it to:

```tsx
                  ) : hasPlayedActionThisTurn && !hasBonusActionPlays ? (
```

- [ ] **Step 12: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (536, up from 533).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 13: Commit**

```bash
git add game/types.ts game/actionRules/definitions.ts game/actionRules/definitions.test.ts game/turn.ts game/turn.test.ts lib/session.tsx components/room/GameTable.tsx components/room/HandTrayModal.tsx
git commit -m "$(cat <<'EOF'
feat: implement A100 Action card (bonus Action plays)

Adds PlayerState.bonusActionPlaysRemaining, consumed by extending
lib/session.tsx's playAction gate to allow extra plays past the
normal 1-per-turn limit. Reset every turn in advanceTurn/
emergencyForceSkipTurn alongside the other per-turn flags.

Part of Group 1 Cluster A -- see
docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A035 "ออกมาเล่นกันเถอะ" (Come Out to Play) — action obligation

**Files:**
- Modify: `game/types.ts`
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`
- Modify: `game/turn.ts`
- Test: `game/turn.test.ts`
- Modify: `lib/session.tsx`
- Modify: `components/room/GameTable.tsx`

- [ ] **Step 1: Add the new `PlayerState` and `RoomState` fields**

In `game/types.ts`, add to `PlayerState` (right after `bonusActionPlaysRemaining` from
Task 1):

```ts
  /** A035: this player is obligated to play an Action before ending their
   * current turn. Set only by resolvePendingActionObligations when it finds
   * them holding ≥1 Action card at their obligated turn's start. Reset to
   * false every turn by advanceTurn. */
  mustPlayActionThisTurn?: boolean;
```

Add to `RoomState`, right after the `pendingWinChecks?: PendingWinCheck[];` line:

```ts
  /** A035: player IDs still owed an obligation check on their own next turn.
   * Consumed exactly once per player by resolvePendingActionObligations,
   * mirroring PendingWinCheck/resolvePendingWinChecks's lifecycle. */
  pendingActionObligations?: PlayerId[];
```

- [ ] **Step 2: Write the failing tests for `resolvePendingActionObligations`**

In `game/turn.test.ts`, add this new `describe` block right after the existing
`describe('resolvePendingWinChecks', ...)` block, and add `resolvePendingActionObligations`
to the import at the top of the file:

```ts
import {
  advanceTurn,
  isMuffinTimeEligible,
  declareMuffinTime,
  checkWinnerAtTurnStart,
  clearMuffinTimeDeclaration,
  emergencyForceSkipTurn,
  finishByDeckExhaustion,
  resolvePendingWinChecks,
  resolvePendingActionObligations,
} from './turn';
```

```ts
describe('resolvePendingActionObligations', () => {
  it('is a no-op when there are no pending obligations', () => {
    const state = { players: { p1: { hand: [] } } } as unknown as RoomState;
    expect(resolvePendingActionObligations(state, 'p1')).toEqual(state);
  });

  it('is a no-op when the current player has no matching obligation', () => {
    const state = {
      players: { p1: { hand: [] }, p2: { hand: [] } },
      pendingActionObligations: ['p2'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.pendingActionObligations).toEqual(['p2']);
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
  });

  it('sets mustPlayActionThisTurn when the player holds an Action card, and consumes the obligation', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBe(true);
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not set the flag when the player holds no Action card (exempt), but still consumes the obligation', () => {
    const state = {
      players: { p1: { hand: ['T01'] } }, // T01 is a Trap card, not an Action
      pendingActionObligations: ['p1'],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
    expect(next.pendingActionObligations).toEqual([]);
  });

  it('does not set the flag while a no_actions restriction is active table-wide (avoids a soft-lock)', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      pendingActionObligations: ['p1'],
      globalRestrictions: [{ type: 'no_actions', sourcePlayerId: 'p2' }],
    } as unknown as RoomState;
    const next = resolvePendingActionObligations(state, 'p1');
    expect(next.players.p1.mustPlayActionThisTurn).toBeUndefined();
    expect(next.pendingActionObligations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `npx vitest run game/turn.test.ts -t "resolvePendingActionObligations" --reporter=verbose`
Expected: FAIL with `resolvePendingActionObligations is not a function` (or a TypeScript
error if you run tsc first — either way, it doesn't exist yet).

- [ ] **Step 4: Implement `resolvePendingActionObligations`**

In `game/turn.ts`, add this import at the top (it doesn't create a circular dependency —
`data/cards/index.ts` only imports from `../../types/card` and the per-type card list
files):

```ts
import { getCardById } from '../data/cards/index';
```

Add this new function right after `resolvePendingWinChecks` (which ends with
`export function clearMuffinTimeDeclaration...` starting right after it — insert before
that):

```ts
/**
 * Evaluates and consumes every RoomState.pendingActionObligations entry
 * scheduled for `currentId` (A035 -- see RoomState.pendingActionObligations's
 * doc comment in ./types.ts). Called on every turn transition, alongside
 * resolvePendingWinChecks. The obligation is consumed (removed) unconditionally
 * -- if the player holds ≥1 Action card and no table-wide no_actions
 * restriction is active, mustPlayActionThisTurn is set for their current
 * turn; otherwise they're silently exempt.
 */
export function resolvePendingActionObligations(state: RoomState, currentId: PlayerId): RoomState {
  const pending = state.pendingActionObligations;
  if (!pending || !pending.includes(currentId)) return state;

  const next = cloneState(state);
  next.pendingActionObligations = pending.filter((id) => id !== currentId);

  const noActions = next.globalRestrictions?.some((r) => r.type === 'no_actions');
  const hand = next.players[currentId]?.hand ?? [];
  const hasAction = hand.some((code) => getCardById(code)?.type === 'action');
  if (hasAction && !noActions) {
    next.players[currentId].mustPlayActionThisTurn = true;
  }
  return next;
}
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx vitest run game/turn.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 6: Also reset `mustPlayActionThisTurn` every turn**

In `game/turn.ts`, the same two reset blocks touched in Task 1 Step 8 (in `advanceTurn`
and `emergencyForceSkipTurn`) need one more line each. They should now read:

```ts
  if (next.players[activePlayerId]) {
    next.players[activePlayerId].placedTrapThisTurn = false;
    next.players[activePlayerId].hasDrawnThisTurn = false;
    next.players[activePlayerId].hasPlayedActionThisTurn = false;
    next.players[activePlayerId].bonusActionPlaysRemaining = 0;
    next.players[activePlayerId].mustPlayActionThisTurn = false;
  }
```

(Both occurrences — `advanceTurn` and `emergencyForceSkipTurn` — need this same edit.)

Add a test for this in `game/turn.test.ts`'s `describe('advanceTurn', ...)` block:

```ts
  it('resets mustPlayActionThisTurn to false for the incoming player', () => {
    const state = {
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 0,
      direction: 1,
      players: {
        p1: { skipNextTurn: false },
        p2: { skipNextTurn: false, mustPlayActionThisTurn: true },
        p3: { skipNextTurn: false },
      },
    } as unknown as RoomState;
    const next = advanceTurn(state);
    expect(next.players.p2.mustPlayActionThisTurn).toBe(false);
  });
```

Run: `npx vitest run game/turn.test.ts --reporter=dot` — expect all PASS (this one should
already pass once the reset line above is added — write the test, add the line, then
verify, in that order, to keep the red/green discipline even though it's a small change).

- [ ] **Step 7: Write the failing test for A035's `executeEffect`**

In `game/actionRules/definitions.test.ts`, add after the A100 `describe` block from
Task 1:

```ts
describe('A035 (obligates every player to play an Action on their own next turn)', () => {
  it('adds every current player to pendingActionObligations', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A035', 'me');
    expect(next.pendingActionObligations).toEqual(expect.arrayContaining(['me', 'p2', 'p3']));
    expect(next.pendingActionObligations).toHaveLength(3);
  });

  it('does not duplicate a player already queued', () => {
    const state = threePlayerState();
    state.pendingActionObligations = ['p2'];
    const next = resolveActionEffect(state, 'A035', 'me');
    expect(next.pendingActionObligations?.filter((id) => id === 'p2')).toHaveLength(1);
    expect(next.pendingActionObligations).toEqual(expect.arrayContaining(['me', 'p2', 'p3']));
    expect(next.pendingActionObligations).toHaveLength(3);
  });
});
```

- [ ] **Step 8: Run the test, confirm it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A035" --reporter=verbose`
Expected: FAIL — `expected undefined to equal ...` (A035 isn't registered yet).

- [ ] **Step 9: Implement A035's card definition**

In `game/actionRules/definitions.ts`, add this right after A100's entry (from Task 1),
still before the `// A064 "Banana Peel"...` comment:

```ts
  A035: {
    code: 'A035', name_en: 'Come Out to Play', name_th: 'ออกมาเล่นกันเถอะ', kind: 'auto',
    description_th: 'ในเทิร์นถัดไป ผู้เล่นทุกคนที่มี Action อยู่ในมือต้องเล่น Action',
    executeEffect: (state) => {
      const next = cloneState(state);
      const existing = new Set(next.pendingActionObligations ?? []);
      for (const id of Object.keys(next.players)) existing.add(id);
      next.pendingActionObligations = [...existing];
      return next;
    },
  },

```

- [ ] **Step 10: Run the test, confirm it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A035" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 11: Wire `resolvePendingActionObligations` into `advanceAndCheckWin`**

In `lib/session.tsx`, update the import from `../game/turn` to include the new function:

```ts
import {
  advanceTurn,
  emergencyForceSkipTurn,
  checkWinnerAtTurnStart,
  resolvePendingWinChecks,
  resolvePendingActionObligations,
  declareMuffinTime as engineDeclareMuffinTime,
  finishByDeckExhaustion,
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
  return afterPendingChecks;
}
```

Change it to also resolve obligations (order doesn't matter here — the two are
independent — but resolve obligations after the win checks, so a same-turn win doesn't
bother computing an obligation that will never matter):

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

- [ ] **Step 12: Gate `endTurn` on the obligation**

In `lib/session.tsx`, find `endTurn` (currently around line 416-428):

```ts
  const endTurn = useCallback(
    () =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const pid = myPlayerId!;
        const player = state.players[pid];
        if (!player?.hasDrawnThisTurn) return state;
        return advanceAndCheckWin(state);
      }),
    [run, myPlayerId]
  );
```

Add the new guard right after the `hasDrawnThisTurn` check:

```ts
  const endTurn = useCallback(
    () =>
      run((state) => {
        if (state.reactionStack && state.reactionStack.length > 0) return state;
        if (state.pendingResponse || state.pendingInteraction) return state;
        if (state.turnOrder[state.currentTurnIndex] !== myPlayerId) return state;
        const pid = myPlayerId!;
        const player = state.players[pid];
        if (!player?.hasDrawnThisTurn) return state;
        if (player?.mustPlayActionThisTurn && !player.hasPlayedActionThisTurn) return state;
        return advanceAndCheckWin(state);
      }),
    [run, myPlayerId]
  );
```

- [ ] **Step 13: Add the UI banner and disable "จบเทิร์น" while obligated**

In `components/room/GameTable.tsx`, find the `canEndTurn` computation (search for
`const canEndTurn =`):

```ts
        const hasDrawnThisTurn = Boolean(me.hasDrawnThisTurn);
        const canEndTurn =
          isMyTurn &&
          state.turnPhase === 'main' &&
          hasDrawnThisTurn &&
          !pendingResponse &&
          !state.pendingInteraction &&
          (!state.reactionStack || state.reactionStack.length === 0) &&
          !isFinished &&
          !isShuffling &&
          !isRoundTransitionActive;
```

Add one more condition:

```ts
        const hasDrawnThisTurn = Boolean(me.hasDrawnThisTurn);
        const mustPlayActionFirst = Boolean(me.mustPlayActionThisTurn) && !me.hasPlayedActionThisTurn;
        const canEndTurn =
          isMyTurn &&
          state.turnPhase === 'main' &&
          hasDrawnThisTurn &&
          !mustPlayActionFirst &&
          !pendingResponse &&
          !state.pendingInteraction &&
          (!state.reactionStack || state.reactionStack.length === 0) &&
          !isFinished &&
          !isShuffling &&
          !isRoundTransitionActive;
```

Now add a banner. Find the "Declare Muffin Time" banner block (search for `canDeclare &&`):

```tsx
        {/* Declare Muffin Time Button (Compact banner if eligible) */}
        {canDeclare && (
          <button
            type="button"
            onClick={declareMuffinTime}
            className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-amber-500/20 transition-all hover:opacity-95 active:scale-[0.98] animate-bounce shrink-0"
          >
            <span>🧁 ประกาศ MUFFIN TIME! (มีไพ่ครบ 10 ใบ)</span>
          </button>
        )}
```

Add a sibling block right after it (still inside the same parent `div`):

```tsx
        {/* A035 "Come Out to Play" obligation banner -- blocks ending this turn */}
        {isMyTurn && mustPlayActionFirst && (
          <div className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 shrink-0">
            <span>ต้องเล่น Action ก่อนจบเทิร์นนี้ (A035)</span>
          </div>
        )}
```

- [ ] **Step 14: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (544, up from 536 after
Task 1).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 15: Commit**

```bash
git add game/types.ts game/actionRules/definitions.ts game/actionRules/definitions.test.ts game/turn.ts game/turn.test.ts lib/session.tsx components/room/GameTable.tsx
git commit -m "$(cat <<'EOF'
feat: implement A035 Action card (table-wide Action obligation)

Adds RoomState.pendingActionObligations (a sibling of
pendingWinChecks) and PlayerState.mustPlayActionThisTurn. On each
obligated player's own next turn, if they hold an Action card and no
table-wide no_actions restriction is active (avoids a soft-lock),
they're blocked from ending their turn until they play one -- ruling
confirmed directly with the user (hard-enforced, not honor-system).

Part of Group 1 Cluster A -- see
docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A040 "ฉันชอบมัน!" (I Love It!) — action redirect

**Files:**
- Modify: `game/types.ts`
- Modify: `game/turnFlow.ts`
- Test: `game/turnFlow.test.ts`
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`
- Modify: `lib/session.tsx`

- [ ] **Step 1: Add the new `RoomState` field**

In `game/types.ts`, add to `RoomState`, right after `pendingActionObligations` from
Task 2:

```ts
  /** A040: an active "next N Action plays redirect to my hand" effect.
   * null/undefined when inactive. Cleared to null when remaining hits 0.
   * Any player's Action play counts, not just the actor who set it up. */
  actionRedirect?: { toPlayerId: PlayerId; remaining: number } | null;
```

- [ ] **Step 2: Write the failing tests for `applyActionRedirect`**

In `game/turnFlow.test.ts`, update the import at the top and add a new `describe` block:

```ts
import { skipTurn, reverseDirection, changeMuffinTarget, applyActionRedirect } from './turnFlow';
```

```ts
describe('applyActionRedirect', () => {
  it('discards normally when no redirect is active', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      discardPile: [],
      actionRedirect: null,
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.discardPile).toEqual(['A001']);
  });

  it("redirects the played card into the redirect target's hand instead of discarding", () => {
    const state = {
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 3 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p2.hand).toEqual(['A001']);
    expect(next.discardPile).toEqual([]);
    expect(next.actionRedirect).toEqual({ toPlayerId: 'p2', remaining: 2 });
  });

  it('clears the redirect once its count reaches 0', () => {
    const state = {
      players: { p1: { hand: ['A001'] }, p2: { hand: [] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 1 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.actionRedirect).toBeNull();
  });

  it('discards normally once remaining is already 0, even if the redirect object is still present', () => {
    const state = {
      players: { p1: { hand: ['A001'] } },
      discardPile: [],
      actionRedirect: { toPlayerId: 'p2', remaining: 0 },
    } as unknown as RoomState;
    const next = applyActionRedirect(state, 'p1', 'A001');
    expect(next.discardPile).toEqual(['A001']);
  });
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `npx vitest run game/turnFlow.test.ts -t "applyActionRedirect" --reporter=verbose`
Expected: FAIL — `applyActionRedirect is not a function`.

- [ ] **Step 4: Implement `applyActionRedirect`**

In `game/turnFlow.ts`, the current file is:

```ts
import { cloneState } from './util';
import type { RoomState, PlayerId } from './types';

export function skipTurn(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state: RoomState): RoomState {
  const next = cloneState(state);
  next.direction = (next.direction * -1) as 1 | -1;
  return next;
}

export function changeMuffinTarget(state: RoomState, n: number): RoomState {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}
```

Change the imports and add the new function at the end:

```ts
import { cloneState } from './util';
import { discard } from './pile';
import type { RoomState, PlayerId, CardCode } from './types';

export function skipTurn(state: RoomState, playerId: PlayerId): RoomState {
  const next = cloneState(state);
  next.players[playerId].skipNextTurn = true;
  return next;
}

export function reverseDirection(state: RoomState): RoomState {
  const next = cloneState(state);
  next.direction = (next.direction * -1) as 1 | -1;
  return next;
}

export function changeMuffinTarget(state: RoomState, n: number): RoomState {
  const next = cloneState(state);
  next.muffinTimeTarget = n;
  return next;
}

/** Where a played Action card's post-resolution destination goes -- normally
 * the discard pile, but redirected into actionRedirect.toPlayerId's hand for
 * A040's "next 3 played Actions enter my hand" effect (any player's play
 * counts, decremented here). Falls back to a normal discard once the
 * redirect is inactive or exhausted. Called from lib/session.tsx's
 * playAction at the exact point the played card leaves the actor's hand. */
export function applyActionRedirect(state: RoomState, actorId: PlayerId, code: CardCode): RoomState {
  const redirect = state.actionRedirect;
  if (!redirect || redirect.remaining <= 0) {
    return discard(state, actorId, 1, [code]);
  }
  const next = cloneState(state);
  const hand = next.players[actorId].hand;
  const pos = hand.indexOf(code);
  if (pos === -1) {
    throw new Error(`applyActionRedirect: card ${code} not found in hand`);
  }
  hand.splice(pos, 1);
  next.players[redirect.toPlayerId].hand.push(code);
  next.actionRedirect = redirect.remaining - 1 > 0 ? { ...redirect, remaining: redirect.remaining - 1 } : null;
  return next;
}
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx vitest run game/turnFlow.test.ts --reporter=dot`
Expected: all tests in the file PASS.

- [ ] **Step 6: Write the failing test for A040's `executeEffect`**

In `game/actionRules/definitions.test.ts`, add after the A035 `describe` block from
Task 2:

```ts
describe("A040 (redirects the next 3 played Actions into the actor's hand)", () => {
  it('activates a 3-count redirect targeting the actor', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A040', 'me');
    expect(next.actionRedirect).toEqual({ toPlayerId: 'me', remaining: 3 });
  });

  it('overwrites (does not stack with) an existing active redirect', () => {
    const state = threePlayerState();
    state.actionRedirect = { toPlayerId: 'p2', remaining: 1 };
    const next = resolveActionEffect(state, 'A040', 'me');
    expect(next.actionRedirect).toEqual({ toPlayerId: 'me', remaining: 3 });
  });
});
```

- [ ] **Step 7: Run the test, confirm it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A040" --reporter=verbose`
Expected: FAIL — `expected undefined to equal {...}` (A040 isn't registered yet).

- [ ] **Step 8: Implement A040's card definition**

In `game/actionRules/definitions.ts`, add this right after A035's entry (from Task 2),
still before the `// A064 "Banana Peel"...` comment:

```ts
  A040: {
    code: 'A040', name_en: 'I Love It!', name_th: 'ฉันชอบมัน!', kind: 'auto',
    description_th: 'Action 3 ใบถัดไปที่ถูกเล่น เมื่อใช้เสร็จแล้วจะเข้ามาอยู่ในมือคุณแทนที่จะลงกองทิ้ง',
    executeEffect: (state, frame) => {
      const next = cloneState(state);
      next.actionRedirect = { toPlayerId: frame.actorId, remaining: 3 };
      return next;
    },
  },

```

- [ ] **Step 9: Run the test, confirm it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A040" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 10: Wire `applyActionRedirect` into `lib/session.tsx`'s `playAction`**

`game/turnFlow.ts` is not currently imported anywhere in `lib/session.tsx` (confirmed by
grep — `skipTurn`/`reverseDirection` are only used inside `game/actionRules/definitions.ts`,
not here). Add a new import line, placed with the other `../game/*` imports near the top
of the file (e.g. right after the `../game/pile` import):

```ts
import { applyActionRedirect } from '../game/turnFlow';
```

Find the line (inside `playAction`, changed already in Task 1):

```ts
        const afterDiscard = discard(state, actorId, 1, [code]);
```

Change it to:

```ts
        const afterDiscard = applyActionRedirect(state, actorId, code);
```

Leave everything else in that block (the `usingBonusPlay` handling from Task 1) exactly
as-is — only this one line changes.

- [ ] **Step 11: Full verification**

Run: `npx vitest run --reporter=dot` — expect all tests passing (550, up from 544 after
Task 2).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 12: Commit**

```bash
git add game/types.ts game/turnFlow.ts game/turnFlow.test.ts game/actionRules/definitions.ts game/actionRules/definitions.test.ts lib/session.tsx
git commit -m "$(cat <<'EOF'
feat: implement A040 Action card (redirect next 3 Action plays)

Adds RoomState.actionRedirect and a new pure applyActionRedirect
helper (game/turnFlow.ts) that intercepts the single call site where
a played Action card is discarded (lib/session.tsx's playAction),
redirecting it into the redirect target's hand instead. Applies to
any player's Action play, not just the actor who set it up -- ruling
confirmed directly with the user.

Part of Group 1 Cluster A -- see
docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md.

163/173 Action cards implemented -- Group 1 Cluster A is done; 10
cards remain across clusters B-G.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wrap-up — docs, push, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`

- [ ] **Step 1: Final full verification**

Run: `npx vitest run --reporter=dot` — expect 550 passed, 0 failed.
Run: `npx tsc --noEmit` — expect clean (no output).

- [ ] **Step 2: Update the handoff doc**

In `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`:
- Change the `## Status:` line to reflect 163/173 and that Cluster A is done.
- Update the "Branch state" section's test count (550) and card-infrastructure summary to
  mention `bonusActionPlaysRemaining`/`pendingActionObligations`/`actionRedirect`.
- Under Group 1's entry, note Cluster A (A100/A035/A040) as done, with a one-line summary
  of what shipped, matching the style already used for the Group 2/Group 3 write-ups
  earlier in the same file (each finished cluster gets a short "what shipped and why"
  paragraph, not just a checkbox).

- [ ] **Step 3: Commit the doc update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "$(cat <<'EOF'
docs: mark Group 1 Cluster A done in the remaining-work handoff (163/173)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Check `main` hasn't moved, then push**

```bash
git fetch origin
git log --oneline main..origin/main
```

Expected: no output (nothing new landed on `main`). If there IS output, stop and
investigate before pushing — read those commits first.

```bash
git push origin feature/birthday-cards
```

- [ ] **Step 5: Update PR #3's description**

Run: `gh pr view 3 --json state,url` to confirm it's still open. If it's open, update its
body (via `gh pr edit 3 --body "..."`) to add a bullet for Cluster A, following the same
format as the existing bullets (card names, what infrastructure was added, test count).
If PR #3 is no longer open, open a new one into `main` instead
(`gh pr create --base main --head feature/birthday-cards ...`).
