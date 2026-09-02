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

## Status: 167/173 Action cards implemented -- Group 2, Group 3, and Group 1 Clusters A/B/C/G are done

Implemented cards live in `game/actionRules/definitions.ts` as a big object literal keyed
by card code (`A001`, `A037`, etc). Each entry is an `ActionRuleDefinition`
(`game/actionRules/types.ts`) — the declarative registry pattern this whole subsystem
follows (mirrors the sibling `game/trapRules/` for Trap cards, which a collaborator built
independently).

## Branch state — start here, don't branch from `main`

- Work so far is on `feature/birthday-cards`, forked from `main`. **PR #3 is open into
  `main`** (https://github.com/plem7106-glitch/MuffinTime/pull/3) — check `gh pr view 3`
  (or the URL) for its current state before assuming it's still open/unmerged.
- **`main` had diverged**: a different author (`Patyz-Hack`) pushed two large commits
  directly to `main` outside PR review — `96103b9` "Trap Fix" and `ff09a4a` "Trap and
  card" — touching the exact same core files this branch's Action-card work builds on
  (`game/turn.ts`, `lib/session.tsx`, `components/room/GameTable.tsx`), plus a large new
  sound/presentation subsystem (`lib/presentation/`) and trap-engine work. This was
  reconciled via merge commit `ec9e517` (not a rebase — avoids a force-push and resolves
  each conflict once). Key things that commit changed, now folded into this branch:
  - **The turn rule was corrected**: each turn is draw **XOR** play one Action, not both
    — restoring the original v1 design spec
    (`docs/superpowers/specs/2026-08-31-muffin-time-web-design.md`'s "ระบบเทิร์น" section),
    which this branch's engine had never actually enforced. `game/turn.ts`'s
    `hasCompletedMainChoice`/`canEndTurn` is now the single authority for end-turn
    eligibility (replacing duplicated inline checks in `lib/session.tsx`/`GameTable.tsx`),
    and `game/turn.ts`'s `beginTurn(state, activePlayerId)` is now the single place that
    resets per-turn `PlayerState` flags (replacing the duplicated reset blocks
    `advanceTurn`/`emergencyForceSkipTurn` used to each carry — see the reset-checklist
    note below, now much lower-risk since there's only one call site to remember).
  - A035's `mustPlayActionThisTurn` check is folded into `canEndTurn`. A new guard was
    added to `lib/session.tsx`'s `drawCard`: under the corrected draw-XOR-play rule,
    drawing would otherwise permanently foreclose ever satisfying an A035 obligation
    (`playAction` is unconditionally blocked once `hasDrawnThisTurn` is set) — so drawing
    itself is now blocked while `mustPlayActionThisTurn` is true and unsatisfied, funneling
    an obligated player toward playing an Action as their only legal choice that turn.
  - If you're picking up Group 1 Cluster C or later and haven't seen this reconciliation,
    read `game/turn.ts` and `lib/session.tsx`'s `playAction`/`drawCard`/`endTurn` fresh —
    don't assume they still look like what an earlier Cluster's spec doc described.
- `main` only has 150/173 cards. This branch adds A037/A066/A137 (birthday-comparison cards,
  `PlayerState.birthdayMMDD`), A135/A023/A024/A027 (`RoomState.pendingWinChecks`,
  `ActionRuleDefinition.needsNumberInput`), A118/A158 (`RoomState.gameSuggesterId`,
  `ActionRuleDefinition.needsDrinkCheck`), A166 (`ActionRuleDefinition.needsTargetThenOutcome`),
  A100/A035/A040 (`PlayerState.bonusActionPlaysRemaining`/`mustPlayActionThisTurn`,
  `RoomState.pendingActionObligations`/`actionRedirect`), A119 (`game/turn.ts`'s
  `jumpToPlayerTurn`/`resolveTurnArrival` — no new `PlayerState`/`RoomState` fields), A092
  (`game/turn.ts`'s `resetPlayerPerTurnFlags` and `game/room.ts`'s `restartGame` — again no new
  `PlayerState`/`RoomState` fields, both are pure refactors/new functions over the existing
  shape), and A126/A130 (`game/actionRules/delegatedTargetPick.ts` — extends the existing
  `RoomState.pendingInteraction` mechanism with a new `type`, again no new `PlayerState`/
  `RoomState` fields). **Branch your next work off `feature/birthday-cards`, not `main`**, or
  you'll be missing that infrastructure and these 17 extra cards (167 vs `main`'s 150).
- When your work is done and tests pass: push to this same branch if PR #3 is still open
  (it'll pick up the new commits automatically), or open a fresh PR **into `main`** if #3
  already merged. Use `git push` and `gh pr create`/`gh pr view` if `gh` is installed and
  authenticated in this environment — it has NOT been consistently available across
  sessions on this project (present and authenticated as `plem7106-glitch` in some, absent
  entirely — `which gh` finds nothing — in others, including the one that wrote this
  sentence); check `which gh` and `gh auth status` yourself rather than assuming either way,
  and if it's absent, tell the user to update the PR description manually (link:
  https://github.com/plem7106-glitch/MuffinTime/pull/3) rather than trying to install it.
- Before pushing anything: `git fetch origin && git log --oneline main..origin/main` to
  check nothing new landed on `main` since you branched.
- Last known-good check on this branch (post-Cluster-C checkpoint): `npx vitest run` → 628
  passed (44 files), `npx tsc --noEmit` → clean. Run both again before you start — confirm
  your baseline.
- **A card whose `executeEffect` triggers a turn transition (calling `resolveTurnArrival`
  or anything reaching `checkWinnerAtTurnStart`) must independently guard against running
  that chain on a player who didn't genuinely just have their turn begin.** Cluster B (A119)
  hit this twice: `jumpToPlayerTurn` no-ops on both a self-target and an invalid/not-found
  target, and in both cases `resolveTurnArrival` would still fire against the unmoved actor
  unless the caller checks first — `checkWinnerAtTurnStart` is a *live*, non-consume-once
  predicate, so this silently produced a premature win. See A119's `executeEffect` in
  `definitions.ts` for the guard pattern, and
  `docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md`'s "A real bug the review
  process caught" section for the full story. If you build a similar turn-jump-style card,
  enumerate *every* no-op/early-return branch of whatever engine helper you're calling —
  don't assume the UI's own filtering (e.g. `TargetSelector` excluding the actor) is enough,
  since the engine layer itself has no such guarantee unless you add one.
- **If you add a new per-turn `PlayerState` field, reset it in `game/turn.ts`'s
  `beginTurn`** — as of the merge above, this is the *one* place `advanceTurn` and
  `emergencyForceSkipTurn` both funnel through, so there's only one call site to remember
  now (previously two, duplicated). **If you add a new per-game `RoomState`/`PlayerState`
  field, still reset it in BOTH `game/room.ts`'s `startGame` and `resetForPlayAgain`** —
  those two remain separate (a different reset category — per-game, not per-turn — and
  `beginTurn`'s consolidation doesn't cover them). Cluster A's implementation hit this
  reset-checklist gap **four separate times** before `beginTurn` existed, each caught only
  by code review, not by the original implementation — don't rediscover it per card.

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

## What's next — 6 cards left, all in Group 1 (Group 2 and Group 3 are done)

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

### Group 1 — Clusters A, B, C & G DONE (167/173 checkpoint), 3 clusters / 6 cards remain

Group 1 (13 cards needing real engine changes, not just a single `executeEffect`) was
decomposed into 7 clusters by shared mechanism during brainstorming — see
`docs/superpowers/specs/2026-09-02-group1-cluster-a-design.md` for the full decomposition
table and rationale.

**Cluster A (A100, A035, A040 — persistent per-player/table flags, the lowest-risk
cluster) is done.** Its own plan/spec docs are
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

**Cluster B (A119, the only "turn-order mutation" card) is done.** Its own plan/spec docs
are `docs/superpowers/specs/2026-09-02-group1-cluster-b-design.md` and
`docs/superpowers/plans/2026-09-02-group1-cluster-b.md`.

- **A119** "จะรอทำไม?" — choose another player, skip play immediately forward to their next
  turn. `game/turn.ts` gained `jumpToPlayerTurn(state, targetId)` (a two-phase walk: players
  strictly in between get zero side effects, mirroring how `advanceTurn` already treats a
  `skipNextTurn`-flagged player it steps past; an existing `skipNextTurn` on the target
  itself is honored the same way `advanceTurn`'s own loop does — ruling confirmed with the
  user) and `resolveTurnArrival(state, currentId)` (the pending-win-check/muffin-time/
  pending-obligation chain, extracted out of `lib/session.tsx`'s `advanceAndCheckWin` so
  both a normal turn-end and A119's immediate jump share one tested path). Lands via the
  pre-existing `beginTurn` from the `main` merge above — zero new `PlayerState`/`RoomState`
  fields.
- **The review process found and fixed a genuinely real, reproduced bug, not a theoretical
  one**: self-targeting A119 (or targeting an invalid/not-found player) while already
  eligible for and having declared muffin time triggered an *immediate premature win* —
  bypassing the "declare now, verify at your genuine next turn" mechanic — because
  `jumpToPlayerTurn`'s no-op paths still let `resolveTurnArrival` run against the unmoved
  actor, and `checkWinnerAtTurnStart` is a live predicate, not consume-once. Currently
  unreachable through the shipped UI (the `TargetSelector` candidate list already excludes
  the actor and only ever offers valid ids), but nothing enforced it at the engine layer
  before the fix. Both paths are now closed by one up-front guard in A119's `executeEffect`
  — see the "guard against a turn-transition-triggering card" note above and the design
  spec's "A real bug the review process caught" section for the full story.
- This took the most review cycles of any card in Cluster A or B — 2 fix rounds on
  `jumpToPlayerTurn` itself (a missing self-target guard, then a non-discriminating
  `direction: -1` test) and 3 more on the card-definition wiring (a missing integration
  test, then the two-part premature-win bug above). Worth knowing going into Cluster D
  (recursive/forced card resolution) — that cluster's engine surface area is bigger than
  Cluster B's, so budget for a similar or greater number of review-fix cycles.

**Cluster G (A092, mid-game full reset, standalone) is done.** Its own plan/spec docs are
`docs/superpowers/specs/2026-09-02-group1-cluster-g-design.md` and
`docs/superpowers/plans/2026-09-02-group1-cluster-g.md`.

- **A092** "ฉันบ้าไปแล้ว!" (I'm Crazy!) — put all cards back into the deck, shuffle, and
  restart the entire game, mid-match. `game/turn.ts` gained `resetPlayerPerTurnFlags(player)`
  (the 5-field per-turn reset checklist, previously duplicated in `beginTurn` and, inline, in
  `game/room.ts`'s `startGame`/`resetForPlayAgain` — now a single shared helper all four call
  sites use). `game/room.ts` gained `restartGame(state, rng)`: unlike `resetForPlayAgain`
  (which requires `status === 'finished'/'ended'` and detours through `'lobby'`), this fires
  while `status` stays `'playing'` — it pools every card currently anywhere in the game (every
  hand, every placed trap, the discard pile, the remaining draw pile — not a fresh canonical
  deck, per the card's own text), reshuffles, deals 3 fresh cards per player, and resets turn
  order/win state/reaction-stack state, while leaving room/social identity fields untouched.
  A092's card definition (`game/actionRules/definitions.ts`) is a thin one-line delegate to
  `restartGame`, `kind: 'auto'`, no target, no new UI wiring. Zero new `PlayerState`/`RoomState`
  fields.
- Three rulings confirmed with the user (none resolved by the card text alone): turn order
  after restart goes back to `seatOrder[0]`, not the actor who played A092; `muffinTimeTarget`
  resets to the default 10 even if A135 "Time of Death" had changed it earlier in the game;
  `gameSuggesterId` (A118's target) is preserved, not cleared — it's a real-world fact ("who
  suggested playing this physical game session"), not in-game state, and a mid-game card
  shouldn't change who actually suggested playing.
- Code review caught one real bug: `restartGame`'s deal loop (`next.drawPile.pop()!`) used a
  non-null assertion with no guard, so if the pooled card count were ever under-provisioned
  relative to `playerIds.length * 3` (3 cards per player), it would silently deal `undefined`
  into a player's hand instead of failing loudly. Fixed by adding an explicit check
  (`if (pool.length < playerIds.length * 3) throw new Error(...)`) before the deal loop runs.
  Currently unreachable with the real 231-card deck at any supported player count, but a test
  fixture in `game/room.test.ts` was already silently tripping this exact case before the fix
  — the fix's guard turned that into a loud, assertable failure instead of a latent one.

**Cluster C (A126, A130 — 2-hop delegated targeting) is done.** Its own plan/spec docs are
`docs/superpowers/specs/2026-09-02-group1-cluster-c-design.md` and
`docs/superpowers/plans/2026-09-02-group1-cluster-c.md`.

- Both cards break every existing `ActionRuleDefinition` pattern in a new way: in every
  prior card, the **actor** decides everything before the frame is even pushed, and
  `executeEffect` just reads the decision back out of `frame.customPayload`. Here, the
  actor's target (a second, non-actor player — call them "Player 1") has to make a further
  choice **after** the card has already resolved onto them, and nothing decides that choice
  up front. **A126** "มือปืน" (Gunman): the actor picks Player 1 to be the gunman; Player 1
  then picks any player to discard their entire hand. **A130** "เลื่อนตำแหน่ง" (Promotion):
  the actor picks Player 1; Player 1 then picks a recipient for one of their own cards.
- New module `game/actionRules/delegatedTargetPick.ts` (`initiateDelegatedTargetPick`,
  `resolveDelegatedTargetPick`) extends the existing `RoomState.pendingInteraction`
  mechanism — previously used only by T10's date-invite trap — with a new
  `type: 'delegated_target_pick'`, rather than building a second "pause and wait for one
  specific player" mechanism from scratch. This was a deliberate choice over two
  alternatives: a nested `StackFrame` using the reaction-stack's own
  `eligibleResponderIds`/`responses` fields (rejected — that system is for Counter-card
  responses, and reusing it for "a targeting choice that determines what the effect even
  does" would touch the reaction-stack's core resolution loop, exactly the surface area
  Cluster D was split out to own); and a brand-new separate `RoomState` field like
  `pendingDelegatedChoice` (rejected — every one of `pendingInteraction`'s existing guards,
  `canEndTurn`, `drawCard`/`playAction`, `hostSkipTurn` → `emergencyForceSkipTurn`, and
  `PresentationBridge.tsx`'s "waiting on X" banner, would each need a duplicate second check
  added — the exact reset-checklist-gap risk this doc has flagged repeatedly). Extending
  `pendingInteraction` instead needed zero changes to any of those call sites, and both
  cards turned out to need the identical interaction shape ("Player 1 picks one other
  player, excluding themselves") once the rulings below were applied — only the resolution
  in `resolveDelegatedTargetPick` differs, branching on `sourceCardCode`.
- Two rulings confirmed with the user (neither resolved by card text alone): **A126** — the
  gunman (Player 1) may target **any player except themselves**, including the original
  actor; matches how every other "pick a player" card in this codebase already excludes
  self-targeting, and nothing in the text specifically protects the actor. **A130** —
  Player 1, not the original actor, picks **both** which card to give and who receives it,
  matching the English text's "their choice" framing; but Player 1 does **not** get a UI to
  pick a specific card — the card given is chosen **at random** from their hand. This reuses
  the precedent set by **A056**, which hit the identical "pick a specific card from your own
  hand" need and deliberately punted the same way: no such UI component exists anywhere in
  this codebase, and building one was out of scope for a single card.
- Self-exclusion is enforced only at the UI candidate-list layer (the `TargetSelector`
  instance offered to Player 1 excludes Player 1), not inside `executeEffect` — deliberately
  different from Cluster B's A119, which needed an engine-level guard because
  `checkWinnerAtTurnStart` is a *live* predicate that a self-target/no-op path could still
  trigger. Nothing in Cluster C reaches a turn-transition or other live-predicate hazard, so
  the same UI-only self-exclusion precedent already used elsewhere (e.g. A016) applies
  as-is.
- `components/modals/TargetSelector.tsx`'s `onCancel` prop became optional (backward
  compatible — every existing caller still passes one) — there is no valid "cancel" for this
  interaction, since the card has already been played and discarded and the game is blocked
  on exactly this choice, so a visible Cancel button that did nothing would be actively
  misleading at the one moment a player's input is required to unstick the table.
- Code review (task 3's fix round, commit `50a6f33`) caught one real bug: the new
  `GameTable.tsx` local state `delegatedPickChoice` was only cleared on a successful
  `onConfirm`, not when `pendingInteraction` gets force-cleared out from under the modal by
  another path — `emergencyForceSkipTurn` (the host-unstick button) unconditionally nulls
  `pendingInteraction` regardless of `type`. A stale selected-but-not-confirmed value could
  then pre-select and pre-enable Confirm on a later, unrelated `delegated_target_pick`
  interaction targeting the same player. Fixed with a `useEffect` (mirroring the existing
  trap-target auto-close effect in the same file) that clears `delegatedPickChoice` whenever
  the current `pendingInteraction` isn't a `delegated_target_pick` targeting `myPlayerId`.
- Zero new `PlayerState`/`RoomState` fields — the whole cluster rides on
  `pendingInteraction`, which already existed.

**Remaining: 3 clusters, 6 cards** — `A017, A028, A064, A091, A094, A108`. Each needs its
own spec (and likely its own plan) before implementation, following the same
brainstorming → writing-plans → subagent-driven-development flow used for Clusters A, B, C,
and G. Per the original decomposition:

- **Cluster D** (recursive/forced card resolution — trickiest, touches the reaction-stack
  system directly): `A017`, `A028`, `A094`, `A108`
- **Cluster E** (draw-pile hook): `A064`
- **Cluster F** (forced-vs-voluntary loss tracking): `A091`

**Confirmed next order: E → F → D** (superseding the plan's original assumption, which had
no fixed order beyond "C first"). This was reassessed after closer inspection of E and F
turned up two corrections to the original classification doc's risk estimates:

- **Cluster E (A064) turned out simpler than expected.** It needs only a special-case check
  for card code `'A064'` inside `draw()`, plus a small `executeEffect` that moves the card
  from the discard pile into the draw pile at a random position — no new `RoomState`/
  `PlayerState` field at all. Lowest-risk of the three remaining clusters, hence going
  first.
- **Cluster F (A091) turned out to need a forced-vs-voluntary distinction threaded through
  dozens of existing call sites** in the `discard`/steal primitives across
  `definitions.ts`/`transfer.ts`/`primitives.ts`/`roster.ts`/`group.ts` — comparable risk to
  Cluster D, **not** the "lower risk" the original classification doc assumed. Still going
  before D because its surface area, while wide, doesn't touch the reaction-stack's
  resolution loop directly the way D does.
- **Cluster D (A017, A028, A094, A108)** remains the hardest and goes last. Its exact
  approach — specifically, how a forced/replayed card that itself needs further input
  (e.g. a forced discard that turns out to be a card needing its own target) should be
  handled — was **deliberately left undecided**; the user chose to defer that design
  conversation until Cluster D is actually picked up, rather than speculate now. Don't
  invent an answer to this from first principles — raise it fresh with the user when D
  starts.

Full per-card reasoning for all of these is in the classification doc's "Phase 2" table
(`docs/superpowers/specs/2026-09-02-action-card-classification.md`). Don't start any of
these casually inside a small-batch PR — each wants its own
`superpowers:brainstorming` + `superpowers:writing-plans` pass given the engine-level
surface area, the same way Clusters A, B, C, and G got one.

## Known gap, not yet built (unrelated to the above)

No UI to edit a player's birthday after first entry — same shape as the existing "no
sign-out, a mistyped display name is permanently stuck" gap already documented in
`CLAUDE.md`. Not blocking, just flagged in case someone wants a settings-modal fix later.
