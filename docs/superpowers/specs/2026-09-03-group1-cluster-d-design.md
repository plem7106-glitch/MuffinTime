# Group 1 Cluster D: Recursive/Forced Card Resolution (A017, A028, A094, A108)

## Context

Group 1 was decomposed into 7 clusters during brainstorming (see the handoff doc and
Cluster A's design spec for the full table). Clusters A, B, C, G, and E are already shipped
(merged into `main`; Cluster E landed via PR #5 at `a9e1c85`). This spec covers **Cluster
D**, the last one on the original decomposition table and the one flagged as hardest:

| Code | Name | Text |
|---|---|---|
| A017 | นายตาบอด (You're Blind) | Choose another player to draw and play the next Action card in the deck. (Discard any Trap/Counter until an Action is found.) |
| A028 | ทาเยอะไปหน่อย (Bad Spread) | Play this with an Action card to double its effect. |
| A094 | พร้อมเพรียง (In Sync) | Repeat the effects of the most recently played Action card. |
| A108 | เล่นใบนั้นสิ (Play That One) | Choose 1 Action card from another player's hand and force them to play it. |

**Cluster F (A091)** has separate, unmerged, in-progress work on `origin/feature/group1-cluster-f`.
The user explicitly chose to do D before F despite the handoff doc's documented E→F→D order
(F and D share touched files — `definitions.ts`/`transfer.ts`/`primitives.ts`/`roster.ts`/
`group.ts` — so a later reconciliation between the two branches is expected and out of scope
for this spec). This branch (`feature/group1-cluster-d`) forked from `main` at `a9e1c85`
(168/173, Cluster E merged), **not** from the cluster-f branch.

## Why this is more tractable than the classification doc feared

The classification doc grouped these 4 cards together as "the trickiest, touches the
reaction-stack system directly" without distinguishing how *much* each one actually needs.
Two things found during this brainstorming session substantially de-risk it:

**1. The reaction-stack resolution loop already supports nested frames for free.**
`lib/session.tsx`'s `resolveCompletedStackFrames` pops the top frame once all Counter
responses are in, runs its `executeEffect` via `executeActionFrameEffect`, then removes that
frame by `frameId` (via `removeStackFrame`, which finds it anywhere in the stack, not just
the top) and checks whether a new top frame exists. If a card's `executeEffect` calls the
existing `pushStackFrame` to spawn a nested frame, that nested frame is picked up
automatically — `removeStackFrame` still finds the *original* frame by id even though a new
one now sits above it, and the loop's `areAllResponsesComplete` check on the new top frame
correctly makes the loop stop and wait for a real Counter-response window before continuing.
This was verified by tracing the function by hand, not assumed. **No changes are needed to
that loop at all** — every Cluster D card that needs to "play" another card just builds a
frame and pushes it, and gets Counter-ability, bot-turn-advance handling
(`wasActionBase`), and natural recursion (a nested card that is itself another Cluster D
card) entirely for free.

**2. Only one of the four cards has a genuinely hard "what supplies the input" problem.**
About a third of the 168 implemented cards need some form of manual input
(`needsTargetSelection`/`needsRosterSelection`/etc.), gathered by the UI *before* the frame
is pushed, since `executeEffect` must stay pure. Looking at the four cards individually:
- A028 gathers input through the normal co-play UI at play time (the actor supplies it,
  same as any real play) — no new pause mechanism needed.
- A094 reuses a frozen historical payload — no new input needed at all.
- A108's actor already sees which card they're forcing, but per the ruling below the *card*
  itself is chosen randomly, not by the actor — so its own input still needs auto-resolving
  (see A017 below), not eliminated as first thought during brainstorming.
- A017 is the only one where the card is fully unknown until mid-resolution (a blind draw)
  — this is the one real "something has to supply input with nobody live to ask" problem.

Since A108 turned out to need the same auto-resolve treatment as A017 (see rulings below),
both share **one new helper function** rather than needing separate bespoke mechanisms.

## Rulings confirmed with the user (not resolved by card text alone)

- **A028 scope**: restricted to pairing with "quantity" Action cards only — cards whose
  effect is fundamentally drawing, discarding, or stealing a card count (including
  roster/multi-target versions, e.g. "everyone discards 2"). If the actor holds A028 but no
  qualifying partner card, A028 cannot be played at all (not just a bad idea — genuinely
  blocked), and the UI must show a persistent warning whenever A028 is in hand and
  currently unplayable for this reason. The qualifying-card list is enumerated during
  implementation (a one-time audit of `definitions.ts`), not exhaustively listed here.
- **A028 doubling mechanism**: re-invoke `executeActionFrameEffect` on the paired card's
  frame twice, rather than adding a multiplier field threaded through every quantity card's
  definition. Zero changes needed to the ~160 other card definitions.
- **A028 partner-picker UI**: shows only qualifying cards in the candidate list (filtered),
  not all Action cards with non-qualifying ones disabled — matches the existing
  candidate-filtering convention (e.g. A126/A108's target lists).
- **A028's in-hand warning**: a passive UI hint only (badge/banner) — does not block ending
  the turn or otherwise gate play; the player just can't press play on A028 itself.
- **A094 actor**: the player who plays A094 becomes the actor of the repeated effect (not
  the original historical actor) — "you get to use their trick." A094 reuses the historical
  `targetIds`/`customPayload` verbatim (the affected players stay the same), only the actor
  changes.
- **A094 lookup**: walks backward through history for the most recent successfully-resolved
  Action play whose code isn't `A094` itself (skips self-chains rather than looping). Only
  plays that actually resolved (not Countered) are logged, since a Countered play's effect
  never happened.
- **A108 card selection**: the actor picks a target *player* (from players holding ≥1
  implemented Action card), not a specific card — a random Action card from that player's
  hand is then forced to play automatically, matching the established precedent for "no
  card-picker UI exists" (A056, A130) rather than building a new hand-reveal-and-pick
  component for a single card.
- **A017/A108 auto-resolve default for `needsRosterSelection`**: if the card has no fixed
  `rosterSelectionCount`, default to *all eligible candidates* (not a random subset) — an
  auto-triggered "everyone loses a card" hits everyone, which reads as fair. If it has a
  fixed count, pick that many at random.
- **A017/A108 auto-resolve default for `needsTargetSelection`/outcome-style flags**: pick a
  uniformly random valid candidate (excluding self where the card's existing candidate-list
  convention already excludes self), and a random boolean for outcome-style flags
  (`needsOutcomeEntry`, `needsDrinkCheck`, `needsTargetThenOutcome`). `needsTodayDate` is
  captured once at the outermost real play (whoever actually played A017/A108) and threaded
  down through any nested auto-resolved cards rather than re-derived per level, since
  `executeEffect` still can't call `new Date()` itself.
- **Recursion depth**: `data/cards.json`'s `action` array lists each of the 173 codes
  exactly once, and `buildCanonicalDeck()` builds the deck 1:1 from it — there is only ever
  one physical copy of any Action code in the whole game. A chain (A017 finds A028, which
  finds A094, ...) is therefore naturally bounded by how many distinct Action codes remain
  undrawn/unplayed — genuinely infinite recursion isn't possible with the real deck. A
  defensive depth cap (20) is still added purely to guard against bugs or test fixtures with
  duplicated codes; it should never trigger with the real deck.

## Shared building block: auto-resolving a card's inputs

**Interface constraint that shapes this section**: `ActionRuleDefinition.executeEffect` is
fixed at `(state: RoomState, frame: StackFrame) => RoomState` — there is no way to pass an
external `rng` or wall-clock `today` value *into* it from a caller; a card's `executeEffect`
only ever sees `state` and its own `frame`. Two consequences, both resolved using patterns
already established elsewhere in this codebase rather than by widening the interface:

- **Randomness**: `autoResolveInputFrame` (below) is a plain helper function, not bound by
  the `executeEffect` signature, so it can and does take `rng: Rng = Math.random` as a real
  parameter for testability. But A017/A108's *own* `executeEffect` bodies just call it with
  the default — they don't and can't receive an injected `rng` themselves. This matches the
  precedent Cluster E's design doc already established: "genuine randomness cards... are not
  required to thread an injectable `rng` through `executeEffect`" (that requirement is for
  reusable primitives like `draw()`/`discard()`, not a card's own top-level effect). Tests
  that need determinism call `autoResolveInputFrame` directly; tests of A017/A108's
  `executeEffect` itself assert the *set* of valid outcomes, same as A007's coin-flip test.
- **`today`**: A017 and A108 both set `needsTodayDate: true` on their *own*
  `ActionRuleDefinition`, even though neither card has any birthday-comparison behavior
  itself — purely so the existing UI convention (`GameTable.tsx` stamps `today` into
  `frame.customPayload` before pushing any `needsTodayDate` card) captures wall-clock time at
  the one moment it's legitimately available (the real, live play of A017/A108 through the
  normal UI). `executeEffect` then reads it back via the existing `todayFromFrame(frame)`
  accessor and forwards it into the nested frame's `customPayload` if the chain surfaces a
  card that needs it. No interface change, no new accessor — reuses `needsTodayDate` for a
  purpose slightly broader than its original one (birthday comparisons), which is why this is
  called out explicitly rather than left implicit.

New function, `game/actionRules/autoResolve.ts`:

```ts
export function autoResolveInputFrame(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  today: string | undefined,
  rng: Rng = Math.random
): { targetIds: PlayerId[]; customPayload?: Record<string, unknown> } | null
```

Looks up `getActionRule(code)`. Returns `null` if the rule is missing (defensive — should be
unreachable since only implemented codes reach here). Otherwise inspects the rule's flags and
fills in what a live player would otherwise have picked through the UI:

- `needsTargetSelection` / plain single-target cards: one random valid candidate (same
  self-exclusion convention the card's own definition already implies via its normal target
  list — most cards exclude the actor; a few explicitly allow self, matched case by case
  during implementation).
- `needsRosterSelection`: all eligible candidates, or (if `rosterSelectionCount` is set)
  that many chosen at random.
- `needsDualTargetSelection`: two distinct random candidates for `firstId`/`secondId`.
- `needsOutcomeEntry` / `needsDrinkCheck` / `needsTargetThenOutcome`: random boolean for the
  outcome; `needsTargetThenOutcome` additionally needs a random target first.
- `needsTodayDate`: uses the `today` parameter (captured once at the outermost real play,
  not re-derived here).
- `needsNumberInput`: a random integer within `numberInputMin`/`numberInputMax` (defaulting
  to a small positive range if unset).
- Plain `kind: 'auto'` with no flags: no input needed, returns empty `targetIds`.

Used by both A017 (for the blind-drawn card) and A108 (for the forced card). Not used by
A028 (input already gathered live through the co-play UI) or A094 (input reused from
history).

## Per-card approach

### A017 "นายตาบอด"

Plays like any normal `needsTargetSelection` card — actor picks another player. A017's own
card placement (discard vs. A040 redirect) is already handled by `playAction`'s existing
`applyActionRedirect` call before the frame is even pushed; nothing new there.

`executeEffect`:

1. Loop: pop the top of `drawPile` (reshuffling from `discardPile` via the existing
   `reshuffleDiscardIntoDraw` if it runs dry mid-loop). If the card is a Trap or Counter,
   push it onto `discardPile` and continue. If it's an Action card, stop. Hard cap at the
   total remaining card count (defensive — mirrors the A092 unguarded-pop lesson from the
   handoff doc; should only trigger if literally no Action card remains anywhere, which
   can't happen with the real deck since 173 Action codes exist).
2. Place the found card into its post-play destination: a new small helper,
   `resolvePostPlayDestination(state, code)` (new, `game/turnFlow.ts`, a lighter sibling of
   `applyActionRedirect` that doesn't require the card to already be in a hand, since this
   card came straight from `drawPile`) — pushes to `actionRedirect`'s target hand if active,
   else `discardPile`.
3. Call `autoResolveInputFrame(state, foundCode, chosenPlayerId, todayFromFrame(frame))`
   (see the interface-constraint note above — `today` comes from A017's own frame, which
   `needsTodayDate: true` caused the UI to stamp at play time; `rng` uses the helper's own
   `Math.random` default) to fill in `targetIds`/`customPayload`.
4. `pushStackFrame` a new frame: `sourceType: 'action'`, `sourceCode: foundCode`, `actorId:
   chosenPlayerId` (the player who was chosen to draw-and-play — matches "another player...
   draws and plays," not the original A017 actor), `customPayload` merging the
   auto-resolved payload with `{ chainDepth: (frame.customPayload?.chainDepth ?? 0) + 1 }`
   (see "Recursion depth cap" below).

### A108 "เล่นใบนั้นสิ"

`needsTargetSelection` + `needsTodayDate: true` (see interface-constraint note above),
candidate list filtered to players (excluding self) holding ≥1 implemented Action card in
hand (mirrors A126/A108's existing self-exclusion + candidate filtering convention).

`executeEffect`:

1. From the forced player's hand, filter to implemented Action codes, pick one uniformly at
   random (`rng`, defaulted).
2. Remove it from their hand via `applyActionRedirect(state, forcedPlayerId, code)` (works
   as-is here since, unlike A017's found card, this one genuinely is in a hand).
3. `autoResolveInputFrame(state, code, forcedPlayerId, todayFromFrame(frame))` for the
   forced card, `actorId: forcedPlayerId` (matches "force them to play it" — they are the
   actor of its effect, even though the actor of A108 chose which player).
4. `pushStackFrame` the same way as A017, including the same `chainDepth` increment.

### A094 "พร้อมเพรียง"

`kind: 'auto'`, no target. `executeEffect`:

1. Walk `state.recentActionPlays` (newest first) for the first entry whose `code !== 'A094'`.
   No-op (return state unchanged) if none found.
2. `pushStackFrame`: `sourceType: 'action'`, `sourceCode` = that entry's code, `actorId` =
   A094's own actor, `targetIds`/`customPayload` = the entry's frozen values verbatim, with
   `customPayload.chainDepth` recomputed the same way as A017/A108 (from A094's own frame,
   not carried over from the historical entry) — see "Recursion depth cap" below.

### A028 "ทาเยอะไปหน่อย"

New session method, `playDoubledAction(partnerCode, targetId?, customPayload?)` (mirrors
`playAction`'s validation shape): requires A028 and a qualifying `partnerCode` both in hand,
distinct codes, and goes through the partner card's own normal input UI (nothing new — same
`needsTargetSelection`/`needsRosterSelection`/etc. flow already wired in `GameTable.tsx`).
On confirm: both cards discarded/redirected via `applyActionRedirect` (A028 first, then the
partner), then `pushStackFrame` **one** frame for the partner's code with
`customPayload: { ...gathered, doubled: true }`.

`resolveCompletedStackFrames` (the one real change to existing code, `lib/session.tsx`):
where it currently does `next = executeActionFrameEffect(next, resolvingFrame)` for
`sourceType === 'action'`, check `resolvingFrame.customPayload?.doubled` and call it twice
instead of once. `executeActionFrameEffect` already loops over multi-target frames
internally, so this correctly doubles per-target counts for roster cards too. A single
Counter response cancels the whole doubled effect (simplest ruling — countering the combo
cancels both applications, not just one).

If A028 surfaces as a nested/forced card via A017 or A108's auto-chain and the relevant
player has no qualifying partner in hand at that moment, it simply fizzles (no effect) —
consistent with "no partner = unplayable," just without blocking the chain.

### Recursion depth cap

Mechanism: `frame.customPayload.chainDepth` (a plain number, so it round-trips through
`RoomState`'s normal JSON serialization the same as any other `customPayload` value — no new
top-level state needed). A017/A108/A094's `executeEffect` reads
`frame.customPayload?.chainDepth ?? 0` from their *own* frame; if it's `>= 20`, they no-op
(return `state` unchanged, don't push a nested frame) instead of continuing the chain.
Otherwise they push the nested frame with `chainDepth: currentDepth + 1` set in its
`customPayload`. A frame that was never part of a chain (a normal, directly-played A017/
A108/A094) simply has no `chainDepth` key, reads as `0`, and behaves exactly as described
above with no cap-related change in behavior. As covered in the rulings section, this should
be unreachable with the real 173-unique-code deck; it exists only so a bug or a test fixture
with duplicated codes fails safely (silently stops the chain) instead of hanging.

## Data model changes

- `RoomState.recentActionPlays?: { code: CardCode; actorId: PlayerId; targetIds: PlayerId[]; customPayload?: Record<string, unknown> }[]`
  — capped ring buffer (last ~5), appended in `resolveCompletedStackFrames` exactly where it
  already branches on `sourceType === 'action'` and the frame isn't cancelled (so a
  Countered play is never logged). **Reset in `startGame`, `resetForPlayAgain`, and
  `restartGame`**, per the project's standing reset-checklist gotcha (flagged repeatedly in
  the handoff doc as the single most common bug source in prior clusters).
- No new `PlayerState` fields.
- No new field needed to track "is A028 currently playable" — that's derived at render time
  from hand contents, not stored state.

## UI changes

- `GameTable.tsx`: a new co-play flow for A028 (pick partner card from a filtered list →
  reuse that card's existing input UI) — same shape as the existing multi-step local-state
  patterns (`dualPickPhase`, `drinkCheckPhase`).
- A028's hand-slot shows a disabled state + warning badge when no qualifying partner exists
  in hand.
- A108's target list filters to players holding ≥1 implemented Action card (new candidate
  filter, same mechanism as A126's self-exclusion filter).
- A017 needs no new UI beyond its existing single-target picker.
- A094 needs no new UI at all.

## Testing plan

- `game/actionRules/autoResolve.test.ts` (new): each flag branch of `autoResolveInputFrame`
  in isolation — target selection excludes self where expected, roster defaults to "all" vs.
  "N random" based on `rosterSelectionCount`, outcome/drink/dual flags produce valid shapes,
  `needsTodayDate` uses the passed-in `today` rather than deriving its own.
- `game/actionRules/definitions.test.ts`: A017 (drawing through Trap/Counter cards to find
  an Action, deck-exhaustion/reshuffle edge case, chosen player becomes actor of the found
  card), A108 (candidate filtering excludes players with no Action cards, random selection
  among the forced player's Action cards only, forced player becomes actor), A094 (skips its
  own code in history, no-ops with empty/A094-only history, new actor with reused
  targets/payload), A028 (only qualifying partners accepted, doubling via double-invoke
  matches calling the partner's effect twice manually, roster/multi-target partner doubles
  correctly, single Counter cancels both applications).
- `game/reactionStack.test.ts` or `lib/session.test.ts` (wherever `resolveCompletedStackFrames`
  is already tested): a nested frame pushed from within `executeEffect` correctly waits for
  its own Counter-response window rather than resolving immediately, and a chain of 2-3
  Cluster D cards resolves in the right order.
- `game/cardInvariant.test.ts`: card-conservation checks across an A017 chain (found card
  moves from `drawPile` to `discardPile`/redirect target, nothing duplicated or lost) and an
  A108 forced play (card moves from forced player's hand to its destination).
- Reset-checklist regression test: `recentActionPlays` is empty after `startGame`,
  `resetForPlayAgain`, and `restartGame`, matching the pattern already used for
  `actionRedirect`/`bananaPeelArmed` reset tests.
- `chainDepth` cap: a synthetic frame with `customPayload.chainDepth: 20` fed directly to
  A017/A108/A094's `executeEffect` no-ops instead of pushing a further nested frame (this is
  the only practical way to exercise the cap, since the real deck can't produce a chain long
  enough to hit it).

## Out of scope

- Cluster F (A091) — separate, already in progress on its own unmerged branch; reconciling
  the two branches is a later step, not part of this implementation.
- Any new hand-reveal/card-picker UI (A108's "choose 1 action card" is deliberately random
  per the ruling above, matching the A056/A130 precedent).
- Extending `autoResolveInputFrame`'s defaults to be smarter than "random" (e.g. an AI
  choosing a "good" target) — out of scope, this is a party game honor-system default, not
  a strategy layer.
