# Handoff — Action Card Effects (2026-09-02)

**For a fresh AI agent picking this up with zero prior context.** Read this whole file
before touching code — it's written to be self-contained. Deeper per-card reasoning for
all 173 cards lives in `docs/superpowers/specs/2026-09-02-action-card-classification.md`;
this file only covers what's left and how to build it.

## What this project is

Muffin Time: a Thai-language web port of a physical party card game (Next.js App Router +
React + TypeScript + Supabase). Full project context is in `CLAUDE.md` at the repo root —
read it first, it's short. `data/cards.json` is the ground-truth card list/text; never
invent or rephrase a card's effect, only what's written there.

## Status: 163/173 Action cards implemented -- Group 2, Group 3, and Group 1 Cluster A are done

Implemented cards live in `game/actionRules/definitions.ts` as a big object literal keyed
by card code (`A001`, `A037`, etc). Each entry is an `ActionRuleDefinition`
(`game/actionRules/types.ts`) — the declarative registry pattern this whole subsystem
follows (mirrors the sibling `game/trapRules/` for Trap cards, which a collaborator built
independently).

## Branch state — start here, don't branch from `main`

- Work so far is on `feature/birthday-cards`, forked from `main`. **PR #3 is open into
  `main`** (https://github.com/plem7106-glitch/MuffinTime/pull/3) as of the 157/173
  checkpoint — check `gh pr view 3` (or the URL) for its current state before assuming it's
  still open/unmerged, and `git log` for whether later commits landed on this branch after
  it was opened (Group 2's last two cards, A118/A158, were pushed after PR #3 was created —
  they'll show up in the PR automatically since it tracks the branch, but re-check before
  merging).
- `main` only has 150/173 cards. This branch adds A037/A066/A137 (birthday-comparison cards,
  `PlayerState.birthdayMMDD`), A135/A023/A024/A027 (`RoomState.pendingWinChecks`,
  `ActionRuleDefinition.needsNumberInput`), A118/A158 (`RoomState.gameSuggesterId`,
  `ActionRuleDefinition.needsDrinkCheck`), A166 (`ActionRuleDefinition.needsTargetThenOutcome`),
  and A100/A035/A040 (`PlayerState.bonusActionPlaysRemaining`/`mustPlayActionThisTurn`,
  `RoomState.pendingActionObligations`/`actionRedirect`). **Branch your next work off
  `feature/birthday-cards`, not `main`**, or you'll be missing that infrastructure and these
  13 extra cards.
- When your work is done and tests pass: push to this same branch if PR #3 is still open
  (it'll pick up the new commits automatically), or open a fresh PR **into `main`** if #3
  already merged. Use `git push` and `gh pr create`/`gh pr view` — `gh` is authenticated in
  this environment (account `plem7106-glitch`); a prior session that wrote part of this doc
  didn't have it and used raw `curl` against `api.github.com` instead, but check `gh auth
  status` yourself rather than assuming either way.
- Before pushing anything: `git fetch origin && git log --oneline main..origin/main` to
  check nothing new landed on `main` since you branched.
- Last known-good check on this branch (at the 163/173 checkpoint): `npx vitest run` → 556
  passed, `npx tsc --noEmit` → clean. Run both again before you start — confirm your baseline.
- **If you add a new per-turn or per-game `PlayerState`/`RoomState` field, reset it in ALL
  FOUR places**, not just the ones that seem obvious: `game/turn.ts`'s `advanceTurn` and
  `emergencyForceSkipTurn` (per-turn resets), and `game/room.ts`'s `startGame` and
  `resetForPlayAgain` (per-game resets). Cluster A's implementation (below) hit this exact
  gap **four separate times** — once per new field — each caught only by code review, not
  by the original implementation. Treat this as a checklist, not a one-off pattern to
  rediscover per card.

## How to implement a card (the pattern)

1. Look up the card's exact Thai/English text in `data/cards.json` (`action` array, search
   by `code`). Never guess effect text.
2. Pick an `ActionResolutionKind` (`game/actionRules/types.ts`): `'auto'` (no manual input
   needed once any target is already picked), `'roster_select'` (multi-pick from the
   player list), `'outcome_entry'` (someone enters a real-world result), `'no_op'`.
3. Write the `ActionRuleDefinition` object and add it to the exported object in
   `game/actionRules/definitions.ts`. `executeEffect: (state, frame) => RoomState` **must
   stay pure** — never call `new Date()`, `Math.random()` without an injectable `rng`
   param, etc. inside it. Any real-world input (today's date, a chosen winner, a roster of
   matching players) gets resolved in the UI *before* the frame is pushed, and read back out
   of `frame.customPayload` via a small typed accessor (see `todayFromFrame`,
   `rosterIdsFromFrame`, `outcomeFromFrame`, `winnerIdFromFrame` in `types.ts`) — this keeps
   effects testable without mocking the clock or RNG.
4. Reuse existing primitives before writing new state-mutation logic:
   `game/primitives.ts` (`executeDraw`/`executeRandomSteal`/`executeAllRandomSteal`/etc.),
   `game/transfer.ts` (`stealRandom(state, fromId, toId, n, rng?)`, `swapHands`),
   `game/roster.ts` (loops over a multi-select roster), `game/turnFlow.ts`
   (`changeMuffinTarget(state, n)`, `skipTurn`, `reverseDirection`).
5. Best worked example to copy: **A037/A066/A137** at
   `game/actionRules/definitions.ts:997-1040` — shows the `needsTodayDate` flag pattern
   (stamping real-world input into the frame from `components/room/GameTable.tsx`'s
   `handlePlayActionDirect`), a shared helper (`soonestBirthdayPlayers`) reused across
   multiple cards, and respecting `GlobalRestriction`'s `no_win` type.
6. UI wiring already exists for most kinds in use, and a new flag + a small local state
   machine in `GameTable.tsx` (mirroring `dualPickPhase`/`drinkCheckPhase`) covers anything
   that needs a multi-step manual flow (see A115's `needsDualTargetSelection`, A158's
   `needsDrinkCheck`). Reference: `components/room/GameTable.tsx` reads
   `getActionRule(cardCode)` and branches on `needsRosterSelection` / `needsOutcomeEntry` /
   `needsTargetSelection` / `needsDualTargetSelection` / `needsTodayDate` /
   `needsNumberInput` / `needsDrinkCheck` before pushing the frame.
   `components/modals/TargetSelector.tsx` handles both single-select (`needsTargetSelection`)
   and multi-select (`needsRosterSelection`, pass `multiSelect` + optional `requiredCount`).
   `components/modals/OutcomeToggle.tsx` handles binary `needsOutcomeEntry` cases.
   `components/modals/NumberInputModal.tsx` handles `needsNumberInput`.
7. Add unit tests in `game/actionRules/definitions.test.ts` (there's a `describe` block per
   card family already — follow that structure) covering the happy path, the no-op/edge
   case, and (if relevant) the `GlobalRestriction` gate.
8. Verify: `npx vitest run --reporter=dot` and `npx tsc --noEmit`, both clean, before
   committing. Small focused commits, descriptive messages.

## What's next — 10 cards left, all in Group 1 (Group 2 and Group 3 are done)

### Group 2 — DONE (159/173 checkpoint)

All 6 cards implemented: A135, A023, A024, A027, A118, A158. See
`game/actionRules/definitions.ts` (search each code), `game/types.ts`'s `PendingWinCheck` /
`gameSuggesterId`, `game/turn.ts`'s `resolvePendingWinChecks` (wired into
`lib/session.tsx`'s `advanceAndCheckWin`), `game/room.ts`'s `setGameSuggester`, and
`components/modals/NumberInputModal.tsx`.

- A135 added `ActionRuleDefinition.needsNumberInput` (mirrors `needsTodayDate`).
- A023/A024/A027 added `RoomState.pendingWinChecks`, consumed exactly once — on the actor's
  own next turn — by `resolvePendingWinChecks`. A024/A027 ties resolve as a one-shot no-op
  (not the physical game's "try again" redraw) — a deliberate scope simplification, flagged
  for whoever reviews the PR.
- A118 added `RoomState.gameSuggesterId` (host-picked, optional, during the
  `TurnOrderSetup.tsx` setup screen via a new `setGameSuggester` session callback) — steals
  3 from that player, guarded against missing/stale/self-referential values.
- A158 was a genuine design fork with no clear default: "who has drunk the most" needs some
  notion of a drink count, but nothing in this codebase tracks one, even for other
  drinking-flavor cards (A139/A145). Asked the user directly rather than picking silently;
  they chose **no persistent state at all** — a new `ActionRuleDefinition.needsDrinkCheck`
  flag drives a two-step honor-system UI (outcome toggle "already drunk?", then only if
  "not yet" a single target pick "who has drunk the most?"), resolved live at play time.
  `RoomState`/`PlayerState` gained zero new fields for this card. If a later card needs real
  drink tracking, this precedent doesn't preclude adding it then — it was scoped to what
  A158 alone needed.

### Group 3 — DONE (160/173 checkpoint)

`A166` "หมดแก้วเร็วก็รวย" was blocked on a genuine rules ambiguity (neither description_en nor
description_th says who draws the 3 cards). Asked the user directly for a ruling rather than
guessing: **the target draws 3 on success** (beats the actor's slow count of 5), **the actor
draws 3 on failure**. Since the two outcomes have *different* recipients (unlike the existing
`kind: 'outcome_entry'` + `needsTargetSelection` cards, e.g. A006, where picking a target *is*
the outcome and skipping the pick means no-op), this needed a new two-step flow: a new
`ActionRuleDefinition.needsTargetThenOutcome` flag drives "pick a target, then report a binary
outcome for that target" (`components/room/GameTable.tsx`'s `targetThenOutcomePhase` local
state, mirroring A158's `drinkCheckPhase` but in the opposite step order). See its doc comment
in `game/actionRules/types.ts` and A166's entry in `definitions.ts`.

### Group 1 — Cluster A DONE (163/173 checkpoint), 6 clusters / 10 cards remain

Group 1 (13 cards needing real engine changes, not just a single `executeEffect`) was
decomposed into 7 clusters by shared mechanism during brainstorming — see
`docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md` for the full decomposition
table and rationale. **Cluster A (A100, A035, A040 — persistent per-player/table flags,
the lowest-risk cluster) is done.** Its own plan/spec docs are
`docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md` and
`docs/superpowers/plans/2026-09-02-group1-cluster-a.md`.

- **A100** "โรงงานมัฟฟิน" — `PlayerState.bonusActionPlaysRemaining`, consumed by extending
  `lib/session.tsx`'s `playAction` gate to allow 2 extra plays past the normal 1-per-turn
  limit.
- **A035** "ออกมาเล่นกันเถอะ" — `RoomState.pendingActionObligations` (a sibling of
  `pendingWinChecks`) + `PlayerState.mustPlayActionThisTurn`. Ruling confirmed with the
  user: hard-enforced (blocks `endTurn`), not honor-system, applies to every player at the
  table on their own next turn, exempts a player under an active table-wide `no_actions`
  restriction (avoids a soft-lock).
- **A040** "ฉันชอบมัน!" — `RoomState.actionRedirect` + a new pure `applyActionRedirect`
  helper (`game/turnFlow.ts`) intercepting the one call site where a played Action card is
  discarded. Ruling confirmed with the user: applies to *any* player's Action play, not
  just the actor who set it up.
- Implemented via `superpowers:subagent-driven-development` — 3 implementer runs + spec
  review + code review per task, plus a final holistic review across all three cards
  together. That process caught 4 real bugs, all the same shape: a new field left out of
  `startGame`/`resetForPlayAgain`'s reset logic, letting stale state leak into a "Play
  Again" match (see the "reset it in ALL FOUR places" note above — this is exactly what
  bit this cluster, repeatedly). All 4 are fixed and verified.
- Known, accepted (not fixed) gaps from the final review, low priority: `emergencyForceSkipTurn`
  (the host's "unstick" button) doesn't consume a landed-on player's `pendingActionObligations`
  entry — consistent with that function's existing documented contract of skipping
  turn-start side effects (it also already skips `resolvePendingWinChecks`), not a new gap.
  Bot-driven (`bot-*`) rooms bypass all three cards' new mechanics entirely (bots already
  bypassed the 1-action-per-turn limit before this cluster; this wasn't specifically
  addressed). Neither blocks merge; flagged for whoever picks up bot-room support later.

**Remaining: 6 clusters, 10 cards** — `A017, A028, A064, A091, A092, A094, A108, A119,
A126, A130`. Each needs its own spec (and likely its own plan) before implementation,
following the same brainstorming → writing-plans → subagent-driven-development flow used
for Cluster A. Per the original decomposition:

- **Cluster B** (turn-order mutation): `A119`
- **Cluster C** (2-hop delegated targeting): `A126`, `A130`
- **Cluster D** (recursive/forced card resolution — trickiest, touches the reaction-stack
  system directly): `A017`, `A028`, `A094`, `A108`
- **Cluster E** (draw-pile hook): `A064`
- **Cluster F** (forced-vs-voluntary loss tracking): `A091`
- **Cluster G** (mid-game full reset, standalone): `A092`

Full per-card reasoning for all of these is in the classification doc's "Phase 2" table
(`docs/superpowers/specs/2026-09-02-action-card-classification.md`). Don't start any of
these casually inside a small-batch PR — each wants its own
`superpowers:brainstorming` + `superpowers:writing-plans` pass given the engine-level
surface area, the same way Cluster A got one.

## Known gap, not yet built (unrelated to the above)

No UI to edit a player's birthday after first entry — same shape as the existing "no
sign-out, a mistyped display name is permanently stuck" gap already documented in
`CLAUDE.md`. Not blocking, just flagged in case someone wants a settings-modal fix later.
