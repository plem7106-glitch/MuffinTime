# Group 1 Cluster B: Turn-Order Mutation (A119)

## Context

Group 1 (per `docs/superpowers/specs/2026-09-02-remaining-work-handoff.md`) was decomposed
into 7 clusters by shared mechanism. Cluster A (A100/A035/A040, persistent per-player/table
flags) shipped first as the lowest-risk cluster. This spec covers **Cluster B**: a single
card, `A119` "จะรอทำไม?" (Why Wait?), the only Group 1 card needing a genuine
turn-order-mutation mechanic.

- **A119** "จะรอทำไม?": "เลือกผู้เล่นอีก 1 คน แล้วข้ามการเล่นไปยังเทิร์นถัดไปของผู้เล่นคนนั้น"
  — choose another player, then skip play forward to that player's next turn.

The remaining 9 Group 1 cards (clusters C–G) are out of scope for this spec and this
implementation pass.

## What makes this architecturally new

No existing card causes an immediate mid-turn turn-index jump as a side effect of playing
it. `lib/session.tsx`'s `resolveCompletedStackFrames` — the generic resolver that runs
every card's `executeEffect` — does **not** call `advanceAndCheckWin` (the function that
normally advances the turn) for human-played actions; it only does so for bot-played
actions, since bots have no UI to click "จบเทิร์น" and must complete their whole turn
atomically. For a human, playing an action normally only mutates cards/state — the turn
itself doesn't move until the player explicitly ends it.

A119 needs to force an actual turn transition — to an arbitrary target, not just "the next
player" — as an immediate consequence of being played, mid-turn, by a human. The cleanest
fit found: let A119's `executeEffect` call directly into `game/turn.ts`'s turn-transition
machinery itself (the same file `advanceTurn` lives in), rather than adding a special case
to the generic stack-frame resolver. `A037` (the birthday-win card) already establishes the
precedent of an `executeEffect` mutating turn/game-ending state directly rather than just
card positions, so this isn't a new category of thing this codebase does — just a new
instance of it.

## Ruling confirmed with the user (not fully resolved by card text alone)

**If A119's chosen target currently has `skipNextTurn: true`** (from an unrelated earlier
effect): landing on them honors that flag exactly like `advanceTurn`'s own stepping loop
does — clear the flag and keep walking (in play direction) until landing on someone who
isn't skip-flagged. Confirmed with the user over the alternative (land on them
unconditionally, ignoring the flag).

## Design decisions made by precedent, not asked (documented here for review)

- **Players strictly between the current position and the target get zero side effects**
  when A119 skips over them — no per-turn flag resets, no `pendingWinChecks`/
  `pendingActionObligations` resolution, no `GlobalRestriction` clearing. This mirrors how
  `advanceTurn`'s existing loop already treats a `skipNextTurn`-flagged player it steps
  past: entirely silent, no side effects, as if that turn simply never happened this cycle.
  Their queued items (if any) simply wait for the next time it's genuinely their turn.
- **`roundNumber` increments by exactly 0 or 1** for a single A119 jump — never more,
  since the target is a single fixed position in a fixed-size ring and a jump can cross the
  "start of a new lap" boundary at most once. Detected the same way `advanceTurn` already
  detects it (landing on index 0 while walking in the play direction), just checked across
  every step of the jump instead of a single step.
- **A119 excludes the actor as a valid target** ("เลือกผู้เล่นอีก 1 คน" / "choose *another*
  player") — enforced the same way every other "another player" card already is: the UI's
  `TargetSelector` candidate list (`opponentCandidates`) already excludes the acting player,
  no new filtering needed.

## Approach

`game/turn.ts` gains one new exported function, `jumpToPlayerTurn(state, targetId)`, plus
two internal refactors that generalize existing logic rather than duplicate it a third
and fourth time:

1. **`resetPerTurnFlags(player)`** (new, private to `game/turn.ts`) — the reset checklist
   (`placedTrapThisTurn`, `hasDrawnThisTurn`, `hasPlayedActionThisTurn`,
   `bonusActionPlaysRemaining`, `mustPlayActionThisTurn`) currently duplicated verbatim in
   both `advanceTurn` and `emergencyForceSkipTurn`. Extracting it here means `jumpToPlayerTurn`
   doesn't become a *third* copy — directly addresses the final Cluster A review's
   recommendation, since this cluster is about to add exactly the kind of new "lands on a
   player" call site that recommendation anticipated.
2. **`resolveTurnArrival(state, currentId)`** (new, exported from `game/turn.ts`) — the
   `resolvePendingWinChecks` → win-check → `resolvePendingActionObligations` chain
   currently inlined in `lib/session.tsx`'s `advanceAndCheckWin`. Extracting it lets both
   `advanceAndCheckWin` (a normal turn-end) and A119's `executeEffect` (an immediate jump)
   call the identical, already-tested resolution chain instead of `advanceAndCheckWin`
   growing a twin. `advanceAndCheckWin` itself becomes a thin wrapper:
   `resolveTurnArrival(advanceTurn(room), currentId)`.
3. **`jumpToPlayerTurn(state, targetId)`** (new, exported) — two-phase walk (see "Ruling
   confirmed" and "Design decisions" above), landing on `targetId` (or past them if
   skip-flagged), then calling `resetPerTurnFlags` for whoever it lands on, clearing a
   `GlobalRestriction` sourced by them, bumping `roundNumber` if a lap boundary was crossed,
   and incrementing `sequenceNumber` — the same tail `advanceTurn` already performs for its
   own landed-on player, just reached via a multi-step walk instead of a single step.
   Guards defensively at the top, mirroring `advanceTurn`'s own `if (count <= 0) return
   next;`: no-ops (returns the state unchanged, cloned) if `turnOrder` is empty or
   `targetId` isn't found in it — the UI's `TargetSelector` should never actually produce
   an invalid target, but the function doesn't trust that from the outside.

A119's card definition in `game/actionRules/definitions.ts`:

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

**A119 introduces zero new `PlayerState`/`RoomState` fields** — nothing to add to
`game/room.ts`'s `startGame`/`resetForPlayAgain`, no reset-gap risk of the kind Cluster A
hit four times.

## Data flow / architecture note

This is the first Action card whose `executeEffect` triggers a turn transition as part of
its own resolution, rather than only mutating hands/piles/flags. This is a deliberate,
narrow precedent — not a general invitation for future cards to freely call turn-transition
functions from `executeEffect`. Future Group 1 clusters (especially Cluster D, "recursive/
forced card resolution") should evaluate whether they need something similar on a
case-by-case basis, not assume this pattern generalizes automatically.

## Testing plan

- `game/turn.test.ts`: `jumpToPlayerTurn` — happy path (lands on target, resets their
  flags, clears their restriction), wraps `roundNumber` correctly in both directions,
  honors a skip-flagged target (clears the flag, continues past), leaves in-between
  players' `skipNextTurn`/pending-check state completely untouched. Plus tests for the two
  extracted helpers (`resolveTurnArrival` covering win-check/obligation resolution reused
  from Cluster A/Group 2's existing test shapes; a light sanity check that `advanceTurn`'s
  existing test suite still passes unchanged after the `resetPerTurnFlags` extraction,
  since it's a pure refactor of already-tested code).
- `game/actionRules/definitions.test.ts`: A119's `executeEffect` — jumps to the chosen
  target, no-op when no target is picked.
- `lib/session.tsx`'s `advanceAndCheckWin` has no direct test file (established convention
  in this codebase) — the refactor there is exercised indirectly through `game/turn.ts`'s
  tests for the function it now delegates to, consistent with how the rest of this
  subsystem is tested.
- No new UI/component tests — `needsTargetSelection` already has full UI wiring, no new
  modal or local state machine needed.

## Out of scope

- Clusters C–G (the other 9 Group 1 cards) — separate specs, separate implementation
  passes.
- Any generalization of "an executeEffect can trigger a turn transition" into a reusable
  pattern for other cards — scoped narrowly to A119 for now, per the architecture note
  above.
