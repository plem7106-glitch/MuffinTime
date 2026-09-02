# Group 1 Cluster E (A064) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement A064 "เปลือกกล้วย" (Banana Peel — plant this card face-up in the draw
pile; whoever draws it keeps it and discards 3 other cards), bringing the project from
167/173 to 168/173 implemented Action cards.

**Architecture:** No new `RoomState`/`PlayerState` fields — only one physical copy of A064
exists in the whole 231-card deck, so its position never needs separate tracking. A064's
`executeEffect` moves the card from the top of `discardPile` (where a normal Action play
already puts it) into `drawPile` at a random position. `game/pile.ts`'s `draw()` gets a
small hook: when the popped card is literally `'A064'`, it triggers discarding 3 other
random cards (excluding A064 itself) from the same player's hand, on top of the normal
push-into-hand behavior `draw()` already does. Full design/rationale:
`docs/superpowers/specs/2026-09-03-group1-cluster-e-design.md` — read it before starting.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router). No new dependencies.

## Global Constraints

- No new `RoomState`/`PlayerState` fields for this cluster — if a task in this plan seems
  to need one, stop and re-read the design spec; it doesn't.
- A064's `executeEffect` and the new `draw()` hook call `Math.random()` directly — this
  matches an established, existing pattern in this codebase (A007's coin-flip card and
  A043's random-insert card both already do this) and is **not** a purity violation to fix.
  Don't thread an injectable `rng` through either of these two additions; the design spec
  explains why.
- Card text (Thai, from `data/cards.json`, must be copied verbatim, never rephrased):
  `description_th: 'ใส่ไพ่ใบนี้กลับเข้าไปในกองจั่วโดยหงายหน้า ผู้เล่นที่จั่วเจอจะเก็บไพ่ใบนี้ไว้และต้องทิ้งไพ่อื่น 3 ใบ'`
  `name_en: 'Banana Peel'`, `name_th: 'เปลือกกล้วย'`.
- No new UI/presentation work — confirmed with the user, out of scope for this cluster.

---

## Before you start

- Confirm you're on branch `feature/group1-cluster-e` (forked from `main` at the Cluster C
  merge, commit `43d0d40`, plus this cluster's own design-spec commit `3f3a0e9`) — `git
  branch --show-current`. Do **not** work directly on `main` for this cluster's code (docs
  updates earlier this session went straight to `main`; code changes for a new cluster
  follow this project's established branch-then-PR pattern, same as Clusters A/B/C/G).
- Run the baseline: `npx vitest run --reporter=dot` (expect 808 passed, 60 files) and `npx
  tsc --noEmit` (expect clean, no output). If either fails, stop and investigate before
  adding new code.
- Read `docs/superpowers/specs/2026-09-03-group1-cluster-e-design.md` in full — it documents
  two rulings confirmed with the user (random insertion position, no new UI for the "หงายหน้า"
  face-up text) and a checked cross-cluster interaction with A040's `actionRedirect` (a
  legitimate no-op path, not a gap).
- Before pushing anything at the end: `git fetch origin && git log --oneline main..origin/main`
  — if this has ANY output, stop and investigate before opening a PR. This project has hit
  unreviewed direct-to-`main` pushes from a collaborator three times already (see the
  handoff doc's "Branch state" section) — treat a fourth occurrence as the expected case to
  check for, not a surprise.

---

### Task 1: `draw()`'s A064 hook

**Files:**
- Modify: `game/pile.ts`
- Test: `game/pile.test.ts`

**Interfaces:**
- Produces: `draw(state, playerId, n, _rng?)` gains new behavior (unchanged signature) —
  drawing the literal card code `'A064'` also discards up to 3 other random cards from the
  same player's hand. No new exported function needed for Task 2 to depend on.

- [ ] **Step 1: Write the failing tests**

In `game/pile.test.ts`, add these three `it` blocks inside the existing `describe('draw', ...)`
block (after the existing three tests, before its closing `});`). `drawPile` is popped from
the end (`Array.prototype.pop()` — the last element is drawn first), which each test's
comment calls out where the exact pop order matters:

```ts
  it('drawing A064 also discards 3 other random cards from the same hand, keeping A064', () => {
    // pop() takes 'A064' (the last element) on the only draw.
    const state = {
      drawPile: ['H1', 'H2', 'H3', 'H4', 'A064'],
      discardPile: [],
      players: { p1: { hand: ['H5', 'H6', 'H7'] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 1);
    expect(next.players.p1.hand).toEqual(['A064']);
    expect(next.discardPile.length).toBe(3);
    expect(next.discardPile).not.toContain('A064');
    expect(new Set(next.discardPile)).toEqual(new Set(['H5', 'H6', 'H7']));
  });

  it('A064 hook clamps to however many other cards are actually in hand (fewer than 3)', () => {
    const state = {
      drawPile: ['A064'],
      discardPile: [],
      players: { p1: { hand: ['H1'] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 1);
    expect(next.players.p1.hand).toEqual(['A064']);
    expect(next.discardPile).toEqual(['H1']);
  });

  it('a multi-card draw where A064 is drawn mid-batch only discards cards already in hand at that moment -- a card drawn afterward in the same batch is untouched', () => {
    // pop() order for this drawPile, 4 draws: 'H2', 'H1', 'A064', 'LATER2' --
    // A064 is the 3rd draw, LATER2 the 4th (drawn strictly after A064's
    // discard-3 trigger already ran).
    const state = {
      drawPile: ['LATER1', 'LATER2', 'A064', 'H1', 'H2'],
      discardPile: [],
      players: { p1: { hand: [] } },
    } as unknown as RoomState;
    const next = draw(state, 'p1', 4);
    expect(next.players.p1.hand).toEqual(['A064', 'LATER2']);
    expect(next.discardPile.length).toBe(2);
    expect(new Set(next.discardPile)).toEqual(new Set(['H1', 'H2']));
  });
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run game/pile.test.ts -t "A064" --reporter=verbose`
Expected: FAIL — drawing `'A064'` today behaves like drawing any other card (no discard
triggered), so `next.discardPile.length` is `0`, not `3`, in each new test.

- [ ] **Step 3: Implement the hook**

In `game/pile.ts`, find:

```ts
export function draw(state: RoomState, playerId: PlayerId, n: number, _rng?: Rng): RoomState {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}
```

Replace with:

```ts
export function draw(state: RoomState, playerId: PlayerId, n: number, _rng?: Rng): RoomState {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
    if (card === 'A064') {
      next = discardOthersAfterBananaPeel(next, playerId);
    }
  }
  return next;
}

/**
 * A064 "เปลือกกล้วย": whoever draws it keeps it (already true -- the push
 * above puts it in their hand) and discards 3 other cards, chosen at
 * random, excluding A064 itself. Only one physical copy of A064 exists in
 * the whole 231-card deck, so excluding it by card code is exact -- no
 * index-tracking needed. Clamps to however many other cards they actually
 * hold (0-3) rather than throwing if they have fewer than 3 others.
 */
function discardOthersAfterBananaPeel(state: RoomState, playerId: PlayerId): RoomState {
  const hand = state.players[playerId].hand;
  const others = hand.filter((code) => code !== 'A064');
  const count = Math.min(3, others.length);
  const indices = pickRandomIndices(others.length, count, Math.random);
  const toDiscard = indices.map((i) => others[i]);
  return discard(state, playerId, count, toDiscard);
}
```

No new imports needed — `pickRandomIndices` is already imported from `./util` at the top
of this file, and `discard` is defined later in this same file (function declarations are
hoisted, so calling it from inside `draw()`, which is defined earlier in the file, is fine).

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run game/pile.test.ts --reporter=dot`
Expected: all tests in the file PASS (the 3 new ones plus every pre-existing `draw`/
`drawFromBottom`/`discard`/`reshuffleDiscardIntoDraw` test unchanged).

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 811 passed (up from 808), 60 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/pile.ts game/pile.test.ts
git commit -m "$(cat <<'EOF'
feat: add A064 draw-pile hook to draw()

Whoever draws A064 discards 3 other random cards from their hand,
excluding A064 itself -- only one physical copy exists in the whole
deck, so excluding it by card code is exact. Fires identically
regardless of what caused the draw (a player's own draw, another
card's forced multi-draw, a bot's draw), since the hook lives in the
one shared draw() primitive every draw path already funnels through.

Part of Group 1 Cluster E -- see
docs/superpowers/specs/2026-09-03-group1-cluster-e-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

---

### Task 2: A064's card definition

**Files:**
- Modify: `game/actionRules/definitions.ts`
- Test: `game/actionRules/definitions.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — this task's own test only exercises `executeEffect`
  directly (moving the card from `discardPile` into `drawPile`), not the `draw()` hook.

- [ ] **Step 1: Write the failing test**

In `game/actionRules/definitions.test.ts`, add this new `describe` block at the end of the
file:

```ts
describe('A064 (plant Banana Peel face-up in the draw pile)', () => {
  it('moves the card from the top of discardPile into drawPile at a random position', () => {
    const state = threePlayerState();
    state.discardPile = ['H1', 'A064'];
    const before = state.drawPile.length;
    const next = resolveActionEffect(state, 'A064', 'me');
    expect(next.discardPile).toEqual(['H1']);
    expect(next.drawPile.length).toBe(before + 1);
    expect(next.drawPile).toContain('A064');
  });

  it('no-ops if A064 is not actually on top of discardPile (defensive)', () => {
    const state = threePlayerState();
    state.discardPile = ['A064', 'H1'];
    const next = resolveActionEffect(state, 'A064', 'me');
    expect(next.discardPile).toEqual(['A064', 'H1']);
    expect(next.drawPile).toEqual(state.drawPile);
  });
});
```

(Reuses the `threePlayerState` helper already defined near the top of this file, and
`resolveActionEffect`'s existing `(state, code, actorId)` legacy adapter — A064 has no
target and no `customPayload`, so this is the simplest possible call shape.)

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A064" --reporter=verbose`
Expected: FAIL — `resolveActionEffect` returns the input state unchanged (A064 isn't
registered yet), so the first test's assertions on `discardPile`/`drawPile` don't hold.

- [ ] **Step 3: Implement the card definition**

In `game/actionRules/definitions.ts`, add this block right after A130's entry (at the end
of the real card entries added by Cluster C, before the trailing `// A091 ...` explanatory
comment — the `// A064 ...` comment that currently explains why this card was deferred
should be deleted, since it's no longer deferred):

```ts
  A064: {
    code: 'A064', name_en: 'Banana Peel', name_th: 'เปลือกกล้วย',
    description_th: 'ใส่ไพ่ใบนี้กลับเข้าไปในกองจั่วโดยหงายหน้า ผู้เล่นที่จั่วเจอจะเก็บไพ่ใบนี้ไว้และต้องทิ้งไพ่อื่น 3 ใบ',
    kind: 'auto',
    executeEffect: (state) => {
      const next = cloneState(state);
      if (next.discardPile[next.discardPile.length - 1] !== 'A064') return next;
      next.discardPile.pop();
      const pos = Math.floor(Math.random() * (next.drawPile.length + 1));
      next.drawPile.splice(pos, 0, 'A064');
      return next;
    },
  },
```

Find and delete this now-stale comment block (it currently sits near the end of the file,
right before A092's `// A091 ...` sibling comment):

```ts
  // A064 "Banana Peel" (Family H1) intentionally NOT included here -- needs a
  // deferred-trigger mechanism (mark a specific card in the draw pile so
  // drawing it later fires an extra effect when someone later draws it). No
  // existing hook for that in the draw flow (game/pile.ts's draw / lib/session.tsx's
  // drawCard) -- touching draw() itself, the most-called primitive in the game, puts
  // this in the same risk class as the Phase 2 engine batch, not a definitions-only
  // addition. See classification doc's Phase 2 list.
```

`cloneState` is already imported in this file (`import { cloneState, shuffle } from
'../util';`) — no new import needed.

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npx vitest run game/actionRules/definitions.test.ts -t "A064" --reporter=verbose`
Expected: both tests PASS.

- [ ] **Step 5: Full verification**

Run: `npx vitest run --reporter=dot` — expect 813 passed (up from 811 after Task 1), 60 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add game/actionRules/definitions.ts game/actionRules/definitions.test.ts
git commit -m "$(cat <<'EOF'
feat: implement A064 Action card (plant Banana Peel in the draw pile)

executeEffect moves the card from the top of discardPile (where a
normal Action play already put it) into drawPile at a random
position, matching the existing A043 random-insert precedent and
A007's existing direct-Math.random() convention -- not a purity
violation, both patterns already exist in this file.

Part of Group 1 Cluster E -- see
docs/superpowers/specs/2026-09-03-group1-cluster-e-design.md.

168/173 Action cards implemented -- Group 1 Cluster E is done; 5
cards remain across clusters F, D.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

---

### Task 3: Card-conservation check across the full sequence

**Files:**
- Test: `game/cardInvariant.test.ts`

**Interfaces:**
- Consumes: `resolveActionEffect` (already imported via `./actionRules/registry` if not
  already present in this file — check the existing imports first) for playing A064, and
  `draw`/`restartGame` (both already imported in this file) for the draw-trigger and
  reshuffle checks.

- [ ] **Step 1: Write the failing test**

In `game/cardInvariant.test.ts`, first check whether `resolveActionEffect` is already
imported. If not, add it — find:

```ts
import { draw, discard } from './pile';
```

and add a new import line right after it:

```ts
import { resolveActionEffect } from './actionRules/registry';
```

Then add this new `it` inside the existing `describe('card conservation invariant', ...)`
block, right after the existing "preserves every card through draw, discard, trap,
transfer, swap, and reaction metadata" test:

```ts
  it('preserves every card through A064 being played, planted, drawn by someone else, and its own discard-3 trigger', () => {
    let state = startedRoom();
    // Give p1 an A064 to play, wherever it currently sits.
    const a064Index = state.drawPile.indexOf('A064');
    state.drawPile.splice(a064Index, 1);
    state.players.p1.hand.push('A064');
    assertCardConservation(state);

    // Simulate the normal play-a-card flow: A064 moves to the top of discardPile
    // (as lib/session.tsx's playAction already does for every Action card), then
    // its own executeEffect plants it into drawPile.
    state.players.p1.hand = state.players.p1.hand.filter((c) => c !== 'A064');
    state.discardPile.push('A064');
    state = resolveActionEffect(state, 'A064', 'p1');
    assertCardConservation(state);
    expect(state.drawPile).toContain('A064');

    // Move A064 to the very top of drawPile (drawPile.pop() reads the end) so the
    // next draw deterministically draws it, then have p2 draw it.
    const plantedIndex = state.drawPile.indexOf('A064');
    state.drawPile.splice(plantedIndex, 1);
    state.drawPile.push('A064');
    state = draw(state, 'p2', 1);
    assertCardConservation(state);
    expect(state.players.p2.hand).toContain('A064');
  });

  it('preserves every card through restartGame with A064 sitting mid-drawPile', () => {
    let state = startedRoom();
    // A064 is already somewhere in drawPile from buildCanonicalDeck() -- confirm
    // that, then restart mid-game and verify conservation still holds.
    expect(state.drawPile).toContain('A064');
    state = restartGame(state, () => 0.5);
    assertCardConservation(state);
  });
```

- [ ] **Step 2: Run the tests, confirm they pass**

This task adds no new implementation — Tasks 1 and 2 already provide everything these
tests exercise, so this step is a verification pass, not a RED→GREEN cycle. Confirm you're
running with both of those tasks' commits already in place (`git log --oneline` should show
Task 1's and Task 2's commits) before running:

Run: `npx vitest run game/cardInvariant.test.ts --reporter=dot`
Expected: all tests in the file PASS, including the 2 new ones — confirming the card-
conservation invariant genuinely holds through A064's full lifecycle and through
`restartGame`, not just that the functions run without throwing.

- [ ] **Step 3: Full verification**

Run: `npx vitest run --reporter=dot` — expect 815 passed (up from 813 after Task 2), 60 files.
Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 4: Commit**

```bash
git add game/cardInvariant.test.ts
git commit -m "$(cat <<'EOF'
test: verify card conservation through A064's full lifecycle

Covers play -> plant into drawPile -> drawn by a different player ->
its own discard-3 trigger, and separately restartGame with A064
sitting mid-drawPile at the time -- both already pass against Tasks
1-2's implementation with no further code changes, confirming the
"no gap" checks in the design spec.

Part of Group 1 Cluster E -- see
docs/superpowers/specs/2026-09-03-group1-cluster-e-design.md.

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

Run: `npx vitest run --reporter=dot` — expect 815 passed, 0 failed, 60 files.
Run: `npx tsc --noEmit` — expect clean (no output).

- [ ] **Step 2: Manual smoke-check (optional but recommended)**

If you have a way to run the app locally: play A064, confirm it leaves your hand and the
game continues normally (no visible UI change is expected — this card has no target and no
modal, matching `kind: 'auto'` with no `needsX` flags). Not a blocker if you can't run the
app in this environment — note it as unverified in your report instead.

- [ ] **Step 3: Update the handoff doc**

In `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`:
- Change the `## Status:` line to reflect 168/173 and that Cluster E is done.
- Update the "Branch state" section's test count (815, 60 files) and note this cluster's
  branch (`feature/group1-cluster-e`, forked from `main` at `43d0d40`).
- Under Group 1's entry, mark Cluster E (A064) done with a short "what shipped and why"
  paragraph, matching the style already used for Clusters A, B, C, and G — cover the "only
  one physical copy exists" insight that made this simpler than the classification doc
  originally feared, and the two rulings (random position, no new UI).
- Update "Remaining: N clusters, N cards" to reflect Clusters F, D (5 cards: A091, A017,
  A028, A094, A108) left, per the confirmed order (F next, D last).

- [ ] **Step 4: Commit the doc update**

```bash
git add docs/superpowers/specs/2026-09-02-remaining-work-handoff.md
git commit -m "$(cat <<'EOF'
docs: mark Group 1 Cluster E done in the remaining-work handoff (168/173)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QJHXso4tUoZgYyJWuydtMf
EOF
)"
```

- [ ] **Step 5: Check `main` hasn't moved, then push**

```bash
git fetch origin
git log --oneline main..origin/main
```

Expected: no output. If there IS output, stop and investigate before pushing — read those
commits first (this project has hit unreviewed direct-to-`main` pushes from a collaborator
three times already; don't assume a fourth can't happen).

```bash
git push -u origin feature/group1-cluster-e
```

- [ ] **Step 6: Open a PR (if `gh` is available in this environment)**

Run: `which gh` to check. If absent, skip this step and tell the user to open one manually
via:
`https://github.com/plem7106-glitch/MuffinTime/compare/main...feature/group1-cluster-e?expand=1`

If `gh` is available and authenticated (`gh auth status`), open a PR into `main` with `gh
pr create`, following this repo's existing PR conventions (check a recent merged PR's
description shape with `gh pr view <N>` if unsure).
