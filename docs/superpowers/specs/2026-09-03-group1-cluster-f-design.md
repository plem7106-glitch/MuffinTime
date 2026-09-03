# Group 1 Cluster F: Forced-Loss Tracking (A091)

## Context

Group 1's remaining order is E → F → D. Cluster E (`A064`) shipped and merged into `main`
via PR #5 (`a9e1c85`). This spec covers **Cluster F**: a single card, `A091` "ฉันเป็นหมอ"
(I'm A Doctor).

Card text (from `data/cards.json`, ground truth):

> **name_en**: I'm A Doctor
> **name_th**: ฉันเป็นหมอ
> **description_en**: Draw as many cards as you've had stolen or discarded since your last
> turn
> **description_th**: จั่วไพ่เท่ากับจำนวนไพ่ที่ถูกขโมยหรือถูกบังคับให้ทิ้งจากคุณ
> นับตั้งแต่เทิร์นก่อนหน้าของคุณ

The classification doc originally filed this under "self draws N cards equal to a
tracked value" (comparable to `A004`, trivial). It was moved to Phase 2 once
implementation revealed the tracked value doesn't exist anywhere yet: no part of the
engine currently distinguishes "a card left your hand because someone else's card forced
it" from "a card left your hand because you chose to discard/give it as part of playing
your own card." This spec builds that distinction and wires it through every place cards
currently leave a hand involuntarily.

## Why this is genuinely dozens of call sites, and why that's still low-risk

Two parallel pipelines already exist in this codebase:

- **Event-emitting primitives** (`game/forcedDiscard.ts`'s `finalizeForcedDiscard`,
  `game/steal.ts`'s `finalizeSteal`, `game/primitives.ts`'s `executeFullHandTransfer`) —
  used by traps, counter-punishment, and a handful of Action cards. These already know
  the victim and the actual count moved, and already emit `EVENT_FORCED_DISCARD` /
  `EVENT_CARD_STOLEN` events (`game/events.ts`).
- **Raw primitives** (`game/pile.ts`'s `discard()`, `game/transfer.ts`'s `stealRandom()`
  / `stealChosen()`) — called directly by ~55 Action-card entries in
  `game/actionRules/definitions.ts`, plus `game/roster.ts`'s `rosterDiscards` /
  `rosterStolenBy`. None of these track or emit anything today.

Reading every one of those ~55 direct call sites (verified below) shows one consistent
rule, with no exceptions found:

> **A loss counts as "forced" for A091 purposes exactly when the player losing the
> card(s) is not the player who played the card causing the loss.** Self-inflicted costs
> of your own card (discarding your own cards, choosing to give cards away, a mandatory
> "then discard the extra" side effect of your own steal) do not count — you chose to
> play that card knowing the cost. A card that makes someone *else* lose cards — whether
> they're a single chosen target, a roster, "everyone but the actor," or a trap/counter
> victim — always counts.

Because the rule is uniform, instrumenting it is mechanical, not a series of individual
judgment calls: at each call site, check which parameter identifies the player who loses
cards. If it's `frame.actorId` (or the equivalent "the person who played this card"),
leave it alone. If it's anyone else (`targetId`, a roster member, a trap/counter victim,
"everyone except the actor"), route it through a tracking wrapper. This was checked
against every `discard(`/`stealRandom(` call in `definitions.ts` as of this spec — see
the inventory tables below.

## Data model: one new field, one reset point

```ts
// game/types.ts, PlayerState
/** A091: cards involuntarily lost (stolen from you, or forced-discarded by
 * someone else's card/trap/counter) since your last turn began. Incremented
 * by trackForcedLoss (game/util.ts) at every forced-loss site; read (not
 * reset) by A091's own executeEffect -- if A091 is played twice in one turn
 * (e.g. via A100's bonus plays), both reads see the same accumulated total
 * unless something forces a loss in between, matching the card's literal
 * "since your last turn" wording rather than "since you last played this
 * card." */
forcedLossSinceLastTurn?: number;
```

Reset point: `game/turn.ts`'s `resetPlayerPerTurnFlags(player)`. Add
`player.forcedLossSinceLastTurn = 0;` there, next to the other per-turn resets
(`placedTrapThisTurn`, `hasDrawnThisTurn`, etc.). No separate edit is needed in
`beginTurn`, `startGame`, `resetForPlayAgain`, or `restartGame` — verified directly
against `game/room.ts`: all three of the latter already call
`resetPlayerPerTurnFlags(next.players[pid])` for every player (`startGame` line ~163,
`resetForPlayAgain` line ~244, `restartGame` line ~313), and `beginTurn` calls it for the
active player. One line in the shared function covers all four call sites automatically.

## Instrumentation: a shared tracker, two thin wrappers, and per-site classification

**`game/util.ts`** (already the home of `cloneState`/`shuffle`/`pickRandomIndices` —
small generic `RoomState` helpers) gains:

```ts
export function trackForcedLoss(state: RoomState, victimId: PlayerId, count: number): RoomState {
  if (count <= 0) return state;
  const next = cloneState(state);
  const player = next.players[victimId];
  if (player) player.forcedLossSinceLastTurn = (player.forcedLossSinceLastTurn ?? 0) + count;
  return next;
}
```

**`game/pile.ts`** gains a thin wrapper around the existing `discard()`:

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

**`game/transfer.ts`** gains the same shape around `stealRandom()`:

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

Diffing hand length before/after (rather than recomputing the clamp formula) means the
wrapper is correct even when the victim has fewer cards than requested, with no
duplicated logic to drift out of sync with `discard()`/`stealRandom()`.

**Centralized pipeline (one edit per file, covers traps + counters + roster + the Action
cards already routed through them, for free):**

- `game/forcedDiscard.ts`'s `finalizeForcedDiscard` — after building `moved`, call
  `trackForcedLoss(next, operation.targetPlayerId, moved.length)` before returning.
- `game/steal.ts`'s `finalizeSteal` — after `stolen.length > 0`, call
  `trackForcedLoss(next, operation.victimId, stolen.length)`.
- `game/primitives.ts`'s `executeFullHandTransfer` — after the existing `CARD_STOLEN`
  event append, call `trackForcedLoss(next, victimId, count)`.
- `game/roster.ts`'s `rosterDiscards`/`rosterStolenBy` — swap their internal
  `discard(...)`/`stealRandom(...)` calls for `forceDiscard(...)`/`forceSteal(...)`. Both
  already loop over players who are never the acting player by construction
  (`rosterStolenBy` already has `if (victimId === thiefId) continue;`), so no
  self-exclusion logic is needed here beyond what already exists.

**Group-loop helpers where the acting player can legitimately be swept into the "loses a
card" set as a side effect of their own card** (`stealFromRightNeighbor`,
`everyoneGivesOneTo`, `everyoneStealsOneFrom` in `definitions.ts`; `game/group.ts`'s
`everyoneDiscards` already takes `excludeIds`/`sourcePlayerId` and routes through
`executeDiscard`, so it's already centralized) — these three local helpers gain an
`actorId: PlayerId` parameter used **only** to skip tracking (not to skip the game
mechanic itself) for the one iteration where the affected player equals the actor,
matching the same "self-caused doesn't count" rule applied consistently: playing a card
that symmetrically costs you too (e.g. "everyone steals from their right neighbor,
including you") is still your own choice to play that card, the same way A055's "you
discard 2, everyone else discards 1" already treats the actor's own 2-card discard as
self-inflicted and not trap for tracking.

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

`everyoneGivesOneTo`/`everyoneStealsOneFrom` take the same shape: the loop body picks
`forceSteal` normally, `stealRandom` (untracked) only for the iteration where the
affected player is the actor. Call sites that invoke these three helpers gain one extra
argument (`frame.actorId`); this is a mechanical signature change, not a behavior change
to the helpers' existing callers' game logic.

## Per-call-site classification (verified against `game/actionRules/definitions.ts` as of
this spec; exact line numbers will shift slightly once earlier tasks in the plan land —
the implementation plan re-greps rather than trusting these numbers blindly)

**Raw `discard(` calls — leave untouched (`frame.actorId` loses the cards, self-caused):**
lines 374, 428, 439, 576 (the `afterSelf` half only), 1406, 1537, 1545 (both halves),
1584 (the inner `discard(state, frame.actorId, 2)` half only), 1632.

**Raw `discard(` calls — swap for `forceDiscard(`(someone other than the actor loses the
cards):** lines 310, 557, 568, 578 (the `targetId` half), 588, 1358, 1367, 1376, 1385,
1394, 1476, 1485. Also the local helper `discardAllOfType` (defined line ~237, its
internal `discard(state, playerId, ...)` at line 241) — checked both its current callers
(lines 598, 609): both pass `targetId`, never `frame.actorId`, so despite taking a
generic `playerId` param this is a forced case, not self-caused.

**Raw `stealRandom(` calls — leave untouched (the actor is the `fromId`, i.e. giving
cards away or choosing to have cards stolen from themselves; self-caused):** lines 295
(`A014`, actor picks someone to steal from their own hand), 649 (`A079`), 668 (`A107`).

**Raw `stealRandom(` calls — swap for `forceSteal(`(someone other than the actor is the
`fromId`):** lines 453, 462, 471, 482, 491, 502, 513, 659 (the target half of a mixed
draw+steal effect — actor draws, then steals from target), 697, 1001, 1013, 1293, 1302,
1320, 1329, 1338, 1347, 1496, 1505. Also line 1724 (`A115` "Tall Midget" — `tallestId`
loses cards to `shortestId`; neither is necessarily the actor, both are picked via
`needsDualTargetSelection`, so this is forced on `tallestId` regardless of who the actor
is).

**Group-loop helpers (see above, gain an `actorId` param):** `stealFromRightNeighbor`
(line ~195), `everyoneGivesOneTo` (line ~78), `everyoneStealsOneFrom` (line ~89).

**Trap-pile steals** (`stealTrapToHand`, `stealRandomTrapToHand`, `stealAllActionCards`
in `game/trapPile.ts`) — a card involuntarily leaving your trap area or hand to another
player's hand is the same kind of loss A091's text describes ("ถูกขโมย" doesn't specify
hand-only). These get the same treatment: audit each call site in `game/trapPile.ts` the
same way, tracking the victim when it isn't the initiating player. Full inventory is a
plan task, not repeated here — `game/trapPile.ts` is small enough (checked: under 150
lines) for one task to cover completely.

## Explicitly not tracked (no clear "victim")

- `game/primitives.ts`'s `executeHandSwapAndDeal` (A063-style hand swap-and-redeal) and
  `definitions.ts`'s local N-player generalization of it, and `game/group.ts`'s
  `passHands` (rotate everyone's hand by N seats) — no directional theft, every
  participant both "loses" their old hand and "gains" a new one symmetrically. Not
  forced-loss in the sense A091 means.
- Playing a card itself (any card leaving a hand into `discardPile` as the normal
  consequence of being played) is never tracked — that's not a loss of a card `state`, it's
  the intended lifecycle of playing the card.

## A091's own entry (new, `game/actionRules/definitions.ts`)

```ts
A091: {
  code: 'A091', name_en: "I'm A Doctor", name_th: 'ฉันเป็นหมอ',
  description_th: 'จั่วไพ่เท่ากับจำนวนไพ่ที่ถูกขโมยหรือถูกบังคับให้ทิ้งจากคุณ นับตั้งแต่เทิร์นก่อนหน้าของคุณ',
  kind: 'auto',
  executeEffect: (state, frame) => draw(state, frame.actorId, state.players[frame.actorId].forcedLossSinceLastTurn ?? 0),
},
```

No UI beyond the normal draw feedback already shown for every other draw-N card
(matches `A004`'s existing precedent — a tracked-value draw needs no special
presentation).

## Testing plan

- `game/turn.test.ts`: `beginTurn`/`resetPlayerPerTurnFlags` zero out
  `forcedLossSinceLastTurn` for the player starting their turn, and leave other players'
  counters untouched.
- `game/util.test.ts`: `trackForcedLoss` — increments from `undefined`, accumulates
  across repeated calls, no-ops on `count <= 0`, no-ops for an unknown player id.
- `game/pile.test.ts` / `game/transfer.test.ts`: `forceDiscard`/`forceSteal` — behave
  identically to the wrapped primitive for card movement, and additionally increment the
  victim's counter by the actual (post-clamp) count moved, including the 0-count and
  "fewer cards than requested" edge cases.
- `game/forcedDiscard.test.ts` / `game/transfer.test.ts` (or `steal.test.ts` if that's
  where `finalizeSteal` is covered) / `game/primitives.test.ts`: the three centralized
  pipeline points now also increment the victim's counter — one regression test each,
  reusing existing fixtures for the trap/counter-driven paths already tested there.
- `game/roster.test.ts`: `rosterDiscards`/`rosterStolenBy` increment every affected
  roster member's counter.
- `game/actionRules/definitions.test.ts`: A091 draws exactly
  `forcedLossSinceLastTurn` cards (0, a small number, and a number exceeding
  `drawPile.length`, reusing the existing draw-clamping convention already tested for
  other draw-N cards). Spot-check a representative swapped call site (e.g. `A038`) to
  confirm it now increments the target's counter, and a representative untouched one
  (e.g. `A056`) to confirm it still does not.
- `game/cardInvariant.test.ts`: one card-conservation check across a
  forced-discard → forced-steal → A091-draw sequence, confirming no card is created or
  destroyed by the new bookkeeping (the counter itself holds no cards, but this guards
  against a wrapper accidentally double-moving a card).

## Out of scope

- Cluster D (`A017`, `A028`, `A094`, `A108`) — separate spec, separate implementation
  pass; its core design question (a forced/replayed card that itself needs further
  input) remains deliberately undecided per the user's earlier instruction, to be raised
  fresh when D starts.
- Any UI surfacing "you were hit for N cards" beyond A091's own draw — not requested,
  not needed for the card to function.
