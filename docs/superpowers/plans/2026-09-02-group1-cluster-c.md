# Group 1 Cluster C (A126, A130) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement A126 "มือปืน" (Gunman) and A130 "เลื่อนตำแหน่ง" (Promotion) — both
"2-hop delegated targeting" Action cards where the actor's chosen player then makes a
further choice before the effect resolves — bringing the project from 166/173 to 168/173
implemented Action cards.

**Architecture:** Extend `RoomState.pendingInteraction` (already used by T10's date-invite
trap) with a new interaction type, `'delegated_target_pick'`, so a non-actor player can be
handed one further choice mid-resolution without touching the reaction-stack. Both cards
resolve to the identical pick shape ("choose one other player, excluding yourself") once
the confirmed rulings are applied, so this is one new engine module
(`game/actionRules/delegatedTargetPick.ts`), one new modal wiring in `GameTable.tsx`
(reusing the existing `TargetSelector` component), and two thin card definitions. Full
design/rationale, including the three rulings confirmed with the user, is at
`docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md` — read it before starting.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

## Global Constraints

- `executeEffect: (state, frame) => RoomState` must stay a pure function of `(state,
  frame)` — no `Date.now()`/`Math.random()` calls inside it. The new interaction's
  `interactionId` is derived from `frame.frameId` (already unique) instead.
- All player-facing prompt/UI copy is Thai, matching every existing card/modal in this
  codebase — see the design spec's exact prompt strings.
- No new `PlayerState`/`RoomState` per-turn or per-game fields are added by this cluster,
  so the reset-checklist pattern (`docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`)
  does not apply here — nothing new needs to be reset in `beginTurn`/`startGame`/
  `resetForPlayAgain`/`restartGame`.
- No turn-transition (`resolveTurnArrival`/`checkWinnerAtTurnStart`) is triggered by either
  card, so the turn-transition-guard pattern from that same doc does not apply here either.

---

## Before you start

- Confirm you're on branch `feature/birthday-cards` (not `main`) — `git branch --show-current`.
- Run the baseline: `npx vitest run --reporter=dot` (expect 618 passed, 43 files) and
  `npx tsc --noEmit` (expect clean, no output). If either fails, stop and investigate before
  adding new code.
- Read `docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md` in full. Key rulings
  to internalize: A126's delegated player (Player 1) may target **any player except
  themselves**, including the original actor. A130's Player 1 picks **both** the recipient
  **and** (implicitly, via a random pick — no card-choice UI) which card, mirroring the
  existing A056 precedent for "no pick-a-card-from-your-hand UI exists yet."

---

### Task 1: `game/actionRules/delegatedTargetPick.ts` (new engine module)

**Files:**
- Modify: `game/types.ts`
- Create: `game/actionRules/delegatedTargetPick.ts`
- Test: `game/actionRules/delegatedTargetPick.test.ts`

**Interfaces:**
- Produces: `initiateDelegatedTargetPick(state: RoomState, frame: StackFrame, prompt:
  string): RoomState` and `resolveDelegatedTargetPick(state: RoomState, interactionId:
  string, responderId: PlayerId, chosenTargetId: PlayerId, rng?: Rng): RoomState` — both
  exported from `game/actionRules/delegatedTargetPick.ts`. Task 2's card definitions call
  `initiateDelegatedTargetPick`; Task 3's `lib/session.tsx` wiring calls
  `resolveDelegatedTargetPick`.

- [ ] **Step 1: Extend `PendingInteraction.type` in `game/types.ts`**

Find (in `game/types.ts`):

```ts
export interface PendingInteraction {
  interactionId: string;
  type: 'date_invite' | string;
```

Replace with:

```ts
export interface PendingInteraction {
  interactionId: string;
  /** date_invite: T10's accept/refuse trap prompt. delegated_target_pick:
   * Cluster C's "the chosen player picks one further player, excluding
   * themselves" step (A126, A130) -- see
   * game/actionRules/delegatedTargetPick.ts. */
  type: 'date_invite' | 'delegated_target_pick' | string;
```

This is a type-only, backward-compatible change (the union already accepted any `string`)
— no test needed on its own; Steps 2-5 below exercise it.

- [ ] **Step 2: Write the failing tests**

Create `game/actionRules/delegatedTargetPick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initiateDelegatedTargetPick, resolveDelegatedTargetPick } from './delegatedTargetPick';
import type { RoomState, StackFrame } from '../types';

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
      me: { name: 'Me', hand: ['A126'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p2: { name: 'Two', hand: ['H1', 'H2', 'H3'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
      p3: { name: 'Three', hand: ['H4', 'H5'], traps: [], connected: true, hasCalledMuffinTime: false, skipNextTurn: false },
    },
  };
}

function testFrame(overrides: Partial<StackFrame> = {}): StackFrame {
  return {
    frameId: 'frame-1', parentFrameId: null, sourceType: 'action', sourceCode: 'A126',
    actorId: 'me', targetIds: ['p2'], targetScope: 'single', eligibleResponderIds: [],
    responses: {}, modifiers: [], status: 'resolving',
    turnContext: { turnIndex: 0, phase: 'main', roundNumber: 0 },
    ...overrides,
  };
}

describe('initiateDelegatedTargetPick', () => {
  it('sets pendingInteraction from the frame, keyed off frameId for a deterministic interactionId', () => {
    const state = threePlayerState();
    const next = initiateDelegatedTargetPick(state, testFrame(), 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ');
    expect(next.pendingInteraction).toEqual({
      interactionId: 'interact-frame-1',
      type: 'delegated_target_pick',
      sourceCardCode: 'A126',
      initiatorId: 'me',
      targetPlayerId: 'p2',
      prompt: 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ',
      timestamp: 0,
    });
  });

  it('no-ops when the frame has no target', () => {
    const state = threePlayerState();
    const next = initiateDelegatedTargetPick(state, testFrame({ targetIds: [] }), 'prompt');
    expect(next.pendingInteraction).toBeUndefined();
  });
});

describe('resolveDelegatedTargetPick', () => {
  function pending(sourceCardCode: string, targetPlayerId = 'p2') {
    let state = threePlayerState();
    state = initiateDelegatedTargetPick(state, testFrame({ sourceCode: sourceCardCode, targetIds: [targetPlayerId] }), 'prompt');
    return state;
  }

  it('A126: the chosen target discards their entire hand, pendingInteraction clears', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3');
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p3.hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(['H4', 'H5']));
  });

  it('A130: exactly one card moves from the delegated player to the chosen target', () => {
    const state = pending('A130', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3', () => 0);
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p2.hand.length).toBe(2);
    expect(next.players.p3.hand.length).toBe(3);
    const movedCard = next.players.p3.hand.find((c) => !['H4', 'H5'].includes(c));
    expect(movedCard).toBeDefined();
    expect(['H1', 'H2', 'H3']).toContain(movedCard);
  });

  it('A130: no-ops the card transfer (but still clears pendingInteraction) when the delegated player has an empty hand', () => {
    let state = pending('A130', 'p2');
    state.players.p2.hand = [];
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'p3', () => 0);
    expect(next.pendingInteraction).toBeNull();
    expect(next.players.p3.hand).toEqual(['H4', 'H5']);
  });

  it('throws when the responder is not the delegated player', () => {
    const state = pending('A126', 'p2');
    expect(() => resolveDelegatedTargetPick(state, 'interact-frame-1', 'p3', 'me')).toThrow(
      'only the delegated player can respond to this choice'
    );
  });

  it('no-ops on a stale/mismatched interactionId', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'not-the-real-id', 'p2', 'p3');
    expect(next.pendingInteraction).toEqual(state.pendingInteraction);
    expect(next.players.p3.hand).toEqual(['H4', 'H5']);
  });

  it('no-ops when chosenTargetId does not exist', () => {
    const state = pending('A126', 'p2');
    const next = resolveDelegatedTargetPick(state, 'interact-frame-1', 'p2', 'not-a-real-player');
    expect(next.pendingInteraction).toEqual(state.pendingInteraction);
  });
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `npx vitest run game/actionRules/delegatedTargetPick.test.ts --reporter=verbose`
Expected: FAIL — the module `./delegatedTargetPick` doesn't exist yet.

- [ ] **Step 4: Implement `game/actionRules/delegatedTargetPick.ts`**

Create `game/actionRules/delegatedTargetPick.ts`:

```ts
import { cloneState } from '../util';
import { discard } from '../pile';
import { stealRandom } from '../transfer';
import type { RoomState, PlayerId, StackFrame, Rng } from '../types';

/**
 * Pauses resolution and hands the choice to frame.targetIds[0] (the player
 * the actor already picked via the normal needsTargetSelection flow) --
 * called from inside executeEffect, so it must stay pure: the
 * interactionId is derived from frame.frameId (already unique) rather than
 * Date.now()/Math.random(), and timestamp is a placeholder -- nothing reads
 * PendingInteraction.timestamp today (it's a T10-only, write-only field).
 */
export function initiateDelegatedTargetPick(state: RoomState, frame: StackFrame, prompt: string): RoomState {
  const next = cloneState(state);
  const targetPlayerId = frame.targetIds[0];
  if (!targetPlayerId || !next.players[targetPlayerId]) return next;
  next.pendingInteraction = {
    interactionId: `interact-${frame.frameId}`,
    type: 'delegated_target_pick',
    sourceCardCode: frame.sourceCode,
    initiatorId: frame.actorId,
    targetPlayerId,
    prompt,
    timestamp: 0,
  };
  return next;
}

/**
 * Resolves a pending delegated_target_pick once the delegated player has
 * chosen. Branches on sourceCardCode for the two different outcomes -- both
 * cards in this cluster share the same pick shape (one other player).
 */
export function resolveDelegatedTargetPick(
  state: RoomState,
  interactionId: string,
  responderId: PlayerId,
  chosenTargetId: PlayerId,
  rng: Rng = Math.random
): RoomState {
  const next = cloneState(state);
  const interaction = next.pendingInteraction;
  if (!interaction || interaction.interactionId !== interactionId) return next;
  if (interaction.type !== 'delegated_target_pick') return next;
  if (interaction.targetPlayerId !== responderId) {
    throw new Error('only the delegated player can respond to this choice');
  }
  if (!next.players[chosenTargetId]) return next;

  const delegatedPlayerId = interaction.targetPlayerId;
  next.pendingInteraction = null;

  if (interaction.sourceCardCode === 'A126') {
    return discard(next, chosenTargetId, next.players[chosenTargetId].hand.length);
  }
  if (interaction.sourceCardCode === 'A130') {
    if (next.players[delegatedPlayerId].hand.length === 0) return next;
    return stealRandom(next, delegatedPlayerId, chosenTargetId, 1, rng);
  }
  return next;
}
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx vitest run game/actionRules/delegatedTargetPick.test.ts --reporter=dot`
Expected: all 8 tests PASS.

- [ ] **Step 6: Full verification**

Run: `npx vitest run --reporter=dot` — expect 626 passed (up from 618), 44 files (up from 43).
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 7: Commit**

```bash
git add game/types.ts game/actionRules/delegatedTargetPick.ts game/actionRules/delegatedTargetPick.test.ts
git commit -m "$(cat <<'EOF'
feat: add delegatedTargetPick engine module for Group 1 Cluster C

Extends RoomState.pendingInteraction (already used by T10's
date-invite trap) with a new 'delegated_target_pick' type, so a
non-actor player can be handed one further "pick another player,
excluding yourself" choice mid-resolution -- without touching the
reaction-stack (Cluster D's territory). A126 and A130 both resolve
to this identical pick shape once the confirmed rulings are applied;
only resolveDelegatedTargetPick's branch on sourceCardCode differs.

Part of Group 1 Cluster C -- see
docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

---

### Task 2: A126 and A130 card definitions

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

**Interfaces:**
- Consumes: `initiateDelegatedTargetPick(state, frame, prompt)` from Task 1
  (`game/actionRules/delegatedTargetPick.ts`).

- [ ] **Step 1: Write the failing tests**

In `game/actionRules/definitions.test.ts`, add this new `describe` block at the end of the
file:

```ts
describe('A126 and A130 (Group 1 Cluster C -- 2-hop delegated targeting)', () => {
  it('A126: sets up a delegated_target_pick interaction naming the chosen player and the right prompt', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A126', 'me', 'p2');
    expect(next.pendingInteraction?.type).toBe('delegated_target_pick');
    expect(next.pendingInteraction?.sourceCardCode).toBe('A126');
    expect(next.pendingInteraction?.initiatorId).toBe('me');
    expect(next.pendingInteraction?.targetPlayerId).toBe('p2');
    expect(next.pendingInteraction?.prompt).toBe('คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ');
  });

  it('A130: sets up a delegated_target_pick interaction naming the chosen player and the right prompt', () => {
    const state = threePlayerState();
    const next = resolveActionEffect(state, 'A130', 'me', 'p3');
    expect(next.pendingInteraction?.type).toBe('delegated_target_pick');
    expect(next.pendingInteraction?.sourceCardCode).toBe('A130');
    expect(next.pendingInteraction?.initiatorId).toBe('me');
    expect(next.pendingInteraction?.targetPlayerId).toBe('p3');
    expect(next.pendingInteraction?.prompt).toBe('คุณได้รับเลื่อนตำแหน่ง! เลือกผู้เล่นที่จะได้รับไพ่ 1 ใบจากคุณ (สุ่มเลือกให้)');
  });
});
```

(Reuses the `threePlayerState` helper already defined near the top of this file, and
`resolveActionEffect`'s existing `(state, code, actorId, targetId)` legacy adapter, which
already supports plain `needsTargetSelection` cards like these two — no new frame-building
helper needed.)

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A126 and A130" --reporter=verbose`
Expected: FAIL — `resolveActionEffect` returns the input state unchanged (A126/A130 aren't
registered yet), so `next.pendingInteraction` is `undefined`.

- [ ] **Step 3: Implement the card definitions**

In `game/actionRules/definitions.ts`:

1. Add a new import line for `initiateDelegatedTargetPick` — add it right after the
   existing `import { restartGame } from '../room';` line:

```ts
import { initiateDelegatedTargetPick } from './delegatedTargetPick';
```

2. Add this block right after A092's entry (at the end of the real card entries, before
   the trailing `// A064 ...` / `// A091 ...` explanatory comments):

```ts
  A126: {
    code: 'A126', name_en: 'Gunman', name_th: 'มือปืน',
    description_th: 'เลือกผู้เล่นอีก 1 คนให้เป็นมือปืน จากนั้นผู้เล่นคนนั้นต้องเลือกผู้เล่นคนใดก็ได้ 1 คนให้ทิ้งไพ่ทั้งหมดในมือ',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่นให้เป็นมือปืน',
    executeEffect: (state, frame) =>
      initiateDelegatedTargetPick(state, frame, 'คุณคือมือปืน! เลือกผู้เล่นให้ทิ้งไพ่ทั้งหมดในมือ'),
  },
  A130: {
    code: 'A130', name_en: 'Promotion', name_th: 'เลื่อนตำแหน่ง',
    description_th: 'เลือกผู้เล่น 1 คน ให้ผู้เล่นคนนั้นเลือกไพ่ของตัวเอง 1 ใบแล้วมอบให้ผู้เล่นอีก 1 คน',
    kind: 'auto', needsTargetSelection: true, targetPrompt: 'เลือกผู้เล่น 1 คน',
    executeEffect: (state, frame) =>
      initiateDelegatedTargetPick(state, frame, 'คุณได้รับเลื่อนตำแหน่ง! เลือกผู้เล่นที่จะได้รับไพ่ 1 ใบจากคุณ (สุ่มเลือกให้)'),
  },
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A126 and A130" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 628 passed (up from 626), 44 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "$(cat <<'EOF'
feat: implement A126 and A130 Action cards (delegated targeting)

Both are thin delegates to initiateDelegatedTargetPick -- the actor
picks Player 1 via the existing needsTargetSelection flow (no new UI
for that half), then executeEffect pauses resolution and hands the
further choice to Player 1 via pendingInteraction instead of
resolving the effect immediately.

Part of Group 1 Cluster C -- see
docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

---

### Task 3: UI wiring — the delegated player's pick modal

**Files:**
- Modify: `lib/session.tsx`
- Modify: `components/modals/TargetSelector.tsx`
- Modify: `components/room/GameTable.tsx`

**Interfaces:**
- Consumes: `resolveDelegatedTargetPick(state, interactionId, responderId, chosenTargetId,
  rng?)` from Task 1.
- Produces: a new `respondToDelegatedTargetPick(interactionId: string, chosenTargetId:
  PlayerId): void` on the `useGameSession()` context, for any future card in this shape to
  reuse.

No new automated tests in this task — this project has no existing test coverage for
`lib/session.tsx` or `components/room/GameTable.tsx` (both are Supabase/React wiring
layers with no unit tests anywhere in the codebase today; check `find . -iname
"session.test.tsx" -o -iname "GameTable*test*"` finds nothing before and after this task).
Coverage here is the full regression suite (unchanged pass count, since this task adds no
new `*.test.ts` files) plus the optional manual smoke check in Step 6.

- [ ] **Step 1: Add `respondToDelegatedTargetPick` to `lib/session.tsx`**

Add a new import line right after the existing `trapRules/engine` import block (currently
ending `} from '../game/trapRules/engine';`):

```ts
import { resolveDelegatedTargetPick as engineResolveDelegatedTargetPick } from '../game/actionRules/delegatedTargetPick';
```

Find (in the `GameSessionContextValue`-shaped interface near the top of the file):

```ts
  respondToTrapInteraction: (interactionId: string, decision: 'accept' | 'refuse') => void;
```

Add right after it:

```ts
  respondToDelegatedTargetPick: (interactionId: string, chosenTargetId: PlayerId) => void;
```

Find the `respondToTrapInteraction` implementation:

```ts
  const respondToTrapInteraction = useCallback(
    (interactionId: string, decision: 'accept' | 'refuse') =>
      run((state) => {
        const responderId = myPlayerId!;
        let next = engineRespondToTrapInteraction(state, interactionId, responderId, decision);
        next = resolveCompletedStackFrames(next);
        return next;
      }),
    [run, myPlayerId, resolveCompletedStackFrames]
  );
```

Add right after it (no `resolveCompletedStackFrames` call needed here — unlike T10's
refuse branch, `resolveDelegatedTargetPick` never pushes a new stack frame, it mutates
state directly):

```ts
  const respondToDelegatedTargetPick = useCallback(
    (interactionId: string, chosenTargetId: PlayerId) =>
      run((state) => {
        const responderId = myPlayerId!;
        return engineResolveDelegatedTargetPick(state, interactionId, responderId, chosenTargetId);
      }),
    [run, myPlayerId]
  );
```

Find the returned context value object's `respondToTrapInteraction,` line and add right
after it:

```ts
    respondToDelegatedTargetPick,
```

- [ ] **Step 2: Make `TargetSelector`'s `onCancel` optional**

In `components/modals/TargetSelector.tsx`, change the destructured props (currently
`onSelect, onConfirm, onCancel, prompt,`) — no change needed to the destructuring line
itself, but change the type annotation:

Find:

```ts
  onSelect: (id: PlayerId) => void;
  onConfirm: () => void;
  onCancel: () => void;
  prompt: string;
```

Replace with:

```ts
  onSelect: (id: PlayerId) => void;
  onConfirm: () => void;
  /** Omit when there is no valid "cancel" for this flow (e.g. a delegated
   * choice that must be resolved to unstick the game) -- the Cancel button
   * and scrim-dismiss are both suppressed. */
  onCancel?: () => void;
  prompt: string;
```

Find:

```tsx
    <BottomSheet open={open} onClose={onCancel}>
```

Replace with:

```tsx
    <BottomSheet open={open} onClose={onCancel ?? (() => {})}>
```

Find:

```tsx
        <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>
```

Replace with:

```tsx
        {onCancel && <SecondaryButton onClick={onCancel}>ยกเลิก</SecondaryButton>}
```

This is backward-compatible — every existing `<TargetSelector onCancel={...}>` caller in
`GameTable.tsx` keeps passing a real handler and is unaffected.

- [ ] **Step 3: Add local pick state and destructure the new session function in `GameTable.tsx`**

Find (the `useGameSession()` destructuring block):

```ts
    initiateTrapInteraction,
    respondToTrapInteraction,
```

Replace with:

```ts
    initiateTrapInteraction,
    respondToTrapInteraction,
    respondToDelegatedTargetPick,
```

Find (near the other `useState` declarations for trap targeting, e.g. right after
`const [chosenTrapTargets, setChosenTrapTargets] = useState<PlayerId[]>([]);`):

```ts
  const [chosenTrapTargets, setChosenTrapTargets] = useState<PlayerId[]>([]);
```

Add right after it:

```ts
  const [delegatedPickChoice, setDelegatedPickChoice] = useState<PlayerId | null>(null);
```

- [ ] **Step 4: Add the new modal, right after the existing `DateInviteModal` block**

Find (in the JSX, the closing of the "12.5 Interactive Trap Modal" block):

```tsx
      {/* 12.5 Interactive Trap Modal (e.g. T10 Date Invite) */}
      <DateInviteModal
        interaction={
          state.pendingInteraction?.type === 'date_invite' &&
          state.pendingInteraction.targetPlayerId === myPlayerId
            ? state.pendingInteraction
            : null
        }
        state={state}
        onAccept={() => {
          if (state.pendingInteraction) {
            respondToTrapInteraction(state.pendingInteraction.interactionId, 'accept');
          }
        }}
        onRefuse={() => {
          if (state.pendingInteraction) {
            respondToTrapInteraction(state.pendingInteraction.interactionId, 'refuse');
          }
        }}
      />
```

Add right after it:

```tsx
      {/* 12.6 Delegated Target Pick Modal (Group 1 Cluster C: A126, A130 --
          the player the actor chose must now pick one further player,
          excluding themselves, before the card's effect resolves) */}
      <TargetSelector
        open={Boolean(
          state.pendingInteraction?.type === 'delegated_target_pick' &&
          state.pendingInteraction.targetPlayerId === myPlayerId
        )}
        candidates={opponentCandidates}
        selectedId={delegatedPickChoice}
        onSelect={setDelegatedPickChoice}
        onConfirm={() => {
          if (state.pendingInteraction && delegatedPickChoice) {
            respondToDelegatedTargetPick(state.pendingInteraction.interactionId, delegatedPickChoice);
            setDelegatedPickChoice(null);
          }
        }}
        prompt={state.pendingInteraction?.prompt ?? ''}
      />
```

No `onCancel` prop is passed — the delegated player must resolve this choice, matching
Step 2's optional-`onCancel` change. `opponentCandidates` is the existing memo (already
excludes `myPlayerId`, which at render time for this modal *is* the delegated player, so
this already correctly excludes them from their own candidate list per the A126 ruling —
no new candidate-building logic needed).

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 628 passed (unchanged from Task 2), 44 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Manual smoke-check (optional but recommended)**

If you have a way to run the app locally with two real or bot-driven sessions: have the
active player play A126 or A130 and pick Player 1. Confirm the active player's own client
now shows nothing extra (they're blocked from drawing/playing/ending turn — check the
"waiting on X" banner from `PresentationBridge` shows up for them), while Player 1's client
shows a target-picker modal with no Cancel button, offering every player except Player 1
themselves. Confirm picking a target resolves correctly: A126 discards the chosen target's
entire hand; A130 moves exactly one card from Player 1's hand to the chosen target and,
if Player 1's hand happens to be empty, the modal still resolves cleanly with no card
moved. Not a blocker if you can't run the app in this environment — note it as unverified
in your report instead.

- [ ] **Step 7: Commit**

```bash
git add lib/session.tsx components/modals/TargetSelector.tsx components/room/GameTable.tsx
git commit -m "$(cat <<'EOF'
feat: wire the delegated target pick modal into GameTable

Adds respondToDelegatedTargetPick to the session context (mirrors
respondToTrapInteraction's shape), makes TargetSelector's onCancel
optional so a must-resolve interaction can suppress the Cancel
button, and renders a new TargetSelector instance gated on
pendingInteraction.type === 'delegated_target_pick' &&
targetPlayerId === myPlayerId -- reusing the existing
opponentCandidates memo, which already excludes myPlayerId (the
delegated player at render time), satisfying the A126 self-exclusion
ruling with no new candidate-building logic.

Part of Group 1 Cluster C -- see
docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

---

### Task 4: Wrap-up — docs, push, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`

- [ ] **Step 1: Final full verification**

Run: `npx vitest run --reporter=dot` — expect 628 passed, 0 failed, 44 files.
Run: `npx tsc --noEmit` — expect clean (no output).

- [ ] **Step 2: Update the handoff doc**

In `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`:
- Change the `## Status:` line and the "166/173 checkpoint" language to reflect 168/173.
- Update the "Branch state" section's test count (628, 44 files) and the card-infrastructure
  bullet list to mention `game/actionRules/delegatedTargetPick.ts` and the
  `pendingInteraction`-extension pattern (no new `PlayerState`/`RoomState` fields).
- Under Group 1's entry, mark Cluster C (A126, A130) done with a short "what shipped and
  why" paragraph, matching the style already used for Clusters A, B, and G — cover the
  `pendingInteraction`-extension decision, the two rulings (A126 self-exclusion, A130's
  Player-1-picks-both-with-a-random-card), and the A056 precedent this reuses.
- Update "Remaining: N clusters, N cards" to reflect Clusters D, E, F (6 cards:
  A017, A028, A094, A108, A064, A091) left, and note the confirmed next order (E → F → D)
  from the ordering discussion, including the reassessed risk note: A091 (Cluster F) turned
  out to need instrumentation across dozens of existing call sites (a forced-vs-voluntary
  distinction threaded through `discard`/steal primitives), comparable in risk to Cluster D,
  not the "lower risk" originally assumed — while A064 (Cluster E) turned out simpler than
  expected (no new `RoomState`/`PlayerState` field needed at all).

- [ ] **Step 3: Commit the doc update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "$(cat <<'EOF'
docs: mark Group 1 Cluster C done in the remaining-work handoff (168/173)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

- [ ] **Step 4: Check `main` hasn't moved, then push**

```bash
git fetch origin
git log --oneline main..origin/main
```

Expected: no output. If there IS output, stop and investigate before pushing — read those
commits first (this branch already had one significant unplanned divergence with `main`
earlier this project; don't assume it can't happen again).

```bash
git push origin feature/birthday-cards
```

- [ ] **Step 5: Update PR #3's description (if `gh` is available in this environment)**

Run: `gh pr view 3 --json state,mergeable,url` to confirm it's open and mergeable. If `gh`
is not installed/authenticated in this environment, skip this step and tell the user to
update the PR description themselves (link: https://github.com/plem7106-glitch/MuffinTime/pull/3).
If `mergeable` isn't `MERGEABLE`, stop and investigate before editing the description —
query again after a few seconds if it reads `UNKNOWN` (GitHub computes it asynchronously).
If open, update its body (`gh pr edit 3 --body "..."`) to add a bullet for Cluster C,
following the same format as the existing bullets. If PR #3 is no longer open, open a new
one into `main` instead.
